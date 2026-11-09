// POST /api/grace: counts one press of the break button. The body carries only
// the floor of the last planned talk and live/preview. Nothing identifying is
// read, stored or logged, and the request log line is hidden (warn level) for this route.
const { FLOORS, MODES, getMetrics, normalizeFloor } = require("../lib/metrics");

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const MAX_TRACKED = 5_000;
// Backstop in case the per-IP key can be spoofed through forwarded headers.
const MAX_TOTAL_PER_WINDOW = 1_200;

// Behind the platform gateway request.ip is the gateway for everyone, so use the
// first forwarded address when present. The key is used in memory only.
function clientKey(request) {
  const fwd = request.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return request.ip;
}

module.exports = async function grace(app, opts) {
  const metrics = opts.metrics ?? getMetrics();
  // Per-IP counts live in memory only, are never logged, and are dropped each window.
  let hits = new Map();
  let total = 0;
  let windowEnds = Date.now() + WINDOW_MS;

  function limited(ip) {
    const now = Date.now();
    if (now >= windowEnds) {
      hits = new Map();
      total = 0;
      windowEnds = now + WINDOW_MS;
    }
    if (++total > MAX_TOTAL_PER_WINDOW) return true;
    if (!hits.has(ip) && hits.size >= MAX_TRACKED) return true;
    const n = (hits.get(ip) ?? 0) + 1;
    hits.set(ip, n);
    return n > MAX_PER_WINDOW;
  }

  app.post(
    "/api/grace",
    {
      logLevel: "warn",
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
      if (limited(clientKey(request))) {
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
    if (status === 500)
      request.log.error({ err: err.code ?? err.name }, "grace failed");
    reply.code(status).send({
      error: status === 400 ? "invalid request" : "request failed",
    });
  });
};

module.exports.FLOORS = FLOORS;
