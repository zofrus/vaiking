// Builds and shapes the hybrid talk search. Pure functions, so the query can be
// tested without a cluster.
const EXCLUDED_TRACKS = ["Breaks", "Registration"];
const TIME_ZONE = "America/Denver";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const MAX_QUERY_LENGTH = 200;
const RANK_WINDOW = 50;
const SEARCH_TIMEOUT = "2s";
const HIDDEN_FIELDS = ["semantic_content"];

function parseLimit(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function cleanQuery(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

function isDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

// Applied to both legs of the fusion, so each leg ranks the same candidate set.
function buildFilters({ day, track } = {}) {
  const filters = [
    { bool: { must_not: [{ terms: { track: EXCLUDED_TRACKS } }] } },
  ];
  if (day) {
    filters.push({
      range: {
        starts_at: { gte: day, lte: day, format: "yyyy-MM-dd", time_zone: TIME_ZONE },
      },
    });
  }
  // Exact match on the keyword field, so "Security" never matches "Security + X".
  if (track) filters.push({ term: { track } });
  return filters;
}

// Typos are handled here: fuzziness is ignored on semantic_text fields.
function keywordLeg(q) {
  return {
    standard: {
      query: {
        multi_match: {
          query: q,
          fields: ["title^3", "speakers^2", "tags^2", "abstract"],
          fuzziness: "AUTO",
        },
      },
    },
  };
}

function semanticLeg(q) {
  return { standard: { query: { match: { semantic_content: q } } } };
}

const FACET_AGGS = {
  tracks: { terms: { field: "track", size: 30 } },
  days: {
    date_histogram: {
      field: "starts_at",
      calendar_interval: "day",
      time_zone: TIME_ZONE,
      format: "yyyy-MM-dd",
      min_doc_count: 1,
    },
  },
};

function buildSearchRequest({ q, day, track, limit }) {
  return {
    index: "talks",
    size: limit,
    timeout: SEARCH_TIMEOUT,
    _source: { excludes: HIDDEN_FIELDS },
    explain: true,
    aggs: FACET_AGGS,
    retriever: {
      rrf: {
        retrievers: [keywordLeg(q), semanticLeg(q)],
        rank_window_size: RANK_WINDOW,
        rank_constant: 60,
        filter: buildFilters({ day, track }),
      },
    },
    highlight: {
      encoder: "html",
      pre_tags: ["<mark>"],
      post_tags: ["</mark>"],
      fields: {
        title: { number_of_fragments: 0 },
        abstract: { number_of_fragments: 1, fragment_size: 180 },
      },
    },
  };
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// Reads "computed for initial ranks [1, 0]" out of the RRF explanation. A rank
// of 0 means that leg did not return the talk.
function legRanks(explanation) {
  const text = JSON.stringify(explanation ?? "");
  const match = /initial ranks \[([\d,\s]+)\]/.exec(text);
  const none = { keyword_rank: null, semantic_rank: null };
  if (!match) return none;
  const [kw, sem] = match[1].split(",").map((s) => Number.parseInt(s, 10));
  return {
    keyword_rank: kw > 0 ? kw : null,
    semantic_rank: sem > 0 ? sem : null,
  };
}

function shapeHit(hit) {
  const marked = hit.highlight?.abstract?.[0] ?? hit.highlight?.title?.[0];
  const fallback = escapeHtml((hit._source.abstract ?? "").slice(0, 180));
  return {
    ...hit._source,
    highlight: marked ?? fallback,
    why: legRanks(hit._explanation),
  };
}

function shapeFacets(aggs) {
  const bucket = (b) => ({ value: b.key_as_string ?? String(b.key), count: b.doc_count });
  return {
    tracks: (aggs?.tracks?.buckets ?? []).filter((b) => !EXCLUDED_TRACKS.includes(b.key)).map(bucket),
    days: (aggs?.days?.buckets ?? []).map(bucket),
  };
}

function shapeResponse(res) {
  const hits = res.hits?.hits ?? [];
  const body = { took_ms: res.took ?? null, results: hits.map(shapeHit), facets: shapeFacets(res.aggregations) };
  if (hits.length === 0) {
    body.message =
      "No talks matched. Try fewer or simpler words, or describe what you want to learn.";
  }
  return body;
}

module.exports = {
  EXCLUDED_TRACKS,
  TIME_ZONE,
  MAX_QUERY_LENGTH,
  parseLimit,
  cleanQuery,
  isDay,
  buildFilters,
  buildSearchRequest,
  escapeHtml,
  legRanks,
  shapeFacets,
  shapeResponse,
};
