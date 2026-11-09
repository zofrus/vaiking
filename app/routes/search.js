const { SpanStatusCode, trace } = require("@opentelemetry/api");
const { buildSearchRequest, cleanQuery, isDay, parseLimit, shapeResponse } = require("../lib/search");

const { createGuard } = require("../lib/guard");

const CACHE_MS = 8_000;
const tracer = trace.getTracer("vaiking-search");
const REQUEST_OPTIONS = { requestTimeout: 3000, maxRetries: 0 };

module.exports = async function search(app, { elastic, env }) {
  const guarded = createGuard({ env, ttlMs: CACHE_MS });
  app.get("/api/search", async (request, reply) => {
    const q = cleanQuery(request.query.q);
    if (!q) return reply.code(400).send({ error: "q is required" });
    const { day } = request.query;
    if (day !== undefined && !isDay(day)) {
      return reply.code(400).send({ error: "day must look like 2026-11-10" });
    }
    const track = typeof request.query.track === "string" ? request.query.track.trim().slice(0, 80) : "";
    if (!elastic.configured) {
      return reply.code(503).send({ error: "search is not available right now" });
    }
    const limit = parseLimit(request.query.limit);
    const key = JSON.stringify([q.toLowerCase(), day ?? "", track, limit]);
    try {
      // The span records the operation only, never the query text.
      return await guarded(request, reply, key, () =>
        tracer.startActiveSpan("elasticsearch.search", async (span) => {
          span.setAttribute("db.system.name", "elasticsearch");
          span.setAttribute("db.operation.name", "search");
          try {
            const res = await elastic.client.search(
              buildSearchRequest({ q, day, track: track || undefined, limit }),
              REQUEST_OPTIONS,
            );
            const shaped = shapeResponse(res);
            span.setAttribute("search.result_count", shaped.results.length);
            return shaped;
          } catch (err) {
            span.recordException({ name: err?.name ?? "Error" });
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw err;
          } finally {
            span.end();
          }
        }),
      );
    } catch (err) {
      // Status only: client errors can carry the endpoint or the query.
      request.log.error({ status: err?.statusCode ?? null }, "search failed");
      return reply.code(502).send({ error: "search is not available right now" });
    }
  });
};
