import { useEffect, useState } from "react";
import DemoQr from "./DemoQr";
import { reportRequestFailure } from "../telemetry";

// Judge-facing projector page at /demo. Left half: the real app in preview mode
// (Tuesday 3:25 PM Denver, sample plan). Right half: one column per tool, all
// polled together. A stat shows LIVE only when the server read it from the real
// source on its last fetch; otherwise it says unavailable. Nothing is invented.
const POLL_MS = 5000;
const APP_SRC = "/?preview=2026-11-10T15%3A25%3A00-07%3A00&sample=1&drill=1";

interface Stat {
  value: number | null;
  status: "live" | "unavailable";
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

interface Column {
  key: keyof Demo;
  name: string;
  stats: { key: string; label: string; unit?: string }[];
}

const COLUMNS: Column[] = [
  {
    key: "elastic",
    name: "Elasticsearch",
    stats: [
      { key: "talks", label: "talks indexed" },
      { key: "took_ms", label: "hybrid search", unit: "ms" },
    ],
  },
  {
    key: "dash0",
    name: "Dash0",
    stats: [
      { key: "button_presses", label: "real button presses, 1h" },
      { key: "plan_requests", label: "plan requests, 1h" },
      { key: "http_rate", label: "HTTP requests/s", unit: "/s" },
    ],
  },
  {
    key: "radar",
    name: "Radar",
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
    stats: [
      { key: "merged_prs", label: "pull requests merged" },
      { key: "gitar_comments", label: "Gitar review comments" },
    ],
  },
];

function Badge({ live }: { live: boolean }) {
  return live ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-300 px-3 py-1 text-sm font-bold tracking-wide text-emerald-950">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-full bg-emerald-900 motion-safe:animate-pulse"
      />
      LIVE
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-slate-600 px-3 py-1 text-sm font-bold tracking-wide text-white">
      UNAVAILABLE
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
  stat,
}: {
  label: string;
  unit?: string;
  stat?: Stat;
}) {
  const live = stat?.status === "live" && stat.value !== null;
  return (
    <div className="border-t border-slate-600 pt-3">
      <p className="text-base text-slate-300">{label}</p>
      <p className="mt-1 text-5xl font-extrabold leading-none text-white xl:text-6xl">
        {live ? (
          <>
            {stat.value!.toLocaleString("en-US")}
            {unit && (
              <span className="ml-1 text-xl font-semibold text-slate-300">
                {unit}
              </span>
            )}
          </>
        ) : (
          <span className="text-2xl font-bold text-slate-300">unavailable</span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge live={live} />
        {live && stat?.window && (
          <span className="text-sm text-slate-300">{stat.window}</span>
        )}
      </div>
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

  return (
    <div className="min-h-screen bg-slate-950 text-white lg:flex lg:h-screen">
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
      <section
        aria-label="The app"
        className="h-[70vh] border-b border-slate-600 lg:h-full lg:w-1/2 lg:border-b-0 lg:border-r"
      >
        <iframe
          title="Grace Period app in preview mode, Tuesday 3:25 PM Mountain, with a sample plan"
          src={APP_SRC}
          className="h-full w-full bg-white"
        />
      </section>
      <div className="grid grid-cols-1 gap-px overflow-y-auto bg-slate-600 sm:grid-cols-2 lg:h-full lg:w-1/2 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const src = data?.[col.key];
          return (
            <section
              key={col.key}
              aria-labelledby={`h-${col.key}`}
              className="flex flex-col gap-4 bg-slate-950 p-4 [container-type:inline-size]"
            >
              <h2
                id={`h-${col.key}`}
                className="text-[clamp(1rem,11cqw,1.875rem)] font-extrabold break-words"
              >
                {col.name}
              </h2>
              {col.key === "gitar" && <DemoQr />}
              {col.stats.map((s) => (
                <StatBlock
                  key={s.key}
                  label={s.label}
                  unit={s.unit}
                  stat={src?.stats?.[s.key]}
                />
              ))}
              {col.key === "gitar" && src?.latest_reviewed_pr && (
                <div className="border-t border-slate-600 pt-3">
                  <p className="text-base text-slate-300">
                    latest Gitar-reviewed PR
                  </p>
                  <a
                    href={src.latest_reviewed_pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-lg font-semibold text-sky-300 underline"
                  >
                    #{src.latest_reviewed_pr.number}{" "}
                    {src.latest_reviewed_pr.title}
                  </a>
                </div>
              )}
              <p className="mt-auto border-t border-slate-600 pt-3 text-sm text-slate-300">
                {src?.activity ??
                  (failed ? "Could not reach the demo data." : "Loading.")}
                {src?.fetched_at && <> Updated {ago(src.fetched_at, nowMs)}.</>}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
