import { afterEach, describe, expect, it, vi } from "vitest";
import { countPress, floorFromPlan } from "./grace";
import type { PlanItem } from "./reconcile";

const at = (hm: string, day = "10") => `2026-11-${day}T${hm}:00-07:00`;
const talk = (
  room: string,
  start: string,
  end: string,
  day?: string,
): PlanItem => ({
  id: room,
  title: "Talk",
  room,
  starts_at: at(start, day),
  ends_at: at(end, day),
  priority: "must",
});
const now = new Date(at("15:25"));

describe("floorFromPlan", () => {
  it("uses the talk happening now", () => {
    const plan = [
      talk("Salt Palace | Level 4 | 455", "16:00", "16:30"),
      talk("Salt Palace | Level 1 | Hall DE", "15:10", "15:40"),
    ];
    expect(floorFromPlan(plan, now)).toBe("Level 1");
  });

  it("uses the next talk today when none is on now", () => {
    const plan = [
      talk("Salt Palace | Level 2 | 250 D-F", "14:00", "14:30"),
      talk("Salt Palace | Level 4 | 455", "17:00", "17:30"),
      talk("Salt Palace | Level 2 | 255 EF", "16:00", "16:30"),
    ];
    expect(floorFromPlan(plan, now)).toBe("Level 2");
  });

  it("reads the comma form shown on screen too", () => {
    expect(
      floorFromPlan(
        [talk("Salt Palace, Level 3, 355F", "15:00", "16:00")],
        now,
      ),
    ).toBe("Level 3");
  });

  it("gives unknown with no plan", () => {
    expect(floorFromPlan([], now)).toBe("unknown");
  });

  it("gives unknown when the only talks left are on another day", () => {
    expect(
      floorFromPlan(
        [talk("Salt Palace | Level 2 | 250 A-C", "09:00", "09:30", "11")],
        now,
      ),
    ).toBe("unknown");
  });

  it("gives unknown for a room with no level", () => {
    expect(
      floorFromPlan([talk("Off-Site Location", "15:00", "16:00")], now),
    ).toBe("unknown");
  });

  it("gives unknown, never an error, for a damaged plan from storage", () => {
    expect(
      floorFromPlan([null, { room: 3 }] as unknown as PlanItem[], now),
    ).toBe("unknown");
  });
});

describe("countPress", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends only the floor and the mode, without waiting on anything", async () => {
    const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    const result = countPress(
      "live",
      [talk("Salt Palace | Level 2 | 251 A-C", "15:00", "16:00")],
      now,
    );
    expect(result).toBeUndefined();
    const [url, body] = sendBeacon.mock.calls[0];
    expect(url).toBe("/api/grace");
    expect(JSON.parse(await body.text())).toEqual({
      scheduled_floor: "Level 2",
      mode: "live",
    });
  });
});
