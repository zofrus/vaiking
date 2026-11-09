const { withSpan } = require("../lib/search-trace");

const MAX_CHANGES = 100;
const UNAVAILABLE = "schedule changes are not available right now";

function buildChangesRequest(sinceMs) {
  return {
    index: "changes",
    // Before the reconciler's first run there is no index yet, which just means no changes.
    ignore_unavailable: true,
    size: MAX_CHANGES,
    sort: [{ detected_at: { order: "desc", unmapped_type: "date" } }],
    query:
      sinceMs === null
        ? { match_all: {} }
        : { range: { detected_at: { gt: new Date(sinceMs).toISOString() } } },
  };
}

module.exports = async function changes(app, { elastic }) {
  app.get("/api/changes", async (request, reply) => {
    const { since } = request.query;
    const sinceMs = since === undefined ? null : Date.parse(since);
    if (Number.isNaN(sinceMs)) {
      return reply.code(400).send({ error: "since must be an ISO 8601 time" });
    }
    if (!elastic.configured)
      return reply.code(503).send({ error: UNAVAILABLE });

    try {
      const now = new Date().toISOString();
      const res = await withSpan("elasticsearch.search", "search", () =>
        elastic.client.search(buildChangesRequest(sinceMs), {
          requestTimeout: 3000,
          maxRetries: 0,
        }),
      );
      return { now, changes: res.hits.hits.map((hit) => hit._source) };
    } catch (err) {
      request.log.error(
        { status: err?.statusCode ?? null },
        "changes lookup failed",
      );
      return reply.code(502).send({ error: UNAVAILABLE });
    }
  });
};
