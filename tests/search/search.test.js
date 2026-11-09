const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { build } = require("../../app/server");
const { createElastic } = require("../../app/lib/elastic");
const s = require("../../app/lib/search");

const NO_PUBLIC = path.join(os.tmpdir(), "vaiking-no-public-dir");
const GOLDEN_RELEVANCE = [
  {
    q: "platform engineering for beginners",
    id: "1289832",
    title: "OpenChoreo: Developer Platform for Both Humans and Agents",
  },
  { q: "ebpf networking", id: "1289758", title: "CiliumCon Hosted by CNCF - Half Day Event" },
  {
    q: "kuberntes securty",
    id: "1356273",
    title: "Building, Scaling + Running Secure Agents on Kubernetes with AWS",
  },
];

function legs(req) {
  return req.retriever.rrf.retrievers;
}

for (const { q } of GOLDEN_RELEVANCE) {
  test(`request: "${q}" builds a hybrid query with shared filters`, () => {
    const req = s.buildSearchRequest({ q, limit: 10 });
    const [kw, sem] = legs(req);
    assert.equal(kw.standard.query.multi_match.query, q);
    assert.equal(kw.standard.query.multi_match.fuzziness, "AUTO");
    assert.deepEqual(kw.standard.query.multi_match.fields, ["title^3", "speakers^2", "tags^2", "abstract"]);
    assert.deepEqual(sem.standard.query, { match: { semantic_content: q } });
    assert.ok(req.retriever.rrf.rank_window_size >= req.size);
    assert.equal(req.retriever.rrf.filter.length, 1);
    assert.deepEqual(req.retriever.rrf.filter[0].bool.must_not[0].terms.track, ["Breaks", "Registration"]);
    assert.equal(req.highlight.encoder, "html");
    assert.ok(req.timeout);
  });
}

test(
  "live golden relevance: expected talks rank in the top 10",
  {
    skip:
      !process.env.ELASTICSEARCH_URL || !process.env.ELASTICSEARCH_API_KEY
        ? "set Elasticsearch credentials to verify live relevance"
        : false,
  },
  async () => {
    const elastic = createElastic();
    assert.equal(elastic.configured, true, "Elasticsearch must be configured");
    try {
      for (const { q, id, title } of GOLDEN_RELEVANCE) {
        const response = await elastic.client.search(s.buildSearchRequest({ q, limit: 10 }), {
          requestTimeout: 10_000,
          maxRetries: 0,
        });
        const hits = response.hits.hits;
        const ids = hits.map((hit) => hit._source.id);
        assert.ok(
          ids.includes(id),
          `expected ${title} (${id}) in the top 10 for "${q}"; got ${hits
            .map((hit) => `${hit._source.id} ${hit._source.title}`)
            .join(", ")}`,
        );
      }
    } finally {
      await elastic.client.close();
    }
  },
);

test("day filter is added in Denver time", () => {
  const filter = s.buildSearchRequest({ q: "x", day: "2026-11-10", limit: 5 }).retriever.rrf.filter;
  assert.equal(filter[1].range.starts_at.time_zone, "America/Denver");
});

test("limit and day parsing", () => {
  assert.equal(s.parseLimit(undefined), 10);
  assert.equal(s.parseLimit("500"), 20);
  assert.equal(s.parseLimit("-3"), 10);
  assert.ok(s.isDay("2026-11-10"));
  assert.ok(!s.isDay("2026-13-40"));
  assert.ok(!s.isDay("tomorrow"));
});

test("leg ranks come from the RRF explanation", () => {
  const e = { description: "rrf score: [0.03] computed for initial ranks [2, 0] with rankConstant: [60]" };
  assert.deepEqual(s.legRanks(e), { keyword_rank: 2, semantic_rank: null });
  assert.deepEqual(s.legRanks(undefined), { keyword_rank: null, semantic_rank: null });
});

test("highlights are escaped when falling back to the abstract", () => {
  const out = s.shapeResponse({
    took: 7,
    hits: { hits: [{ _source: { id: "1", abstract: "<script>x</script>" } }] },
  });
  assert.equal(out.took_ms, 7);
  assert.equal(out.results[0].highlight, "&lt;script&gt;x&lt;/script&gt;");
});

test("empty results carry a helpful message", () => {
  const out = s.shapeResponse({ took: 3, hits: { hits: [] } });
  assert.deepEqual(out.results, []);
  assert.match(out.message, /No talks matched/);
});

function appWith(elastic) {
  const app = build({ env: {}, publicDir: NO_PUBLIC, elastic });
  test.after(() => app.close());
  return app;
}

test("route: missing q is 400, unconfigured is 503, errors never leak", async () => {
  assert.equal((await appWith({ configured: false }).inject({ url: "/api/search" })).statusCode, 400);
  assert.equal((await appWith({ configured: false }).inject({ url: "/api/search?q=mesh" })).statusCode, 503);
  assert.equal((await appWith({ configured: false }).inject({ url: "/api/search?q=a&day=nope" })).statusCode, 400);
  const boom = { configured: true, client: { close() {}, search: async () => { throw Object.assign(new Error("https://secret.example"), { statusCode: 500 }); } } };
  const res = await appWith(boom).inject({ url: "/api/search?q=mesh" });
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.json(), { error: "search is not available right now" });
});

test("route: returns shaped results", async () => {
  const client = { close() {}, search: async () => ({ took: 12, hits: { hits: [{ _source: { id: "9", title: "Mesh" }, highlight: { title: ["<mark>Mesh</mark>"] } }] } }) };
  const res = await appWith({ configured: true, client }).inject({ url: "/api/search?q=mesh" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().results[0].highlight, "<mark>Mesh</mark>");
});
