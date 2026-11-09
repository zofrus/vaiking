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
import "./day.css";

const TAG: Record<DayStatus, { text: string; cls: string }> = {
  kept: { text: "Kept", cls: "gp-tag-ok" },
  "moved-fits": { text: "Moved", cls: "gp-tag-moved" },
  "no-longer-fits": { text: "No longer fits", cls: "gp-tag-bad" },
  "set-aside": { text: "Set aside", cls: "" },
};

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
  const startOf = (id: string) =>
    (live.find((l) => l.id === id) ?? plan.find((p) => p.id === id))?.starts_at;
  const movedNow = view.entries.filter(
    (e) =>
      e.moved && (e.status === "moved-fits" || e.status === "no-longer-fits"),
  );

  return (
    <section aria-labelledby="day-h" className="gp-day space-y-4">
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
                <strong>{e.title}</strong>. {e.reason}
              </p>
              <span className="gp-credit">
                Change detected by <b>Radar</b>
              </span>
            </li>
          ))}
        </ul>
      )}

      {kubectl ? (
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
      ) : (
        <ul className="gp-card">
          {view.entries.map((e) => {
            const start = startOf(e.id);
            const tag = TAG[e.status];
            return (
              <li key={e.id} className="gp-row">
                <span className="gp-time gp-mono">
                  {start ? formatTime(start) : ""}
                </span>
                <span className="gp-title">
                  {e.title}
                  <span className="gp-sub">{e.reason}</span>
                </span>
                <span className={`gp-tag ${tag.cls}`}>{tag.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
