import { useState, type FormEvent } from "react";
import { formatTime, type PlanItem } from "./lib/reconcile";
import { placeLabel } from "./lib/place";
import "./day.css";

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
  // Elastic's html encoder also writes numeric codes such as &#x2F; for "/" and
  // &#x27; for "'". The result is React text, never HTML, so decoding is safe.
  const code = (whole: string, n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole);
  const decode = (t: string) =>
    t
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x([0-9a-f]+);/gi, (whole, hex: string) => code(whole, parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (whole, dec: string) => code(whole, Number(dec)))
      .replace(/&amp;/g, "&");
  return <>{parts.map((p, i) => (p.startsWith("<mark>") ? <mark key={i}>{decode(p.slice(6, -7))}</mark> : decode(p)))}</>;
}

const toItem = (t: Talk, priority: PlanItem["priority"]): PlanItem => ({
  id: t.id, title: t.title, room: t.room, starts_at: t.starts_at, ends_at: t.ends_at, priority,
});

const when = (t: Talk) => `${formatTime(t.starts_at)} to ${formatTime(t.ends_at)} MST`;

// For first-time users who don't know what to type. Each has a good top match on the live search.
export const SEARCH_EXAMPLES = ["kubernetes", "platform engineering", "ebpf", "security", "observability"];

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
  const [facets, setFacets] = useState<Facets | null>(null);
  const [track, setTrack] = useState("");
  const [day, setDay] = useState("");
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

  const tryExample = (text: string) => {
    setQ(text);
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
    <section aria-labelledby="plan-h" className="gp-find">
      <h2 id="plan-h" className="gp-h">Find your talks</h2>
      <form onSubmit={search} className="space-y-3">
        <label htmlFor="q" className="gp-label">What's the one thing you came for?</label>
        <p id="q-hint" className="gp-hint">Any topic, project or speaker works.</p>
        <div className="gp-searchbox">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-describedby="q-hint" className="gp-input" autoComplete="off" />
          <span className="gp-credit gp-secondary">Search by <b>Elastic</b></span>
        </div>
        <div role="group" aria-labelledby="q-examples" className="gp-secondary flex flex-wrap items-center gap-3">
          <span id="q-examples" className="gp-hint">Try one:</span>
          {SEARCH_EXAMPLES.map((text) => (
            <button key={text} type="button" aria-label={`Search for ${text}`} onClick={() => tryExample(text)} className="gp-chip">
              {text}
            </button>
          ))}
        </div>
        <button type="submit" className="gp-btn">Search talks</button>
      </form>
      <p role="status" aria-live="polite" className="gp-status">{status}</p>

      {results && facets && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="f-day" className="gp-label">Day</label>
            <select id="f-day" className="gp-field" value={day} onChange={(e) => pick(track, e.target.value)}>
              <option value="">All days</option>
              {facets.days.map((d) => <option key={d.value} value={d.value}>{dayLabel(d.value)} ({d.count})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-track" className="gp-label">Track</label>
            <select id="f-track" className="gp-field" value={track} onChange={(e) => pick(e.target.value, day)}>
              <option value="">All tracks</option>
              {facets.tracks.map((t) => <option key={t.value} value={t.value}>{t.value} ({t.count})</option>)}
            </select>
          </div>
        </div>
      )}

      {results && (
        <ul role="list" className="space-y-3 p-0">
          {results.map((t) => {
            const mine = plan.find((p) => p.id === t.id)?.priority;
            return (
              <li key={t.id} className="gp-result">
                <h3 className="text-lg font-semibold">{t.title}</h3>
                <p className="gp-where"><span className="gp-mono">{when(t)}</span><span className="gp-tag">{placeLabel(t.room)}</span></p>
                {t.highlight && <p><Highlight html={t.highlight} /></p>}
                {t.why && (t.why.keyword_rank || t.why.semantic_rank) && (
                  <p className="gp-hint">
                    {t.why.keyword_rank ? "Matched your words" : ""}
                    {t.why.keyword_rank && t.why.semantic_rank ? " and " : ""}
                    {t.why.semantic_rank ? (t.why.keyword_rank ? "your meaning" : "Matched your meaning") : ""}
                    .
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button type="button" aria-label={`Must-see: ${t.title}`} aria-pressed={mine === "must"} onClick={() => mark(t, "must")} className="gp-chip">Must-see</button>
                  <button type="button" aria-label={`Nice to have: ${t.title}`} aria-pressed={mine === "nice"} onClick={() => mark(t, "nice")} className="gp-chip">Nice to have</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {plan.length > 0 && (
        <div className="space-y-3">
          <h3 className="gp-label">Saved on this phone</h3>
          <ul className="gp-card">
            {[...plan].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((p) => (
              <li key={p.id} className="gp-row">
                <span className="gp-title">
                  {p.title}
                  <span className="gp-sub">{p.priority === "must" ? "Must-see" : "Nice to have"}, {formatTime(p.starts_at)} MST</span>
                  <span className="gp-sub">{placeLabel(p.room)}</span>
                </span>
              </li>
            ))}
          </ul>
          <label htmlFor="buffer" className="gp-label">Minutes you want between talks</label>
          <p id="buffer-hint" className="gp-hint">Any number from 5 to 120.</p>
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
            className="gp-field"
          />
          <p className="gp-hint">Your reasons and your plan are saved only on this phone. The app sends the words you type, and talk numbers to find similar talks. When you press the button, it sends the floor of your current or next talk, if it knows one, and whether this is a preview.</p>
        </div>
      )}
    </section>
  );
}
