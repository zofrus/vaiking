import { describe, expect, it } from "vitest";
import { buildDayView, formatAge, toKubectl } from "./dayview";
import { reconcile, type Change, type PlanItem } from "./reconcile";

const at = (hm: string) => `2026-11-10T${hm}:00-07:00`;
const talk = (id: string, start: string, end: string, priority: "must" | "nice", room = "100A"): PlanItem => ({
  id, title: `Talk ${id}`, room, starts_at: at(start), ends_at: at(end), priority,
});
const NOW = new Date(at("13:00"));
const run = (plan: PlanItem[], changes: Change[], graceActive = false, bufferMinutes = 25) => {
  const result = reconcile(plan, changes, { now: NOW, bufferMinutes, graceActive });
  return buildDayView(plan, changes, result, { now: NOW, bufferMinutes });
};
const move = (talk_id: string, after: Partial<PlanItem>, detected = "12:48"): Change => ({
  id: `c-${talk_id}`, talk_id, kind: "moved", before: null, after, detected_at: at(detected),
});

const a = talk("a", "13:30", "14:00", "nice");
const b = talk("b", "14:30", "15:00", "must");
const c = talk("c", "16:00", "16:30", "must");

describe("buildDayView", () => {
  it("keeps untouched talks and says so from the schedule time", () => {
    const v = run([a, c], []);
    expect(v.summary).toBe("You wanted 2 talks. 2 still fit.");
    expect(v.entries[0]).toMatchObject({ status: "kept" });
    expect(v.entries[0].reason).toBe("Still at 1:30 PM MST in 100A. The schedule has not changed it.");
  });

  it("reports a move that still fits with room, time and the person's buffer", () => {
    const v = run([a, b, c], [move("b", { room: "355F", starts_at: at("14:45"), ends_at: at("15:15") })], false, 15);
    const e = v.entries.find((x) => x.id === "b")!;
    expect(e.status).toBe("moved-fits");
    expect(e.reason).toBe("Moved to 355F at 2:45 PM MST. It still fits your 15 minutes buffer.");
    expect(v.summary).toBe("You wanted 3 talks. 3 still fit. 1 moved.");
  });

  it("explains a move that no longer fits with the real gap and buffer", () => {
    // a ends 14:00, b now starts 14:20: a 20 minute gap against a 25 minute buffer.
    const v = run([a, b], [move("b", { starts_at: at("14:20"), ends_at: at("14:50") })]);
    const e = v.entries.find((x) => x.id === "b")!;
    expect(e.status).toBe("no-longer-fits");
    expect(e.reason).toContain("It starts 20 minutes after Talk a ends");
    expect(e.reason).toContain("you asked for 25 minutes");
    expect(e.event.message).toBe("0/1 slots fit: starts 20m after the previous talk, you asked for 25m");
    expect(v.summary).toBe("You wanted 2 talks. 1 still fits. 1 moved. 1 no longer fits.");
  });

  it("reports overlap rather than a negative gap", () => {
    const v = run([a, b], [move("b", { starts_at: at("13:45"), ends_at: at("14:15") })]);
    const e = v.entries.find((x) => x.id === "b")!;
    expect(e.reason).toContain("overlaps");
    expect(e.reason).not.toContain("-");
  });

  it("reports cancelled talks as no longer fitting", () => {
    const cancel: Change = { id: "x", talk_id: "a", kind: "cancelled", before: null, after: null, detected_at: at("12:00") };
    const v = run([a, c], [cancel]);
    expect(v.entries[0]).toMatchObject({ id: "a", status: "no-longer-fits", reason: "It was cancelled in the real schedule." });
  });

  it("reports talks set aside by the button, with the must-see time", () => {
    const v = run([a, b, c], [], true);
    expect(v.entries.map((e) => e.status)).toEqual(["set-aside", "kept", "kept"]);
    expect(v.entries[0].reason).toContain("until your must-see at 2:30 PM MST");
    expect(v.summary).toBe("You wanted 3 talks. 2 still fit. 1 set aside by you.");
  });

  it("handles an empty plan and singular wording", () => {
    expect(run([], []).summary).toBe("You wanted 0 talks. 0 still fit.");
    expect(run([a], []).summary).toBe("You wanted 1 talk. 1 still fits.");
  });
});

describe("toKubectl", () => {
  const v = run([a, b], [move("b", { starts_at: at("14:20"), ends_at: at("14:50") })]);
  const out = toKubectl(v);

  it("prints a get-style table", () => {
    const lines = out.split("\n");
    expect(lines[0]).toBe("$ kubectl get talks");
    expect(lines[1]).toMatch(/^NAME\s+DESIRED\s+READY\s+STATUS\s+AGE$/);
    expect(lines[2]).toMatch(/^talk-a\s+1\s+1\s+Scheduled\s+-$/);
    expect(lines[3]).toMatch(/^talk-b\s+1\s+0\s+Unschedulable\s+12m$/);
  });

  it("prints events whose message matches the plain reason's facts", () => {
    expect(out).toContain("FailedScheduling");
    expect(out).toContain("0/1 slots fit: starts 20m after the previous talk, you asked for 25m");
  });

  it("gives duplicate titles distinct names", () => {
    const x = { ...a, id: "x", title: "Same" };
    const y = { ...b, id: "y", title: "Same" };
    expect(toKubectl(run([x, y], [])).split("\n").filter((l) => l.startsWith("same"))).toHaveLength(2);
  });
});

describe("formatAge", () => {
  it("formats", () => {
    expect(formatAge(null)).toBe("-");
    expect(formatAge(30_000)).toBe("30s");
    expect(formatAge(12 * 60_000)).toBe("12m");
    expect(formatAge(3 * 3_600_000)).toBe("3h");
    expect(formatAge(2 * 86_400_000)).toBe("2d");
  });
});
