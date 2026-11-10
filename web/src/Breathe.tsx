import { useEffect, useRef, useState } from "react";
import { breathState, createCuePlayer } from "./lib/sound";

const btn =
  "btn-s";

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Box breathing: in 4, hold 4, out 4, hold 4. Words and a count always show; the
// circle only moves when the phone allows motion. Never starts by itself.
export function Breathe() {
  const reduce = useState(reducedMotion)[0];
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [tone, setTone] = useState(false);
  const cues = useRef(createCuePlayer());
  const lastStep = useRef(0);

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setElapsed(performance.now() - startedAt), reduce ? 250 : 50);
    return () => clearInterval(id);
  }, [startedAt, reduce]);

  const running = startedAt !== null;
  const s = breathState(elapsed);

  useEffect(() => {
    if (running && s.step !== lastStep.current) cues.current.cue(s.step);
    lastStep.current = s.step;
  }, [running, s.step]);

  useEffect(() => {
    const c = cues.current;
    return () => c.close();
  }, []);

  const start = async () => {
    lastStep.current = 0;
    setElapsed(0);
    if (tone) await cues.current.open();
    setStartedAt(performance.now());
  };
  const stop = () => {
    cues.current.close();
    setStartedAt(null);
    setElapsed(0);
  };

  return (
    <div className="panel">
      <h3 className="text-2xl font-semibold">Breathe</h3>
      <p className="mt-2 text-ink-soft">
        Breathe in for 4, hold for 4, breathe out for 4, hold for 4. Stop whenever you like.
      </p>
      {running && (
        <div className="mt-4 flex flex-col items-center gap-3">
          {!reduce && (
            <div className="flex size-48 items-center justify-center" aria-hidden="true">
              <div
                className="size-48 rounded-full border-4 border-deep bg-ground"
                style={{ transform: `scale(${0.35 + 0.65 * s.level})` }}
              />
            </div>
          )}
          <p role="status" className="text-3xl font-semibold">
            {s.cue}
          </p>
          <p className="text-2xl" aria-hidden="true">
            {s.count}
          </p>
        </div>
      )}
      <label className="mt-4 flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          checked={tone}
          disabled={running}
          className="mt-1 size-6 shrink-0"
          onChange={(e) => setTone(e.target.checked)}
        />
        <span>Play a soft tone when the cue changes</span>
      </label>
      <div className="mt-4">
        {running ? (
          <button type="button" className={btn} onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="button" className={btn} onClick={() => void start()}>
            Start breathing guide
          </button>
        )}
      </div>
    </div>
  );
}
