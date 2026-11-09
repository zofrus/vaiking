#!/usr/bin/env node
// Loads the public conference schedule into Elasticsearch.
//   node scripts/ingest-sessionize.mjs [--dry-run]
// Needs ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY unless --dry-run is given.
// Prints counts only. Unchanged documents are skipped so re-runs do not re-embed.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const SOURCE_URL = 'https://sessionize.com/api/v2/svi82w6c/view/All';
const SESSION_PAGE = 'https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule/?id=';
const INDEX = 'talks-v1';
const ALIAS = 'talks';
const INFERENCE_ID = '.jina-embeddings-v5-text-small';
const EXCLUDED_TRACKS = new Set(['Breaks', 'Registration']);
// The feed's times have no offset; the conference runs on Mountain time.
const CONFERENCE_OFFSET = '-07:00';

// One set of field names, shared by the mapping and normalize() below.
const MAPPINGS = {
  properties: {
    id: { type: 'keyword' },
    title: { type: 'text', copy_to: 'semantic_content' },
    abstract: { type: 'text', copy_to: 'semantic_content' },
    speakers: { type: 'text', fields: { raw: { type: 'keyword' } } },
    tags: { type: 'text', fields: { raw: { type: 'keyword' } } },
    track: { type: 'keyword' },
    level: { type: 'keyword' },
    flags: { type: 'keyword' },
    room: { type: 'keyword' },
    venue: { type: 'keyword' },
    floor: { type: 'integer' },
    starts_at: { type: 'date' },
    ends_at: { type: 'date' },
    url: { type: 'keyword', index: false },
    slides_url: { type: 'keyword', index: false },
    content_hash: { type: 'keyword' },
    semantic_content: { type: 'semantic_text', inference_id: INFERENCE_ID },
  },
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };

function plainText(value) {
  return (value ?? '')
    .replace(/<\/p>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, name) => ENTITIES[name])
    .trim();
}

function withOffset(time) {
  if (!time) return null;
  return /(Z|[+-]\d\d:\d\d)$/.test(time) ? time : time + CONFERENCE_OFFSET;
}

function hashOf(doc) {
  return createHash('sha256').update(JSON.stringify(doc)).digest('hex');
}

export function normalize(feed) {
  const rooms = new Map(feed.rooms.map((r) => [r.id, r.name.trim()]));
  const questions = new Map(feed.questions.map((q) => [q.id, q.question]));
  const speakerNames = new Map(feed.speakers.map((p) => [p.id, p.fullName]));
  const categoryItems = new Map(
    feed.categories.flatMap((c) => c.items.map((i) => [i.id, { category: c.title, name: i.name }])),
  );

  const docs = [];
  for (const session of feed.sessions) {
    const items = session.categoryItems.map((id) => categoryItems.get(id)).filter(Boolean);
    const namesIn = (...categories) =>
      items.filter((i) => categories.includes(i.category)).map((i) => i.name);

    const track = namesIn('All Sessions')[0] ?? null;
    if (EXCLUDED_TRACKS.has(track)) continue;

    const room = rooms.get(session.roomId) ?? 'Room TBD';
    const floor = /Level\s*(\d+)/.exec(room);
    const slides = (session.questionAnswers ?? []).find(
      (a) => questions.get(a.questionId) === 'Presentation Slides',
    );

    const doc = {
      id: String(session.id),
      title: plainText(session.title),
      abstract: plainText(session.description),
      speakers: session.speakers.map((id) => speakerNames.get(id)).filter(Boolean),
      tags: namesIn('CNCF Projects', 'SubTopic'),
      track,
      level: namesIn('Audience Level'),
      flags: namesIn('End User Programming', 'Is Sponsored Keynote', 'Solutions Showcase Programming'),
      room,
      venue: room.split('|')[0].trim(),
      floor: floor ? Number(floor[1]) : null,
      starts_at: withOffset(session.startsAt),
      ends_at: withOffset(session.endsAt),
      url: SESSION_PAGE + session.id,
      slides_url: slides?.answerValue ?? null,
    };
    docs.push({ ...doc, content_hash: hashOf(doc) });
  }
  return { fetched: feed.sessions.length, docs };
}

async function fetchFeed() {
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw Object.assign(new Error('fetch failed'), { statusCode: res.status });
  return res.json();
}

function createClient() {
  const node = process.env.ELASTICSEARCH_URL;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  if (!node || !apiKey) return null;
  // The dependency is installed in app/, next to the server that uses it.
  const require = createRequire(new URL('../app/package.json', import.meta.url));
  const { Client } = require('@elastic/elasticsearch');
  return new Client({ node, auth: { apiKey }, serverMode: 'serverless', requestTimeout: 120_000 });
}

async function ensureIndex(client) {
  if (!(await client.indices.exists({ index: INDEX }))) {
    await client.indices.create({ index: INDEX, mappings: MAPPINGS, aliases: { [ALIAS]: {} } });
    return;
  }
  if (!(await client.indices.existsAlias({ name: ALIAS, index: INDEX }))) {
    await client.indices.putAlias({ index: INDEX, name: ALIAS });
  }
}

async function findChanged(client, docs) {
  const existing = new Map();
  for (let i = 0; i < docs.length; i += 500) {
    const ids = docs.slice(i, i + 500).map((d) => d.id);
    const { docs: found } = await client.mget({ index: INDEX, ids, _source: ['content_hash'] });
    for (const hit of found) if (hit.found) existing.set(hit._id, hit._source.content_hash);
  }
  return docs.filter((d) => existing.get(d.id) !== d.content_hash);
}

async function ingest(client, docs) {
  await ensureIndex(client);
  const changed = await findChanged(client, docs);
  if (changed.length === 0) return { changed: 0, written: 0, failed: 0 };
  const stats = await client.helpers.bulk({
    datasource: changed,
    onDocument: (doc) => ({ index: { _index: INDEX, _id: doc.id } }),
    flushBytes: 1_000_000,
    concurrency: 2,
    retries: 3,
    onDrop: () => {},
  });
  return { changed: changed.length, written: stats.successful, failed: stats.failed };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const client = dryRun ? null : createClient();
  if (!dryRun && !client) {
    console.error('ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY must be set (or pass --dry-run).');
    process.exitCode = 2;
    return;
  }

  const { fetched, docs } = normalize(await fetchFeed());
  console.log(`fetched=${fetched} normalized=${docs.length} excluded=${fetched - docs.length}`);

  if (dryRun) {
    console.log(JSON.stringify(docs.find((d) => d.speakers.length > 0) ?? docs[0], null, 2));
    return;
  }

  const { changed, written, failed } = await ingest(client, docs);
  console.log(`unchanged=${docs.length - changed} changed=${changed} written=${written} failed=${failed}`);
  await client.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  // Name and status only: client errors can carry the endpoint.
  console.error(`ingest failed: ${err.name}${err.statusCode ? ` status=${err.statusCode}` : ''}`);
  process.exitCode = 1;
});
