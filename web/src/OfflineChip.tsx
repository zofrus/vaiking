import { chipText, useChipState } from "./lib/online";

// Small status line in the header. The element is always present and polite, and
// its text is set from the first render, so a screen reader hears it only when
// the text changes, never on mount. No network calls.
export function OfflineChip() {
  const text = chipText(useChipState());
  return (
    <p aria-live="polite" className={text ? "mt-1 text-sm text-black" : "sr-only"}>
      {text}
    </p>
  );
}
