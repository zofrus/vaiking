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
  // Every stop() and start() moves this on. A start that was still waiting for
  // the audio to wake up checks it afterwards, so a stop (or a second start) that
  // happened in the meantime wins and no tone is left running.
  let gen = 0;

  const stop = () => {
    gen++;
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
      const my = gen;
      const w = globalThis as unknown as {
        AudioContext?: Ctor;
        webkitAudioContext?: Ctor;
      };
      const C = w.AudioContext ?? w.webkitAudioContext;
      if (!C) return false;
      let c: AudioContext | null = null;
      try {
        c = new C();
        // Kept before the wait, so a stop() during it can close this context.
        ctx = c;
        await c.resume();
        if (my !== gen) return false;
        const o = c.createOscillator();
        o.type = "square";
        o.frequency.value = ALARM_HZ[0];
        const g = c.createGain();
        g.gain.value = 0.5;
        o.connect(g).connect(c.destination);
        o.start();
        osc = o;
        const began = Date.now();
        const live = c;
        timer = setInterval(() => {
          o.frequency.setValueAtTime(
            alarmFrequency(Date.now() - began),
            live.currentTime,
          );
        }, ALARM_STEP_MS / 4);
        return true;
      } catch {
        console.warn("Sound alert could not start");
        if (my === gen) stop();
        else void c?.close().catch(() => {});
        return false;
      }
    },
    stop,
  };
}

// The alert must never play over a phone call or after the person has left the
// page: stop it when the page is hidden or leaves. Returns a cleanup.
export function stopOnAway(
  doc: {
    visibilityState: string;
    addEventListener(type: "visibilitychange", h: () => void): void;
    removeEventListener(type: "visibilitychange", h: () => void): void;
  },
  win: {
    addEventListener(type: "pagehide", h: () => void): void;
    removeEventListener(type: "pagehide", h: () => void): void;
  },
  stop: () => void,
): () => void {
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") stop();
  };
  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("pagehide", stop);
  return () => {
    doc.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("pagehide", stop);
  };
}
