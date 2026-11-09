// On-device background sound and the breathing guide's timing. Nothing is
// downloaded and nothing starts by itself: callers start sound from a tap.

export type SoundMode = "focus" | "calm";

// ---- breathing: box breathing, four seconds each -------------------------------

export interface BreathStep {
  cue: string;
  seconds: number;
}

export const BREATH_STEPS: readonly BreathStep[] = [
  { cue: "Breathe in", seconds: 4 },
  { cue: "Hold", seconds: 4 },
  { cue: "Breathe out", seconds: 4 },
  { cue: "Hold", seconds: 4 },
];

const CYCLE_MS = BREATH_STEPS.reduce((n, s) => n + s.seconds * 1000, 0);

export interface BreathState {
  step: number;
  cue: string;
  // 4, 3, 2, 1 inside each step.
  count: number;
  // 0 is empty lungs, 1 is full. Drives the circle's size.
  level: number;
}

export function breathState(elapsedMs: number): BreathState {
  const t = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs % CYCLE_MS : 0;
  let start = 0;
  for (let step = 0; step < BREATH_STEPS.length; step++) {
    const len = BREATH_STEPS[step].seconds * 1000;
    if (t < start + len) {
      const into = (t - start) / len;
      const level = step === 0 ? into : step === 1 ? 1 : step === 2 ? 1 - into : 0;
      return {
        step,
        cue: BREATH_STEPS[step].cue,
        count: Math.max(1, Math.ceil((len - (t - start)) / 1000)),
        level,
      };
    }
    start += len;
  }
  return { step: 0, cue: BREATH_STEPS[0].cue, count: 4, level: 0 };
}

// ---- background sound ----------------------------------------------------------

export const DEFAULT_VOLUME = 0.2;

// The slider runs 0 to 1; the curve keeps even the top end well short of loud.
export function gainFromVolume(volume: number): number {
  const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
  return v * v * 0.5;
}

// Brown noise: a random walk, so it is deep and soft. The end is bent back to the
// start so the loop has no click, then scaled to fit between -1 and 1.
export function brownNoise(length: number, random: () => number = Math.random): Float32Array {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    out[i] = last;
  }
  const drift = length > 1 ? out[length - 1] - out[0] : 0;
  let peak = 1e-9;
  for (let i = 0; i < length; i++) {
    out[i] -= (drift * i) / (length - 1 || 1);
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < length; i++) out[i] /= peak;
  return out;
}

export interface SoundSettings {
  cutoffHz: number;
  level: number;
  lfoHz: number;
  // 0 is steady; 0.25 swings the loudness by a quarter.
  lfoDepth: number;
}

export function soundSettings(mode: SoundMode, pulse: boolean): SoundSettings {
  return mode === "focus"
    ? { cutoffHz: 1200, level: 1, lfoHz: 2, lfoDepth: pulse ? 0.25 : 0 }
    : { cutoffHz: 350, level: 0.6, lfoHz: 0.1, lfoDepth: 0.15 };
}

// Calls stop when the page goes to the background. Returns a cleanup.
export function stopWhenHidden(
  doc: {
    visibilityState: string;
    addEventListener(type: "visibilitychange", h: () => void): void;
    removeEventListener(type: "visibilitychange", h: () => void): void;
  },
  stop: () => void,
): () => void {
  const onChange = () => {
    if (doc.visibilityState === "hidden") stop();
  };
  doc.addEventListener("visibilitychange", onChange);
  return () => doc.removeEventListener("visibilitychange", onChange);
}

// ---- Web Audio -----------------------------------------------------------------

type Ctor = typeof AudioContext;
function audioContext(): AudioContext | null {
  const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  const C = w.AudioContext ?? w.webkitAudioContext;
  try {
    return C ? new C() : null;
  } catch {
    return null;
  }
}

export const canPlaySound = (): boolean => {
  const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return Boolean(w.AudioContext ?? w.webkitAudioContext);
};

export interface SoundPlayer {
  start(mode: SoundMode, pulse: boolean, volume: number): Promise<boolean>;
  setVolume(volume: number): void;
  stop(): void;
}

export function createSoundPlayer(): SoundPlayer {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;

  const stop = () => {
    const c = ctx;
    const m = master;
    ctx = null;
    master = null;
    if (!c) return;
    try {
      m?.gain.setTargetAtTime(0, c.currentTime, 0.05);
    } catch {
      /* closing anyway */
    }
    setTimeout(() => void c.close().catch(() => {}), 300);
  };

  return {
    async start(mode, pulse, volume) {
      stop();
      const c = audioContext();
      if (!c) return false;
      try {
        await c.resume();
        const s = soundSettings(mode, pulse);
        const buffer = c.createBuffer(1, c.sampleRate * 6, c.sampleRate);
        buffer.copyToChannel(brownNoise(buffer.length) as Float32Array<ArrayBuffer>, 0);
        const source = c.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const filter = c.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = s.cutoffHz;
        const level = c.createGain();
        level.gain.value = s.level;
        // The pulse: a slow wave nudges this gain around 1 - depth / 2.
        const swing = c.createGain();
        swing.gain.value = 1 - s.lfoDepth / 2;
        if (s.lfoDepth > 0) {
          const lfo = c.createOscillator();
          lfo.frequency.value = s.lfoHz;
          const depth = c.createGain();
          depth.gain.value = s.lfoDepth / 2;
          lfo.connect(depth).connect(swing.gain);
          lfo.start();
        }
        const m = c.createGain();
        m.gain.value = 0;
        source.connect(filter).connect(level).connect(swing).connect(m).connect(c.destination);
        source.start();
        m.gain.setTargetAtTime(gainFromVolume(volume), c.currentTime, 0.1);
        ctx = c;
        master = m;
        return true;
      } catch {
        console.warn("Background sound could not start");
        void c.close().catch(() => {});
        return false;
      }
    },
    setVolume(volume) {
      if (ctx && master) master.gain.setTargetAtTime(gainFromVolume(volume), ctx.currentTime, 0.05);
    },
    stop,
  };
}

// A short, soft tone for the breathing cues. Its own context, opened by the tap
// on Start and closed on Stop.
export function createCuePlayer() {
  let ctx: AudioContext | null = null;
  return {
    async open(): Promise<boolean> {
      ctx = audioContext();
      if (!ctx) return false;
      await ctx.resume().catch(() => {});
      return true;
    },
    cue(step: number) {
      const c = ctx;
      if (!c) return;
      try {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.frequency.value = [392, 440, 330, 440][step] ?? 392;
        g.gain.setValueAtTime(0, c.currentTime);
        g.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.05);
        g.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);
        osc.connect(g).connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + 0.45);
      } catch {
        /* a missed tone is fine; the text cue is still there */
      }
    },
    close() {
      const c = ctx;
      ctx = null;
      if (c) void c.close().catch(() => {});
    },
  };
}
