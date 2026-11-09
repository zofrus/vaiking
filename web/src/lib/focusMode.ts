// Focus mode: fewer things on screen, no motion, larger text. A display choice
// only. It lives in localStorage on this phone and is never sent anywhere, and
// it is never added to the break-press count.
//
// A phone that asks for reduced motion starts with focus mode suggested on.
// Whatever the person picks after that wins.

const KEY = "grace-focus-v1";

let current = false;
const listeners = new Set<() => void>();

function saved(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch (error) {
    console.warn("Could not read focus mode preference", error);
    return null;
  }
}

function suggested(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function apply(on: boolean): void {
  current = on;
  if (typeof document !== "undefined") {
    if (on) document.documentElement.setAttribute("data-focus", "on");
    else document.documentElement.removeAttribute("data-focus");
  }
  listeners.forEach((l) => l());
}

// Call once at startup, before the first render, so there is no flash.
export function initFocus(): void {
  apply(saved() ?? suggested());
}

export function setFocus(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch (error) {
    console.warn("Could not save focus mode preference", error);
  }
  apply(on);
}

export const isFocusOn = (): boolean => current;

export function subscribeFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
