import { describe, expect, it, vi } from "vitest";
import {
  BREATH_STEPS,
  DEFAULT_VOLUME,
  brownNoise,
  breathState,
  gainFromVolume,
  soundSettings,
  stopWhenHidden,
} from "./sound";

describe("breathState (box breathing, 4-4-4-4)", () => {
  const at = (s: number) => breathState(s * 1000);

  it("runs in, hold, out, hold, four seconds each", () => {
    expect(BREATH_STEPS.map((s) => [s.cue, s.seconds])).toEqual([
      ["Breathe in", 4],
      ["Hold", 4],
      ["Breathe out", 4],
      ["Hold", 4],
    ]);
    expect(at(0).cue).toBe("Breathe in");
    expect(at(3.9).cue).toBe("Breathe in");
    expect(at(4).cue).toBe("Hold");
    expect(at(8).cue).toBe("Breathe out");
    expect(at(12).cue).toBe("Hold");
    expect(at(16).cue).toBe("Breathe in");
    expect(at(16).step).toBe(0);
  });

  it("counts 4, 3, 2, 1 inside each step", () => {
    expect([0, 1, 2, 3].map((s) => at(s + 0.01).count)).toEqual([4, 3, 2, 1]);
    expect(at(8.01).count).toBe(4);
  });

  it("grows the circle on the way in, holds, shrinks on the way out", () => {
    expect(at(0).level).toBe(0);
    expect(at(2).level).toBeCloseTo(0.5, 5);
    expect(at(4).level).toBe(1);
    expect(at(7.9).level).toBe(1);
    expect(at(10).level).toBeCloseTo(0.5, 5);
    expect(at(12).level).toBe(0);
    expect(at(15.9).level).toBe(0);
  });

  it("never throws on a negative or bad time", () => {
    expect(breathState(-5).cue).toBe("Breathe in");
    expect(breathState(NaN).cue).toBe("Breathe in");
  });
});

describe("background sound", () => {
  it("makes brown noise that is bounded, steady and loops without a click", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const n = brownNoise(4000, rand);
    expect(n.length).toBe(4000);
    expect(Math.max(...n.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(Math.abs(n[n.length - 1] - n[0])).toBeLessThan(1e-6);
    // brown noise moves in small steps; white noise would jump around
    let step = 0;
    for (let i = 1; i < n.length; i++) step += Math.abs(n[i] - n[i - 1]);
    expect(step / n.length).toBeLessThan(0.1);
  });

  it("starts quiet and caps the loudest setting", () => {
    expect(DEFAULT_VOLUME).toBeLessThanOrEqual(0.3);
    expect(gainFromVolume(0)).toBe(0);
    expect(gainFromVolume(1)).toBeLessThanOrEqual(0.5);
    expect(gainFromVolume(2)).toBe(gainFromVolume(1));
    expect(gainFromVolume(DEFAULT_VOLUME)).toBeLessThan(gainFromVolume(0.8));
  });

  it("pulses at 2 Hz only when Focus has the pulse on", () => {
    expect(soundSettings("focus", true).lfoHz).toBe(2);
    expect(soundSettings("focus", true).lfoDepth).toBeGreaterThan(0);
    expect(soundSettings("focus", false).lfoDepth).toBe(0);
    const calm = soundSettings("calm", true);
    expect(calm.lfoHz).toBeLessThan(0.5);
    expect(calm.cutoffHz).toBeLessThan(soundSettings("focus", false).cutoffHz);
    expect(calm.level).toBeLessThan(soundSettings("focus", false).level);
  });
});

describe("stopWhenHidden", () => {
  function fakeDoc() {
    const handlers = new Set<() => void>();
    return {
      visibilityState: "visible" as "visible" | "hidden",
      addEventListener: (_: "visibilitychange", h: () => void) => void handlers.add(h),
      removeEventListener: (_: "visibilitychange", h: () => void) => void handlers.delete(h),
      fire() {
        handlers.forEach((h) => h());
      },
      count: () => handlers.size,
    };
  }

  it("stops once when the page is hidden, not while visible", () => {
    const doc = fakeDoc();
    const stop = vi.fn();
    stopWhenHidden(doc, stop);
    doc.fire();
    expect(stop).not.toHaveBeenCalled();
    doc.visibilityState = "hidden";
    doc.fire();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("lets go of the listener when cleaned up", () => {
    const doc = fakeDoc();
    const stop = vi.fn();
    const off = stopWhenHidden(doc, stop);
    expect(doc.count()).toBe(1);
    off();
    expect(doc.count()).toBe(0);
  });
});
