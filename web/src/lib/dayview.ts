// Turns the output of reconcile() into a per-talk account of the day.
// Pure and text-only. Every sentence is built from the plan, the changes the
// server reported, and reconcile's own result, so it cannot state a reason the
// data does not support.
import { formatTime, type Change, type PlanItem, type reconcile } from "./reconcile";

export type DayStatus = "kept" | "moved-fits" | "no-longer-fits" | "set-aside";

export interface DayEntry {
  id: string;
  title: string;
  status: DayStatus;
  moved: boolean;
  reason: string; // plain sentence
  event: { type: "Normal" | "Warning"; reason: string; message: string };
  ageMs: number | null; // time since the newest change to this talk, if any
}

export interface DayView {
  summary: string;
  entries: DayEntry[];
}

type Result = ReturnType<typeof reconcile>;

const MINUTE = 60_000;
const ms = (iso: string) => new Date(iso).getTime();
const mins = (n: number) => `${n} minute${n === 1 ? "" : "s"}`;
const talks = (n: number) => `${n} talk${n === 1 ? "" : "s"}`;
const at = (iso: string) => `${formatTime(iso)} MST`;

export const STATUS_LABEL: Record<DayStatus, string> = {
  kept: "Kept",
  "moved-fits": "Moved and still fits",
  "no-longer-fits": "No longer fits",
  "set-aside": "Set aside by you",
};

// The closest talk in the live schedule that breaks the person's buffer, or null.
function clashWith(item: PlanItem, others: PlanItem[], bufferMs: number) {
  let worst: { other: PlanItem; gapMin: number; before: boolean } | null = null;
  for (const o of others) {
    if (o.id === item.id) continue;
    const before = ms(o.starts_at) <= ms(item.starts_at);
    const gap = before ? ms(item.starts_at) - ms(o.ends_at) : ms(o.starts_at) - ms(item.ends_at);
    if (gap >= bufferMs) continue;
    if (!worst || gap < worst.gapMin * MINUTE) worst = { other: o, gapMin: Math.floor(gap / MINUTE), before };
  }
  return worst;
}

export function buildDayView(
  plan: PlanItem[],
  changes: Change[],
  result: Result,
  opts: { now: Date; bufferMinutes: number },
): DayView {
  const bufferMs = opts.bufferMinutes * MINUTE;
  const buffer = mins(opts.bufferMinutes);
  const live = [...result.kept, ...result.dropped];
  const newest = new Map<string, Change>();
  for (const c of [...changes].sort((a, b) => ms(a.detected_at) - ms(b.detected_at))) newest.set(c.talk_id, c);
  const noticeFor = new Map(result.notices.map((n) => [n.talkId, n]));
  const setAsideIds = new Set(result.dropped.map((d) => d.id));
  const age = (id: string) => {
    const c = newest.get(id);
    return c ? Math.max(0, opts.now.getTime() - ms(c.detected_at)) : null;
  };

  const entries: DayEntry[] = [];
  for (const item of [...plan].sort((a, b) => ms(a.starts_at) - ms(b.starts_at))) {
    const change = newest.get(item.id);
    if (change?.kind === "cancelled") {
      entries.push({
        id: item.id, title: item.title, status: "no-longer-fits", moved: false, ageMs: age(item.id),
        reason: "It was cancelled in the real schedule.",
        event: { type: "Warning", reason: "FailedScheduling", message: "0/1 slots fit: the talk was cancelled in the real schedule" },
      });
      continue;
    }
    const now = live.find((l) => l.id === item.id);
    if (!now) continue;
    const moved = noticeFor.has(item.id);
    const place = `${now.room ? ` in ${now.room}` : ""}`;
    const movedTo = `Moved to ${now.room ? `${now.room} at ` : ""}${at(now.starts_at)}`;

    if (setAsideIds.has(item.id)) {
      const until = result.clearUntil ? `until your must-see at ${at(result.clearUntil)}` : "for the rest of your plan";
      entries.push({
        id: item.id, title: item.title, status: "set-aside", moved, ageMs: age(item.id),
        reason: `You pressed the break button. This nice-to-have is set aside ${until}. Put them back to bring it back.`,
        event: { type: "Normal", reason: "Preempted", message: `Set aside by you ${until}` },
      });
    } else if (moved && !noticeFor.get(item.id)!.fits) {
      const c = clashWith(now, live, bufferMs);
      const gap = c ? (c.gapMin < 0 ? `overlaps ${c.other.title} by ${Math.abs(c.gapMin)}m` : `starts ${c.gapMin}m ${c.before ? "after the previous" : "before the next"} talk`) : "does not leave your buffer";
      const gapPlain = c
        ? c.gapMin < 0
          ? `It overlaps ${c.other.title} by ${mins(Math.abs(c.gapMin))}`
          : `It ${c.before ? "starts" : "ends"} ${mins(c.gapMin)} ${c.before ? "after" : "before"} ${c.other.title}${c.before ? " ends" : " starts"}`
        : "It does not leave your buffer";
      entries.push({
        id: item.id, title: item.title, status: "no-longer-fits", moved, ageMs: age(item.id),
        reason: `${movedTo}. ${gapPlain}, and you asked for ${buffer}.`,
        event: { type: "Warning", reason: "FailedScheduling", message: `0/1 slots fit: ${gap}, you asked for ${opts.bufferMinutes}m` },
      });
    } else if (moved) {
      entries.push({
        id: item.id, title: item.title, status: "moved-fits", moved, ageMs: age(item.id),
        reason: `${movedTo}. It still fits your ${buffer} buffer.`,
        event: { type: "Normal", reason: "Rescheduled", message: `${movedTo}; fits your ${opts.bufferMinutes}m buffer` },
      });
    } else {
      entries.push({
        id: item.id, title: item.title, status: "kept", moved, ageMs: age(item.id),
        reason: `Still at ${at(now.starts_at)}${place}. The schedule has not changed it.`,
        event: { type: "Normal", reason: "Scheduled", message: `Kept at ${at(now.starts_at)}${place}` },
      });
    }
  }

  const count = (f: (e: DayEntry) => boolean) => entries.filter(f).length;
  const fit = count((e) => e.status === "kept" || e.status === "moved-fits");
  const movedN = count((e) => e.moved);
  const lost = count((e) => e.status === "no-longer-fits");
  const aside = count((e) => e.status === "set-aside");
  const parts = [`You wanted ${talks(entries.length)}.`, `${fit} still ${fit === 1 ? "fits" : "fit"}.`];
  if (movedN) parts.push(`${movedN} moved.`);
  if (lost) parts.push(`${lost} no longer ${lost === 1 ? "fits" : "fit"}.`);
  if (aside) parts.push(`${aside} set aside by you.`);
  return { summary: parts.join(" "), entries };
}

export function formatAge(ms: number | null): string {
  if (ms === null) return "-";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28).replace(/-+$/, "") || "talk";

// The same facts as kubectl-style text. Reads only DayView, adds no new claims.
export function toKubectl(view: DayView): string {
  const seen = new Map<string, number>();
  const rows = view.entries.map((e) => {
    let name = slug(e.title);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    if (n > 1) name = `${name}-${n}`;
    const ready = e.status === "kept" || e.status === "moved-fits" ? "1" : "0";
    const status = { kept: "Scheduled", "moved-fits": "Rescheduled", "no-longer-fits": "Unschedulable", "set-aside": "Preempted" }[e.status];
    return { e, name, ready, status, age: formatAge(e.ageMs) };
  });
  const w = Math.max(4, ...rows.map((r) => r.name.length));
  const sw = Math.max(6, ...rows.map((r) => r.status.length));
  const line = (a: string, b: string, c: string, d: string, f: string) => `${a.padEnd(w)}  ${b.padEnd(7)}  ${c.padEnd(5)}  ${d.padEnd(sw)}  ${f}`;
  const out = ["$ kubectl get talks", line("NAME", "DESIRED", "READY", "STATUS", "AGE")];
  for (const r of rows) out.push(line(r.name, "1", r.ready, r.status, r.age));
  for (const r of rows) {
    out.push("", `$ kubectl describe talk ${r.name}`, "Events:", "  Type     Reason            Age  Message");
    out.push(`  ${r.e.event.type.padEnd(7)}  ${r.e.event.reason.padEnd(16)}  ${r.age.padEnd(3)}  ${r.e.event.message}`);
  }
  return out.join("\n");
}
