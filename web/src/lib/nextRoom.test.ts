import { describe, expect, it } from "vitest";
import { nextRoom } from "./nextRoom";
import type { PlanItem } from "./reconcile";

const talk = (id: string, start: string, room: string): PlanItem => ({
  id,
  title: id,
  room,
  starts_at: start,
  ends_at: new Date(Date.parse(start) + 30 * 60_000).toISOString(),
  priority: "nice",
});
const now = new Date("2026-11-10T13:00:00-07:00");

describe("nextRoom", () => {
  it("names the room of the next talk that has not started, as plain words", () => {
    const items = [
      talk("late", "2026-11-10T16:00:00-07:00", "Salt Palace | Level 2 | 255 EF"),
      talk("soon", "2026-11-10T14:00:00-07:00", "Salt Palace | Level 3 | 355 EF"),
    ];
    expect(nextRoom(items, now)).toBe("Salt Palace, Level 3, 355 EF");
  });

  it("skips talks that already started or ended", () => {
    const items = [talk("over", "2026-11-10T11:00:00-07:00", "Salt Palace | Level 1 | 151 G")];
    expect(nextRoom(items, now)).toBeNull();
    expect(nextRoom([talk("now", "2026-11-10T13:00:00-07:00", "Salt Palace | Level 1 | 151 G")], now)).toBeNull();
  });

  it("returns null when the plan is empty", () => {
    expect(nextRoom([], now)).toBeNull();
  });

  it("returns null when the next talk is not today", () => {
    expect(nextRoom([talk("tomorrow", "2026-11-11T09:00:00-07:00", "Salt Palace | Level 2 | 250 D-F")], now)).toBeNull();
  });

  it("uses the Denver day, so a late-evening talk still counts as today", () => {
    const evening = new Date("2026-11-10T20:00:00-07:00");
    expect(nextRoom([talk("night", "2026-11-10T21:00:00-07:00", "Hyatt Regency | Level 1 | Bar")], evening)).toBe(
      "Hyatt Regency, Level 1, Bar",
    );
  });

  it("ignores a talk with no room and bad times", () => {
    const items = [talk("blank", "2026-11-10T14:00:00-07:00", " "), { id: "bad", title: "bad", room: "Somewhere", starts_at: "x", ends_at: "y", priority: "nice" as const }];
    expect(nextRoom(items, now)).toBeNull();
  });

  it("shows the new room once a live change has been applied to the item", () => {
    const moved = { ...talk("moved", "2026-11-10T14:00:00-07:00", "Salt Palace | Level 3 | 355 EF"), room: "Salt Palace | Level 2 | 250 D-F" };
    expect(nextRoom([moved], now)).toBe("Salt Palace, Level 2, 250 D-F");
  });
});
