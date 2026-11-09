#!/usr/bin/env node
// Indexes app/data/facilities.json as facilities-v1 so one store holds everything.
//   node scripts/ingest-facilities.mjs
// Needs ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY. Prints counts only.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(new URL('../app/package.json', import.meta.url));
if (
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
  !process.env.NODE_OPTIONS?.includes('@opentelemetry/auto-instrumentations-node/register')
) {
  require('@opentelemetry/auto-instrumentations-node/register');
}
const { SpanStatusCode, trace } = require('@opentelemetry/api');
const { Client } = require('@elastic/elasticsearch');
const tracer = trace.getTracer('vaiking-ingest');

const INDEX = 'facilities-v1';
const node = process.env.ELASTICSEARCH_URL;
const apiKey = process.env.ELASTICSEARCH_API_KEY;
if (!node || !apiKey) {
  console.error('ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY must be set.');
  process.exit(2);
}

const docs = JSON.parse(readFileSync(new URL('../app/data/facilities.json', import.meta.url), 'utf8'));
const client = new Client({ node, auth: { apiKey }, serverMode: 'serverless', requestTimeout: 30_000 });
await tracer.startActiveSpan('elasticsearch.ingest_facilities', async (span) => {
  span.setAttribute('db.system.name', 'elasticsearch');
try {
  if (!(await client.indices.exists({ index: INDEX }))) {
    await client.indices.create({
      index: INDEX,
      aliases: { facilities: {} },
      mappings: {
        properties: {
          id: { type: 'keyword' },
          kind: { type: 'keyword' },
          name: { type: 'text' },
          audience: { type: 'keyword' },
          venue: { type: 'keyword' },
          floor: { type: 'integer' },
          notes: { type: 'text' },
          hours: { type: 'keyword' },
        },
      },
    });
  }
  const stats = await client.helpers.bulk({
    datasource: docs,
    onDocument: (doc) => ({ index: { _index: INDEX, _id: doc.id } }),
  });
  console.log(`facilities written=${stats.successful} failed=${stats.failed}`);
  if (stats.failed > 0) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    process.exitCode = 1;
  }
} catch (err) {
  span.recordException({ name: err?.name ?? 'Error' });
  span.setStatus({ code: SpanStatusCode.ERROR });
  console.error(`facilities ingest failed: ${err.name}${err.statusCode ? ` status=${err.statusCode}` : ''}`);
  process.exitCode = 1;
} finally {
  span.end();
  await client.close();
}
});
