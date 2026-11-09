import { useState } from "react";
import { buildIcs, ICS_FILENAME } from "./lib/ics";
import type { PlanItem } from "./lib/reconcile";

// Builds the calendar file on this phone and hands it to the browser to save.
// No request is made, so it works offline and nothing about the plan leaves.
export function AddToCalendar({ talks }: { talks: readonly PlanItem[] }) {
  const [status, setStatus] = useState("");
  if (talks.length === 0) return null;

  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([buildIcs(talks)], { type: "text/calendar;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = ICS_FILENAME;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus("Saved. Open the file to add your talks to your calendar.");
    } catch (error) {
      console.warn("Could not build the calendar file", error);
      setStatus("That did not work on this phone. Your plan is still here.");
    }
  };

  return (
    <section aria-labelledby="cal-h" className="panel space-y-3">
      <h2 id="cal-h" className="text-xl font-semibold">Reminders for your day</h2>
      <button type="button" onClick={download} className="quiet-button">
        Add my day to your calendar
      </button>
      <p className="text-ink-soft">
        Your phone reminds you 10 minutes and 2 minutes before each talk. Nothing leaves this phone.
      </p>
      <p role="status" aria-live="polite" className={status ? "text-ink-soft" : "sr-only"}>{status}</p>
    </section>
  );
}
