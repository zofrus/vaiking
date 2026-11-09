// When /api/changes last answered, kept outside React so a small line can show
// it without changing what useChanges returns. The poll in lib/live.ts calls
// markChecked() with the server's own clock after each good answer.

import { formatTime } from "./reconcile";

let checkedAt: string | null = null;
const listeners = new Set<() => void>();

export function markChecked(iso: string): void {
  if (!Number.isFinite(Date.parse(iso))) return;
  checkedAt = iso;
  listeners.forEach((l) => l());
}
export const getChecked = (): string | null => checkedAt;
export function subscribeChecked(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// One plain sentence. Nothing while online and not yet checked, so the line
// never flashes in and out.
export function checkedLine(iso: string | null, online: boolean): string | null {
  if (iso) {
    const base = `Changes last checked ${formatTime(iso)} MST.`;
    return online ? base : `${base} May be out of date: you're offline.`;
  }
  return online ? null : "Changes not checked yet. May be out of date: you're offline.";
}
