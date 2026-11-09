import { useEffect, useState } from "react";

// A repeat of the big "I need a break" button, pinned to the bottom of the home
// screen once the big one has scrolled out of view. It takes the same press
// handler, so there is one way to take a break. While it holds focus it stays,
// so a keyboard user never loses the control they are on. Hidden means out of
// the tab order and the accessibility tree too, so the page never has two of
// the same button on screen.
export function BreakBar({ onPress }: { onPress: () => void }) {
  const [offscreen, setOffscreen] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const target = document.getElementById("break-main");
    if (!target || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting));
    io.observe(target);
    return () => io.disconnect();
  }, []);
  return (
    <div
      className="break-bar"
      hidden={!(offscreen || focused)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <button type="button" onClick={onPress} className="break-bar-button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4a8.5 8.5 0 1 0 11.5 11.5z" />
        </svg>
        I need a break
      </button>
    </div>
  );
}
