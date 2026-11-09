// Times the requests behind the plan screen (search, the changes poll, and
// talks by id) and counts them as plan_requests_total{within_1s}. The SLO
// target is "plan requests answered within 1 second". Only a duration is
// recorded, never search text or ids. /api/similar is left out on purpose:
// it follows a break press, so it gets no telemetry (see app/otel.js).
const { getMetrics } = require("../lib/metrics");

const PLAN_ROUTES = new Set(["/api/search", "/api/changes", "/api/talks"]);

async function planTiming(app, opts) {
  const metrics = opts.metrics ?? getMetrics();
  app.addHook("onResponse", async (request, reply) => {
    if (request.method !== "GET") return;
    if (!PLAN_ROUTES.has(request.routeOptions?.url)) return;
    // Server errors count as slow: a failed answer is not a good answer.
    const ms = reply.statusCode >= 500 ? Infinity : reply.elapsedTime;
    metrics.recordPlan(ms);
  });
}

// Skip Fastify's encapsulation so the hook sees routes registered by other seats.
planTiming[Symbol.for("skip-override")] = true;

module.exports = planTiming;
