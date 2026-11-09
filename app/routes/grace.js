// POST /api/grace: counts one press of the break button. The body carries only
// the floor of the last planned talk and live/preview. Nothing identifying is
// read, stored or logged, and the request log line is silenced for this route.
const { FLOORS, MODES, getMetrics, normalizeFloor } = require("../lib/metrics");

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const MAX_TRACKED = 5_000;

module.exports = async function grace(app, opts) {
  const metrics = opts.metrics ?? getMetrics();
  // Per-IP counts live in memory only, are never logged, and are dropped each window.
  let hits = new Map();
  let windowEnds = Date.now() + WINDOW_MS;

  function limited(ip) {
    const now = Date.now();
    if (now >= windowEnds) {
      hits = new Map();
      windowEnds = now + WINDOW_MS;
    }
    if (!hits.has(ip) && hits.size >= MAX_TRACKED) return true;
    const n = (hits.get(ip) ?? 0) + 1;
    hits.set(ip, n);
    return n > MAX_PER_WINDOW;
  }

  app.post(
    "/api/grace",
    {
      logLevel: "silent",
      schema: {
        body: {
          type: "object",
          required: ["mode"],
          properties: {
            scheduled_floor: { type: "string", maxLength: 32 },
            mode: { type: "string", enum: MODES },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (limited(request.ip)) {
        return reply.code(429).header("retry-after", "60").send({
          error: "too many requests",
        });
      }
      const { scheduled_floor: floor, mode } = request.body;
      metrics.recordGrace(normalizeFloor(floor), mode);
      return reply.code(204).send();
    },
  );

  app.setErrorHandler((err, request, reply) => {
    const status =
      err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    reply.code(status).send({
      error: status === 400 ? "invalid request" : "request failed",
    });
  });
};

module.exports.FLOORS = FLOORS;
