import { describe, expect, it } from "vitest";
import { TOUR_STEPS, hasSeenTour, markTourSeen, shouldAutoShowTour } from "./tour";

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("tour", () => {
  it("shows once: first visit yes, after seen no", () => {
    const store = memoryStore();
    expect(shouldAutoShowTour("", hasSeenTour(store))).toBe(true);
    markTourSeen(store); // Skip and Done both do this
    expect(hasSeenTour(store)).toBe(true);
    expect(shouldAutoShowTour("", hasSeenTour(store))).toBe(false);
  });

  it("replay works even after it was seen: tour=1 forces it", () => {
    expect(shouldAutoShowTour("?tour=1", true)).toBe(true);
  });

  it("never auto-shows in preview sample mode unless tour=1", () => {
    expect(shouldAutoShowTour("?preview=2026-11-10T15%3A25%3A00-07%3A00&sample=1", false)).toBe(false);
    expect(shouldAutoShowTour("?sample=1&tour=1", false)).toBe(true);
  });

  it("does not nag when storage throws", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(hasSeenTour(broken)).toBe(true);
    expect(() => markTourSeen(broken)).not.toThrow();
  });

  it("has at most 5 steps, 15 words each, no exclamation marks", () => {
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(5);
    for (const s of TOUR_STEPS) {
      expect(s.text.split(/\s+/).length).toBeLessThanOrEqual(15);
      expect(s.text + s.title).not.toContain("!");
    }
  });
});
