const test = require("node:test");
const assert = require("node:assert/strict");
const Fastify = require("fastify");
const changesRoute = require("../routes/changes");

const CHANGE = {
  id: "abc",
  talk_id: "7",
  kind: "moved",
  before: { room: "A" },
  after: { room: "B" },
  detected_at: "2026-11-10T20:00:00.000Z",
};

async function appWith(elastic) {
  const app = Fastify({ logger: false });
  await app.register(changesRoute, { elastic });
  return app;
}

function configured(search) {
  return { configured: true, client: { search } };
}

test("returns changes newest first and capped, with the server's time", async () => {
  let request;
  const app = await appWith(
    configured(async (body) => {
      request = body;
      return { hits: { hits: [{ _source: CHANGE }] } };
    }),
  );
  const res = await app.inject("/api/changes");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().changes, [CHANGE]);
  assert.ok(Date.parse(res.json().now));
  assert.equal(request.sort[0].detected_at.order, "desc");
  assert.equal(request.size, 100);
  assert.deepEqual(request.query, { match_all: {} });
});

test("since filters to strictly newer changes", async () => {
  let request;
  const app = await appWith(
    configured(async (body) => {
      request = body;
      return { hits: { hits: [] } };
    }),
  );
  await app.inject("/api/changes?since=2026-11-10T20:00:00Z");
  assert.deepEqual(request.query, {
    range: { detected_at: { gt: "2026-11-10T20:00:00.000Z" } },
  });
});

test("a bad since is a 400 and never reaches Elasticsearch", async () => {
  const app = await appWith(
    configured(async () => {
      throw new Error("should not be called");
    }),
  );
  const res = await app.inject("/api/changes?since=yesterday");
  assert.equal(res.statusCode, 400);
  assert.ok(res.json().error);
});

test("reports 503 when Elasticsearch is not configured", async () => {
  const app = await appWith({ configured: false, client: null });
  assert.equal((await app.inject("/api/changes")).statusCode, 503);
});

test("never exposes a raw Elasticsearch error", async () => {
  const app = await appWith(
    configured(async () => {
      throw Object.assign(new Error("https://secret.example failed"), {
        statusCode: 500,
      });
    }),
  );
  const res = await app.inject("/api/changes");
  assert.equal(res.statusCode, 502);
  assert.ok(!res.body.includes("secret.example"));
});
