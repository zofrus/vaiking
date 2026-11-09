const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { build } = require("../../app/server");

test("/api/facilities lists the quiet rooms with unknown hours", async () => {
  const app = build({ env: {}, publicDir: path.join(os.tmpdir(), "vaiking-no-public-dir") });
  test.after(() => app.close());
  const res = await app.inject({ url: "/api/facilities" });
  assert.equal(res.statusCode, 200);
  const { facilities } = res.json();
  const quiet = facilities.filter((f) => f.kind === "quiet_room");
  assert.deepEqual(quiet.map((f) => f.audience), ["all", "women_nonbinary"]);
  assert.equal(facilities.filter((f) => f.kind === "all_gender_restroom").length, 6);
  for (const f of facilities) {
    assert.equal(f.hours, null);
    assert.deepEqual(Object.keys(f).sort(), ["audience", "floor", "hours", "id", "kind", "name", "notes", "venue"]);
  }
});

function fakeElasticsearch({ failed = 0 } = {}) {
  const calls = { bulkDocuments: [], deleteQueries: [], mappings: [] };
  return {
    calls,
    indices: {
      exists: async () => true,
      putMapping: async (mapping) => calls.mappings.push(mapping),
      existsAlias: async () => true,
    },
    helpers: {
      bulk: async ({ datasource, onDocument }) => {
        for (const doc of datasource) {
          onDocument(doc);
          calls.bulkDocuments.push(doc);
        }
        return { successful: datasource.length - failed, failed };
      },
    },
    deleteByQuery: async (query) => {
      calls.deleteQueries.push(query);
      return { deleted: 1 };
    },
  };
}

test("facilities ingest maps and indexes semantic content", async () => {
  const { MAPPINGS, toIndexedDocument, ingest } = await import("../../scripts/ingest-facilities.mjs");
  assert.deepEqual(MAPPINGS.properties.semantic_content, {
    type: "semantic_text",
    inference_id: ".jina-embeddings-v5-text-small",
  });
  assert.equal(MAPPINGS.properties.content_hash.type, "keyword");
  const doc = {
    id: "quiet-260a",
    kind: "quiet_room",
    name: "Quiet room 260A",
    audience: "all",
    venue: "Salt Palace",
    notes: "Open to all attendees.",
  };
  assert.equal(
    toIndexedDocument(doc).semantic_content,
    "quiet_room. Quiet room 260A. all. Salt Palace. Open to all attendees.",
  );

  const client = fakeElasticsearch();
  await ingest(client, [doc]);
  assert.equal(client.calls.bulkDocuments[0].semantic_content, toIndexedDocument(doc).semantic_content);
  assert.deepEqual(client.calls.mappings[0].properties.semantic_content, MAPPINGS.properties.semantic_content);
});

test("facilities ingest removes records missing from a successful non-empty source", async () => {
  const { ingest } = await import("../../scripts/ingest-facilities.mjs");
  const client = fakeElasticsearch();
  await ingest(client, [{ id: "quiet-260a", kind: "quiet_room", name: "Quiet room 260A" }]);
  assert.deepEqual(client.calls.deleteQueries[0].query.bool.must_not.ids.values, ["quiet-260a"]);
});

test("facilities ingest does not prune on empty input or failed writes", async () => {
  const { ingest } = await import("../../scripts/ingest-facilities.mjs");
  const emptyClient = fakeElasticsearch();
  await ingest(emptyClient, []);
  assert.equal(emptyClient.calls.deleteQueries.length, 0);

  const failedClient = fakeElasticsearch({ failed: 1 });
  await ingest(failedClient, [{ id: "quiet-260a", kind: "quiet_room", name: "Quiet room 260A" }]);
  assert.equal(failedClient.calls.deleteQueries.length, 0);
});
