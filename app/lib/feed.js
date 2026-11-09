// Turns the public Sessionize feed into talk documents. The ingest script and
// the reconciler share this file: if they normalized differently, content_hash
// would differ and every talk would look changed.
const { createHash } = require("node:crypto");

const SOURCE_URL = "https://sessionize.com/api/v2/svi82w6c/view/All";
const SESSION_PAGE =
  "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule/?id=";
const EXCLUDED_TRACKS = new Set(["Breaks", "Registration"]);
// The feed's times have no offset; the conference runs on Mountain time.
const CONFERENCE_OFFSET = "-07:00";

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

function plainText(value) {
  return (value ?? "")
    .replace(/<\/p>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, name) => ENTITIES[name])
    .trim();
}

// Links in the feed are typed by speakers. Only http and https are kept, so a
// javascript: or data: value can never reach an href. Anything else becomes null.
function safeHttpUrl(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  try {
    const { protocol } = new URL(text);
    return protocol === "http:" || protocol === "https:" ? text : null;
  } catch {
    return null;
  }
}

function withOffset(time) {
  if (!time) return null;
  return /(Z|[+-]\d\d:\d\d)$/.test(time) ? time : time + CONFERENCE_OFFSET;
}

function hashOf(doc) {
  return createHash("sha256").update(JSON.stringify(doc)).digest("hex");
}

function normalize(feed) {
  const rooms = new Map(feed.rooms.map((r) => [r.id, r.name.trim()]));
  const questions = new Map(feed.questions.map((q) => [q.id, q.question]));
  const speakerNames = new Map(feed.speakers.map((p) => [p.id, p.fullName]));
  const categoryItems = new Map(
    feed.categories.flatMap((c) =>
      c.items.map((i) => [i.id, { category: c.title, name: i.name }]),
    ),
  );

  const docs = [];
  for (const session of feed.sessions) {
    const items = session.categoryItems
      .map((id) => categoryItems.get(id))
      .filter(Boolean);
    const namesIn = (...categories) =>
      items.filter((i) => categories.includes(i.category)).map((i) => i.name);

    const track = namesIn("All Sessions")[0] ?? null;
    if (EXCLUDED_TRACKS.has(track)) continue;

    const room = rooms.get(session.roomId) ?? "Room TBD";
    const floor = /Level\s*(\d+)/.exec(room);
    const slides = (session.questionAnswers ?? []).find(
      (a) => questions.get(a.questionId) === "Presentation Slides",
    );

    const doc = {
      id: String(session.id),
      title: plainText(session.title),
      abstract: plainText(session.description),
      speakers: session.speakers
        .map((id) => speakerNames.get(id))
        .filter(Boolean),
      tags: namesIn("CNCF Projects", "SubTopic"),
      track,
      level: namesIn("Audience Level"),
      flags: namesIn(
        "End User Programming",
        "Is Sponsored Keynote",
        "Solutions Showcase Programming",
      ),
      room,
      venue: room.split("|")[0].trim(),
      floor: floor ? Number(floor[1]) : null,
      starts_at: withOffset(session.startsAt),
      ends_at: withOffset(session.endsAt),
      url: safeHttpUrl(SESSION_PAGE + session.id),
      slides_url: safeHttpUrl(slides?.answerValue),
    };
    docs.push({ ...doc, content_hash: hashOf(doc) });
  }
  return { fetched: feed.sessions.length, docs };
}

module.exports = { SOURCE_URL, normalize, safeHttpUrl, plainText };
