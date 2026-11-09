// First-run tour. Whether it has been seen lives in localStorage on this phone
// only. Nothing here touches the network or the break-press count.

export interface TourStep {
  title: string;
  text: string;
}

// One short sentence each, 15 words at most, no exclamation marks.
export const TOUR_STEPS: readonly TourStep[] = [
  { title: "I need a break", text: "One tap on the big button. It works offline." },
  { title: "The calm screen", text: "It shows a quiet room, restrooms and first aid." },
  { title: "Show this to staff", text: "A card that asks for help without talking. Your sticker choice is here too." },
  { title: "Your day", text: "See room changes and add calendar reminders." },
  { title: "Focus mode and sound", text: "Dim the screen and pick quiet sound whenever you need it." },
];

export const TOUR_KEY = "grace-tour-seen-v1";
export const TOUR_OPEN_EVENT = "grace-tour-open";

type Store = Pick<Storage, "getItem" | "setItem">;

export function hasSeenTour(store: Store | null = safeStore()): boolean {
  try {
    return store?.getItem(TOUR_KEY) === "1";
  } catch {
    return true; // storage blocked: do not nag on every load
  }
}

export function markTourSeen(store: Store | null = safeStore()): void {
  try {
    store?.setItem(TOUR_KEY, "1");
  } catch {
    // Blocked storage: the tour just stays replayable.
  }
}

// Show once on a first visit. In preview sample mode only when &tour=1.
export function shouldAutoShowTour(search: string, seen: boolean): boolean {
  const p = new URLSearchParams(search);
  if (p.get("tour") === "1") return true;
  if (p.get("sample") === "1") return false;
  return !seen;
}

function safeStore(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
