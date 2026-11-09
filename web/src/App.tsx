import { useCallback, useEffect, useState } from "react";

interface Status {
  version: string;
  elastic: { configured: boolean };
  telemetry: { configured: boolean };
}

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; status: Status };

async function fetchStatus(): Promise<Load> {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return { state: "error" };
    return { state: "ready", status: (await res.json()) as Status };
  } catch {
    return { state: "error" };
  }
}

const label = (configured: boolean) =>
  configured ? "Connected" : "Not configured";

function announcement(load: Load): string {
  if (load.state === "loading") return "Checking service status.";
  if (load.state === "error") return "Service status is unavailable.";
  const { elastic, telemetry } = load.status;
  return `Service status updated. Search: ${label(elastic.configured)}. Telemetry: ${label(telemetry.configured)}.`;
}

export default function App() {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let current = true;
    void fetchStatus().then((next) => {
      if (current) setLoad(next);
    });
    return () => {
      current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setLoad({ state: "loading" });
    void fetchStatus().then(setLoad);
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-white focus:p-2 focus:underline"
      >
        Skip to main content
      </a>

      <header className="border-b border-slate-300 px-4 py-6">
        <h1 className="mx-auto max-w-2xl text-3xl font-bold">vAIking</h1>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-4 py-6">
        <section aria-labelledby="status-heading">
          <h2 id="status-heading" className="text-xl font-semibold">
            Service status
          </h2>

          <p role="status" aria-live="polite" className="sr-only">
            {announcement(load)}
          </p>

          {load.state === "loading" && <p className="mt-4">Checking…</p>}
          {load.state === "error" && (
            <p className="mt-4">Status is unavailable right now.</p>
          )}
          {load.state === "ready" && (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              <dt className="font-medium">Version</dt>
              <dd>{load.status.version}</dd>
              <dt className="font-medium">Search</dt>
              <dd>{label(load.status.elastic.configured)}</dd>
              <dt className="font-medium">Telemetry</dt>
              <dd>{label(load.status.telemetry.configured)}</dd>
            </dl>
          )}

          <button
            type="button"
            onClick={refresh}
            className="mt-6 min-h-11 rounded bg-blue-800 px-4 py-2 font-medium text-white hover:bg-blue-900"
          >
            Refresh status
          </button>
        </section>
      </main>

      <footer className="border-t border-slate-300 px-4 py-6 text-sm text-slate-700">
        <div className="mx-auto max-w-2xl">
          <p>
            Session data: KubeCon + CloudNativeCon North America 2026, The Linux
            Foundation, CC BY 3.0.
          </p>
          <a className="mt-2 inline-block underline" href="/board">
            Organizer board
          </a>
        </div>
      </footer>
    </div>
  );
}
