import { describe, expect, it } from "vitest";
import { startTimeFor } from "./DayView";

describe("startTimeFor", () => {
  const live = [{ id: "a", starts_at: "2026-11-10T16:00:00Z" }];
  const plan = [
    { id: "a", starts_at: "2026-11-10T15:00:00Z" },
    { id: "gone", starts_at: "2026-11-10T17:00:00Z" },
  ];
  it("prefers the live schedule", () => {
    expect(startTimeFor("a", live, plan)).toBe("2026-11-10T16:00:00Z");
  });
  it("falls back to the saved plan for a cancelled talk", () => {
    expect(startTimeFor("gone", live, plan)).toBe("2026-11-10T17:00:00Z");
  });
  it("returns undefined for an unknown talk", () => {
    expect(startTimeFor("nope", live, plan)).toBeUndefined();
  });
});
