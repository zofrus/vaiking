import type { PlanItem } from "./reconcile";

const saltLakeDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  dateStyle: "short",
});

// The floor of the talk the person is in now, or else their next one today, from
// the plan on this phone. Rooms read "Salt Palace | Level 3 | 355F", so this gives
// "Level 3", which the server turns into "3". No talk, or a room with no level
// (such as "Off-Site Location"), gives "unknown". It never throws: a bad plan in
// storage must not stop the button.
export function floorFromPlan(plan: readonly PlanItem[], now: Date): string {
  try {
    const t = now.getTime();
    const today = saltLakeDay.format(now);
    const talks = plan
      .map((p) => ({
        room: String(p.room ?? ""),
        start: Date.parse(p.starts_at),
        end: Date.parse(p.ends_at),
      }))
      .filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end))
      .sort((a, b) => a.start - b.start);
    const talk =
      talks.find((p) => p.start <= t && t < p.end) ??
      talks.find((p) => p.start > t && saltLakeDay.format(p.start) === today);
    const level = /\bLevel\s*(\d+)\b/i.exec(talk?.room ?? "");
    return level ? `Level ${level[1]}` : "unknown";
  } catch {
    return "unknown";
  }
}

// Counts one press. Fire and forget: nothing here is awaited or fetched first.
// Only the floor and live/preview are sent: no reason, no talk, no identity.
export function countPress(
  mode: "live" | "preview",
  plan: readonly PlanItem[],
  now: Date,
): void {
  try {
    const body = new Blob(
      [JSON.stringify({ scheduled_floor: floorFromPlan(plan, now), mode })],
      {
        type: "application/json",
      },
    );
    if (!navigator.sendBeacon("/api/grace", body))
      console.warn("Grace count not queued");
  } catch {
    console.warn("Grace count failed");
  }
}
