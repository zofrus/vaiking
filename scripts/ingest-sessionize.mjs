#!/usr/bin/env node
// Loads the public conference schedule into Elasticsearch.
//   node scripts/ingest-sessionize.mjs [--dry-run]
// Needs ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY unless --dry-run is given.
// Prints counts only. Unchanged documents are skipped so re-runs do not re-embed.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../app/package.json', import.meta.url));
if (
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
  !process.env.NODE_OPTIONS?.includes('@opentelemetry/auto-instrumentations-node/register')
) {
  require('@opentelemetry/auto-instrumentations-node/register');
}
const { SpanStatusCode, trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('vaiking-ingest');

// Shared with the reconciler, so both compute the same content_hash.
const { SOURCE_URL, normalize } = require('./lib/feed.js');

const INDEX = 'talks-v1';
const ALIAS = 'talks';
const INFERENCE_ID = '.jina-embeddings-v5-text-small';

// One set of field names, shared by the mapping and normalize().
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

async function withSpan(name, attributes, operation) {
  return tracer.startActiveSpan(name, async (span) => {
    for (const [key, value] of Object.entries(attributes)) span.setAttribute(key, value);
    try {
      return await operation(span);
    } catch (err) {
      span.recordException({ name: err?.name ?? 'Error' });
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}

async function fetchFeed() {
  return withSpan(
    'sessionize.fetch_feed',
    { 'http.request.method': 'GET', 'server.address': 'sessionize.com' },
    async () => {
      const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw Object.assign(new Error('fetch failed'), { statusCode: res.status });
      return res.json();
    },
  );
}

function createClient() {
  const node = process.env.ELASTICSEARCH_URL;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  if (!node || !apiKey) return null;
  // The dependency is installed in app/, next to the server that uses it.
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

const MIN_DOCS_TO_PRUNE = 400;

async function ingest(client, docs) {
  return withSpan(
    'elasticsearch.ingest',
    { 'db.system.name': 'elasticsearch' },
    async (span) => {
      await ensureIndex(client);
      const changed = await findChanged(client, docs);
      let stats = { successful: 0, failed: 0 };
      if (changed.length > 0) {
        stats = await client.helpers.bulk({
          datasource: changed,
          onDocument: (doc) => ({ index: { _index: INDEX, _id: doc.id } }),
          flushBytes: 1_000_000,
          concurrency: 2,
          retries: 3,
          onDrop: () => {
            console.error('Elasticsearch bulk dropped a document');
            span.recordException({ name: 'ElasticsearchBulkDrop' });
            span.setStatus({ code: SpanStatusCode.ERROR });
          },
        });
      }
      // A short or failed feed must never wipe the index, so prune only after a
      // clean write of a feed that looks complete (about 580 sessions in full).
      let deleted = 0;
      if (docs.length >= MIN_DOCS_TO_PRUNE && stats.failed === 0) {
        const current = docs.map((doc) => doc.id);
        ({ deleted } = await client.deleteByQuery({
          index: INDEX,
          query: { bool: { must_not: { ids: { values: current } } } },
          refresh: true,
        }));
      } else {
        span.setAttribute('ingest.prune_skipped', true);
        console.warn(`prune skipped: docs=${docs.length} failed=${stats.failed}`);
      }
      if (stats.failed > 0) span.setStatus({ code: SpanStatusCode.ERROR });
      return { changed: changed.length, written: stats.successful, failed: stats.failed, deleted };
    },
  );
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

  const { changed, written, failed, deleted } = await ingest(client, docs);
  console.log(`unchanged=${docs.length - changed} changed=${changed} written=${written} failed=${failed} deleted=${deleted}`);
  await client.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  // Name and status only: client errors can carry the endpoint.
  console.error(`ingest failed: ${err.name}${err.statusCode ? ` status=${err.statusCode}` : ''}`);
  process.exitCode = 1;
});
