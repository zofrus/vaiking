const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { build } = require("../server");
const { context } = require("@opentelemetry/api");
const { AsyncLocalStorageContextManager } = require("@opentelemetry/context-async-hooks");
const { isTracingSuppressed } = require("@opentelemetry/core");
const { withSpan } = require("../lib/search-trace");

const NO_PUBLIC = path.join(os.tmpdir(), "vaiking-no-public-dir");

function appWith(opts = {}) {
  const app = build({ env: {}, publicDir: NO_PUBLIC, ...opts });
  test.after(() => app.close());
  return app;
}

test("untraced operations suppress nested instrumentation spans", async () => {
  const contextManager = new AsyncLocalStorageContextManager().enable();
  assert.equal(context.setGlobalContextManager(contextManager), true);

  try {
    let suppressed;
    const result = await withSpan("elasticsearch.similar", "search", async () => {
      await Promise.resolve();
      suppressed = isTracingSuppressed(context.active());
      return "done";
    }, { traced: false });

    assert.equal(result, "done");
    assert.equal(suppressed, true);
    assert.equal(isTracingSuppressed(context.active()), false);
  } finally {
    contextManager.disable();
  }
});

for (const url of ["/healthz", "/readyz"]) {
  test(`${url} returns 200 without external calls`, async () => {
    const fetch = () => assert.fail("probe must not call out");
    const res = await appWith({ fetch }).inject({ url });
    assert.equal(res.statusCode, 200);
  });
}

test("/api/status reports not configured with no env", async () => {
  const res = await appWith().inject({ url: "/api/status" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), {
    version: "dev",
    elastic: { configured: false },
    telemetry: { configured: false },
  });
});

test("/api/status treats env as configured only when complete", async () => {
  const env = {
    APP_VERSION: "abc1234",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.example",
  };
  const partial = await appWith({ env }).inject({ url: "/api/status" });
  assert.equal(partial.json().telemetry.configured, false);
  assert.equal(partial.json().version, "abc1234");

  const full = await appWith({ env: { ...env, DASH0_AUTH_TOKEN: "x" } }).inject(
    { url: "/api/status" },
  );
  assert.equal(full.json().telemetry.configured, true);
});

test("/api/status?deep=1 returns no URLs or tokens and caches", async () => {
  const secret = "tok-should-not-appear";
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    return { status: 200 };
  };
  const elastic = {
    configured: true,
    client: {
      info: async () => ({ statusCode: 200 }),
      close: async () => {},
    },
  };
  const env = {
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.example:4318/x",
    DASH0_AUTH_TOKEN: secret,
  };
  const app = appWith({ env, fetch, elastic });

  const res = await app.inject({ url: "/api/status?deep=1" });
  const body = res.json();
  assert.equal(body.checks.elasticsearch.ok, true);
  assert.equal(body.checks.dash0.status, 200);
  assert.equal(body.checks.sessionize.ok, true);
  assert.equal(typeof body.checks.sessionize.durationMs, "number");
  assert.doesNotMatch(res.body, /otlp\.example|sessionize\.com|tok-should/);
  assert.deepEqual(
    calls.sort(),
    [
      "https://otlp.example:4318",
      "https://sessionize.com/api/v2/svi82w6c/view/All",
    ].sort(),
  );

  await app.inject({ url: "/api/status?deep=1" });
  assert.equal(calls.length, 2, "second call is served from the cache");
});

test("/api/status?deep=1 hides error details", async () => {
  const fetch = async () => {
    throw new Error("connect failed https://sessionize.com secret");
  };
  const res = await appWith({ fetch }).inject({ url: "/api/status?deep=1" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().checks.sessionize.ok, false);
  assert.equal(res.json().checks.elasticsearch.skipped, true);
  assert.doesNotMatch(res.body, /connect failed|secret/);
});

test("/api/public-config returns null rum until configured", async () => {
  const none = await appWith().inject({ url: "/api/public-config" });
  assert.deepEqual(none.json(), { version: "dev", rum: null });

  const env = {
    DASH0_RUM_ENDPOINT: "https://rum.example",
    DASH0_RUM_TOKEN: "t",
    DASH0_DATASET: "d",
  };
  const set = await appWith({ env }).inject({ url: "/api/public-config" });
  assert.deepEqual(set.json().rum, {
    endpoint: "https://rum.example",
    token: "t",
    dataset: "d",
  });
});

test("SPA fallback serves index for pages, 404 for API and missing assets", async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaiking-public-"));
  fs.writeFileSync(path.join(publicDir, "index.html"), "<h1>shell</h1>");
  const app = appWith({ publicDir });

  assert.match((await app.inject({ url: "/" })).body, /shell/);
  const page = await app.inject({ url: "/some/page" });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /shell/);
  assert.equal((await app.inject({ url: "/api/nope" })).statusCode, 404);
  assert.equal((await app.inject({ url: "/assets/nope.js" })).statusCode, 404);
});

test("request log serializer drops the query string", () => {
  const { serializeReq } = require("../server");
  assert.deepEqual(
    serializeReq({ method: "GET", url: "/api/search?q=secret+words&day=1", headers: { a: "b" } }),
    { method: "GET", url: "/api/search" },
  );
  assert.deepEqual(serializeReq({ method: "GET", url: "/api/talks" }), { method: "GET", url: "/api/talks" });
});

test("every response carries the hardening headers, pages and API alike", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vaiking-pub-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>t</title>");
  const app = build({ env: {}, publicDir: dir });
  test.after(() => app.close());
  for (const url of ["/", "/board", "/api/status", "/healthz", "/api/nope"]) {
    const res = await app.inject(url);
    assert.equal(res.headers["x-content-type-options"], "nosniff", url);
    assert.equal(res.headers["referrer-policy"], "strict-origin-when-cross-origin", url);
    assert.equal(res.headers["content-security-policy"], "frame-ancestors 'self'", url);
  }
});
