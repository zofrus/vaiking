const test = require("node:test");
const assert = require("node:assert/strict");
const Fastify = require("fastify");
const demo = require("../routes/demo");

const ENV = {
  DASH0_API_URL: "https://api.example/",
  DASH0_READ_TOKEN: "secret-token",
  APP_VERSION: "v9",
};

const prom = (n) => ({
  ok: true,
  json: async () => ({
    data: { result: [{ metric: {}, value: [1, String(n)] }] },
  }),
});
const json = (body) => ({ ok: true, json: async () => body });

const elasticOk = {
  configured: true,
  client: {
    count: async ({ index }) => ({ count: index === "talks" ? 321 : 2 }),
    search: async () => ({ took: 17 }),
  },
};

// Routes each outbound call by URL, like the real sources.
function router({ dash0 = () => prom(5), radar = () => prom(3), github } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    const u = String(url);
    if (u.startsWith("https://api.example/")) return dash0(u);
    if (u.startsWith("http://prometheus-server.monitoring.svc"))
      return radar(u);
    if (u.includes("/search/issues")) return json({ total_count: 26 });
    if (u.includes("/issues/comments"))
      return json([
        {
          user: { login: "gitar-bot[bot]" },
          issue_url: "https://api.github.com/repos/zofrus/vaiking/issues/7",
        },
        { user: { login: "zofrus" }, issue_url: "x/issues/8" },
        { user: { login: "gitar-bot[bot]" }, issue_url: "x/issues/6" },
      ]);
    if (u.includes("/pulls/7"))
      return json({
        title: "Add demo",
        html_url: "https://github.com/zofrus/vaiking/pull/7",
      });
    if (github) return github(u);
    throw new Error("unexpected " + u);
  };
  fn.calls = calls;
  return fn;
}

async function make(fetch, opts = {}) {
  const app = Fastify();
  await app.register(demo, { elastic: elasticOk, env: ENV, fetch, ...opts });
  test.after(() => app.close());
  return app;
}

test("all sources live: shapes, values and badges", async () => {
  const app = await make(router());
  const res = await app.inject({ url: "/api/demo" });
  assert.equal(res.statusCode, 200);
  const b = res.json();
  assert.equal(b.elastic.status, "live");
  assert.equal(b.elastic.stats.talks.value, 321);
  assert.equal(b.elastic.stats.took_ms.value, 17);
  assert.equal(b.dash0.stats.button_presses.value, 5);
  assert.equal(b.radar.version, "v9");
  assert.equal(b.radar.stats.pods_ready.value, 3);
  assert.equal(b.radar.stats.schedule_changes.value, 2);
  assert.equal(b.gitar.stats.merged_prs.value, 26);
  assert.equal(b.gitar.stats.gitar_comments.value, 2);
  assert.deepEqual(b.gitar.latest_reviewed_pr, {
    number: 7,
    title: "Add demo",
    url: "https://github.com/zofrus/vaiking/pull/7",
  });
});

test("one failing source never breaks the others and leaks nothing", async () => {
  const fetch = router({
    dash0: () => {
      throw new Error("boom https://api.example/ Bearer secret-token");
    },
    radar: () => ({ ok: false, status: 503 }),
  });
  const app = await make(fetch);
  const res = await app.inject({ url: "/api/demo" });
  assert.equal(res.statusCode, 200);
  const b = res.json();
  assert.equal(b.dash0.status, "unavailable");
  assert.equal(b.dash0.stats.button_presses.value, null);
  assert.equal(b.radar.cluster_reachable, false);
  assert.equal(b.radar.stats.pods_ready.status, "unavailable");
  assert.equal(b.radar.stats.schedule_changes.status, "live"); // from Elastic, independent
  assert.equal(b.elastic.status, "live");
  assert.equal(b.gitar.status, "live");
  const text = res.body;
  assert.ok(!text.includes("secret-token"));
  assert.ok(!text.includes("boom"));
  assert.ok(!text.includes("api.example"));
});

test("unconfigured elastic and dash0 are unavailable, not zero", async () => {
  const app = await make(router(), {
    elastic: { configured: false, client: null },
    env: {},
  });
  const b = (await app.inject({ url: "/api/demo" })).json();
  assert.equal(b.elastic.status, "unavailable");
  assert.equal(b.elastic.stats.talks.value, null);
  assert.equal(b.dash0.status, "unavailable");
  assert.equal(b.radar.version, null);
});

test("github failure marks gitar unavailable", async () => {
  const fetch = async (url) => {
    if (String(url).includes("github.com")) return { ok: false, status: 403 };
    return prom(1);
  };
  const app = await make(fetch);
  const b = (await app.inject({ url: "/api/demo" })).json();
  assert.equal(b.gitar.status, "unavailable");
  assert.equal(b.gitar.latest_reviewed_pr, null);
});

test("an empty Prometheus result is unavailable, never zero", async () => {
  const fetch = router({ radar: () => json({ data: { result: [] } }) });
  const app = await make(fetch);
  const b = (await app.inject({ url: "/api/demo" })).json();
  assert.equal(b.radar.stats.pods_ready.value, null);
});

test("responses are cached: a second request makes no new outbound calls", async () => {
  const fetch = router();
  const app = await make(fetch);
  await app.inject({ url: "/api/demo" });
  const n = fetch.calls.length;
  await app.inject({ url: "/api/demo" });
  assert.equal(fetch.calls.length, n);
});
