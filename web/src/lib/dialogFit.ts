// Phones have no Escape key, so a modal dialog must close when its dimmed
// backdrop is tapped. A tap on the backdrop is reported on the <dialog> element
// itself, as is a tap on the dialog's own padding, so the position decides.
export function clickedOutside(
  rect: { left: number; right: number; top: number; bottom: number },
  x: number,
  y: number,
): boolean {
  // A click made with the keyboard has no position.
  if (x === 0 && y === 0) return false;
  return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
}
