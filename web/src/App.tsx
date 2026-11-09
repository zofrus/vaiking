import { useEffect, useRef, useState } from "react";
import { quietRoom, restrooms } from "./data/facilities";
import { countPress } from "./lib/grace";

type View = "home" | "calm" | "card";

const viewFromHash = (): View =>
  location.hash === "#/calm" ? "calm" : location.hash === "#/card" ? "card" : "home";

function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(viewFromHash);
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const go = (v: View) => {
    location.hash = v === "home" ? "#/" : `#/${v}`;
  };
  return [view, go];
}

function BreakButton({ onPress }: { onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} className="break-button">
      I need a break
    </button>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-xl px-5 pb-10 pt-6 text-sm text-ink-soft">
      <p>
        Schedule data: KubeCon + CloudNativeCon North America 2026, The Linux
        Foundation, CC BY 3.0.
      </p>
    </footer>
  );
}

function Calm({ onCard, showCard }: { onCard: () => void; showCard: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const cardButton = useRef<HTMLButtonElement>(null);
  const wasShowingCard = useRef(showCard);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (wasShowingCard.current && !showCard) cardButton.current?.focus();
    wasShowingCard.current = showCard;
  }, [showCard]);

  const byVenue = (venue: string) => restrooms.filter((r) => r.venue === venue);

  return (
    <section aria-labelledby="calm-h" className="space-y-8">
      <div>
        <h2
          id="calm-h"
          ref={heading}
          tabIndex={-1}
          className="text-3xl font-semibold leading-tight outline-none"
        >
          Take your time. The quiet room is open to everyone.
        </h2>
        <p className="mt-3 text-lg text-ink-soft">
          Nothing here needs an answer from you.
        </p>
      </div>

      <div className="panel">
        <h3 className="text-2xl font-semibold">{quietRoom.name}</h3>
        <p className="mt-1 text-lg">
          {quietRoom.venue}, Level {quietRoom.level}
        </p>
        <p className="mt-3">Hours not listed.</p>
        <p className="mt-1 text-ink-soft">
          Estimated. Confirm routes with event staff.
        </p>
        <button ref={cardButton} type="button" onClick={onCard} className="staff-button mt-6">
          Show this to staff
        </button>
        <p className="mt-3 text-ink-soft">
          Opens a large card you can hold up instead of speaking.
        </p>
      </div>

      <div id="restrooms">
        <h3 className="text-2xl font-semibold">All-gender restrooms</h3>
        {["Salt Palace", "Hyatt Regency"].map((venue) => (
          <div key={venue} className="mt-5">
            <h4 className="text-lg font-semibold">{venue}</h4>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {byVenue(venue).map((r) => (
                <li key={r.id} className="py-3">
                  <span className="font-medium">Level {r.level}</span>
                  <span className="text-ink-soft">. </span>
                  {r.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-4 text-ink-soft">
          Estimated. Confirm routes with event staff.
        </p>
      </div>
    </section>
  );
}

function StaffCard({ onClose }: { onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section
      aria-labelledby="card-h"
      className="fixed inset-0 z-10 flex flex-col bg-white text-black"
    >
      <div className="flex flex-1 flex-col justify-center px-6">
        <h2
          id="card-h"
          ref={heading}
          tabIndex={-1}
          className="text-[clamp(2.25rem,10vw,4.5rem)] font-bold leading-[1.1] outline-none"
        >
          Please point me to {quietRoom.name}, Level {quietRoom.level}.
        </h2>
        <p className="mt-8 text-[clamp(1.75rem,7vw,3rem)] font-semibold leading-tight">
          I may not be able to talk right now.
        </p>
        <p className="mt-8 text-xl">{quietRoom.venue}</p>
      </div>
      <div className="border-t-2 border-black p-4">
        <button type="button" onClick={onClose} className="close-button">
          Close card
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const [view, go] = useView();
  const [announce, setAnnounce] = useState("");

  const press = () => {
    countPress("live");
    setAnnounce("Quiet room details are on screen.");
    go("calm");
  };

  const showCard = view === "card";

  return (
    <div className="min-h-screen bg-ground text-ink">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      <div aria-hidden={showCard || undefined} inert={showCard || undefined}>
        <header className="mx-auto max-w-xl px-5 pt-6">
          <p className="text-lg font-semibold">Grace Period</p>
        </header>

        <main id="main" className="mx-auto max-w-xl space-y-8 px-5 pb-6 pt-5">
          <h1 className="sr-only">Grace Period</h1>
          <BreakButton onPress={press} />
          {view === "home" ? (
            <section aria-labelledby="home-h" className="space-y-3">
              <h2 id="home-h" className="text-2xl font-semibold">
                One tap, no setup.
              </h2>
              <p className="text-lg text-ink-soft">
                Press the button whenever you need a pause. You get the quiet
                room, a card to show staff, and a list of all-gender restrooms. It
                works with no account and no signal.
              </p>
            </section>
          ) : (
            <Calm onCard={() => go("card")} showCard={showCard} />
          )}
        </main>
        <Footer />
      </div>

      {showCard && <StaffCard onClose={() => go("calm")} />}
    </div>
  );
}
