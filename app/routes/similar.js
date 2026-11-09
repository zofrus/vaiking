const { withSpan } = require("../lib/search-trace");
const {
  parseWhen, parseLimit, seedText, buildSimilarRequest, createCache,
} = require("../lib/search-similar");

const { clientKey, createLimiter } = require("../lib/guard");

const BUDGET_MS = 800;
const OPTIONS = { maxRetries: 0, openTelemetry: { enabled: false } };

function similarResponse(results) {
  return results.length === 0
    ? { results, message: "No similar talks found. Try widening the time window." }
    : { results };
}

// Phones send times with seconds that differ on every tap. Cutting to the minute
// makes repeat taps share one cache entry; talks start on whole minutes.
function floorToMinute(iso) {
  if (iso === null) return null;
  const t = Date.parse(iso);
  return new Date(t - (t % 60_000)).toISOString();
}

module.exports = async function similar(app, { elastic, env = process.env, totalLimiter }) {
  const perClient = Number.parseInt(env.RATE_LIMIT_PER_MIN, 10) || 120;
  const total = Number.parseInt(env.RATE_LIMIT_TOTAL_PER_MIN, 10) || 600;
  const limited = createLimiter({ perClient, total, totalLimiter });
  const seeds = createCache(500, 10 * 60_000);
  const answers = createCache(500, 60_000);

  // logLevel "warn" keeps the per-request log lines out, as /api/grace does:
  // their timestamps alone would show a lookup that follows a break press.
  app.get("/api/similar", { logLevel: "warn" }, async (request, reply) => {
    const talkId = typeof request.query.talk_id === "string" ? request.query.talk_id.trim() : "";
    if (!/^[\w-]{1,40}$/.test(talkId)) return reply.code(400).send({ error: "talk_id is required" });
    const after = parseWhen(request.query.after);
    const before = parseWhen(request.query.before);
    if (!after.ok || !before.ok) return reply.code(400).send({ error: "after and before must be ISO times" });
    if (!elastic.configured) return reply.code(503).send({ error: "similar talks are not available right now" });
    const limit = parseLimit(request.query.limit);

    const afterMin = floorToMinute(after.value);
    const beforeMin = floorToMinute(before.value);
    const key = [talkId, afterMin, beforeMin, limit].join("|");
    const cached = answers.get(key);
    if (cached) return cached;
    // Only requests that would reach Elasticsearch are counted.
    if (limited(clientKey(request))) {
      return reply.code(429).header("retry-after", "60").send({
        error: "too many requests, try again in a minute",
      });
    }
    const deadline = Date.now() + BUDGET_MS;

    try {
      const requestOptions = () => {
        const requestTimeout = deadline - Date.now();
        if (requestTimeout <= 0) throw new Error("similar request deadline exceeded");
        return { ...OPTIONS, requestTimeout };
      };
      let text = seeds.get(talkId);
      if (text === undefined) {
        const talk = await withSpan("elasticsearch.get", "get", () =>
          elastic.client.get(
            { index: "talks", id: talkId, _source_includes: ["title", "abstract"] },
            requestOptions(),
          ),
          { traced: false },
        ).catch((err) => (err?.statusCode === 404 ? null : Promise.reject(err)));
        if (!talk) return reply.code(404).send({ error: "talk not found" });
        text = seedText(talk._source);
        seeds.set(talkId, text);
      }
      if (!text) return similarResponse([]);
      const res = await withSpan("elasticsearch.similar", "search", () =>
        elastic.client.search(
          buildSimilarRequest({ talkId, text, after: afterMin, before: beforeMin, limit }),
          requestOptions(),
        ),
        { traced: false },
      );
      const body = similarResponse((res.hits?.hits ?? []).map((h) => h._source));
      answers.set(key, body);
      return body;
    } catch (err) {
      request.log.error({ status: err?.statusCode ?? null }, "similar failed");
      return reply.code(502).send({ error: "similar talks are not available right now" });
    }
  });
};
