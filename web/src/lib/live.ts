import { useEffect, useState } from "react";
import type { Change, PlanItem } from "./reconcile";

// Ask the server what changed, once a minute while online. Never blocks the UI.
export function useChanges(): Change[] {
  const [changes, setChanges] = useState<Change[]>([]);
  useEffect(() => {
    let since = new Date().toISOString();
    const poll = async () => {
      if (!navigator.onLine) return;
      try {
        const res = await fetch(`/api/changes?since=${encodeURIComponent(since)}`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          console.warn("Change poll failed:", res.status);
          return;
        }
        const body = (await res.json()) as { now: string; changes: Change[] };
        since = body.now;
        if (body.changes.length) {
          setChanges((old) => [...old, ...body.changes.filter((c) => !old.some((o) => o.id === c.id))]);
        }
      } catch (error) {
        console.warn("Change poll failed:", error instanceof Error ? error.name : "unknown");
        // Offline or slow: try again next minute.
      }
    };
    const id = setInterval(() => void poll(), 60_000);
    return () => clearInterval(id);
  }, []);
  return changes;
}

// One similar talk, fetched after the calm screen is already showing.
// 800 ms budget, no spinner: if it is late, nothing appears.
export function useSimilar(talk: PlanItem | undefined): string | null {
  const [line, setLine] = useState<{ id: string; title: string } | null>(null);
  const id = talk?.id;
  const after = talk?.ends_at;
  useEffect(() => {
    if (!id || !after || !navigator.onLine) return;
    const day = new Date(after);
    const before = new Date(day.getTime() + 8 * 3_600_000).toISOString();
    fetch(`/api/similar?talk_id=${encodeURIComponent(id)}&after=${encodeURIComponent(after)}&before=${encodeURIComponent(before)}&limit=1`, {
      signal: AbortSignal.timeout(800),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { results?: { title: string }[] } | null) => {
        const first = b?.results?.[0];
        setLine(first ? { id, title: first.title } : null);
      })
      .catch((error: unknown) => {
        console.warn("Similar talk lookup failed:", error instanceof Error ? error.name : "unknown");
      });
  }, [id, after]);
  return line && line.id === id ? line.title : null;
}
