import { useState } from "react";
import { buildDayView, STATUS_LABEL, toKubectl } from "./lib/dayview";
import { loadKubectl, saveKubectl } from "./lib/plan";
import type { Change, PlanItem, reconcile } from "./lib/reconcile";

export function DayViewSection({
  plan, changes, result, now, bufferMinutes,
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

  return (
    <section aria-labelledby="day-h" className="space-y-4">
      <h2 id="day-h" className="text-2xl font-semibold">Your plan against the schedule</h2>
      <p role="status" aria-live="polite" className="text-lg font-semibold">{view.summary}</p>

      <ul className="space-y-2">
        {view.entries.map((e) => (
          <li key={e.id} className="panel">
            <p className="font-semibold">{STATUS_LABEL[e.status]}: {e.title}</p>
            <p className="text-ink-soft">{e.reason}</p>
          </li>
        ))}
      </ul>

      <div>
        <label htmlFor="kubectl" className="flex items-center gap-3 text-lg">
          <input
            id="kubectl"
            type="checkbox"
            checked={kubectl}
            onChange={(e) => { setKubectl(e.target.checked); saveKubectl(e.target.checked); }}
            className="h-6 w-6"
          />
          Show as kubectl
        </label>
        <p className="sr-only" role="status" aria-live="polite">{kubectl ? "Showing kubectl output." : "Showing plain text only."}</p>
      </div>
      {kubectl && (
        <pre tabIndex={0} aria-label="Your plan as kubectl output" className="panel overflow-x-auto font-mono text-sm leading-relaxed">{toKubectl(view)}</pre>
      )}
    </section>
  );
}
