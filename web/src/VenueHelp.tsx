import { VENUE_SOURCE_LINE, venueFacts } from "./data/facilities";

// Venue facts, bundled so they show with no network. No hours: the page does not
// publish any. Every fact carries the source line below the list.
export function VenueHelp() {
  return (
    <div className="panel">
      <h3 className="text-2xl font-semibold">Help at the venue</h3>
      <dl className="mt-3 divide-y divide-line border-y border-line">
        {venueFacts.map((f) => (
          <div key={f.id} className="py-3">
            <dt className="font-semibold">{f.title}</dt>
            <dd className="mt-1">{f.text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-ink-soft">{VENUE_SOURCE_LINE}</p>
    </div>
  );
}
