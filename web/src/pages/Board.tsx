import { useEffect, useState } from "react";
import { reportRequestFailure } from "../telemetry";

interface Row {
  floor: string;
  count: number;
}
interface Board {
  window: string;
  live: Row[];
  preview: Row[];
  sample_note: string;
}
type Load =
  { state: "loading" } | { state: "error" } | { state: "ready"; board: Board };

const floorLabel = (f: string) =>
  f === "unknown" ? "Floor not known" : `Floor ${f}`;

function Table({ caption, rows }: { caption: string; rows: Row[] }) {
  if (rows.length === 0)
    return <p className="mt-2">No presses in this window.</p>;
  return (
    <table className="mt-2 w-full border-collapse text-left">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-slate-400">
          <th scope="col" className="py-2 pr-4">
            Floor
          </th>
          <th scope="col" className="py-2">
            Presses
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.floor} className="border-b border-slate-300">
            <th scope="row" className="py-2 pr-4 font-normal">
              {floorLabel(r.floor)}
            </th>
            <td className="py-2">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BoardPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let current = true;
    const run = async () => {
      try {
        const res = await fetch("/api/board");
        if (!res.ok) throw new Error(`Board request failed with status ${res.status}`);
        const board = (await res.json()) as Board;
        if (current) setLoad({ state: "ready", board });
      } catch (error) {
        reportRequestFailure("/api/board", error);
        if (current)
          setLoad((prev) =>
            prev.state === "ready" ? prev : { state: "error" },
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
    <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-3xl font-bold">Organizer board</h1>
      <p role="status" aria-live="polite" className="mt-4">
        {load.state === "loading" && "Loading counts."}
        {load.state === "error" && "Counts are unavailable right now."}
        {load.state === "ready" && load.board.sample_note}
      </p>
      {load.state === "ready" && (
        <>
          <section aria-labelledby="live-h" className="mt-6">
            <h2 id="live-h" className="text-xl font-semibold">
              Floor of the last planned talk when people pressed the button
            </h2>
            <p className="text-sm text-slate-700">
              Last hour, from the venue. Counts only, no identities.
            </p>
            <Table caption="Presses by floor, live" rows={load.board.live} />
          </section>
          <section aria-labelledby="preview-h" className="mt-8">
            <h2 id="preview-h" className="text-xl font-semibold">
              Preview taps, not from the venue
            </h2>
            <Table
              caption="Presses by floor, preview"
              rows={load.board.preview}
            />
          </section>
        </>
      )}
    </main>
  );
}
