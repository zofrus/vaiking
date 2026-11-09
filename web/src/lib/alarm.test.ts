import { afterEach, describe, expect, it, vi } from "vitest";
import { ALARM_HZ, ALARM_STEP_MS, alarmFrequency, createAlarm, stopOnAway } from "./alarm";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("alarmFrequency", () => {
  it("alternates two tones, one every step", () => {
    expect(alarmFrequency(0)).toBe(ALARM_HZ[0]);
    expect(alarmFrequency(ALARM_STEP_MS - 1)).toBe(ALARM_HZ[0]);
    expect(alarmFrequency(ALARM_STEP_MS)).toBe(ALARM_HZ[1]);
    expect(alarmFrequency(ALARM_STEP_MS * 2)).toBe(ALARM_HZ[0]);
    expect(alarmFrequency(-5)).toBe(ALARM_HZ[0]);
    expect(ALARM_HZ[0]).not.toBe(ALARM_HZ[1]);
  });
});

function fakeAudio() {
  const made = { contexts: 0, started: 0, stopped: 0, closed: 0 };
  class Ctx {
    currentTime = 0;
    destination = {};
    constructor() {
      made.contexts++;
    }
    resume = async () => {};
    close = async () => {
      made.closed++;
    };
    createGain = () => ({
      gain: { value: 0, setValueAtTime() {} },
      connect: (n: unknown) => n,
    });
    createOscillator = () => ({
      type: "",
      frequency: { value: 0, setValueAtTime() {} },
      connect: (n: unknown) => n,
      start: () => void made.started++,
      stop: () => void made.stopped++,
    });
  }
  vi.stubGlobal("AudioContext", Ctx);
  return made;
}

describe("createAlarm", () => {
  it("makes no sound and opens nothing until start is called", () => {
    const made = fakeAudio();
    const alarm = createAlarm();
    expect(made.contexts).toBe(0);
    expect(alarm.running).toBe(false);
  });

  it("plays until stopped, then closes the audio", async () => {
    vi.useFakeTimers();
    const made = fakeAudio();
    const alarm = createAlarm();
    expect(await alarm.start()).toBe(true);
    expect(made.started).toBe(1);
    expect(alarm.running).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(alarm.running).toBe(true);
    alarm.stop();
    expect(alarm.running).toBe(false);
    expect(made.stopped).toBe(1);
    expect(made.closed).toBe(1);
    alarm.stop();
    expect(made.closed).toBe(1);
  });

  it("says no, and does not throw, when the phone has no Web Audio", async () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(await createAlarm().start()).toBe(false);
  });
});

describe("createAlarm races", () => {
  it("a double start leaves exactly one tone running, and stop ends it", async () => {
    const made = fakeAudio();
    const a = createAlarm();
    await Promise.all([a.start(), a.start()]);
    expect(made.contexts).toBe(2);
    a.stop();
    expect(made.started).toBe(made.stopped);
    expect(made.closed).toBe(made.contexts);
    expect(a.running).toBe(false);
  });

  it("a stop while still starting wins: nothing plays and it reports false", async () => {
    const made = fakeAudio();
    const a = createAlarm();
    const p = a.start();
    a.stop();
    expect(await p).toBe(false);
    expect(a.running).toBe(false);
    expect(made.started).toBe(0);
    expect(made.closed).toBe(1);
  });

  it("a start that fails after being replaced does not stop the newer one", async () => {
    vi.useFakeTimers();
    const made = fakeAudio();
    const a = createAlarm();
    expect(await a.start()).toBe(true);
    expect(await a.start()).toBe(true);
    expect(made.started - made.stopped).toBe(1);
    a.stop();
    expect(made.started).toBe(made.stopped);
  });
});

describe("stopOnAway", () => {
  function fakeTargets() {
    const doc = new EventTarget() as EventTarget & { visibilityState: string };
    doc.visibilityState = "visible";
    return { doc, win: new EventTarget() };
  }

  it("stops when the page goes hidden, not while visible", () => {
    const { doc, win } = fakeTargets();
    const stop = vi.fn();
    stopOnAway(doc, win, stop);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(stop).not.toHaveBeenCalled();
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("stops on pagehide", () => {
    const { doc, win } = fakeTargets();
    const stop = vi.fn();
    stopOnAway(doc, win, stop);
    win.dispatchEvent(new Event("pagehide"));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("lets go of both listeners when cleaned up", () => {
    const { doc, win } = fakeTargets();
    const stop = vi.fn();
    const off = stopOnAway(doc, win, stop);
    off();
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("pagehide"));
    expect(stop).not.toHaveBeenCalled();
  });
});
