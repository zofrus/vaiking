import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_VOLUME,
  canPlaySound,
  createSoundPlayer,
  stopWhenHidden,
  type SoundMode,
} from "./lib/sound";

const btn =
  "btn-s";

// Plain background sound made on this phone. It starts only when you tap Play,
// starts quiet, stops when the page is hidden, and says nothing about health.
export function SoundPanel() {
  const player = useRef(createSoundPlayer());
  const [mode, setMode] = useState<SoundMode>("focus");
  const [pulse, setPulse] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const p = player.current;
    return () => p.stop();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const p = player.current;
    return stopWhenHidden(document, () => {
      p.stop();
      setPlaying(false);
    });
  }, [playing]);

  if (!canPlaySound()) return null;

  const begin = async (m: SoundMode, pl: boolean) => {
    const ok = await player.current.start(m, pl, volume);
    setPlaying(ok);
    setFailed(!ok);
  };
  const stop = () => {
    player.current.stop();
    setPlaying(false);
  };

  return (
    <div className="panel">
      <h3 className="text-2xl font-semibold">Background sound</h3>
      <p className="mt-2 text-ink-soft">
        Made on this phone. Nothing to download. It starts only when you tap Play.
      </p>
      <fieldset className="mt-4">
        <legend className="font-semibold">Sound</legend>
        <div className="mt-2 space-y-2">
          {(
            [
              ["focus", "Focus", "Steady, deep noise."],
              ["calm", "Calm", "Slower and softer noise."],
            ] as const
          ).map(([id, name, hint]) => (
            <label key={id} className="flex min-h-11 items-start gap-3">
              <input
                type="radio"
                name="bg-sound"
                value={id}
                checked={mode === id}
                className="mt-1 size-6 shrink-0"
                onChange={() => {
                  setMode(id);
                  if (playing) void begin(id, pulse);
                }}
              />
              <span>
                <span className="font-semibold">{name}.</span> {hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {mode === "focus" && (
        <label className="mt-3 flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            checked={pulse}
            className="mt-1 size-6 shrink-0"
            onChange={(e) => {
              setPulse(e.target.checked);
              if (playing) void begin(mode, e.target.checked);
            }}
          />
          <span>Add a soft, low pulse (about 2 beats a second)</span>
        </label>
      )}
      <label className="mt-4 block">
        <span className="font-semibold">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          className="mt-1 block h-11 w-full"
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            player.current.setVolume(v);
          }}
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        {playing ? (
          <button type="button" className={btn} onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="button" className={btn} onClick={() => void begin(mode, pulse)}>
            Play
          </button>
        )}
      </div>
      <p role="status" className="mt-3">
        {playing ? `Playing: ${mode === "focus" ? "Focus" : "Calm"}.` : failed ? "Sound could not start on this phone." : ""}
      </p>
    </div>
  );
}
