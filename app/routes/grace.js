// POST /api/grace: counts one press of the break button. The body carries only
// the floor of the last planned talk and live/preview. The handler stores no
// identifier: the limiter key lives in memory only for one window, and the
// request log line is hidden (warn level) for this route.
// Known limit: the OTel auto-instrumentation set up through NODE_OPTIONS records
// its own server span for this route, and that span can carry the client IP and
// User-Agent as standard HTTP attributes. We do not strip them (the auto setup
// has no simple switch for it), so do not describe this route as having no
// identifying data in traces.
const { FLOORS, MODES, getMetrics, normalizeFloor } = require("../lib/metrics");

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const MAX_TRACKED = 5_000;
// Global cap on accepted presses per window. It is a backstop for the shared
// metric budget, and it is the only limit that holds if the per-client key is
// forged. Requests already rejected per client do not count toward it.
const MAX_TOTAL_PER_WINDOW = 1_200;

// Behind the platform gateway request.ip is the gateway for everyone. A client
// can send its own X-Forwarded-For, and the gateway appends the address it saw
// to the end, so the LEFT-most entry is spoofable and the RIGHT-most entry is the
// one the gateway added. Use the right-most. This assumes exactly one trusted
// proxy; if there are more, this is the last proxy's view, which still cannot be
// forged by the client. The key is used in memory only.
function clientKey(request) {
  const fwd = request.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) {
    const last = fwd.split(",").pop().trim();
    if (last) return last.slice(0, 64);
  }
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
    // Per-client check first, so a rejected request never drains the shared cap.
    if (!hits.has(ip) && hits.size >= MAX_TRACKED) return true;
    const n = (hits.get(ip) ?? 0) + 1;
    if (n > MAX_PER_WINDOW) return true;
    if (total >= MAX_TOTAL_PER_WINDOW) return true;
    hits.set(ip, n);
    total += 1;
    return false;
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
