const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcileOnce } = require("../reconciler");
const { normalize } = require("../lib/feed");

const NOW = "2026-11-10T20:00:00.000Z";

function talk(id, overrides = {}) {
  return {
    id,
    content_hash: `hash-${id}`,
    title: `Talk ${id}`,
    room: "B | Level 2 | 251",
    venue: "B",
    floor: 2,
    starts_at: "2026-11-10T14:00:00-07:00",
    ends_at: "2026-11-10T14:30:00-07:00",
    ...overrides,
  };
}

const fullSchedule = () =>
  Array.from({ length: 500 }, (_, i) => talk(String(i)));

function fakeClient({
  stored = fullSchedule(),
  changesExist = true,
  failTalkWrites = false,
} = {}) {
  const state = {
    talks: new Map(stored.map((doc) => [doc.id, doc])),
    changes: new Map(),
    talkWrites: [],
    deletes: [],
    created: [],
    changesExist,
  };
  return {
    state,
    search: async () => ({
      hits: {
        hits: [...state.talks.values()].map((doc) => ({ _source: doc })),
      },
    }),
    indices: {
      exists: async () => state.changesExist,
      create: async (request) => {
        state.created.push(request);
        state.changesExist = true;
      },
    },
    index: async ({ index, id, document, op_type: opType }) => {
      if (index === "talks") {
        if (failTalkWrites) throw new Error("write failed");
        state.talkWrites.push(id);
        state.talks.set(id, document);
        return;
      }
      if (opType === "create" && state.changes.has(id))
        throw Object.assign(new Error("conflict"), { statusCode: 409 });
      state.changes.set(id, document);
    },
    delete: async ({ id }) => {
      state.deletes.push(id);
      state.talks.delete(id);
    },
  };
}

const run = (client, docs, extra = {}) =>
  reconcileOnce({
    client,
    getFeed: async () => docs,
    normalizeFeed: (value) => ({ docs: value }),
    now: () => NOW,
    ...extra,
  });

function withChange(id, overrides) {
  return fullSchedule().map((doc) =>
    doc.id === id ? { ...doc, content_hash: "new-hash", ...overrides } : doc,
  );
}

test("an unchanged feed writes nothing", async () => {
  const client = fakeClient();
  const result = await run(client, fullSchedule());
  assert.equal(result.outcome, "reconciled");
  assert.equal(result.changes, 0);
  assert.deepEqual(client.state.talkWrites, []);
});

test("a new room is recorded as moved and only that talk is written", async () => {
  const client = fakeClient();
  const counted = [];
  await run(client, withChange("7", { room: "C | Level 3 | 355F" }), {
    countChange: (k) => counted.push(k),
  });
  const [change] = client.state.changes.values();
  assert.equal(change.kind, "moved");
  assert.equal(change.talk_id, "7");
  assert.equal(change.before.room, "B | Level 2 | 251");
  assert.equal(change.after.room, "C | Level 3 | 355F");
  assert.equal(change.detected_at, NOW);
  assert.deepEqual(client.state.talkWrites, ["7"]);
  assert.deepEqual(counted, ["moved"]);
});

test("a new time is recorded as rescheduled, even when the room changed too", async () => {
  const client = fakeClient();
  await run(
    client,
    withChange("7", { room: "C", starts_at: "2026-11-10T16:00:00-07:00" }),
  );
  assert.equal([...client.state.changes.values()][0].kind, "rescheduled");
});

test("a new abstract updates the talk and tells nobody", async () => {
  const client = fakeClient();
  await run(client, withChange("7", { abstract: "Rewritten" }));
  assert.equal(client.state.changes.size, 0);
  assert.deepEqual(client.state.talkWrites, ["7"]);
});

test("a talk that left the feed is recorded as cancelled and removed", async () => {
  const client = fakeClient();
  await run(
    client,
    fullSchedule().filter((doc) => doc.id !== "7"),
  );
  const [change] = client.state.changes.values();
  assert.equal(change.kind, "cancelled");
  assert.equal(change.after, null);
  assert.deepEqual(client.state.deletes, ["7"]);
});

test("a new talk is recorded as added", async () => {
  const client = fakeClient();
  await run(client, [...fullSchedule(), talk("new")]);
  assert.equal([...client.state.changes.values()][0].kind, "added");
  assert.deepEqual(client.state.talkWrites, ["new"]);
});

test("a failed feed skips the cycle and touches nothing", async () => {
  const client = fakeClient();
  const result = await run(client, [], {
    getFeed: async () => {
      throw Object.assign(new Error("boom"), { statusCode: 503 });
    },
  });
  assert.deepEqual(result, {
    outcome: "skipped",
    reason: "feed_failed",
    status: 503,
  });
  assert.equal(client.state.talks.size, 500);
});

test("a short feed never cancels anything", async () => {
  const client = fakeClient();
  const result = await run(client, fullSchedule().slice(0, 50));
  assert.equal(result.reason, "feed_too_short");
  assert.deepEqual(client.state.deletes, []);
  assert.equal(client.state.changes.size, 0);
});

test("a feed missing too many talks is treated as bad, even when long enough", async () => {
  const client = fakeClient();
  const result = await run(client, fullSchedule().slice(0, 420));
  assert.equal(result.reason, "too_many_missing");
  assert.deepEqual(client.state.deletes, []);
});

test("the first run records a baseline and emits no changes", async () => {
  const client = fakeClient({ changesExist: false });
  const result = await run(client, withChange("7", { room: "C" }));
  assert.equal(result.outcome, "baseline");
  assert.equal(client.state.changes.size, 0);
  assert.deepEqual(client.state.talkWrites, ["7"]);
  assert.equal(client.state.created[0].index, "changes-v1");
});

test("an empty index waits for ingest instead of adding every talk", async () => {
  const client = fakeClient({ stored: [] });
  const result = await run(client, fullSchedule());
  assert.equal(result.reason, "talks_empty");
  assert.equal(client.state.changes.size, 0);
});

test("a retry after a failed talk write records the change once", async () => {
  const docs = withChange("7", { room: "C" });
  const failing = fakeClient({ failTalkWrites: true });
  const first = await run(failing, docs);
  assert.equal(first.failed, 1);
  assert.equal(failing.state.changes.size, 1);

  const counted = [];
  const client = fakeClient();
  client.state.changes = failing.state.changes;
  await run(client, docs, { countChange: (k) => counted.push(k) });
  assert.equal(client.state.changes.size, 1);
  assert.deepEqual(counted, []);
  assert.deepEqual(client.state.talkWrites, ["7"]);
});

test("normalize keeps talks, drops breaks and hashes deterministically", () => {
  const feed = {
    rooms: [{ id: 1, name: " B | Level 2 | 251 " }],
    questions: [],
    speakers: [{ id: "s", fullName: "Ada" }],
    categories: [
      {
        title: "All Sessions",
        items: [
          { id: 10, name: "Observability" },
          { id: 11, name: "Breaks" },
        ],
      },
    ],
    sessions: [
      {
        id: 1,
        title: "A &amp; B",
        description: "<p>Hi</p>",
        speakers: ["s"],
        categoryItems: [10],
        roomId: 1,
        startsAt: "2026-11-10T14:00:00",
      },
      {
        id: 2,
        title: "Lunch",
        description: "",
        speakers: [],
        categoryItems: [11],
        roomId: 1,
        startsAt: "2026-11-10T12:00:00",
      },
    ],
  };
  const first = normalize(feed);
  assert.equal(first.fetched, 2);
  assert.equal(first.docs.length, 1);
  assert.equal(first.docs[0].title, "A & B");
  assert.equal(first.docs[0].floor, 2);
  assert.equal(first.docs[0].starts_at, "2026-11-10T14:00:00-07:00");
  assert.equal(
    first.docs[0].content_hash,
    normalize(feed).docs[0].content_hash,
  );
});
