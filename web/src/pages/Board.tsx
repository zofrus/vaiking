import { useEffect, useState } from "react";
import { reportRequestFailure } from "../telemetry";
import "./pages.css";

interface Row {
  floor: string;
  count: number;
}
interface Board {
  window: string;
  live: Row[];
  preview: Row[];
  sample_note: string;
  stale?: boolean;
}
type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; board: Board; stale?: boolean };

const floorLabel = (f: string) =>
  f === "unknown" ? "Floor not known" : `Floor ${f}`;

function Table({ caption, rows }: { caption: string; rows: Row[] }) {
  if (rows.length === 0)
    return <p className="gp-note gp-muted">No presses in this window.</p>;
  return (
    <table className="gp-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Floor</th>
          <th scope="col" className="gp-num-cell">
            Presses
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.floor}>
            <th scope="row">{floorLabel(r.floor)}</th>
            <td className="gp-num-cell gp-digits">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// One large count per window. With no rows there is nothing to add up, and
// "0" would claim a measurement the server may not have made (the status line
// above says why), so the tile says so in words.
// A total that failed to refresh says so on the tile itself, not only in the
// status line, so an old number is never read as the current one.
function StatTile({
  label,
  rows,
  stale,
  secondary = false,
}: {
  label: string;
  rows: Row[];
  stale: boolean;
  secondary?: boolean;
}) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className={"gp-box gp-stat" + (secondary ? " gp-stat-secondary" : "")}>
      {rows.length > 0 ? (
        <p className="gp-stat-num gp-digits">{total.toLocaleString("en-US")}</p>
      ) : (
        <p className="gp-stat-none">None counted</p>
      )}
      <p className="gp-stat-label gp-muted">{label}</p>
      {stale && (
        <p className="gp-pill gp-pill-partial gp-stat-stale">
          May be out of date
        </p>
      )}
    </div>
  );
}

function Mark() {
  return (
    <span className="gp-mark" aria-hidden="true">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </span>
  );
}

export default function BoardPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let current = true;
    const run = async () => {
      try {
        const res = await fetch("/api/board");
        if (!res.ok)
          throw new Error(`Board request failed with status ${res.status}`);
        const board = (await res.json()) as Board;
        if (current) setLoad({ state: "ready", board });
      } catch (error) {
        reportRequestFailure("/api/board", error);
        if (current)
          setLoad((prev) =>
            prev.state === "ready"
              ? { ...prev, stale: true }
              : { state: "error" },
          );
      }
    };
    void run();
    const id = setInterval(() => void run(), 30_000);
    return () => {
      current = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="gp-page">
      <header className="gp-header">
        <span className="gp-brand">
          <Mark />
          Grace Period
        </span>
        <a className="gp-link" href="/">
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
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to the app
        </a>
      </header>
      <main id="main" tabIndex={-1} className="gp-board-main">
        <h1>Organizer board</h1>
        <p className="gp-lede">
          For event staff: how many breaks were taken in the last hour, by
          floor. Counts only, nobody's identity.
        </p>
        {/* The wrapper only changes class on failure, so the live region
            inside stays mounted and the failure is still announced. Retry
            reloads the page; the fetch itself is unchanged. */}
        <div className={load.state === "error" ? "gp-box gp-fail" : undefined}>
          <p
            role="status"
            aria-live="polite"
            className="gp-load-status gp-muted"
          >
            {load.state === "loading" && "Loading counts."}
            {load.state === "error" && "Counts are unavailable right now."}
            {load.state === "ready" &&
              (load.stale || load.board.stale) &&
              "Couldn't refresh; these counts may be out of date. "}
            {load.state === "ready" && load.board.sample_note}
          </p>
          {load.state === "error" && (
            <button
              type="button"
              className="gp-retry"
              onClick={() => location.reload()}
            >
              Retry
            </button>
          )}
        </div>
        {load.state === "ready" && (
          <>
            <div className="gp-stats">
              <StatTile
                label="presses in the last hour, from the venue"
                rows={load.board.live}
                stale={Boolean(load.stale || load.board.stale)}
              />
              <StatTile
                label="preview taps, not from the venue"
                rows={load.board.preview}
                secondary
                stale={Boolean(load.stale || load.board.stale)}
              />
            </div>
            <section aria-labelledby="live-h" className="gp-box gp-section">
              <h2 id="live-h">
                Floor of the talk on now or next when people pressed the button
              </h2>
              <p className="gp-note gp-muted">
                Last hour, from the venue. Counts only, no identities.
              </p>
              <Table caption="Presses by floor, live" rows={load.board.live} />
              <p className="gp-note gp-muted">
                A floor shows when the person pressing has a talk in their plan:
                the one on now, or else their next one today. “Floor not known”
                means they had no such talk in their plan, or it was off-site.
              </p>
            </section>
            <section aria-labelledby="preview-h" className="gp-box gp-section">
              <h2 id="preview-h">Preview taps, not from the venue</h2>
              <Table
                caption="Presses by floor, preview"
                rows={load.board.preview}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
