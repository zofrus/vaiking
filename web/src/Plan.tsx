import { useEffect, useState, type FormEvent } from "react";
import { formatTime, type PlanItem } from "./lib/reconcile";

interface Talk {
  id: string;
  title: string;
  room: string;
  starts_at: string;
  ends_at: string;
  highlight?: string;
  why?: { keyword_rank: number | null; semantic_rank: number | null };
}
interface Facet { value: string; count: number }
interface Facets { tracks: Facet[]; days: Facet[] }

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// Only the server's <mark> tags are kept; everything else is shown as text.
function Highlight({ html }: { html: string }) {
  const parts = html.split(/(<mark>.*?<\/mark>)/g);
  const decode = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return <>{parts.map((p, i) => (p.startsWith("<mark>") ? <mark key={i}>{decode(p.slice(6, -7))}</mark> : decode(p)))}</>;
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
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [track, setTrack] = useState("");
  const [day, setDay] = useState("");

  // Typing is kept as text; the number is clamped and saved only when the
  // person leaves the field, so "30" never becomes "50" on the way.
  const [bufferText, setBufferText] = useState(String(buffer));
  useEffect(() => setBufferText(String(buffer)), [buffer]);
  const commitBuffer = () => {
    const value = bufferText.trim() === "" ? 15 : Number(bufferText);
    const next = Number.isFinite(value) ? Math.min(120, Math.max(5, Math.round(value))) : 15;
    setBuffer(next);
    setBufferText(String(next));
  };

  const mark = (t: Talk, priority: PlanItem["priority"]) => {
    const current = plan.find((p) => p.id === t.id);
    // Pressing the same choice again takes the talk out of the plan.
    setPlan(current?.priority === priority ? plan.filter((p) => p.id !== t.id) : [...plan.filter((p) => p.id !== t.id), toItem(t, priority)]);
  };

  const run = async (text: string, nextTrack: string, nextDay: string) => {
    setStatus("Searching.");
    try {
      const params = new URLSearchParams({ q: text, limit: "8" });
      if (nextTrack) params.set("track", nextTrack);
      if (nextDay) params.set("day", nextDay);
      const res = await fetch(`/api/search?${params}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { results: Talk[]; took_ms?: number | null; facets?: Facets };
      setResults(body.results);
      setTookMs(typeof body.took_ms === "number" ? body.took_ms : null);
      // Keep the unfiltered counts so the choices don't disappear once one is picked.
      if (body.facets && !nextTrack && !nextDay) setFacets(body.facets);
      setStatus(body.results.length === 0 ? "No talks found. Try a broader search." : `${body.results.length} talks found${typeof body.took_ms === "number" ? `. Found in ${body.took_ms} ms` : ""}.`);
    } catch {
      setResults(null);
      setStatus("Search is not available right now. The break button still works.");
    }
  };

  const search = (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    setTrack("");
    setDay("");
    void run(text, "", "");
  };

  const pick = (nextTrack: string, nextDay: string) => {
    setTrack(nextTrack);
    setDay(nextDay);
    void run(q.trim(), nextTrack, nextDay);
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

      {results && facets && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="f-day" className="block font-semibold">Day</label>
            <select id="f-day" className="field" value={day} onChange={(e) => pick(track, e.target.value)}>
              <option value="">All days</option>
              {facets.days.map((d) => <option key={d.value} value={d.value}>{dayLabel(d.value)} ({d.count})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-track" className="block font-semibold">Track</label>
            <select id="f-track" className="field" value={track} onChange={(e) => pick(e.target.value, day)}>
              <option value="">All tracks</option>
              {facets.tracks.map((t) => <option key={t.value} value={t.value}>{t.value} ({t.count})</option>)}
            </select>
          </div>
        </div>
      )}

      {results && (
        <ul className="space-y-3">
          {results.map((t) => {
            const mine = plan.find((p) => p.id === t.id)?.priority;
            return (
              <li key={t.id} className="panel space-y-3">
                <h3 className="text-lg font-semibold">{t.title}</h3>
                <p className="text-ink-soft">{when(t)}</p>
                {t.highlight && <p className="text-sm"><Highlight html={t.highlight} /></p>}
                {t.why && (t.why.keyword_rank || t.why.semantic_rank) && (
                  <p className="text-sm text-ink-soft">
                    {t.why.keyword_rank ? "Matched your words" : ""}
                    {t.why.keyword_rank && t.why.semantic_rank ? " and " : ""}
                    {t.why.semantic_rank ? (t.why.keyword_rank ? "your meaning" : "Matched your meaning") : ""}
                    {tookMs !== null ? `. Found in ${tookMs} ms.` : "."}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button type="button" aria-pressed={mine === "must"} onClick={() => mark(t, "must")} aria-label={`Must-see: ${t.title}`} className="choice">Must-see</button>
                  <button type="button" aria-pressed={mine === "nice"} onClick={() => mark(t, "nice")} aria-label={`Nice to have: ${t.title}`} className="choice">Nice to have</button>
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
          <input
            id="buffer"
            type="number"
            inputMode="numeric"
            min={5}
            max={120}
            step={1}
            value={bufferText}
            aria-describedby="buffer-hint"
            onChange={(e) => setBufferText(e.target.value)}
            onBlur={commitBuffer}
            onKeyDown={(e) => { if (e.key === "Enter") commitBuffer(); }}
            className="field"
          />
          <p id="buffer-hint" className="text-sm text-ink-soft">5 to 120</p>
          <p className="text-sm text-ink-soft">Your reasons and your plan stay on this phone. The words you type in the search box are sent to search talks.</p>
        </div>
      )}
    </section>
  );
}
