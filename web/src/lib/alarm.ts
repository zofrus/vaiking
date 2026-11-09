// A loud, repeating two-tone beep to get someone's attention. It makes no sound
// until start() is called from a tap, and plays until stop(). Nothing is
// downloaded; the tones are made on the phone.

export const ALARM_HZ = [880, 660] as const;
export const ALARM_STEP_MS = 400;

export function alarmFrequency(elapsedMs: number): number {
  const step = Math.floor(
    Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) / ALARM_STEP_MS,
  );
  return ALARM_HZ[step % 2];
}

type Ctor = typeof AudioContext;

export interface Alarm {
  start(): Promise<boolean>;
  stop(): void;
  readonly running: boolean;
}

export function createAlarm(): Alarm {
  let ctx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    const c = ctx;
    const o = osc;
    ctx = null;
    osc = null;
    try {
      o?.stop();
    } catch {
      /* already stopped */
    }
    if (c) void c.close().catch(() => {});
  };

  return {
    get running() {
      return ctx !== null;
    },
    async start() {
      stop();
      const w = globalThis as unknown as {
        AudioContext?: Ctor;
        webkitAudioContext?: Ctor;
      };
      const C = w.AudioContext ?? w.webkitAudioContext;
      if (!C) return false;
      try {
        const c = new C();
        await c.resume();
        const o = c.createOscillator();
        o.type = "square";
        o.frequency.value = ALARM_HZ[0];
        const g = c.createGain();
        g.gain.value = 0.5;
        o.connect(g).connect(c.destination);
        o.start();
        ctx = c;
        osc = o;
        const began = Date.now();
        timer = setInterval(() => {
          o.frequency.setValueAtTime(
            alarmFrequency(Date.now() - began),
            c.currentTime,
          );
        }, ALARM_STEP_MS / 4);
        return true;
      } catch {
        console.warn("Sound alert could not start");
        stop();
        return false;
      }
    },
    stop,
  };
}
