// Query builders for /api/talks and /api/similar. Pure, so they test without a cluster.
const HIDDEN_FIELDS = ["semantic_content"];
const EXCLUDED_TRACKS = ["Breaks", "Registration"];
const MAX_IDS = 50;
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;
const ABSTRACT_CHARS = 300;
const SIMILAR_TIMEOUT = "700ms";

function parseIds(value) {
  if (typeof value !== "string") return [];
  const ids = value.split(",").map((s) => s.trim()).filter((s) => /^[\w-]{1,40}$/.test(s));
  return [...new Set(ids)].slice(0, MAX_IDS);
}

function parseWhen(value) {
  if (value === undefined) return { ok: true, value: null };
  const t = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(t)) return { ok: false };
  return { ok: true, value: new Date(t).toISOString() };
}

function parseLimit(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function seedText(talk) {
  const title = (talk.title ?? "").trim();
  const abstract = (talk.abstract ?? "").trim().slice(0, ABSTRACT_CHARS);
  return abstract ? `${title}. ${abstract}` : title;
}

// Talks that start inside the window the person can still reach.
function buildSimilarRequest({ talkId, text, after, before, limit }) {
  const filter = [{ bool: { must_not: [{ terms: { track: EXCLUDED_TRACKS } }, { ids: { values: [talkId] } }] } }];
  const range = {};
  if (after) range.gte = after;
  if (before) range.lte = before;
  if (after || before) filter.push({ range: { starts_at: range } });
  return {
    index: "talks",
    size: limit,
    timeout: SIMILAR_TIMEOUT,
    _source: { excludes: HIDDEN_FIELDS },
    query: {
      bool: {
        should: [
          { multi_match: { query: text, fields: ["title^2", "abstract", "tags"] } },
          { match: { semantic_content: text } },
        ],
        minimum_should_match: 1,
        filter,
      },
    },
  };
}

function buildMgetRequest(ids) {
  return { index: "talks", ids, _source_excludes: HIDDEN_FIELDS };
}

// Small bounded cache so repeat taps on the phone do not hit the cluster.
function createCache(max, ttlMs, now = Date.now) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (hit.expires < now()) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (map.size >= max) map.delete(map.keys().next().value);
      map.set(key, { value, expires: now() + ttlMs });
    },
  };
}

module.exports = { parseIds, parseWhen, parseLimit, seedText, buildSimilarRequest, buildMgetRequest, createCache, MAX_IDS };
