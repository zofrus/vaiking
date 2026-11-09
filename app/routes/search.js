const { buildSearchRequest, cleanQuery, isDay, parseLimit, shapeResponse } = require("../lib/search");

const REQUEST_OPTIONS = { requestTimeout: 3000, maxRetries: 0 };

module.exports = async function search(app, { elastic }) {
  app.get("/api/search", async (request, reply) => {
    const q = cleanQuery(request.query.q);
    if (!q) return reply.code(400).send({ error: "q is required" });
    const { day } = request.query;
    if (day !== undefined && !isDay(day)) {
      return reply.code(400).send({ error: "day must look like 2026-11-10" });
    }
    if (!elastic.configured) {
      return reply.code(503).send({ error: "search is not available right now" });
    }
    try {
      const res = await elastic.client.search(
        buildSearchRequest({ q, day, limit: parseLimit(request.query.limit) }),
        REQUEST_OPTIONS,
      );
      return shapeResponse(res);
    } catch (err) {
      // Status only: client errors can carry the endpoint or the query.
      request.log.error({ status: err?.statusCode ?? null }, "search failed");
      return reply.code(502).send({ error: "search is not available right now" });
    }
  });
};
