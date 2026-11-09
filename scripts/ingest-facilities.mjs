#!/usr/bin/env node
// Indexes app/data/facilities.json as facilities-v1 so one store holds everything.
//   node scripts/ingest-facilities.mjs
// Needs ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY. Prints counts only.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../app/package.json', import.meta.url));
if (
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
  !process.env.NODE_OPTIONS?.includes('@opentelemetry/auto-instrumentations-node/register')
) {
  require('@opentelemetry/auto-instrumentations-node/register');
}
const { SpanStatusCode, trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('vaiking-ingest');

const INDEX = 'facilities-v1';
const ALIAS = 'facilities';
const INFERENCE_ID = '.jina-embeddings-v5-text-small';
const DB_ATTRIBUTES = { 'db.system.name': 'elasticsearch', 'db.collection.name': INDEX };

export const MAPPINGS = {
  properties: {
    id: { type: 'keyword' },
    kind: { type: 'keyword' },
    name: { type: 'text' },
    audience: { type: 'keyword' },
    venue: { type: 'keyword' },
    floor: { type: 'integer' },
    notes: { type: 'text' },
    hours: { type: 'keyword' },
    content_hash: { type: 'keyword' },
    semantic_content: { type: 'semantic_text', inference_id: INFERENCE_ID },
  },
};

export function toIndexedDocument(doc) {
  const semanticContent = [doc.kind, doc.name, doc.audience, doc.venue, doc.notes]
    .filter(Boolean)
    .join('. ');
  return { ...doc, semantic_content: semanticContent };
}

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

function createClient(node, apiKey) {
  const { Client } = require('@elastic/elasticsearch');
  return new Client({ node, auth: { apiKey }, serverMode: 'serverless', requestTimeout: 30_000 });
}

async function ensureIndex(client) {
  return withSpan('elasticsearch.ensure_index', DB_ATTRIBUTES, async () => {
    const exists = await withSpan('elasticsearch.indices.exists', DB_ATTRIBUTES, () =>
      client.indices.exists({ index: INDEX }),
    );
    if (!exists) {
      await withSpan('elasticsearch.indices.create', DB_ATTRIBUTES, () =>
        client.indices.create({ index: INDEX, aliases: { [ALIAS]: {} }, mappings: MAPPINGS }),
      );
      return;
    }

    // Existing indices need the semantic fields too; use the unchanged existing
    // field mappings and only add fields, which Elasticsearch permits in place.
    await withSpan('elasticsearch.indices.put_mapping', DB_ATTRIBUTES, () =>
      client.indices.putMapping({
        index: INDEX,
        properties: {
          content_hash: MAPPINGS.properties.content_hash,
          semantic_content: MAPPINGS.properties.semantic_content,
        },
      }),
    );
    const aliasExists = await withSpan('elasticsearch.indices.exists_alias', DB_ATTRIBUTES, () =>
      client.indices.existsAlias({ name: ALIAS, index: INDEX }),
    );
    if (!aliasExists) {
      await withSpan('elasticsearch.indices.put_alias', DB_ATTRIBUTES, () =>
        client.indices.putAlias({ index: INDEX, name: ALIAS }),
      );
    }
  });
}

export async function ingest(client, docs) {
  return withSpan('elasticsearch.ingest', DB_ATTRIBUTES, async (span) => {
    await ensureIndex(client);
    let stats = { successful: 0, failed: 0 };
    if (docs.length > 0) {
      stats = await withSpan('elasticsearch.bulk_index', DB_ATTRIBUTES, (bulkSpan) =>
        client.helpers.bulk({
          datasource: docs.map(toIndexedDocument),
          onDocument: (doc) => ({ index: { _index: INDEX, _id: doc.id } }),
          onDrop: () => {
            console.error('Elasticsearch bulk dropped a document');
            bulkSpan.recordException({ name: 'ElasticsearchBulkDrop' });
            bulkSpan.setStatus({ code: SpanStatusCode.ERROR });
          },
        }),
      );
    }

    let deleted = 0;
    if (docs.length > 0 && stats.failed === 0) {
      ({ deleted } = await withSpan('elasticsearch.delete_by_query', DB_ATTRIBUTES, () =>
        client.deleteByQuery({
          index: INDEX,
          query: { bool: { must_not: { ids: { values: docs.map((doc) => doc.id) } } } },
          refresh: true,
        }),
      ));
    } else {
      span.setAttribute('ingest.prune_skipped', true);
      console.warn(`prune skipped: docs=${docs.length} failed=${stats.failed}`);
    }

    if (stats.failed > 0) span.setStatus({ code: SpanStatusCode.ERROR });
    return { successful: stats.successful, failed: stats.failed, deleted };
  });
}

async function main() {
  const node = process.env.ELASTICSEARCH_URL;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  if (!node || !apiKey) {
    console.error('ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY must be set.');
    process.exitCode = 2;
    return;
  }

  const docs = JSON.parse(readFileSync(new URL('../app/data/facilities.json', import.meta.url), 'utf8'));
  if (!Array.isArray(docs)) throw new TypeError('facilities.json must contain an array.');
  const client = createClient(node, apiKey);
  try {
    const stats = await ingest(client, docs);
    console.log(`facilities written=${stats.successful} failed=${stats.failed} deleted=${stats.deleted}`);
    if (stats.failed > 0) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // Name and status only: client errors can carry the endpoint.
    console.error(`facilities ingest failed: ${err.name}${err.statusCode ? ` status=${err.statusCode}` : ''}`);
    process.exitCode = 1;
  });
}
