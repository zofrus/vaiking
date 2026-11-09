// Shared protection for the routes that call Elasticsearch, so a loop on the
// public demo cannot burn the trial's budget.
//
// Order matters: a cache hit costs nothing, so it is answered before the rate
// limit is checked. A roomful of people on one venue Wi-Fi share one gateway-seen
// address, and when they search the same thing they must not count against each
// other. Only requests that would really reach Elasticsearch are counted.

const { createCache } = require("./search-similar");

const WINDOW_MS = 60_000;
const MAX_TRACKED = 5_000;

// Behind the platform gateway request.ip is the gateway for everyone. The
// gateway appends the address it saw to X-Forwarded-For, so the right-most entry
// is the real client and the left entries are client-controlled. Checked on the
// live site: changing the forged left value did not change the limiter key. Same
// rule as routes/grace.js. The key is held in memory only and never logged.
function clientKey(request) {
  const fwd = request.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) {
    const last = fwd.split(",").pop().trim();
    if (last) return last.slice(0, 64);
  }
  return request.ip;
}

function envInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// grace.effulgentpoint.com is a Vercel rewrite to this app, so everyone who comes
// through it arrives from Vercel's address and would share one normal-size
// bucket. Requests that name that host share the bucket "proxy:grace" instead,
// with GRACE_PROXY_MULTIPLIER times the per-client cap. Forging the header only
// buys a place in that shared bucket, and the total limits hold for everyone.
// Either header is accepted: which one reaches the app through the platform
// gateway could not be checked from outside.
const PROXY_BUCKET = "proxy:grace";
const HOST_HEADERS = ["x-forwarded-host", "x-vercel-forwarded-host"];

function viaGraceProxy(request, env) {
  const want = String(env.GRACE_PROXY_HOST || "grace.effulgentpoint.com").trim().toLowerCase();
  return HOST_HEADERS.some((name) => {
    const value = request.headers[name];
    return value != null && String(value).split(",").some((h) => h.trim().toLowerCase() === want);
  });
}

// The limiter bucket for a request, and how many times the per-client cap it gets.
function clientBucket(request, env = process.env) {
  if (viaGraceProxy(request, env)) return { key: PROXY_BUCKET, scale: envInt(env.GRACE_PROXY_MULTIPLIER, 20) };
  return { key: clientKey(request), scale: 1 };
}

// perClient is per gateway-seen address, so it is deliberately roomy: many
// attendees can share one address. total is the backstop for the budget and is
// the limit that still holds if many addresses are used.
function createTotalLimiter({ total, windowMs = WINDOW_MS, now = Date.now }) {
  let count = 0;
  let windowEnds = now() + windowMs;
  return function totalLimited() {
    const t = now();
    if (t >= windowEnds) {
      count = 0;
      windowEnds = t + windowMs;
    }
    if (count >= total) return true;
    count += 1;
    return false;
  };
}

function createLimiter({ perClient, total, windowMs = WINDOW_MS, now = Date.now, totalLimiter }) {
  let hits = new Map();
  let windowEnds = now() + windowMs;
  const totalLimited = totalLimiter ?? createTotalLimiter({ total, windowMs, now });
  return function limited(key, scale = 1) {
    const t = now();
    if (t >= windowEnds) {
      hits = new Map();
      windowEnds = t + windowMs;
    }
    if (!hits.has(key) && hits.size >= MAX_TRACKED) return true;
    const n = (hits.get(key) ?? 0) + 1;
    if (n > perClient * scale) return true;
    if (totalLimited()) return true;
    hits.set(key, n);
    return false;
  };
}

// Answers from cache, otherwise runs load() once even if many identical
// requests arrive together. Failures are never cached.
function createGuard({ env = process.env, ttlMs, max = 500, now = Date.now, totalLimiter }) {
  const limited = createLimiter({
    perClient: envInt(env.RATE_LIMIT_PER_MIN, 120),
    total: envInt(env.RATE_LIMIT_TOTAL_PER_MIN, 3000),
    now,
    totalLimiter,
  });
  const cache = createCache(max, ttlMs, now);
  const inflight = new Map();

  return async function guarded(request, reply, key, load) {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let pending = inflight.get(key);
    if (!pending) {
      const bucket = clientBucket(request, env);
      if (limited(bucket.key, bucket.scale)) {
        return reply.code(429).header("retry-after", "60").send({
          error: "too many requests, try again in a minute",
        });
      }
      pending = load()
        .then((value) => {
          cache.set(key, value);
          return value;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    return pending;
  };
}

module.exports = { clientKey, clientBucket, createLimiter, createTotalLimiter, createGuard, envInt };
