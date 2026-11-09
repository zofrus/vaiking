import { useEffect, useRef, useState } from "react";
import type { Change, PlanItem } from "./reconcile";
import { reachWindow, type Talk } from "./reach";
import { now, isDrill, samplePlan } from "./clock";
import { reportRequestFailure } from "../telemetry";

// Demo drill: the KServe talk (a must-see) shifts to 5:15 PM, inside the buffer after the Lima talk.
// A reschedule, because the fit check compares times only. Labelled Drill in the notice text.
function drillChange(): Change {
  return {
    id: "drill-1", talk_id: samplePlan[2].id, kind: "rescheduled", drill: true, before: null,
    after: { starts_at: "2026-11-10T17:15:00-07:00", ends_at: "2026-11-10T17:45:00-07:00" },
    detected_at: now().toISOString(),
  };
}

// Ask the server what changed, once a minute while online. Never blocks the UI.
export function useChanges(): Change[] {
  const [changes, setChanges] = useState<Change[]>(() => (isDrill ? [drillChange()] : []));
  useEffect(() => {
    let since = new Date(0).toISOString();
    const poll = async () => {
      if (!navigator.onLine) return;
      try {
        const res = await fetch(`/api/changes?since=${encodeURIComponent(since)}`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`Changes request failed with status ${res.status}`);
        const body = (await res.json()) as { now: string; changes: Change[] };
        since = body.now;
        if (body.changes.length) {
          setChanges((old) => [...old, ...body.changes.filter((c) => !old.some((o) => o.id === c.id))]);
        }
      } catch (error) {
        reportRequestFailure("/api/changes", error);
        // Offline or slow: try again next minute.
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 60_000);
    return () => clearInterval(id);
  }, []);
  return changes;
}

// One similar talk, fetched after the calm screen is already showing.
// 800 ms budget, no spinner: if it is late, nothing appears.
// Returns up to three candidates; the caller shows the first that fits the plan.
export function useSimilar(talk: PlanItem | undefined): Talk[] {
  const [found, setFound] = useState<{ id: string; talks: Talk[] } | null>(null);
  const id = talk?.id;
  const after = talk?.ends_at;
  useEffect(() => {
    if (!id || !after || !navigator.onLine) return;
    const day = new Date(after);
    const before = new Date(day.getTime() + 8 * 3_600_000).toISOString();
    fetch(`/api/similar?talk_id=${encodeURIComponent(id)}&after=${encodeURIComponent(after)}&before=${encodeURIComponent(before)}&limit=3`, {
      signal: AbortSignal.timeout(800),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { results?: Talk[] } | null) => setFound({ id, talks: b?.results ?? [] }))
      .catch(() => {
        // Not reported on purpose: this request follows a button press, so a
        // failure report would reveal the press. Offline or slow just means no line.
      });
  }, [id, after]);
  return found && found.id === id ? found.talks : [];
}

// For each notice that says a talk no longer fits, ask once for similar talks
// later that day. The caller picks one that still fits at render time. Same
// rules as above: no spinner, and if the answer is late or missing, the notice
// stays as it is.
export function useAlternatives(notices: { changeId: string; talkId: string }[], bufferMinutes: number): Record<string, Talk[]> {
  const [found, setFound] = useState<Record<string, Talk[]>>({});
  const asked = useRef(new Set<string>());
  const key = JSON.stringify(notices.map((n) => [n.changeId, n.talkId]));
  useEffect(() => {
    if (!navigator.onLine) return;
    for (const [changeId, talkId] of JSON.parse(key) as [string, string][]) {
      if (asked.current.has(changeId)) continue;
      const { after, before } = reachWindow(now(), bufferMinutes);
      if (Date.parse(after) >= Date.parse(before)) continue;
      asked.current.add(changeId);
      fetch(`/api/similar?talk_id=${encodeURIComponent(talkId)}&after=${encodeURIComponent(after)}&before=${encodeURIComponent(before)}&limit=3`, {
        signal: AbortSignal.timeout(2000),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { results?: Talk[] } | null) => {
          const results = b?.results ?? [];
          if (results.length) setFound((old) => ({ ...old, [changeId]: results }));
        })
        .catch(() => {
          // Not reported on purpose: /api/similar stays out of telemetry because it
          // also runs right after a break press (see useSimilar). Offline or slow just
          // means no alternatives are shown.
        });
    }
  }, [key, bufferMinutes]);
  return found;
}
