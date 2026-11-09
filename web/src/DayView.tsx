import { useState, type ReactNode } from "react";
import {
  buildDayView,
  formatAge,
  STATUS_LABEL,
  toKubectl,
  type DayStatus,
} from "./lib/dayview";
import { loadKubectl, saveKubectl } from "./lib/plan";
import {
  formatTime,
  type Change,
  type PlanItem,
  type reconcile,
} from "./lib/reconcile";
import { placeLabel } from "./lib/place";
import "./day.css";

// Colour only. The words come from STATUS_LABEL.
const TAG_CLASS: Record<DayStatus, string> = {
  kept: "gp-tag-ok",
  "moved-fits": "gp-tag-moved",
  "no-longer-fits": "gp-tag-bad",
  "set-aside": "",
};

// Start time for a talk: the live schedule first, then the saved plan. A
// cancelled talk is in no live list, so it falls back to the plan.
export function startTimeFor(
  id: string,
  live: { id: string; starts_at: string }[],
  plan: { id: string; starts_at: string }[],
): string | undefined {
  return (live.find((l) => l.id === id) ?? plan.find((p) => p.id === id))
    ?.starts_at;
}

// Colour for one line of kubectl output. The text itself is never altered.
function termLine(line: string): ReactNode {
  if (line.startsWith("$ ")) {
    return (
      <>
        <span className="gp-t-prompt">$</span>
        {line.slice(1)}
      </>
    );
  }
  if (
    /^NAME\s/.test(line) ||
    line === "Events:" ||
    /^\s+Type\s+Reason/.test(line)
  ) {
    return <span className="gp-t-head">{line}</span>;
  }
  const tone = /\bUnschedulable\b|\bWarning\b/.test(line)
    ? "gp-t-bad"
    : /\bRescheduled\b/.test(line)
      ? "gp-t-warn"
      : /\bPreempted\b/.test(line)
        ? "gp-t-info"
        : /\bScheduled\b/.test(line)
          ? "gp-t-ok"
          : "";
  return tone ? <span className={tone}>{line}</span> : line;
}

// True when the newest change to this talk is a simulated drill.
export function isDrillFor(id: string, changes: Change[]): boolean {
  let newest: Change | undefined;
  for (const c of changes) {
    if (c.talk_id !== id) continue;
    if (!newest || new Date(c.detected_at) >= new Date(newest.detected_at)) newest = c;
  }
  return newest?.drill === true;
}

// Radar is only credited for real changes. A drill is made up by the demo, so
// it says so in words and never names a tool.
export function NoticeCredit({ drill }: { drill: boolean }) {
  return drill ? (
    <span className="gp-credit">Drill · simulated</span>
  ) : (
    <span className="gp-credit">
      Change detected by <b>Radar</b>
    </span>
  );
}

export function DayViewSection({
  plan,
  changes,
  result,
  now,
  bufferMinutes,
}: {
  plan: PlanItem[];
  changes: Change[];
  result: ReturnType<typeof reconcile>;
  now: Date;
  bufferMinutes: number;
}) {
  const [kubectl, setKubectl] = useState(loadKubectl);
  if (plan.length === 0) return null;
  const view = buildDayView(plan, changes, result, { now, bufferMinutes });
  const live = [...result.kept, ...result.dropped];
  const movedNow = view.entries.filter(
    (e) =>
      e.moved && (e.status === "moved-fits" || e.status === "no-longer-fits"),
  );
  const inNotice = new Set(movedNow.map((e) => e.id));

  return (
    <section aria-labelledby="day-h" className="gp-day">
      <div className="gp-head">
        <div>
          <h2 id="day-h" className="gp-h">
            Your day
          </h2>
          <p className="gp-meta gp-mono">
            {view.entries.length} {view.entries.length === 1 ? "talk" : "talks"}{" "}
            · times in MST
          </p>
        </div>
        <label htmlFor="kubectl" className="gp-switch">
          Show as kubectl
          <input
            id="kubectl"
            type="checkbox"
            role="switch"
            checked={kubectl}
            onChange={(e) => {
              setKubectl(e.target.checked);
              saveKubectl(e.target.checked);
            }}
            className="gp-sw"
          />
        </label>
      </div>

      <p role="status" aria-live="polite" className="gp-summary">
        {view.summary}
      </p>

      {movedNow.length > 0 && (
        <ul className="gp-stack" aria-label="Talks that moved">
          {movedNow.map((e) => (
            <li key={e.id} className="gp-notice">
              <div className="gp-notice-top">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 12h14M13 6l6 6-6 6" />
                </svg>
                <span className="gp-notice-title">
                  {STATUS_LABEL[e.status]}
                </span>
                {e.ageMs !== null && (
                  <span className="gp-notice-age gp-mono">
                    {formatAge(e.ageMs)} ago
                  </span>
                )}
              </div>
              <p className="gp-notice-body">
                {e.reason}
                <span className="gp-sub">{e.title}</span>
              </p>
              <NoticeCredit drill={isDrillFor(e.id, changes)} />
            </li>
          ))}
        </ul>
      )}

      {/* mount: AddToCalendar */}
      <ul className="gp-card">
        {view.entries.map((e) => {
          const start = startTimeFor(e.id, live, plan);
          const room = live.find((l) => l.id === e.id)?.room ?? plan.find((p) => p.id === e.id)?.room;
          // The last part of "Salt Palace | Level 2 | 251 A-C" is the room itself.
          const short = room ? placeLabel(room.split("|").pop() ?? room) : "";
          // Kept talks need no sentence: the tag says it. Everything else keeps its reason.
          const showReason = e.status !== "kept";
          return (
            <li key={e.id} className="gp-row">
              <span className="gp-time gp-mono">
                {start ? formatTime(start) : ""}
              </span>
              <span className="gp-title">
                {e.title}
                {showReason && (
                  /* The notice above already says this; hide the repeat from screen readers. */
                  <span
                    className="gp-sub"
                    aria-hidden={inNotice.has(e.id) || undefined}
                  >
                    {e.reason}
                  </span>
                )}
              </span>
              {short && <span className="gp-tag">{short}</span>}
              {e.status === "kept" ? (
                <span className="sr-only">{STATUS_LABEL[e.status]}</span>
              ) : (
                <span className={`gp-tag ${TAG_CLASS[e.status]}`}>
                  {STATUS_LABEL[e.status]}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {kubectl && (
        <pre
          tabIndex={0}
          role="region"
          aria-label="Your plan as kubectl output"
          className="gp-term gp-mono"
        >
          <span className="gp-term-bar" aria-hidden="true">
            <span className="gp-term-dots">
              <i />
              <i />
              <i />
            </span>
            <span>talks.grace-period</span>
          </span>
          {toKubectl(view)
            .split("\n")
            .map((line, i) => (
              <span key={i}>
                {i > 0 ? "\n" : ""}
                {termLine(line)}
              </span>
            ))}
          <span aria-hidden="true">
            {"\n\n"}
            <span className="gp-t-prompt">$</span>{" "}
            <span className="gp-cursor">▍</span>
          </span>
        </pre>
      )}
    </section>
  );
}
