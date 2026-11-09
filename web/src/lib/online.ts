import { useSyncExternalStore } from "react";

// Honest offline status. "ready" only when the browser is online AND a service
// worker already controls this page (so the app shell really is cached).
export type ChipState = "ready" | "offline" | "none";

export function chipState(online: boolean, controlled: boolean): ChipState {
  if (!online) return "offline";
  return controlled ? "ready" : "none";
}

export function chipText(state: ChipState): string {
  if (state === "ready") return "Ready offline";
  if (state === "offline") return "Offline. The break button still works.";
  return "";
}

const read = (): ChipState =>
  chipState(navigator.onLine, typeof navigator.serviceWorker !== "undefined" && !!navigator.serviceWorker.controller);

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  const sw = navigator.serviceWorker;
  sw?.addEventListener("controllerchange", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    sw?.removeEventListener("controllerchange", cb);
  };
}

export function useChipState(): ChipState {
  return useSyncExternalStore(subscribe, read, () => "none" as ChipState);
}
