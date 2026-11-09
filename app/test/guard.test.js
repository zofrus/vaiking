const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { build } = require("../server");
const { clientKey, clientBucket, createLimiter } = require("../lib/guard");
const { normalize, safeHttpUrl } = require("../lib/feed");

const NO_PUBLIC = path.join(os.tmpdir(), "vaiking-no-public-dir");

function appWith(client, env = {}) {
  const app = build({
    env,
    publicDir: NO_PUBLIC,
    elastic: { configured: true, client: { close() {}, ...client } },
  });
  test.after(() => app.close());
  return app;
}

const HITS = { took: 1, hits: { hits: [{ _source: { id: "1", title: "Mesh" } }] } };

test("client key is the right-most forwarded address, never the forged left one", () => {
  const req = (xff, ip = "10.0.0.1") => ({ headers: { "x-forwarded-for": xff }, ip });
  assert.equal(clientKey(req("6.6.6.6, 203.0.113.5")), "203.0.113.5");
  assert.equal(clientKey(req("1.1.1.1, 203.0.113.5")), clientKey(req("2.2.2.2, 203.0.113.5")));
  assert.equal(clientKey({ headers: {}, ip: "10.0.0.1" }), "10.0.0.1");
});

test("limiter caps one client, then everyone, and resets each window", () => {
  let t = 0;
  const limited = createLimiter({ perClient: 2, total: 3, now: () => t });
  assert.equal(limited("a"), false);
  assert.equal(limited("a"), false);
  assert.equal(limited("a"), true);
  assert.equal(limited("b"), false);
  assert.equal(limited("c"), true, "total cap holds across clients");
  t = 61_000;
  assert.equal(limited("a"), false);
});

test("search: repeat query is served from cache, and cache hits do not use the limit", async () => {
  let calls = 0;
  const app = appWith({ search: async () => (calls++, HITS) }, { RATE_LIMIT_PER_MIN: "2" });
  for (let i = 0; i < 10; i++) {
    const res = await app.inject("/api/search?q=mesh&limit=5&day=2026-11-10");
    assert.equal(res.statusCode, 200);
  }
  assert.equal(calls, 1);
});

test("search: different limit, day or track is a different cache entry", async () => {
  let calls = 0;
  const app = appWith({ search: async () => (calls++, HITS) });
  await app.inject("/api/search?q=mesh");
  await app.inject("/api/search?q=mesh&limit=5");
  await app.inject("/api/search?q=mesh&day=2026-11-10");
  await app.inject("/api/search?q=mesh&track=Security");
  assert.equal(calls, 4);
});

test("search: concurrent identical queries make one Elasticsearch call", async () => {
  let calls = 0;
  const app = appWith({ search: async () => (calls++, await new Promise((r) => setTimeout(r, 20)), HITS) });
  const all = await Promise.all([1, 2, 3, 4].map(() => app.inject("/api/search?q=mesh")));
  assert.deepEqual(all.map((r) => r.statusCode), [200, 200, 200, 200]);
  assert.equal(calls, 1);
});

test("search: new queries from one client are limited with 429 and retry-after", async () => {
  let calls = 0;
  const app = appWith({ search: async () => (calls++, HITS) }, { RATE_LIMIT_PER_MIN: "3" });
  const codes = [];
  let last;
  for (let i = 0; i < 5; i++) {
    last = await app.inject({ url: `/api/search?q=talk${i}`, headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.5" } });
    codes.push(last.statusCode);
  }
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  assert.equal(last.headers["retry-after"], "60");
  assert.deepEqual(last.json(), { error: "too many requests, try again in a minute" });
  assert.equal(calls, 3);
  // Forging the left side does not escape the limit; a different real client is unaffected.
  const forged = await app.inject({ url: "/api/search?q=other", headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.5" } });
  assert.equal(forged.statusCode, 429);
  const other = await app.inject({ url: "/api/search?q=other", headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.77" } });
  assert.equal(other.statusCode, 200);
});

test("search: a failed call is not cached", async () => {
  let calls = 0;
  const app = appWith({ search: async () => { calls++; if (calls === 1) throw new Error("boom"); return HITS; } });
  assert.equal((await app.inject("/api/search?q=mesh")).statusCode, 502);
  assert.equal((await app.inject("/api/search?q=mesh")).statusCode, 200);
});

test("changes: cached for the same since, limited per client", async () => {
  let calls = 0;
  const client = { search: async () => (calls++, { hits: { hits: [] } }) };
  const app = appWith(client, { RATE_LIMIT_PER_MIN: "2" });
  for (let i = 0; i < 5; i++) assert.equal((await app.inject("/api/changes")).statusCode, 200);
  assert.equal(calls, 1);
  assert.equal((await app.inject("/api/changes?since=2026-11-10T20:00:00Z")).statusCode, 200);
  assert.equal((await app.inject("/api/changes?since=2026-11-10T21:00:00Z")).statusCode, 429);
});

test("search and similar share the total rate-limit backstop; changes do not use it", async () => {
  let searchCalls = 0;
  let talkLookups = 0;
  const client = {
    search: async () => (searchCalls++, HITS),
    get: async () => (talkLookups++, { _source: { title: "T" } }),
  };
  const app = appWith(client, {
    RATE_LIMIT_PER_MIN: "10",
    RATE_LIMIT_TOTAL_PER_MIN: "2",
  });

  assert.equal((await app.inject("/api/search?q=mesh")).statusCode, 200);
  assert.equal((await app.inject("/api/changes")).statusCode, 200);
  assert.equal((await app.inject("/api/search?q=grpc")).statusCode, 200);
  const similar = await app.inject(
    "/api/similar?talk_id=1&after=2026-11-10T21:00:00Z",
  );
  assert.equal(similar.statusCode, 429);
  assert.equal(searchCalls, 3);
  assert.equal(talkLookups, 0);
});

test("similar: after and before are cut to the minute for the cache key and the query", async () => {
  let searches = 0;
  let seen;
  const client = {
    get: async () => ({ _source: { title: "T", abstract: "A" } }),
    search: async (body) => (searches++, (seen = body), { hits: { hits: [{ _source: { id: "2" } }] } }),
  };
  const app = appWith(client);
  const a = await app.inject("/api/similar?talk_id=1&after=2026-11-10T21:00:07.123Z&before=2026-11-10T23:00:41Z");
  const b = await app.inject("/api/similar?talk_id=1&after=2026-11-10T21:00:52Z&before=2026-11-10T23:00:03Z");
  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  assert.equal(searches, 1);
  assert.deepEqual(seen.query.bool.filter[1].range.starts_at, {
    gte: "2026-11-10T21:00:00.000Z",
    lte: "2026-11-10T23:00:00.000Z",
  });
});

test("similar: new windows from one client are limited", async () => {
  const client = {
    get: async () => ({ _source: { title: "T" } }),
    search: async () => ({ hits: { hits: [{ _source: { id: "2" } }] } }),
  };
  const app = appWith(client, { RATE_LIMIT_PER_MIN: "2" });
  const codes = [];
  for (let m = 0; m < 4; m++) {
    const r = await app.inject(`/api/similar?talk_id=1&after=2026-11-10T21:0${m}:00Z`);
    codes.push(r.statusCode);
  }
  assert.deepEqual(codes, [200, 200, 429, 429]);
});

test("feed: only http and https links survive", () => {
  assert.equal(safeHttpUrl("https://example.com/s.pdf"), "https://example.com/s.pdf");
  assert.equal(safeHttpUrl("http://example.com/s"), "http://example.com/s");
  assert.equal(safeHttpUrl("  https://example.com/s  "), "https://example.com/s");
  for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "ftp://x.test/a", "//example.com", "not a url", "", null, undefined, 5]) {
    assert.equal(safeHttpUrl(bad), null, String(bad));
  }
});

test("normalize drops a javascript: slides link and keeps a good one", () => {
  const feed = (answer) => ({
    rooms: [{ id: 1, name: "B | Level 2 | 251" }],
    questions: [{ id: 5, question: "Presentation Slides" }],
    speakers: [],
    categories: [{ title: "All Sessions", items: [{ id: 10, name: "Security" }] }],
    sessions: [{
      id: 1, title: "T", description: "&lt;img src=x onerror=alert(1)&gt;", speakers: [], categoryItems: [10], roomId: 1,
      startsAt: "2026-11-10T14:00:00", questionAnswers: [{ questionId: 5, answerValue: answer }],
    }],
  });
  assert.equal(normalize(feed("javascript:alert(1)")).docs[0].slides_url, null);
  assert.equal(normalize(feed("https://example.com/deck.pdf")).docs[0].slides_url, "https://example.com/deck.pdf");
  assert.match(normalize(feed("https://example.com/d")).docs[0].url, /^https:\/\//);
  // Decoded entities stay plain text here; the search route escapes them for the page.
  assert.equal(normalize(feed(null)).docs[0].abstract, "<img src=x onerror=alert(1)>");
});

const PROXIED = (xff) => ({ "x-forwarded-for": xff, "x-forwarded-host": "grace.effulgentpoint.com" });

test("grace proxy: requests naming grace.effulgentpoint.com share one bucket with a larger cap", () => {
  const req = (headers) => ({ headers, ip: "10.0.0.1" });
  const shared = { key: "proxy:grace", scale: 20 };
  assert.deepEqual(clientBucket(req(PROXIED("6.6.6.6, 76.76.21.9"))), shared);
  assert.deepEqual(clientBucket(req({ "x-vercel-forwarded-host": "Grace.EffulgentPoint.com", "x-forwarded-for": "76.76.21.10" })), shared);
  assert.deepEqual(clientBucket(req({ "x-forwarded-host": "grace.effulgentpoint.com, vaiking.cnh.radarhq.io" })), shared);
  // Direct requests are keyed exactly as before.
  assert.deepEqual(clientBucket(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.5" })), { key: "203.0.113.5", scale: 1 });
  assert.deepEqual(clientBucket(req({ "x-forwarded-host": "vaiking.cnh.radarhq.io", "x-forwarded-for": "203.0.113.5" })), { key: "203.0.113.5", scale: 1 });
  assert.deepEqual(clientBucket(req({})), { key: "10.0.0.1", scale: 1 });
  // Host and multiplier come from env.
  const env = { GRACE_PROXY_HOST: "grace.example.test", GRACE_PROXY_MULTIPLIER: "5" };
  assert.deepEqual(clientBucket(req({ "x-forwarded-host": "grace.example.test" }), env), { key: "proxy:grace", scale: 5 });
  assert.deepEqual(clientBucket(req({ "x-forwarded-host": "grace.effulgentpoint.com", "x-forwarded-for": "203.0.113.5" }), env), { key: "203.0.113.5", scale: 1 });
});

test("limiter scale raises only that bucket's cap, never the total", () => {
  const limited = createLimiter({ perClient: 2, total: 100, now: () => 0 });
  for (let i = 0; i < 6; i++) assert.equal(limited("proxy:grace", 3), false);
  assert.equal(limited("proxy:grace", 3), true);
  assert.equal(limited("a"), false);
  assert.equal(limited("a"), false);
  assert.equal(limited("a"), true);
  const tight = createLimiter({ perClient: 10, total: 2, now: () => 0 });
  assert.equal(tight("proxy:grace", 20), false);
  assert.equal(tight("proxy:grace", 20), false);
  assert.equal(tight("proxy:grace", 20), true, "the total cap still holds");
});

test("search: grace proxy visitors share proxy:grace with the larger cap, direct clients unchanged", async () => {
  let calls = 0;
  const app = appWith({ search: async () => (calls++, HITS) }, { RATE_LIMIT_PER_MIN: "2", GRACE_PROXY_MULTIPLIER: "3" });
  const codes = [];
  // A different Vercel address each time, still one shared bucket of 2 x 3 = 6.
  for (let i = 0; i < 7; i++) {
    codes.push((await app.inject({ url: `/api/search?q=p${i}`, headers: PROXIED(`198.51.100.${i}, 76.76.21.${i}`) })).statusCode);
  }
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 200, 429]);
  const direct = [];
  for (let i = 0; i < 3; i++) {
    direct.push((await app.inject({ url: `/api/search?q=d${i}`, headers: { "x-forwarded-for": "203.0.113.5" } })).statusCode);
  }
  assert.deepEqual(direct, [200, 200, 429]);
  assert.equal(calls, 8);
});

test("a room of phones polling changes cannot use up the total that search needs", async () => {
  let searches = 0;
  const client = { search: async (body) => (body.index === "changes" || searches++, { took: 1, hits: { hits: [] } }) };
  const app = appWith(client, { RATE_LIMIT_PER_MIN: "100", RATE_LIMIT_TOTAL_PER_MIN: "3" });
  // Each phone polls with its own since=, so every poll misses the cache.
  for (let i = 0; i < 3; i++) {
    const poll = await app.inject({ url: `/api/changes?since=2026-11-10T21:00:0${i}Z`, headers: { "x-forwarded-for": `203.0.113.${i}` } });
    assert.equal(poll.statusCode, 200);
  }
  // Search still has its whole total of 3.
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await app.inject(`/api/search?q=talk${i}`)).statusCode);
  assert.deepEqual(codes, [200, 200, 200, 429]);
  assert.equal(searches, 3);
});

test("search is limited at the new default total of 3000 a minute", async () => {
  let calls = 0;
  const app = appWith({ search: async () => (calls++, HITS) });
  // 30 clients x 100 new queries: each under its per-client cap of 120, 3000 in all.
  for (let i = 0; i < 3000; i++) {
    const r = await app.inject({ url: `/api/search?q=t${i}`, headers: { "x-forwarded-for": `203.0.113.${i % 30}` } });
    assert.equal(r.statusCode, 200);
  }
  const over = await app.inject({ url: "/api/search?q=one-more", headers: { "x-forwarded-for": "198.51.100.1" } });
  assert.equal(over.statusCode, 429, "a fresh client is refused once the total is spent");
  assert.equal(calls, 3000);
});
