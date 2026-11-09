const { withSpan } = require("../lib/search-trace");
const { parseIds, buildMgetRequest } = require("../lib/search-similar");

module.exports = async function talks(app, { elastic }) {
  app.get("/api/talks", async (request, reply) => {
    const ids = parseIds(request.query.ids);
    if (ids.length === 0) return reply.code(400).send({ error: "ids is required, for example ids=1,2" });
    if (!elastic.configured) return reply.code(503).send({ error: "talks are not available right now" });
    try {
      const res = await withSpan("elasticsearch.mget", "mget", () =>
        elastic.client.mget(buildMgetRequest(ids), { requestTimeout: 3000, maxRetries: 0 }),
      );
      const found = new Map(res.docs.filter((d) => d.found).map((d) => [d._id, d._source]));
      // Keep the order the caller asked for; unknown ids are simply left out.
      return { talks: ids.filter((id) => found.has(id)).map((id) => found.get(id)) };
    } catch (err) {
      request.log.error({ status: err?.statusCode ?? null }, "talks lookup failed");
      return reply.code(502).send({ error: "talks are not available right now" });
    }
  });
};
