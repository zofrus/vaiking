// KubeCon + CloudNativeCon NA 2026 hands out communication stickers at
// registration. This remembers which one the person chose, on this phone only:
// it is never sent anywhere and never added to the break-press count.
// Wording is the event's own, copied from its Inclusion + Accessibility page.

export type StickerId = "green" | "yellow" | "red";

export interface StickerOption {
  id: StickerId;
  word: string;
  meaning: string;
}

export const STICKER_OPTIONS: readonly StickerOption[] = [
  { id: "green", word: "Green", meaning: "Open to communicate." },
  { id: "yellow", word: "Yellow", meaning: "Only if you know me, please." },
  {
    id: "red",
    word: "Red",
    meaning:
      "I’m not interested in communicating (or being videotaped or photographed) at this time.",
  },
];

export const STICKER_CHECKED = "2026-11-09";
export const STICKER_SOURCE_LINE =
  "Source: KubeCon + CloudNativeCon NA 2026 Inclusion + Accessibility page, checked Nov 9, 2026";
export const STICKER_PICKUP_LINE = "Pick up the sticker at registration";

const KEY = "grace-sticker-v1";

export function loadSticker(): StickerId | null {
  try {
    const raw = localStorage.getItem(KEY);
    return STICKER_OPTIONS.find((o) => o.id === raw)?.id ?? null;
  } catch {
    return null;
  }
}

export function saveSticker(id: StickerId | null): void {
  try {
    if (id === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    console.warn("Sticker choice not saved");
  }
}
