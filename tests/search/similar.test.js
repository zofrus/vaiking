const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { build } = require("../../app/server");
const s = require("../../app/lib/search-similar");

const NO_PUBLIC = path.join(os.tmpdir(), "vaiking-no-public-dir");
function appWith(client) {
  const app = build({ env: {}, publicDir: NO_PUBLIC, elastic: { configured: true, client: { close() {}, ...client } } });
  test.after(() => app.close());
  return app;
}

test("seed text is title plus the first 300 characters, title alone if no abstract", () => {
  assert.equal(s.seedText({ title: "T", abstract: "a".repeat(400) }), `T. ${"a".repeat(300)}`);
  assert.equal(s.seedText({ title: "T", abstract: "" }), "T");
});

test("similar query filters to the window and excludes the talk itself", () => {
  const req = s.buildSimilarRequest({ talkId: "42", text: "x", after: "2026-11-10T21:00:00.000Z", before: "2026-11-10T23:00:00.000Z", limit: 3 });
  const f = req.query.bool.filter;
  assert.deepEqual(f[0].bool.must_not[1], { ids: { values: ["42"] } });
  assert.deepEqual(f[1].range.starts_at, { gte: "2026-11-10T21:00:00.000Z", lte: "2026-11-10T23:00:00.000Z" });
  assert.deepEqual(req.query.bool.should, [
    { multi_match: { query: "x", fields: ["title^2", "abstract", "tags"] } },
    { match: { semantic_content: "x" } },
  ]);
  assert.equal(req.query.bool.minimum_should_match, 1);
});

test("parsers", () => {
  assert.deepEqual(s.parseIds("1, 2,2,bad id!,3"), ["1", "2", "3"]);
  assert.equal(s.parseWhen("nope").ok, false);
  assert.equal(s.parseWhen(undefined).value, null);
  assert.equal(s.parseLimit("99"), 10);
});

test("cache expires", () => {
  let t = 0;
  const c = s.createCache(2, 100, () => t);
  c.set("a", 1);
  assert.equal(c.get("a"), 1);
  t = 101;
  assert.equal(c.get("a"), undefined);
});

test("/api/talks keeps requested order and drops unknown ids", async () => {
  const mget = async () => ({ docs: [{ _id: "2", found: true, _source: { id: "2" } }, { _id: "1", found: true, _source: { id: "1" } }, { _id: "9", found: false }] });
  const res = await appWith({ mget }).inject({ url: "/api/talks?ids=1,2,9" });
  assert.deepEqual(res.json(), { talks: [{ id: "1" }, { id: "2" }] });
  assert.equal((await appWith({ mget }).inject({ url: "/api/talks" })).statusCode, 400);
});

test("/api/similar searches once, then serves repeats from cache", async () => {
  let searches = 0;
  const client = {
    get: async () => ({ _source: { title: "Mesh", abstract: "about meshes" } }),
    search: async () => { searches += 1; return { hits: { hits: [{ _source: { id: "7" } }] } }; },
  };
  const app = appWith(client);
  const url = "/api/similar?talk_id=1&after=2026-11-10T21:00:00Z";
  assert.deepEqual((await app.inject({ url })).json(), { results: [{ id: "7" }] });
  await app.inject({ url });
  assert.equal(searches, 1);
});

test("/api/similar shares its request budget across a cold lookup and search", async () => {
  let getOptions;
  let searchOptions;
  let getElapsed;
  const app = appWith({
    get: async (_request, options) => {
      getOptions = options;
      const started = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 30));
      getElapsed = Date.now() - started;
      return { _source: { title: "Mesh", abstract: "about meshes" } };
    },
    search: async (_request, options) => {
      searchOptions = options;
      return { hits: { hits: [] } };
    },
  });

  const res = await app.inject({ url: "/api/similar?talk_id=1" });
  assert.equal(res.statusCode, 200);
  // Budget is 800ms; the clock may have ticked a few ms before the call.
  assert.ok(getOptions.requestTimeout <= 800 && getOptions.requestTimeout >= 790, `getTimeout ${getOptions.requestTimeout}`);
  assert.ok(searchOptions.requestTimeout > 0);
  assert.ok(searchOptions.requestTimeout <= getOptions.requestTimeout - getElapsed + 2);
  assert.deepEqual(getOptions.openTelemetry, { enabled: false });
  assert.deepEqual(searchOptions.openTelemetry, { enabled: false });
});

test("/api/similar explains when no similar results are available", async () => {
  const emptySeed = appWith({
    get: async () => ({ _source: { title: "", abstract: "" } }),
    search: async () => assert.fail("empty seed should skip search"),
  });
  assert.deepEqual((await emptySeed.inject({ url: "/api/similar?talk_id=1" })).json(), {
    results: [],
    message: "No similar talks found. Try widening the time window.",
  });

  const noMatches = appWith({
    get: async () => ({ _source: { title: "Mesh" } }),
    search: async () => ({ hits: { hits: [] } }),
  });
  assert.deepEqual((await noMatches.inject({ url: "/api/similar?talk_id=1" })).json(), {
    results: [],
    message: "No similar talks found. Try widening the time window.",
  });
});

test("/api/similar: 404 for unknown talk, 400 for bad time, errors never leak", async () => {
  const missing = appWith({ get: async () => { throw Object.assign(new Error("x"), { statusCode: 404 }); } });
  assert.equal((await missing.inject({ url: "/api/similar?talk_id=1" })).statusCode, 404);
  assert.equal((await missing.inject({ url: "/api/similar?talk_id=1&after=zzz" })).statusCode, 400);
  const broken = appWith({ get: async () => { throw new Error("https://secret.example"); } });
  const res = await broken.inject({ url: "/api/similar?talk_id=2" });
  assert.equal(res.statusCode, 502);
  assert.ok(!res.body.includes("secret"));
});
