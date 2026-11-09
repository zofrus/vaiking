import { useState, type FormEvent } from "react";
import { formatTime, type PlanItem } from "./lib/reconcile";

interface Talk {
  id: string;
  title: string;
  room: string;
  starts_at: string;
  ends_at: string;
}

const toItem = (t: Talk, priority: PlanItem["priority"]): PlanItem => ({
  id: t.id, title: t.title, room: t.room, starts_at: t.starts_at, ends_at: t.ends_at, priority,
});

const when = (t: Talk) => `${formatTime(t.starts_at)} to ${formatTime(t.ends_at)} MST, room ${t.room}`;

export function PlanSection({
  plan, setPlan, buffer, setBuffer,
}: {
  plan: PlanItem[];
  setPlan: (p: PlanItem[]) => void;
  buffer: number;
  setBuffer: (n: number) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Talk[] | null>(null);
  const [status, setStatus] = useState("");
  // What is in the minutes box while someone types. Clamping on every key
  // turned "3" into 5 before the "0" of 30 arrived, so clamp only on leaving.
  const [draft, setDraft] = useState<string | null>(null);
  const typeBuffer = (text: string) => {
    setDraft(text);
    const n = Number(text);
    if (text !== "" && Number.isInteger(n) && n >= 5 && n <= 120) setBuffer(n);
  };
  const leaveBuffer = () => {
    const n = Number(draft);
    if (draft !== null && draft.trim() !== "" && Number.isFinite(n)) setBuffer(Math.min(120, Math.max(5, Math.round(n))));
    setDraft(null);
  };

  const mark = (t: Talk, priority: PlanItem["priority"]) => {
    const current = plan.find((p) => p.id === t.id);
    // Pressing the same choice again takes the talk out of the plan.
    setPlan(current?.priority === priority ? plan.filter((p) => p.id !== t.id) : [...plan.filter((p) => p.id !== t.id), toItem(t, priority)]);
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    setStatus("Searching.");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(text)}&limit=8`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { results: Talk[] };
      setResults(body.results);
      setStatus(body.results.length === 0 ? "No talks found. Try a broader search." : `${body.results.length} talks found.`);
    } catch {
      setResults(null);
      setStatus("Search is not available right now. The break button still works.");
    }
  };

  return (
    <section aria-labelledby="plan-h" className="space-y-4">
      <h2 id="plan-h" className="text-2xl font-semibold">Your day</h2>
      <form onSubmit={search} className="space-y-3">
        <label htmlFor="q" className="block text-lg font-semibold">What's the one thing you came for?</label>
        <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} className="field" autoComplete="off" />
        <button type="submit" className="staff-button">Search talks</button>
      </form>
      <p role="status" aria-live="polite" className="text-ink-soft">{status}</p>

      {results && (
        <ul className="space-y-3">
          {results.map((t) => {
            const mine = plan.find((p) => p.id === t.id)?.priority;
            return (
              <li key={t.id} className="panel space-y-3">
                <h3 className="text-lg font-semibold">{t.title}</h3>
                <p className="text-ink-soft">{when(t)}</p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" aria-label={`Must-see: ${t.title}`} aria-pressed={mine === "must"} onClick={() => mark(t, "must")} className="choice">Must-see</button>
                  <button type="button" aria-label={`Nice to have: ${t.title}`} aria-pressed={mine === "nice"} onClick={() => mark(t, "nice")} className="choice">Nice to have</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {plan.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xl font-semibold">Saved on this phone</h3>
          <ul className="space-y-2">
            {[...plan].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((p) => (
              <li key={p.id} className="panel">
                <p className="font-semibold">{p.title}</p>
                <p className="text-ink-soft">{p.priority === "must" ? "Must-see" : "Nice to have"}, {formatTime(p.starts_at)} MST, room {p.room}</p>
              </li>
            ))}
          </ul>
          <label htmlFor="buffer" className="block text-lg">Minutes you want between talks</label>
          <p id="buffer-hint" className="text-ink-soft">Any number from 5 to 120.</p>
          <input
            id="buffer"
            type="number"
            inputMode="numeric"
            min={5}
            max={120}
            step={1}
            value={draft ?? String(buffer)}
            aria-describedby="buffer-hint"
            onChange={(e) => typeBuffer(e.target.value)}
            onBlur={leaveBuffer}
            className="field"
          />
          <p className="text-sm text-ink-soft">Your reasons and your plan stay on this phone. The words you type in the search box are sent to search talks.</p>
        </div>
      )}
    </section>
  );
}
