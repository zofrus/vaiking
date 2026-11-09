// GET /api/board: counts of break-button presses by floor of the last planned
// talk, read from Dash0's Prometheus API with a read-only token. The token never
// leaves the server. Results are cached for 30 seconds.
const CACHE_MS = 30_000;
const TIMEOUT_MS = 4_000;
const SMALL_SAMPLE = 20;
const WINDOW = "1h";

const queryFor = (mode) =>
  `round(sum by (scheduled_floor) (increase(grace_requests_total{mode="${mode}"}[${WINDOW}])))`;

// Standard Prometheus instant-query shape: data.result[{metric, value:[ts, "n"]}].
// Confirmed against a live read token: GET {DASH0_API_URL}/api/prometheus/api/v1/query
// returns {status, data:{resultType, result}}; bare /api/v1/query is a 404.
function parseRows(body) {
  const result = body?.data?.result;
  if (!Array.isArray(result)) throw new Error("unexpected response shape");
  return result
    .map((r) => ({
      floor: String(r?.metric?.scheduled_floor ?? "unknown"),
      count: Math.round(Number(r?.value?.[1])),
    }))
    .filter((r) => Number.isFinite(r.count) && r.count > 0)
    .sort((a, b) => b.count - a.count || a.floor.localeCompare(b.floor));
}

function sampleNote(configured, live, preview) {
  if (!configured) return "Live counts are not connected yet.";
  const n = live.reduce((s, r) => s + r.count, 0);
  if (n === 0 && preview.length === 0) return "No presses in the last hour.";
  if (n < SMALL_SAMPLE)
    return `Small sample: ${n} press${n === 1 ? "" : "es"} in the last hour. Treat as a rough picture.`;
  return `${n} presses in the last hour.`;
}

module.exports = async function board(app, { env, fetch: fetchImpl }) {
  const base = env.DASH0_API_URL?.replace(/\/+$/, "");
  const token = env.DASH0_READ_TOKEN;
  const configured = Boolean(base && token);
  let cached = null;
  let cachedAt = 0;
  let inflight = null;

  async function query(mode) {
    const url = `${base}/api/prometheus/api/v1/query?${new URLSearchParams({ query: queryFor(mode) })}`;
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return parseRows(await res.json());
  }

  async function load() {
    const [live, preview] = await Promise.all([
      query("live"),
      query("preview"),
    ]);
    return {
      window: WINDOW,
      live,
      preview,
      changes: { count: null, median_told_s: null },
      sample_note: sampleNote(true, live, preview),
    };
  }

  app.get("/api/board", async (request, reply) => {
    if (!configured) {
      return {
        window: WINDOW,
        live: [],
        preview: [],
        changes: { count: null, median_told_s: null },
        sample_note: sampleNote(false, [], []),
      };
    }
    if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
    inflight ??= load().finally(() => {
      inflight = null;
    });
    try {
      cached = await inflight;
      cachedAt = Date.now();
      return cached;
    } catch (err) {
      // Only a short reason is logged: errors can carry the URL.
      request.log.warn(
        { reason: String(err.message).slice(0, 40) },
        "board query failed",
      );
      if (cached) return cached;
      return reply
        .code(502)
        .send({ error: "counts are unavailable right now" });
    }
  });
};
