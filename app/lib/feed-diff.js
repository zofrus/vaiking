// Pure comparison of what the index holds against what the feed says.
const { createHash } = require("node:crypto");

// A full feed is about 580 talks. Anything well short of that is a bad feed.
const MIN_FEED_DOCS = 400;
const MIN_MISSING_LIMIT = 20;
const MISSING_FRACTION = 0.05;

const SNAPSHOT_FIELDS = [
  "title",
  "room",
  "venue",
  "floor",
  "starts_at",
  "ends_at",
];
const STATE_FIELDS = ["id", "content_hash", ...SNAPSHOT_FIELDS];

function snapshot(talk) {
  return Object.fromEntries(
    SNAPSHOT_FIELDS.map((field) => [field, talk[field] ?? null]),
  );
}

// One change per talk: a new time matters more to someone than a new room, and
// before/after still carry both.
function kindOf(before, after) {
  if (before.starts_at !== after.starts_at || before.ends_at !== after.ends_at)
    return "rescheduled";
  if (before.room !== after.room) return "moved";
  return null;
}

// Stable across retries, so a crash between writes cannot record a change twice.
function changeId(talkId, kind, before, after) {
  return createHash("sha256")
    .update(JSON.stringify([talkId, kind, before, after]))
    .digest("hex")
    .slice(0, 24);
}

function change(talkId, kind, before, after) {
  return {
    id: changeId(talkId, kind, before, after),
    talk_id: talkId,
    kind,
    before,
    after,
  };
}

// Returns a reason to skip this cycle, or null when the feed can be trusted.
function feedProblem(current, docs) {
  if (docs.length < MIN_FEED_DOCS) return "feed_too_short";
  const incoming = new Set(docs.map((doc) => doc.id));
  const missing = [...current.keys()].filter((id) => !incoming.has(id)).length;
  const limit = Math.max(
    MIN_MISSING_LIMIT,
    Math.ceil(current.size * MISSING_FRACTION),
  );
  return missing > limit ? "too_many_missing" : null;
}

// current: Map of id to the stored talk. docs: normalized feed documents.
// Only documents whose hash differs are returned, so nothing re-embeds needlessly.
function diffTalks(current, docs) {
  const changes = [];
  const upserts = [];
  const incoming = new Set();

  for (const doc of docs) {
    incoming.add(doc.id);
    const stored = current.get(doc.id);
    if (stored?.content_hash === doc.content_hash) continue;
    upserts.push(doc);
    const after = snapshot(doc);
    if (!stored) {
      changes.push(change(doc.id, "added", null, after));
      continue;
    }
    const before = snapshot(stored);
    const kind = kindOf(before, after);
    if (kind) changes.push(change(doc.id, kind, before, after));
  }

  const removals = [];
  for (const [id, stored] of current) {
    if (incoming.has(id)) continue;
    removals.push(id);
    changes.push(change(id, "cancelled", snapshot(stored), null));
  }

  return { changes, upserts, removals };
}

module.exports = { STATE_FIELDS, feedProblem, diffTalks };
