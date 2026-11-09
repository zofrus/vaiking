const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { build } = require("../../app/server");

test("/api/facilities lists the quiet rooms with unknown hours", async () => {
  const app = build({ env: {}, publicDir: path.join(os.tmpdir(), "vaiking-no-public-dir") });
  test.after(() => app.close());
  const res = await app.inject({ url: "/api/facilities" });
  assert.equal(res.statusCode, 200);
  const { facilities } = res.json();
  const quiet = facilities.filter((f) => f.kind === "quiet_room");
  assert.deepEqual(quiet.map((f) => f.audience), ["all", "women_nonbinary"]);
  assert.equal(facilities.filter((f) => f.kind === "all_gender_restroom").length, 6);
  for (const f of facilities) {
    assert.equal(f.hours, null);
    assert.deepEqual(Object.keys(f).sort(), ["audience", "floor", "hours", "id", "kind", "name", "notes", "venue"]);
  }
});
