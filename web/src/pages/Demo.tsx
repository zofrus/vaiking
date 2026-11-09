import { useEffect, useState, type CSSProperties } from "react";
import DemoShare from "./DemoShare";
import { reportRequestFailure } from "../telemetry";
import "./pages.css";

// Judge-facing projector page at /demo. Left half: the real app in preview mode
// (Tuesday 3:25 PM Denver, sample plan). Right half: one column per tool, all
// polled together. A column says Live only when the server read every stat in
// it from the real source on its last fetch, and a stat shows a number only
// when it was; otherwise it says unavailable. Before the first answer it says
// Loading. Nothing is invented.
const POLL_MS = 5000;
const APP_SRC = "/?preview=2026-11-10T15%3A25%3A00-07%3A00&sample=1&drill=1";

interface Stat {
  value: number | null;
  // stale: the last good value, kept when the source answered with nothing.
  status: "live" | "stale" | "unavailable";
  as_of?: string;
  window?: string;
}
interface Source {
  status: "live" | "partial" | "unavailable";
  fetched_at: string | null;
  stats: Record<string, Stat>;
  activity?: string;
  latest_reviewed_pr?: { number: number; title: string; url: string } | null;
}
type Demo = Record<"elastic" | "dash0" | "radar" | "gitar", Source>;

// The PR link comes from the demo data: render it only if it points at GitHub.
const isGithubUrl = (url: unknown) =>
  typeof url === "string" && url.startsWith("https://github.com/");

interface Column {
  key: keyof Demo;
  name: string;
  role: string;
  // decimals: fixed fraction digits, so a rate keeps one width between polls.
  stats: { key: string; label: string; unit?: string; decimals?: number }[];
}

const COLUMNS: Column[] = [
  {
    key: "elastic",
    name: "Elasticsearch",
    role: "Search",
    stats: [
      { key: "talks", label: "talks indexed" },
      { key: "took_ms", label: "hybrid search", unit: "ms" },
    ],
  },
  {
    key: "dash0",
    name: "Dash0",
    role: "Telemetry",
    stats: [
      { key: "button_presses", label: "real button presses, 1h" },
      { key: "plan_requests", label: "plan requests, 1h" },
      {
        key: "http_rate",
        label: "HTTP requests",
        unit: "per second",
        decimals: 2,
      },
    ],
  },
  {
    key: "radar",
    name: "Radar",
    role: "Cluster",
    stats: [
      { key: "pods_ready", label: "pods ready" },
      { key: "restarts", label: "container restarts" },
      { key: "memory_mib", label: "memory in use", unit: "MiB" },
      { key: "schedule_changes", label: "schedule changes seen" },
    ],
  },
  {
    key: "gitar",
    name: "Gitar",
    role: "Review",
    stats: [
      { key: "merged_prs", label: "pull requests merged" },
      { key: "gitar_comments", label: "Gitar review comments" },
    ],
  },
];

type ChipState = Source["status"] | "loading";

const CHIP_TEXT: Record<ChipState, string> = {
  live: "Live",
  partial: "Partly live",
  unavailable: "Unavailable",
  loading: "Loading",
};

// Always a word, never colour alone. Only Live gets the green dot.
function Chip({ state }: { state: ChipState }) {
  return (
    <span
      className={
        "gp-pill" +
        (state === "live"
          ? " gp-pill-live"
          : state === "partial"
            ? " gp-pill-partial"
            : "")
      }
    >
      {state === "live" && <span aria-hidden="true" className="gp-pill-dot" />}
      {CHIP_TEXT[state]}
    </span>
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

function ago(iso: string | null, nowMs: number): string {
  if (!iso) return "no data";
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

function StatBlock({
  label,
  unit,
  decimals,
  stat,
  loading,
}: {
  label: string;
  unit?: string;
  decimals?: number;
  stat?: Stat;
  loading: boolean;
}) {
  const live =
    (stat?.status === "live" || stat?.status === "stale") &&
    stat.value !== null;
  const asOf =
    stat?.status === "stale" && stat.as_of
      ? new Date(stat.as_of).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/Denver",
        })
      : null;
  const text = live
    ? stat.value!.toLocaleString(
        "en-US",
        decimals === undefined
          ? undefined
          : {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            },
      )
    : "";
  // The number's size follows its length, so a long count shrinks to fit its
  // tile instead of wrapping or running past it (see .gp-value).
  const fit = { "--gp-len": Math.max(3, text.length) } as CSSProperties;
  return (
    <div className="gp-tile">
      <p className="gp-tile-label gp-muted">{label}</p>
      {/* The dash holds the number's height while loading, so nothing jumps.
          The column's chip and the page's status line already say Loading. */}
      <p className="gp-value gp-digits" style={fit}>
        {live ? (
          text
        ) : loading ? (
          <span aria-hidden="true">—</span>
        ) : (
          <span className="gp-value-word">Unavailable</span>
        )}
      </p>
      {unit && (live || loading) && (
        <p className="gp-unit gp-digits gp-muted">{unit}</p>
      )}
      {asOf && <p className="gp-unit gp-muted">as of {asOf}</p>}
      {live && stat?.window && (
        <p className="gp-unit gp-muted">{stat.window}</p>
      )}
    </div>
  );
}

export default function Demo() {
  const [data, setData] = useState<Demo | null>(null);
  const [failed, setFailed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/demo", { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const body = (await res.json()) as Demo;
        if (!stop) {
          setData(body);
          setFailed(false);
        }
      } catch (error) {
        reportRequestFailure("/api/demo", error);
        // A failed poll must never leave old numbers wearing a LIVE badge.
        if (!stop) {
          setData(null);
          setFailed(true);
        }
      }
      if (!stop) setNowMs(Date.now());
    };
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  // Before the first answer: Loading, not "unavailable".
  const loading = data === null && !failed;

  return (
    <main id="main" className="gp-page gp-demo">
      {/* The title comes first, so a screen reader meets it before the app. */}
      <h1 className="sr-only">
        Grace Period live demo: the app and the four tools behind it
      </h1>
      {/* Only a change of overall state is announced, never every poll. */}
      <p className="sr-only" role="status">
        {failed
          ? "Live data is unavailable."
          : data
            ? "Live data connected."
            : ""}
      </p>
      <section aria-label="The app" className="gp-demo-app">
        <div className="gp-phone">
          <iframe
            title="Grace Period app in preview mode, Tuesday 3:25 PM Mountain, with a sample plan"
            src={APP_SRC}
          />
        </div>
      </section>
      <div className="gp-demo-tools">
        {/* The brand text repeats the h1, so screen readers skip it. The QR
            card is the last item in the grid below. */}
        <header className="gp-header">
          <p className="gp-brand" aria-hidden="true">
            <Mark />
            Grace Period
            <span className="gp-muted">Live demo</span>
          </p>
        </header>
        <div className="gp-demo-grid">
          {COLUMNS.map((col) => {
            const src = data?.[col.key];
            const state: ChipState = loading
              ? "loading"
              : (src?.status ?? "unavailable");
            return (
              <section
                key={col.key}
                aria-labelledby={`h-${col.key}`}
                className="gp-box gp-col"
              >
                <div className="gp-col-head">
                  <div>
                    <p className="gp-kicker gp-muted">{col.role}</p>
                    <h2 id={`h-${col.key}`}>{col.name}</h2>
                  </div>
                  <Chip state={state} />
                </div>
                {/* A tool with no live stat at all gets one line, not a wall
                    of "Unavailable" tiles. Partly live keeps its tiles, so
                    each missing stat is still named. */}
                {state === "unavailable" ? (
                  <p className="gp-unavail gp-muted">Live data unavailable</p>
                ) : (
                  <div className="gp-tiles">
                    {col.stats.map((s) => (
                      <StatBlock
                        key={s.key}
                        label={s.label}
                        unit={s.unit}
                        decimals={s.decimals}
                        stat={src?.stats?.[s.key]}
                        loading={loading}
                      />
                    ))}
                  </div>
                )}
                {col.key === "gitar" &&
                  src?.latest_reviewed_pr &&
                  isGithubUrl(src.latest_reviewed_pr.url) && (
                  <div className="gp-block">
                    <p className="gp-tile-label gp-muted">
                      latest Gitar-reviewed PR
                    </p>
                    <a
                      href={src.latest_reviewed_pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="gp-pr"
                    >
                      #{src.latest_reviewed_pr.number}{" "}
                      {src.latest_reviewed_pr.title}
                    </a>
                  </div>
                )}
                <p className="gp-col-foot gp-muted">
                  {src?.activity ??
                    (failed ? "Could not reach the demo data." : "Loading.")}
                  {src?.fetched_at && (
                    <span className="gp-updated">
                      Updated {ago(src.fetched_at, nowMs)}.
                    </span>
                  )}
                </p>
              </section>
            );
          })}
          <DemoShare />{/* mount: DemoShare */}
        </div>
      </div>
    </main>
  );
}
