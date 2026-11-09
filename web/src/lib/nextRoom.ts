// The room of the person's next talk today, for the staff card. Pure: the plan
// items passed in already have any live change applied (they come from
// reconcile's result), so a moved talk shows its new room. Nothing is fetched.

import { placeLabel } from "./place";
import type { PlanItem } from "./reconcile";

// "Today" is the conference's day, in Denver, not the phone's own zone.
const denverDay = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(d);

export function nextRoom(items: PlanItem[], now: Date): string | null {
  const today = denverDay(now);
  const next = items
    .filter((i) => {
      const start = Date.parse(i.starts_at);
      return Number.isFinite(start) && start > now.getTime() && denverDay(new Date(start)) === today && i.room.trim() !== "";
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
  return next ? placeLabel(next.room) : null;
}
