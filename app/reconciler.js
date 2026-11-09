// Keeps the talks index in step with the real schedule and records what changed.
// Runs as its own Deployment: node reconciler.js
const http = require("node:http");
const { setTimeout: sleep } = require("node:timers/promises");
const { SpanStatusCode, metrics, trace } = require("@opentelemetry/api");
const { createElastic } = require("./lib/elastic");
const { SOURCE_URL, normalize } = require("./lib/feed");
const { STATE_FIELDS, feedProblem, diffTalks } = require("./lib/feed-diff");

const INTERVAL_MS = 2 * 60 * 1000;
const STALE_AFTER_MS = 5 * INTERVAL_MS;
const HEALTH_PORT = 8081;
const FEED_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 60_000;

const TALKS = "talks";
const CHANGES_INDEX = "changes-v1";
const CHANGES_ALIAS = "changes";
const KINDS = ["moved", "rescheduled", "cancelled", "added"];

const CHANGES_MAPPINGS = {
  properties: {
    id: { type: "keyword" },
    talk_id: { type: "keyword" },
    kind: { type: "keyword" },
    before: { type: "object", enabled: false },
    after: { type: "object", enabled: false },
    detected_at: { type: "date" },
  },
};

const tracer = trace.getTracer("vaiking-reconciler");

function createChangeCounter(meter = metrics.getMeter("vaiking-reconciler")) {
  const counter = meter.createCounter("schedule_changes_total", {
    description: "Real schedule changes found in the feed",
  });
  // Adding 0 makes each series exist before the first change, so increase() has a baseline.
  for (const kind of KINDS) counter.add(0, { kind });
  return (kind) => counter.add(1, { kind });
}

async function fetchFeed() {
  const res = await fetch(SOURCE_URL, {
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });
  if (!res.ok)
    throw Object.assign(new Error("feed request failed"), {
      statusCode: res.status,
    });
  return res.json();
}

async function loadTalks(client) {
  const res = await client.search({
    index: TALKS,
    size: 2000,
    _source: STATE_FIELDS,
    query: { match_all: {} },
  });
  return new Map(res.hits.hits.map((hit) => [hit._source.id, hit._source]));
}

async function writeTalk(client, doc) {
  await client.index(
    { index: TALKS, id: doc.id, document: doc },
    { requestTimeout: WRITE_TIMEOUT_MS },
  );
}

async function removeTalk(client, id) {
  await client.delete({ index: TALKS, id }, { ignore: [404] });
}

// False when this change was already recorded by an earlier, interrupted cycle.
async function recordChange(client, entry, detectedAt) {
  try {
    await client.index({
      index: CHANGES_INDEX,
      id: entry.id,
      op_type: "create",
      document: { ...entry, detected_at: detectedAt },
    });
    return true;
  } catch (err) {
    if (err?.statusCode === 409) return false;
    throw err;
  }
}

// Change first, talk second: if the talk write fails, the next cycle sees the
// same difference and tries again, and the stable id stops a duplicate.
async function applyDiff({ client, diff, now, countChange }) {
  const upserts = new Map(diff.upserts.map((doc) => [doc.id, doc]));
  const removals = new Set(diff.removals);
  let recorded = 0;
  let failed = 0;

  for (const entry of diff.changes) {
    try {
      if (await recordChange(client, entry, now)) {
        recorded += 1;
        countChange(entry.kind);
      }
      if (upserts.has(entry.talk_id))
        await writeTalk(client, upserts.get(entry.talk_id));
      if (removals.has(entry.talk_id)) await removeTalk(client, entry.talk_id);
    } catch (err) {
      failed += 1;
      trace.getActiveSpan()?.recordException({ name: err?.name ?? "Error" });
      console.error(
        JSON.stringify({
          msg: "reconcile write failed",
          talk_id: entry.talk_id,
          error: err?.name ?? "Error",
          status: err?.statusCode ?? null,
        }),
      );
    }
    upserts.delete(entry.talk_id);
  }

  // What is left changed in ways nobody needs telling about, such as a new abstract.
  for (const doc of upserts.values()) {
    try {
      await writeTalk(client, doc);
    } catch (err) {
      failed += 1;
      trace.getActiveSpan()?.recordException({ name: err?.name ?? "Error" });
      console.error(
        JSON.stringify({
          msg: "reconcile write failed",
          talk_id: doc.id,
          error: err?.name ?? "Error",
          status: err?.statusCode ?? null,
        }),
      );
    }
  }
  return { recorded, failed };
}

// The first run brings the index up to date and tells nobody: differences from
// before the reconciler existed are not news.
async function recordBaseline(client, diff) {
  for (const doc of diff.upserts) await writeTalk(client, doc);
  for (const id of diff.removals) await removeTalk(client, id);
  await client.indices.create({
    index: CHANGES_INDEX,
    mappings: CHANGES_MAPPINGS,
    aliases: { [CHANGES_ALIAS]: {} },
  });
}

async function reconcileOnce({
  client,
  getFeed = fetchFeed,
  normalizeFeed = normalize,
  countChange = () => {},
  now = () => new Date().toISOString(),
}) {
  let docs;
  try {
    ({ docs } = normalizeFeed(await getFeed()));
  } catch (err) {
    return {
      outcome: "skipped",
      reason: "feed_failed",
      status: err?.statusCode ?? null,
    };
  }

  const current = await loadTalks(client);
  if (current.size === 0) return { outcome: "skipped", reason: "talks_empty" };

  const problem = feedProblem(current, docs);
  if (problem) return { outcome: "skipped", reason: problem };

  const diff = diffTalks(current, docs);
  if (!(await client.indices.exists({ index: CHANGES_INDEX }))) {
    await recordBaseline(client, diff);
    return {
      outcome: "baseline",
      talks: docs.length,
      updated: diff.upserts.length,
    };
  }

  const { recorded, failed } = await applyDiff({
    client,
    diff,
    now: now(),
    countChange,
  });
  return {
    outcome: "reconciled",
    talks: docs.length,
    changes: recorded,
    updated: diff.upserts.length,
    failed,
  };
}

async function tracedCycle(options) {
  return tracer.startActiveSpan("reconciler.cycle", async (span) => {
    try {
      const result = await reconcileOnce(options);
      span.setAttribute("reconciler.outcome", result.outcome);
      if (result.reason) span.setAttribute("reconciler.reason", result.reason);
      if (result.changes !== undefined)
        span.setAttribute("reconciler.changes", result.changes);
      if (result.failed) span.setStatus({ code: SpanStatusCode.ERROR });
      return result;
    } catch (err) {
      span.recordException({ name: err?.name ?? "Error" });
      span.setStatus({ code: SpanStatusCode.ERROR });
      return {
        outcome: "failed",
        error: err?.name ?? "Error",
        status: err?.statusCode ?? null,
      };
    } finally {
      span.end();
    }
  });
}

function logResult(result) {
  // Fixed fields only: client errors can carry the endpoint.
  console.log(JSON.stringify({ msg: "reconcile cycle", ...result }));
}

function startHealthServer(getLastCycle) {
  const server = http.createServer((req, res) => {
    const healthy =
      req.url !== "/healthz" || Date.now() - getLastCycle() < STALE_AFTER_MS;
    res.writeHead(healthy ? 200 : 503, { "content-type": "text/plain" });
    res.end(healthy ? "ok\n" : "stale\n");
  });
  server.listen(HEALTH_PORT, "0.0.0.0");
  return server;
}

async function main() {
  const elastic = createElastic();
  const countChange = createChangeCounter();
  const stopping = new AbortController();
  let lastCycle = Date.now();
  const server = startHealthServer(() => lastCycle);

  // Stop the loop and let the process end by itself, so the OpenTelemetry
  // SIGTERM handler has time to flush.
  const stop = () => stopping.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  while (!stopping.signal.aborted) {
    logResult(
      elastic.configured
        ? await tracedCycle({ client: elastic.client, countChange })
        : { outcome: "skipped", reason: "elastic_not_configured" },
    );
    lastCycle = Date.now();
    await sleep(INTERVAL_MS, undefined, { signal: stopping.signal }).catch(
      () => {},
    );
  }

  server.close();
  if (elastic.client) await elastic.client.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("reconciler failed:", err.name);
    process.exitCode = 1;
  });
}

module.exports = { reconcileOnce };
