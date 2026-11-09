const test = require("node:test");
const assert = require("node:assert/strict");
const Fastify = require("fastify");
const board = require("../routes/board");

const ENV = {
  DASH0_API_URL: "https://api.example/prom/",
  DASH0_READ_TOKEN: "t",
};

function prom(rows) {
  return {
    ok: true,
    json: async () => ({
      status: "success",
      data: {
        resultType: "vector",
        result: rows.map(([f, n]) => ({
          metric: { scheduled_floor: f },
          value: [1, String(n)],
        })),
      },
    }),
  };
}

async function make(env, fetch) {
  const app = Fastify();
  await app.register(board, { env, fetch });
  test.after(() => app.close());
  return app;
}

test("not configured returns an empty board with a note", async () => {
  const app = await make({}, () => assert.fail("no call"));
  const res = await app.inject({ url: "/api/board" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().live, []);
  assert.match(res.json().sample_note, /not connected/);
});

test("reads live and preview, sorts, drops zeros, flags small samples, sends token only in header", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return url.includes("preview")
      ? prom([["3", 1]])
      : prom([
          ["2", 3],
          ["4", 0],
          ["3", 5.4],
        ]);
  };
  const app = await make(ENV, fetch);
  const body = (await app.inject({ url: "/api/board" })).json();
  assert.deepEqual(body.live, [
    { floor: "3", count: 5 },
    { floor: "2", count: 3 },
  ]);
  assert.deepEqual(body.preview, [{ floor: "3", count: 1 }]);
  assert.match(body.sample_note, /Small sample: 8 presses/);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => !c.url.includes("token")));
  assert.equal(calls[0].init.headers.authorization, "Bearer t");
  assert.match(calls[0].url, /\/api\/prometheus\/api\/v1\/query\?/);
  assert.match(
    decodeURIComponent(calls[0].url).replace(/\+/g, " "),
    /round\(sum by \(scheduled_floor\)/,
  );
});

test("reports preview taps separately when there are no live presses", async () => {
  const app = await make(ENV, async (url) =>
    url.includes("preview") ? prom([["3", 2]]) : prom([]),
  );
  const body = (await app.inject({ url: "/api/board" })).json();
  assert.deepEqual(body.live, []);
  assert.deepEqual(body.preview, [{ floor: "3", count: 2 }]);
  assert.equal(
    body.sample_note,
    "No live presses in the last hour; only preview taps.",
  );
});

test("caches for 30 seconds", async () => {
  let n = 0;
  const app = await make(ENV, async () => (n++, prom([])));
  await app.inject({ url: "/api/board" });
  await app.inject({ url: "/api/board" });
  assert.equal(n, 2);
});

test("upstream failure gives a plain JSON error, no upstream details", async () => {
  const app = await make(ENV, async () => ({ ok: false, status: 401 }));
  const res = await app.inject({ url: "/api/board" });
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.json(), { error: "counts are unavailable right now" });
});

test("serves recent cached counts as stale and rejects cache older than ten minutes", async () => {
  const originalNow = Date.now;
  let now = 1_700_000_000_000;
  let fail = false;
  Date.now = () => now;
  const app = await make(ENV, async () =>
    fail ? { ok: false, status: 503 } : prom([["2", 7]]),
  );

  try {
    const fresh = await app.inject({ url: "/api/board" });
    assert.equal(fresh.statusCode, 200);

    fail = true;
    now += 2 * 60_000;
    const stale = await app.inject({ url: "/api/board" });
    assert.equal(stale.statusCode, 200);
    assert.deepEqual(stale.json().live, [{ floor: "2", count: 7 }]);
    assert.equal(stale.json().stale, true);
    assert.match(
      stale.json().sample_note,
      /Counts from 2 min ago; live update failed\./,
    );

    now += 9 * 60_000;
    const expired = await app.inject({ url: "/api/board" });
    assert.equal(expired.statusCode, 502);
    assert.deepEqual(expired.json(), {
      error: "counts are unavailable right now",
    });
  } finally {
    Date.now = originalNow;
  }
});
