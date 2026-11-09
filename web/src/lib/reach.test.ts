import { describe, expect, it } from "vitest";
import { closestReachable, reachWindow, type Talk } from "./reach";
import { placeLabel } from "./place";
import type { PlanItem } from "./reconcile";

describe("placeLabel", () => {
  it("turns the schedule's room path into plain words", () => {
    expect(placeLabel("Salt Palace | Level 2 | 250 D-F")).toBe("Salt Palace, Level 2, 250 D-F");
    expect(placeLabel("251 A-C")).toBe("251 A-C");
  });
});

const at = (hm: string) => `2026-11-10T${hm}:00-07:00`;
const item = (id: string, start: string, end: string): PlanItem => ({
  id, title: `Talk ${id}`, room: "100A", starts_at: at(start), ends_at: at(end), priority: "must",
});
const talk = (id: string, start: string, end: string): Talk => ({
  id, title: `Talk ${id}`, room: "200B", starts_at: at(start), ends_at: at(end),
});
const now = new Date(at("15:25"));

describe("reachWindow", () => {
  it("starts the buffer from now and ends that day in Salt Lake City", () => {
    const w = reachWindow(now, 15);
    expect(Date.parse(w.after)).toBe(Date.parse(at("15:40")));
    expect(w.before).toBe("2026-11-10T23:59:59-07:00");
  });

  it("uses the Salt Lake City date, not the UTC date, late in the evening", () => {
    // 22:00 in Salt Lake City is already the next day in UTC.
    expect(reachWindow(new Date(at("22:00")), 15).before).toBe("2026-11-10T23:59:59-07:00");
  });
});

describe("closestReachable", () => {
  const kept = item("kept", "17:30", "18:00");
  const moved = item("moved", "17:00", "17:30");

  it("takes the most similar talk that fits around the rest of the plan", () => {
    const pick = closestReachable([talk("x", "16:40", "17:10"), talk("y", "16:00", "16:30")], [kept, moved], "moved", now, 15);
    // x ends 17:10, only 20 minutes before kept at 17:30: that fits a 15 minute buffer.
    expect(pick?.id).toBe("x");
  });

  it("skips a talk that clashes with something kept, using the buffer", () => {
    const pick = closestReachable([talk("x", "16:50", "17:20"), talk("y", "16:00", "16:30")], [kept, moved], "moved", now, 15);
    expect(pick?.id).toBe("y");
  });

  it("does not count the talk that no longer fits as a clash", () => {
    expect(closestReachable([talk("x", "16:40", "17:10")], [moved], "moved", now, 15)?.id).toBe("x");
  });

  it("skips a talk that starts sooner than the buffer allows", () => {
    expect(closestReachable([talk("x", "15:35", "16:05")], [kept], "moved", now, 15)).toBeNull();
  });

  it("skips talks already in the plan", () => {
    expect(closestReachable([talk("kept", "17:30", "18:00")], [kept], "moved", now, 15)).toBeNull();
  });

  it("returns nothing when nothing fits, rather than a guess", () => {
    expect(closestReachable([], [kept], "moved", now, 15)).toBeNull();
  });
});
