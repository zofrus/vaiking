// The core of the product. Given the plan, what changed in the real schedule,
// and whether the person pressed the button, work out what to keep, what to
// set aside, and what to say. Pure: same inputs, same answer, no network.

export interface PlanItem {
  id: string;
  title: string;
  room: string;
  starts_at: string; // ISO
  ends_at: string; // ISO
  priority: "must" | "nice";
}

// One change from /api/changes. "before" and "after" hold the fields that changed.
export interface Change {
  id: string;
  talk_id: string;
  kind: "moved" | "rescheduled" | "cancelled" | "added";
  before: Partial<PlanItem> | null;
  after: Partial<PlanItem> | null;
  detected_at: string;
}

export interface Notice {
  changeId: string;
  talkId: string;
  fits: boolean;
  text: string;
}

export interface Options {
  now: Date;
  bufferMinutes: number;
  graceActive: boolean;
}

const MINUTE = 60_000;
const ms = (iso: string) => new Date(iso).getTime();

export function formatTime(iso: string | number | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Two talks clash if they overlap once the person's own buffer is added.
function clash(a: PlanItem, b: PlanItem, buffer: number): boolean {
  return ms(a.starts_at) < ms(b.ends_at) + buffer && ms(b.starts_at) < ms(a.ends_at) + buffer;
}

export function reconcile(plan: PlanItem[], changes: Change[], opts: Options) {
  const buffer = opts.bufferMinutes * MINUTE;
  const now = opts.now.getTime();

  // 1. Apply the newest change to each talk. Cancelled talks leave the plan.
  const byTalk = new Map<string, Change>();
  for (const c of [...changes].sort((a, b) => ms(a.detected_at) - ms(b.detected_at))) {
    byTalk.set(c.talk_id, c);
  }
  const live: PlanItem[] = [];
  const cancelled: Change[] = [];
  for (const item of plan) {
    const change = byTalk.get(item.id);
    if (change?.kind === "cancelled") cancelled.push(change);
    else if (change?.kind === "moved" || change?.kind === "rescheduled") live.push({ ...item, ...change.after });
    else live.push(item);
  }
  live.sort((a, b) => ms(a.starts_at) - ms(b.starts_at));

  // 2. Say what changed, in one plain sentence each.
  const notices: Notice[] = cancelled.map((c) => {
    const item = plan.find((p) => p.id === c.talk_id)!;
    return { changeId: c.id, talkId: item.id, fits: false, text: `Your ${formatTime(item.starts_at)} MST talk was cancelled: ${item.title}.` };
  });
  for (const item of live) {
    const change = byTalk.get(item.id);
    if (change?.kind !== "moved" && change?.kind !== "rescheduled") continue;
    const fits = !live.some((other) => other.id !== item.id && clash(item, other, buffer));
    // Name the talk by the time the person planned for, then say what is new.
    const planned = plan.find((p) => p.id === item.id)!;
    const time = ms(item.starts_at) !== ms(planned.starts_at) ? `${formatTime(item.starts_at)} MST` : "";
    const room = change.after?.room ?? "";
    const what =
      time && room ? `moved to ${time} in ${room}`
      : time ? `moved to ${time}`
      : room ? `moved to ${room}`
      : `now ends at ${formatTime(item.ends_at)} MST`;
    const text = `Your ${formatTime(planned.starts_at)} MST talk ${what}. ` + (fits ? "It still fits." : "It no longer fits.");
    notices.push({ changeId: change.id, talkId: item.id, fits, text });
  }

  // 3. The button. Set aside nice-to-haves from now up to the next must-see.
  const upcoming = live.filter((i) => ms(i.starts_at) > now);
  const nextMust = upcoming.find((i) => i.priority === "must");
  const clearUntil = nextMust ? nextMust.starts_at : null;
  const setAside = (i: PlanItem) =>
    opts.graceActive && i.priority === "nice" && ms(i.ends_at) > now && (!nextMust || ms(i.starts_at) < ms(nextMust.starts_at));

  return {
    kept: live.filter((i) => !setAside(i)),
    dropped: live.filter(setAside),
    notices,
    clearUntil,
  };
}
