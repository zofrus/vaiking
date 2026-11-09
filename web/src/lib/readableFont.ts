// "Easier-to-read font": swaps the page to Atkinson Hyperlegible (bundled, so it
// works offline). It lives inside Focus mode. A display choice only: saved on this
// phone, never sent anywhere, never added to the break-press count.

const KEY = "grace-font-v1";

let current = false;
const listeners = new Set<() => void>();

function apply(on: boolean): void {
  current = on;
  if (typeof document !== "undefined") {
    if (on) document.documentElement.setAttribute("data-font", "readable");
    else document.documentElement.removeAttribute("data-font");
  }
  listeners.forEach((l) => l());
}

export function initReadableFont(): void {
  let on = false;
  try {
    on = localStorage.getItem(KEY) === "1";
  } catch (error) {
    console.warn("Could not read font preference", error);
  }
  apply(on);
}

export function setReadableFont(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch (error) {
    console.warn("Could not save font preference", error);
  }
  apply(on);
}

export const isReadableFont = (): boolean => current;

export function subscribeReadableFont(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
