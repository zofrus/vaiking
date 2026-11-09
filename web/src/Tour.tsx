import { useEffect, useRef, useState } from "react";
import "./tour.css";
import { TOUR_OPEN_EVENT, TOUR_STEPS, hasSeenTour, markTourSeen, shouldShowInvite } from "./lib/tour";

const btn =
  "btn-s";

// Button that asks the one mounted <Tour /> to open. Safe to place anywhere.
export function ReplayTour() {
  return (
    <button type="button" className="link-button" onClick={() => window.dispatchEvent(new Event(TOUR_OPEN_EVENT))}>
      Replay tour
    </button>
  );
}

// The tour never opens by itself; the invite or a Replay button asks for it.
// Native <dialog> opened with showModal(): background goes inert, Escape closes,
// focus returns to whatever opened it. No timers, no auto-advance, no animation.
// Closing in any way (Skip, Done, Escape) marks the tour as seen.
export function Tour() {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);

  const open = () => {
    const d = dialog.current;
    if (!d || d.open) return;
    setStep(0);
    d.showModal();
  };

  useEffect(() => {
    window.addEventListener(TOUR_OPEN_EVENT, open);
    return () => window.removeEventListener(TOUR_OPEN_EVENT, open);
  }, []);

  useEffect(() => {
    if (dialog.current?.open) heading.current?.focus();
  }, [step]);

  const last = step === TOUR_STEPS.length - 1;
  const s = TOUR_STEPS[step];

  return (
    <dialog
      ref={dialog}
      aria-labelledby="tour-h"
      onClose={() => markTourSeen()}
      className="tour-dialog m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl bg-[var(--gp-surface)] p-5 text-[var(--gp-ink)] shadow-[0_0_0_1px_var(--gp-line)] backdrop:bg-[rgb(24_24_27/0.45)]"
    >
      <p className="text-sm font-semibold">
        Step {step + 1} of {TOUR_STEPS.length}
      </p>
      <ol className="tour-dots" aria-hidden="true">
        {TOUR_STEPS.map((_, i) => (
          <li key={i} data-current={i === step ? "true" : undefined} />
        ))}
      </ol>
      <h2 id="tour-h" ref={heading} tabIndex={-1} className="mt-1 text-2xl font-semibold">
        {s.title}
      </h2>
      <p className="mt-2 text-lg">{s.text}</p>
      <div className="dialog-actions">
        <button type="button" className={btn} disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </button>
        {last ? (
          <button type="button" className="btn-p" onClick={() => dialog.current?.close()}>
            Done
          </button>
        ) : (
          <button type="button" className="btn-p" onClick={() => setStep(step + 1)}>
            Next
          </button>
        )}
        <button type="button" className="btn-q" onClick={() => dialog.current?.close()}>
          Skip tour
        </button>
      </div>
    </dialog>
  );
}

// Small first-visit line below the break button. Never a modal, so the break
// button is always reachable. "No thanks" and finishing the tour both set seen.
export function TourInvite() {
  const [show, setShow] = useState(() => shouldShowInvite(location.search, hasSeenTour()));
  if (!show) return null;
  return (
    <div className="panel" role="group" aria-label="Tour">
      <p>New here? Take the 5-step tour.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          className={btn}
          onClick={() => {
            setShow(false);
            window.dispatchEvent(new Event(TOUR_OPEN_EVENT));
          }}
        >
          Take the 5-step tour
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => {
            markTourSeen();
            setShow(false);
          }}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
