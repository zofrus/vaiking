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
  await app.inject({ url: "/api/other" });
  await app.inject({ url: "/api/talks?ids=a" });
  await app.close();
  return recorded;
}

test("records a fast /api/talks answer and ignores other routes", async () => {
  const recorded = await run(async () => ({ talks: [] }));
  assert.equal(recorded.length, 1);
  assert.ok(recorded[0] < 1000);
});

test("a 5xx counts as slow", async () => {
  const recorded = await run(async (req, reply) => reply.code(500).send({}));
  assert.deepEqual(recorded, [Infinity]);
});
