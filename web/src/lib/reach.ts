import type { PlanItem } from "./reconcile";

// A talk from /api/similar. Only the fields we show or check.
export interface Talk {
  id: string;
  title: string;
  room: string;
  starts_at: string;
  ends_at: string;
}

const MINUTE = 60_000;
const ms = (iso: string) => new Date(iso).getTime();

// "Can still reach" is about time only: we have no walking or elevator data.
// A talk counts if it starts at least the person's own buffer from now, later
// the same day, and leaves that buffer around everything else in their plan.

// The window to ask /api/similar for: from now plus the buffer to the end of
// that day in Salt Lake City. The conference is after daylight saving ends,
// so the day ends at 23:59 UTC-7.
export function reachWindow(now: Date, bufferMinutes: number): { after: string; before: string } {
  const after = new Date(now.getTime() + bufferMinutes * MINUTE);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(after);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return { after: after.toISOString(), before: `${part("year")}-${part("month")}-${part("day")}T23:59:59-07:00` };
}

// The first candidate (they arrive most similar first) that is not already in
// the plan, starts far enough ahead, and does not clash with the rest of the
// plan. The clash rule is the same as reconcile's: overlap once the buffer is added.
export function closestReachable(
  candidates: Talk[],
  plan: PlanItem[],
  skipId: string,
  now: Date,
  bufferMinutes: number,
): Talk | null {
  const buffer = bufferMinutes * MINUTE;
  const others = plan.filter((p) => p.id !== skipId);
  const clashes = (t: Talk, p: PlanItem) =>
    ms(t.starts_at) < ms(p.ends_at) + buffer && ms(p.starts_at) < ms(t.ends_at) + buffer;
  return (
    candidates.find(
      (t) =>
        t.id !== skipId &&
        !plan.some((p) => p.id === t.id) &&
        ms(t.starts_at) >= now.getTime() + buffer &&
        !others.some((p) => clashes(t, p)),
    ) ?? null
  );
}
