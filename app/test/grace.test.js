const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { build } = require("../server");
const { createMetrics, normalizeFloor } = require("../lib/metrics");

const NO_PUBLIC = path.join(os.tmpdir(), "vaiking-no-public-dir");

function appWith() {
  const app = build({ env: {}, publicDir: NO_PUBLIC });
  test.after(() => app.close());
  return app;
}

test("normalizeFloor maps to the allowlist or unknown", () => {
  assert.equal(normalizeFloor("Level 2"), "2");
  assert.equal(normalizeFloor("L3"), "3");
  assert.equal(normalizeFloor("Lobby"), "lobby");
  assert.equal(normalizeFloor("lobby"), "lobby");
  assert.equal(normalizeFloor("Ground"), "ground");
  assert.equal(normalizeFloor("room 355F, jane@example.com"), "unknown");
  assert.equal(normalizeFloor(undefined), "unknown");
  assert.equal(normalizeFloor("unknown"), "unknown");
});

test("metrics record only the two allowed labels", () => {
  const calls = [];
  const meter = {
    createCounter: () => ({ add: (v, attrs) => calls.push([v, attrs]) }),
  };
  const m = createMetrics(meter);
  calls.length = 0;
  m.recordGrace("Level 2", "live");
  m.recordGrace("secret name", "preview");
  assert.deepEqual(calls, [
    [1, { scheduled_floor: "2", mode: "live" }],
    [1, { scheduled_floor: "unknown", mode: "preview" }],
  ]);
});

test("startup zero-fills every floor and mode", () => {
  const calls = [];
  const meter = {
    createCounter: () => ({ add: (v, attrs) => calls.push([v, attrs]) }),
  };
  createMetrics(meter);
  assert.ok(calls.every(([v]) => v === 0));
  assert.ok(
    calls.some(
      ([, a]) => a.scheduled_floor === "unknown" && a.mode === "preview",
    ),
  );
});

test("POST /api/grace returns 204 for valid bodies, floor optional", async () => {
  const app = appWith();
  for (const payload of [
    { scheduled_floor: "2", mode: "live" },
    { scheduled_floor: "unknown", mode: "preview" },
    { mode: "live" },
  ]) {
    const res = await app.inject({
      method: "POST",
      url: "/api/grace",
      payload,
    });
    assert.equal(res.statusCode, 204);
  }
});

test("POST /api/grace rejects bad or missing mode with JSON error", async () => {
  const app = appWith();
  for (const payload of [{ mode: "other" }, {}]) {
    const res = await app.inject({
      method: "POST",
      url: "/api/grace",
      payload,
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: "invalid request" });
  }
});

test("POST /api/grace ignores extra fields instead of reading them", async () => {
  const app = build({ env: {}, publicDir: NO_PUBLIC });
  test.after(() => app.close());
  const res = await app.inject({
    method: "POST",
    url: "/api/grace",
    payload: { mode: "live", user: "someone" },
  });
  assert.equal(res.statusCode, 204);
});

test("POST /api/grace rate limits per IP", async () => {
  const app = appWith();
  let last;
  for (let i = 0; i < 31; i++) {
    last = await app.inject({
      method: "POST",
      url: "/api/grace",
      headers: { "x-forwarded-for": "10.9.9.9, 10.0.0.1" },
      payload: { mode: "live" },
    });
  }
  assert.equal(last.statusCode, 429);
  const other = await app.inject({
    method: "POST",
    url: "/api/grace",
    headers: { "x-forwarded-for": "10.9.9.8" },
    payload: { mode: "live" },
  });
  assert.equal(other.statusCode, 204);
});
