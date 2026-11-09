// Times how long a shared plan takes to answer (GET /api/talks?ids=...) and
// counts it as plan_requests_total{within_1s}. The SLO target is "share
// answered within 1 second". Only a duration is recorded, never the ids.
const { getMetrics } = require("../lib/metrics");

async function planTiming(app, opts) {
  const metrics = opts.metrics ?? getMetrics();
  app.addHook("onResponse", async (request, reply) => {
    if (request.method !== "GET") return;
    if (request.routeOptions?.url !== "/api/talks") return;
    // Server errors count as slow: a failed answer is not a good answer.
    const ms = reply.statusCode >= 500 ? Infinity : reply.elapsedTime;
    metrics.recordPlan(ms);
  });
}

// Skip Fastify's encapsulation so the hook sees routes registered by other seats.
planTiming[Symbol.for("skip-override")] = true;

module.exports = planTiming;
