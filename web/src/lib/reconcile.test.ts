import { describe, expect, it } from "vitest";
import { reconcile, type Change, type PlanItem } from "./reconcile";

const at = (hm: string) => `2026-11-10T${hm}:00-07:00`;
const talk = (id: string, start: string, end: string, priority: "must" | "nice"): PlanItem => ({
  id, title: `Talk ${id}`, room: "100A", starts_at: at(start), ends_at: at(end), priority,
});
const opts = { now: new Date(at("13:00")), bufferMinutes: 15, graceActive: false };

const a = talk("a", "13:30", "14:00", "nice");
const b = talk("b", "14:30", "15:00", "nice");
const c = talk("c", "16:00", "16:30", "must");
const d = talk("d", "17:00", "17:30", "nice");

describe("reconcile", () => {
  it("keeps everything when nothing happened", () => {
    const r = reconcile([a, c], [], opts);
    expect(r.kept).toHaveLength(2);
    expect(r.dropped).toEqual([]);
    expect(r.notices).toEqual([]);
  });

  it("the button sets aside nice-to-haves up to the next must-see", () => {
    const r = reconcile([a, b, c, d], [], { ...opts, graceActive: true });
    expect(r.dropped.map((i) => i.id)).toEqual(["a", "b"]);
    expect(r.kept.map((i) => i.id)).toEqual(["c", "d"]);
    expect(r.clearUntil).toBe(c.starts_at);
  });

  it("putting them back (grace off) keeps all", () => {
    expect(reconcile([a, b, c], [], opts).dropped).toEqual([]);
  });

  it("with no must-see, the button sets aside every nice-to-have still to come", () => {
    const r = reconcile([a, d], [], { ...opts, graceActive: true });
    expect(r.dropped).toHaveLength(2);
    expect(r.clearUntil).toBeNull();
  });

  it("does not use an in-progress must-see as a clear-until time", () => {
    const ongoing = talk("ongoing", "12:30", "13:30", "must");
    const r = reconcile([ongoing], [], { ...opts, now: new Date(at("13:00")) });
    expect(r.clearUntil).toBeNull();
  });

  it("ignores talks that already ended", () => {
    const r = reconcile([a], [], { ...opts, now: new Date(at("15:00")), graceActive: true });
    expect(r.dropped).toEqual([]);
  });

  it("says a moved talk still fits", () => {
    const change: Change = { id: "1", talk_id: "c", kind: "moved", before: null, after: { room: "355F" }, detected_at: at("13:05") };
    const r = reconcile([a, c], [change], opts);
    expect(r.notices[0].text).toBe("Your 4:00 PM MST talk moved to 355F. It still fits.");
  });

  it("says when a moved talk no longer fits, using the buffer", () => {
    // b now runs to 15:50, only 10 minutes before c: less than the 15 minute buffer.
    const change: Change = { id: "2", talk_id: "b", kind: "rescheduled", before: null, after: { ends_at: at("15:50") }, detected_at: at("13:05") };
    const r = reconcile([b, c], [change], opts);
    expect(r.notices[0].fits).toBe(false);
    expect(r.notices[0].text).toContain("It no longer fits.");
  });

  it("names a rescheduled talk by its planned time, then gives the new time", () => {
    const change: Change = { id: "6", talk_id: "c", kind: "rescheduled", before: { starts_at: c.starts_at }, after: { starts_at: at("16:30"), ends_at: at("17:00"), room: c.room }, detected_at: at("13:05") };
    expect(reconcile([c], [change], opts).notices[0].text).toBe("Your 4:00 PM MST talk moved to 4:30 PM MST. It still fits.");
  });

  it("gives both the new time and the new room when both change", () => {
    const change: Change = { id: "7", talk_id: "c", kind: "moved", before: null, after: { starts_at: at("16:30"), ends_at: at("17:00"), room: "355F" }, detected_at: at("13:05") };
    expect(reconcile([c], [change], opts).notices[0].text).toBe("Your 4:00 PM MST talk moved to 4:30 PM MST in 355F. It still fits.");
  });

  it("says when only the end time changed", () => {
    const change: Change = { id: "8", talk_id: "b", kind: "rescheduled", before: null, after: { ends_at: at("15:50") }, detected_at: at("13:05") };
    expect(reconcile([b, c], [change], opts).notices[0].text).toBe("Your 2:30 PM MST talk now ends at 3:50 PM MST. It no longer fits.");
  });

  it("removes a cancelled talk and says so", () => {
    const change: Change = { id: "3", talk_id: "c", kind: "cancelled", before: null, after: null, detected_at: at("13:05") };
    const r = reconcile([a, c], [change], opts);
    expect(r.kept.map((i) => i.id)).toEqual(["a"]);
    expect(r.notices[0].text).toContain("Your 4:00 PM MST talk was cancelled");
  });

  it("uses the newest change for a talk", () => {
    const early: Change = { id: "4", talk_id: "c", kind: "moved", before: null, after: { room: "1" }, detected_at: at("13:01") };
    const late: Change = { id: "5", talk_id: "c", kind: "moved", before: null, after: { room: "2" }, detected_at: at("13:09") };
    expect(reconcile([c], [late, early], opts).notices[0].text).toContain("to 2.");
  });
});
