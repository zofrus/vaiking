import { afterEach, describe, expect, it, vi } from "vitest";
import { ALARM_HZ, ALARM_STEP_MS, alarmFrequency, createAlarm } from "./alarm";

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
