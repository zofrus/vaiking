// GET /api/demo: one JSON object for the judge-facing /demo page, one section per
// tool. Each source is fetched on its own with a short timeout and cached for a
// few seconds, so one failing source never breaks the others.
//
// Honesty rules: a stat is status "live" only when it was read from the real
// source in this fetch. Anything else is "unavailable" with value null. Nothing
// is invented, and no token, URL or raw error text ever reaches the JSON.
const { buildSearchRequest } = require("../lib/search");

const CACHE_MS = 15_000;
const GITHUB_CACHE_MS = 5 * 60_000; // unauthenticated GitHub API: 60 requests/hour
const TIMEOUT_MS = 3_000;
const DEMO_QUERY = "running AI inference on Kubernetes";
const REPO = "zofrus/vaiking";
const GITAR_LOGIN = "gitar-bot[bot]";
const IN_CLUSTER_PROM = "http://prometheus-server.monitoring.svc";
const NAMESPACE = "team-vaiking";
const GITHUB_HEADERS = {
  accept: "application/vnd.github+json",
  "user-agent": "vaiking-demo",
};
// OTel HTTP server metric names differ by instrumentation version; the first
// one that returns data is used.
const HTTP_RATE_QUERIES = [
  "sum(rate(http_server_request_duration_seconds_count[5m]))",
  "sum(rate(http_server_duration_milliseconds_count[5m]))",
  "sum(rate(http_server_request_duration_count[5m]))",
];

const live = (value, extra = {}) => ({ value, status: "live", ...extra });
const unavailable = (extra = {}) => ({
  value: null,
  status: "unavailable",
  ...extra,
});

// Runs one stat; any failure becomes "unavailable". Only a short reason code is logged.
async function stat(log, name, fn) {
  try {
    const value = await fn();
    return Number.isFinite(value) ? live(value) : unavailable();
  } catch (err) {
    log.warn(
      { stat: name, reason: String(err?.message ?? "error").slice(0, 40) },
      "demo stat failed",
    );
    return unavailable();
  }
}

// Instant query against any Prometheus-compatible API; returns the summed value.
async function promScalar(fetchImpl, url, headers, query) {
  const res = await fetchImpl(`${url}?${new URLSearchParams({ query })}`, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const result = (await res.json())?.data?.result;
  if (!Array.isArray(result)) throw new Error("unexpected shape");
  if (result.length === 0) return null; // no series at all: not a number, not a zero
  return result.reduce((sum, r) => sum + Number(r?.value?.[1]), 0);
}

function cached(ttl, load) {
  let value = null;
  let at = 0;
  let inflight = null;
  return () => {
    if (value && Date.now() - at < ttl) return Promise.resolve(value);
    inflight ??= load()
      .then((v) => {
        value = v;
        at = Date.now();
        return v;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}

module.exports = async function demo(app, { elastic, env, fetch: fetchImpl }) {
  const log = app.log;
  const stamp = () => new Date().toISOString();
  // Last good value per cluster stat. When Prometheus answers with no series (a
  // kube-state-metrics pod moving, a scrape gap), the projector shows the last
  // good number marked stale with its time, not a blank tile. Memory only.
  const lastGood = new Map();
  const orLastGood = (name, s) => {
    if (s.status === "live") {
      lastGood.set(name, { value: s.value, as_of: stamp() });
      return s;
    }
    const prev = lastGood.get(name);
    return prev ? { value: prev.value, status: "stale", as_of: prev.as_of } : s;
  };

  async function loadElastic() {
    if (!elastic.configured) {
      return {
        status: "unavailable",
        fetched_at: stamp(),
        stats: { talks: unavailable(), took_ms: unavailable() },
      };
    }
    const talks = await stat(log, "talks", async () => {
      const res = await elastic.client.count(
        { index: "talks" },
        { requestTimeout: TIMEOUT_MS, maxRetries: 0 },
      );
      return res.count;
    });
    const took = await stat(log, "took_ms", async () => {
      const res = await elastic.client.search(
        buildSearchRequest({ q: DEMO_QUERY, limit: 3 }),
        { requestTimeout: TIMEOUT_MS, maxRetries: 0 },
      );
      return res.took;
    });
    return {
      status: summarize([talks, took]),
      fetched_at: stamp(),
      stats: { talks, took_ms: took },
      activity: `Hybrid keyword + semantic search for "${DEMO_QUERY}"`,
    };
  }

  async function loadDash0() {
    const base = env.DASH0_API_URL?.replace(/\/+$/, "");
    const token = env.DASH0_READ_TOKEN;
    if (!base || !token) {
      return {
        status: "unavailable",
        fetched_at: stamp(),
        stats: {
          button_presses: unavailable(),
          plan_requests: unavailable(),
          http_rate: unavailable(),
        },
      };
    }
    const url = `${base}/api/prometheus/api/v1/query`;
    const headers = { authorization: `Bearer ${token}` };
    const q = (query) => promScalar(fetchImpl, url, headers, query);
    const [presses, plans, rate] = await Promise.all([
      stat(log, "button_presses", () =>
        q('round(sum(increase(grace_requests_total{mode="live"}[1h])))'),
      ),
      stat(log, "plan_requests", () =>
        q("round(sum(increase(plan_requests_total[1h])))"),
      ),
      stat(log, "http_rate", async () => {
        for (const query of HTTP_RATE_QUERIES) {
          const v = await q(query);
          if (v !== null) return Math.round(v * 100) / 100;
        }
        return null;
      }),
    ]);
    return {
      status: summarize([presses, plans, rate]),
      fetched_at: stamp(),
      stats: { button_presses: presses, plan_requests: plans, http_rate: rate },
      activity: "Last hour, from Dash0 metrics",
    };
  }

  async function loadRadar() {
    const prom = (query) =>
      promScalar(fetchImpl, `${IN_CLUSTER_PROM}/api/v1/query`, {}, query);
    const ns = `namespace="${NAMESPACE}"`;
    const [ready, restarts, memory, changes] = await Promise.all([
      stat(log, "pods_ready", () =>
        prom(`sum(kube_pod_status_ready{${ns},condition="true"})`),
      ).then((s) => orLastGood("pods_ready", s)),
      stat(log, "restarts", () =>
        prom(`sum(kube_pod_container_status_restarts_total{${ns}})`),
      ).then((s) => orLastGood("restarts", s)),
      stat(log, "memory_mib", async () => {
        const v = await prom(
          `sum(container_memory_working_set_bytes{${ns},container!=""})`,
        );
        return v === null ? null : Math.round(v / 1048576);
      }).then((s) => orLastGood("memory_mib", s)),
      stat(log, "schedule_changes", async () => {
        if (!elastic.configured) throw new Error("no elastic");
        const res = await elastic.client.count(
          { index: "changes", ignore_unavailable: true },
          { requestTimeout: TIMEOUT_MS, maxRetries: 0 },
        );
        return res.count;
      }),
    ]);
    const clusterOk = [ready, restarts, memory].some(
      (s) => s.status === "live",
    );
    return {
      status: summarize([ready, restarts, memory, changes]),
      cluster_reachable: clusterOk,
      fetched_at: stamp(),
      version: env.APP_VERSION || null,
      stats: {
        pods_ready: ready,
        restarts,
        memory_mib: memory,
        schedule_changes: changes,
      },
      activity: clusterOk
        ? `Namespace ${NAMESPACE}, deployed ${env.APP_VERSION || "version unknown"}`
        : "Cluster metrics unavailable from this pod",
    };
  }

  async function githubJson(path) {
    const res = await fetchImpl(`https://api.github.com${path}`, {
      headers: GITHUB_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
  }

  async function loadGitar() {
    const merged = await stat(log, "merged_prs", async () => {
      const body = await githubJson(
        `/search/issues?q=${encodeURIComponent(`repo:${REPO} is:pr is:merged`)}&per_page=1`,
      );
      return body.total_count;
    });
    let comments = unavailable();
    let latest = null;
    try {
      const rows = await githubJson(
        `/repos/${REPO}/issues/comments?sort=created&direction=desc&per_page=100`,
      );
      if (!Array.isArray(rows)) throw new Error("unexpected shape");
      const gitar = rows.filter((c) => c?.user?.login === GITAR_LOGIN);
      comments = live(gitar.length, {
        window: `last ${rows.length} PR comments`,
      });
      const newest = gitar[0];
      const number = Number(
        /\/issues\/(\d+)$/.exec(newest?.issue_url ?? "")?.[1],
      );
      if (Number.isInteger(number)) {
        const pr = await githubJson(`/repos/${REPO}/pulls/${number}`);
        latest = {
          number,
          title: String(pr.title ?? "").slice(0, 120),
          url: pr.html_url,
        };
      }
    } catch (err) {
      log.warn(
        {
          stat: "gitar_comments",
          reason: String(err?.message ?? "error").slice(0, 40),
        },
        "demo stat failed",
      );
    }
    return {
      status: summarize([merged, comments]),
      fetched_at: stamp(),
      stats: { merged_prs: merged, gitar_comments: comments },
      latest_reviewed_pr: latest,
      activity: "Public GitHub API, refreshed every 5 minutes",
    };
  }

  const sources = {
    elastic: cached(CACHE_MS, loadElastic),
    dash0: cached(CACHE_MS, loadDash0),
    radar: cached(CACHE_MS, loadRadar),
    gitar: cached(GITHUB_CACHE_MS, loadGitar),
  };

  app.get("/api/demo", async (request, reply) => {
    const names = Object.keys(sources);
    const settled = await Promise.allSettled(names.map((n) => sources[n]()));
    const body = { generated_at: stamp() };
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") body[names[i]] = r.value;
      else {
        log.warn({ source: names[i] }, "demo source failed");
        body[names[i]] = { status: "unavailable", fetched_at: null, stats: {} };
      }
    });
    reply.header("cache-control", "no-store");
    return body;
  });
};

function summarize(stats) {
  const n = stats.filter((s) => s.status === "live").length;
  if (n === stats.length) return "live";
  return n === 0 ? "unavailable" : "partial";
}
