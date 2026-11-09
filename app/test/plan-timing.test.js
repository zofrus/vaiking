const test = require("node:test");
const assert = require("node:assert/strict");
const Fastify = require("fastify");
const planTiming = require("../routes/plan-timing");

async function run(handler) {
  const recorded = [];
  const app = Fastify();
  await app.register(planTiming, {
    metrics: { recordPlan: (ms) => recorded.push(ms) },
  });
  app.get("/api/talks", handler);
  app.get("/api/other", async () => ({}));
  app.get("/api/similar", async () => ({}));
  await app.inject({ url: "/api/other" });
  await app.inject({ url: "/api/similar?talk_id=a" });
  await app.inject({ url: "/api/talks?ids=a" });
  await app.close();
  return recorded;
}

test("records a fast /api/talks answer and ignores other routes, including /api/similar", async () => {
  const recorded = await run(async () => ({ talks: [] }));
  assert.equal(recorded.length, 1);
  assert.ok(recorded[0] < 1000);
});

test("records the search and changes requests the plan screen makes", async () => {
  const recorded = [];
  const app = Fastify();
  await app.register(planTiming, {
    metrics: { recordPlan: (ms) => recorded.push(ms) },
  });
  app.get("/api/search", async () => ({ results: [] }));
  app.get("/api/changes", async () => ({ changes: [] }));
  await app.inject({ url: "/api/search?q=kubernetes" });
  await app.inject({ url: "/api/changes?since=2026-11-09T00:00:00Z" });
  await app.close();
  assert.equal(recorded.length, 2);
  assert.ok(recorded.every((ms) => ms < 1000));
});

test("a 5xx counts as slow", async () => {
  const recorded = await run(async (req, reply) => reply.code(500).send({}));
  assert.deepEqual(recorded, [Infinity]);
});
