import { useId, useSyncExternalStore } from "react";
import { isFocusOn, setFocus, subscribeFocus } from "./lib/focusMode";

// A native switch. The label and hint are the button's accessible name and
// description, so a screen reader says what it does before it is pressed.
export function FocusToggle() {
  const on = useSyncExternalStore(subscribeFocus, isFocusOn, () => false);
  const hintId = useId();
  return (
    <div className="focus-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={hintId}
        onClick={() => setFocus(!on)}
        className="focus-switch"
      >
        <span className="focus-switch-label">Focus mode</span>
        <span aria-hidden="true" className="focus-switch-track">
          <span className="focus-switch-thumb" />
        </span>
        <span className="focus-switch-state">{on ? "On" : "Off"}</span>
      </button>
      <p id={hintId} className="focus-hint">Fewer things on screen, no motion, larger text</p>
    </div>
  );
}
