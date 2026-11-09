const { withSpan } = require("../lib/search-trace");
const {
  parseWhen, parseLimit, seedText, buildSimilarRequest, createCache,
} = require("../lib/search-similar");

const OPTIONS = { requestTimeout: 800, maxRetries: 0 };

module.exports = async function similar(app, { elastic }) {
  const seeds = createCache(500, 10 * 60_000);
  const answers = createCache(500, 60_000);

  app.get("/api/similar", async (request, reply) => {
    const talkId = typeof request.query.talk_id === "string" ? request.query.talk_id.trim() : "";
    if (!/^[\w-]{1,40}$/.test(talkId)) return reply.code(400).send({ error: "talk_id is required" });
    const after = parseWhen(request.query.after);
    const before = parseWhen(request.query.before);
    if (!after.ok || !before.ok) return reply.code(400).send({ error: "after and before must be ISO times" });
    if (!elastic.configured) return reply.code(503).send({ error: "similar talks are not available right now" });
    const limit = parseLimit(request.query.limit);

    const key = [talkId, after.value, before.value, limit].join("|");
    const cached = answers.get(key);
    if (cached) return cached;

    try {
      let text = seeds.get(talkId);
      if (text === undefined) {
        const talk = await withSpan("elasticsearch.get", "get", () =>
          elastic.client.get({ index: "talks", id: talkId, _source_includes: ["title", "abstract"] }, OPTIONS),
        ).catch((err) => (err?.statusCode === 404 ? null : Promise.reject(err)));
        if (!talk) return reply.code(404).send({ error: "talk not found" });
        text = seedText(talk._source);
        seeds.set(talkId, text);
      }
      if (!text) return { results: [] };
      const res = await withSpan("elasticsearch.similar", "search", () =>
        elastic.client.search(
          buildSimilarRequest({ talkId, text, after: after.value, before: before.value, limit }),
          OPTIONS,
        ),
      );
      const body = { results: (res.hits?.hits ?? []).map((h) => h._source) };
      answers.set(key, body);
      return body;
    } catch (err) {
      request.log.error({ status: err?.statusCode ?? null }, "similar failed");
      return reply.code(502).send({ error: "similar talks are not available right now" });
    }
  });
};
