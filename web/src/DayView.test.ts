import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isDrillFor, NoticeCredit, startTimeFor } from "./DayView";
import type { Change } from "./lib/reconcile";

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

describe("moved-talk credit", () => {
  const change = (o: Partial<Change>): Change => ({
    id: "c", talk_id: "a", kind: "moved", before: null, after: null, detected_at: "2026-11-10T15:00:00Z", ...o,
  });
  it("credits Radar for a real change", () => {
    expect(isDrillFor("a", [change({})])).toBe(false);
    const html = renderToStaticMarkup(createElement(NoticeCredit, { drill: false }));
    expect(html).toContain("Change detected by");
    expect(html).toContain("Radar");
    expect(html).not.toContain("Drill");
  });
  it("never credits Radar for a drill", () => {
    expect(isDrillFor("a", [change({ drill: true })])).toBe(true);
    const html = renderToStaticMarkup(createElement(NoticeCredit, { drill: true }));
    expect(html).toContain("Drill · simulated");
    expect(html).not.toContain("Radar");
  });
  it("uses the newest change for the talk", () => {
    const real = change({ id: "r", detected_at: "2026-11-10T16:00:00Z" });
    const drill = change({ id: "d", drill: true, detected_at: "2026-11-10T15:00:00Z" });
    expect(isDrillFor("a", [real, drill])).toBe(false);
    expect(isDrillFor("b", [drill])).toBe(false);
  });
});
