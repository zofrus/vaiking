import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { quietRoom, restrooms } from "./data/facilities";
import { countPress } from "./lib/grace";
import { PlanSection } from "./Plan";
import { DayViewSection } from "./DayView";
import { loadBreak, loadBuffer, loadPlan, saveBreak, saveBuffer, savePlan } from "./lib/plan";
import { isPreview, now, samplePlan, useSample } from "./lib/clock";
import { useAlternatives, useChanges, useSimilar } from "./lib/live";
import { formatTime, reconcile, type Notice, type PlanItem } from "./lib/reconcile";
import { closestReachable } from "./lib/reach";
import { placeLabel } from "./lib/place";

type View = "home" | "calm" | "card";

// The banner names the day being previewed, not always Tuesday.
const previewDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(now());

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
      <a className="mt-2 inline-block underline" href="/board">
        Organizer board
      </a>
    </footer>
  );
}

function Calm({
  onCard,
  onBack,
  staffBtn,
  planResult,
}: {
  planResult: ReactNode;
  onCard: () => void;
  onBack: () => void;
  staffBtn: { current: HTMLButtonElement | null };
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

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

      {planResult}

      <div className="panel">
        <h3 className="text-2xl font-semibold">{quietRoom.name}</h3>
        <p className="mt-1 text-lg">
          {quietRoom.venue}, Level {quietRoom.level}
        </p>
        <p className="mt-3">Hours not listed.</p>
        <p className="mt-1 text-ink-soft">
          Estimated. Confirm routes with event staff.
        </p>
        <button
          ref={staffBtn}
          type="button"
          onClick={onCard}
          className="staff-button mt-6"
        >
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

      <button type="button" onClick={onBack} className="quiet-button">
        Back to the start
      </button>
    </section>
  );
}

// Held up to someone else, so it is sized for arm's length: vmin keeps the
// words large in portrait and still on screen when the phone is turned.
function StaffCard({ onClose }: { onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-h"
      className="fixed inset-0 z-10 flex flex-col bg-white text-black"
    >
      {/* Auto margins centre the words but drop to 0 if they overflow, so the
          first line can always be scrolled back into view. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-8">
        <div className="my-auto">
          <h2
            id="card-h"
            ref={heading}
            tabIndex={-1}
            className="text-[clamp(2.5rem,13vmin,5.5rem)] font-bold leading-[1.08] tracking-tight outline-none"
          >
            Please point me to {quietRoom.name}, Level {quietRoom.level}.
          </h2>
          <p className="mt-[6vmin] text-[clamp(1.75rem,9vmin,3.5rem)] font-semibold leading-tight">
            I may not be able to talk right now.
          </p>
          <p className="mt-[6vmin] text-[clamp(1.5rem,7.5vmin,2.75rem)] font-semibold leading-tight">
            {quietRoom.venue}
          </p>
        </div>
      </div>
      <div className="border-t-2 border-black px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
  const staffBtn = useRef<HTMLButtonElement>(null);
  const prev = useRef(view);

  useEffect(() => {
    if (prev.current === "card" && view === "calm") staffBtn.current?.focus();
    if (prev.current !== "home" && view === "home") document.getElementById("home-h")?.focus();
    if (view === "home") setAnnounce("");
    prev.current = view;
  }, [view]);

  const [plan, setPlanState] = useState<PlanItem[]>(() => (useSample ? [...samplePlan] : loadPlan()));
  const [buffer, setBufferState] = useState(loadBuffer);
  // A reload keeps a break only when the person pressed the button and it is still valid.
  const [grace, setGrace] = useState(() => viewFromHash() !== "home" && loadBreak(now().getTime(), isPreview));
  const setPlan = (p: PlanItem[]) => {
    setPlanState(p);
    if (!isPreview) savePlan(p); // a preview never overwrites the real plan
  };
  const setBuffer = (n: number) => {
    setBufferState(n);
    if (!isPreview) saveBuffer(n);
  };
  const changes = useChanges();
  const result = reconcile(plan, changes, { now: now(), bufferMinutes: buffer, graceActive: grace });
  const clearLine = (r: ReturnType<typeof reconcile>) =>
    r.clearUntil && Date.parse(r.clearUntil) > now().getTime()
      ? `You're clear until ${formatTime(r.clearUntil)} MST.`
      : "You're clear for the rest of your plan.";
  const similar = useSimilar(grace ? result.dropped[0] : undefined);
  const alternatives = useAlternatives(result.notices.filter((n) => !n.fits), buffer);
  // A notice that no longer fits names the first similar talk the person still
  // has time for, once /api/similar has answered. Until then it says only what changed.
  const noticeLine = (n: Notice) => {
    const reach = n.fits
      ? null
      : closestReachable(alternatives[n.changeId] ?? [], [...result.kept, ...result.dropped], n.talkId, now(), buffer);
    return {
      text: reach
        ? `${n.text} Similar talk you still have time for: ${reach.title}, ${formatTime(reach.starts_at)} MST, ${placeLabel(reach.room)}.`
        : n.text,
      reach: reach !== null,
    };
  };
  const lines = result.notices.map((n) => ({ id: n.changeId, ...noticeLine(n) }));
  const noticeText = lines.map((l) => l.text).join(" ");
  const notices = lines.length > 0 && (
    <>
      {lines.map((l) => (
        <p key={l.id} className="font-semibold">{l.text}</p>
      ))}
      {lines.some((l) => l.reach) && (
        <p className="text-ink-soft">
          Based on the {buffer} minutes you want between talks. Estimated. Confirm routes with event staff.
        </p>
      )}
    </>
  );

  const press = () => {
    setGrace(true);
    saveBreak(result.clearUntil ?? new Date(now().getTime() + 3 * 3_600_000).toISOString(), isPreview);
    countPress(isPreview ? "preview" : "live");
    // Focus moving to the calm heading says where you are, so the live region
    // adds only the result. It is worked out here from the same plan, so
    // nothing waits on the network.
    const pressed = reconcile(plan, changes, { now: now(), bufferMinutes: buffer, graceActive: true });
    setAnnounce(plan.length > 0 ? `${clearLine(pressed)} Nothing is cancelled. Your plan is saved.` : "");
    // Pressed again on the calm screen: nothing remounts, so move focus back
    // to the heading to say it again.
    if (view === "calm") document.getElementById("calm-h")?.focus();
    go("calm");
  };

  // The heading's words change, then focus moves to it so a screen reader
  // reads the new words. The button that was pressed is gone by then.
  const putBack = () => {
    saveBreak(null, isPreview);
    flushSync(() => {
      setGrace(false);
      setAnnounce("");
    });
    document.getElementById("clear-h")?.focus();
  };

  useEffect(() => {
    document.title =
      view === "card" ? "Staff card · Grace Period" : view === "calm" ? "Take your time · Grace Period" : "Grace Period";
  }, [view]);

  const showCard = view === "card";

  return (
    <div className="min-h-screen bg-ground text-ink">
      <p role="status" aria-live="polite" className="sr-only">
        {view === "home" ? "" : announce}
      </p>
      <p aria-live="polite" className="sr-only">
        {noticeText}
      </p>
      {/* Everything but the live region goes quiet while the staff card is up,
          so Tab and the screen reader stay on the card. */}
      <div aria-hidden={showCard || undefined} inert={showCard || undefined}>
        <a
          href="#main"
          className="skip-link"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("main")?.focus();
          }}
        >
          Skip to main content
        </a>
        {isPreview && (
          <p className="bg-black px-5 py-3 text-center font-semibold text-white">
            Preview of {previewDay}. Times are real, the moment is simulated.
            {useSample && " The plan below is a sample."}
          </p>
        )}

        <header className="mx-auto max-w-xl px-5 pt-6">
          <h1 className="text-lg font-semibold">Grace Period</h1>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto max-w-xl space-y-8 px-5 pb-6 pt-5"
        >
          <BreakButton onPress={press} />
          {view === "home" ? (
            <>
            <section aria-labelledby="home-h" className="space-y-3">
              <h2 id="home-h" tabIndex={-1} className="text-2xl font-semibold">
                One tap, no setup.
              </h2>
              <p className="text-lg text-ink-soft">
                Press the button whenever you need a pause. You get the quiet
                room, a card to show staff, and a list of all-gender restrooms. It
                needs no account, and works with no signal after your first visit.
              </p>
            </section>
            {result.notices.length > 0 && (
              <section aria-labelledby="news-h" className="panel space-y-2">
                <h2 id="news-h" className="text-xl font-semibold">What changed</h2>
                {notices}
              </section>
            )}
            <PlanSection plan={plan} setPlan={setPlan} buffer={buffer} setBuffer={setBuffer} />
            <DayViewSection plan={plan} changes={changes} result={result} now={now()} bufferMinutes={buffer} />
            </>
          ) : (
            <Calm
              onCard={() => go("card")}
              onBack={() => go("home")}
              staffBtn={staffBtn}
              planResult={
                plan.length > 0 && (
                  <div className="panel space-y-3" aria-labelledby="clear-h" role="group">
                    <h3 id="clear-h" tabIndex={-1} className="text-2xl font-semibold">
                      {grace ? clearLine(result) : "All your talks are in your plan."}
                    </h3>
                    {grace && <p>Nothing is cancelled. Your plan is saved.</p>}
                    {notices}
                    {similar && <p className="text-ink-soft">Similar talk later today: {similar}.</p>}
                    {result.dropped.length > 0 && (
                      <>
                        <p id="aside-h" className="font-semibold">Set aside for now</p>
                        <ul aria-labelledby="aside-h" className="list-disc space-y-1 pl-6 text-ink-soft">
                          {result.dropped.map((d) => (
                            <li key={d.id}>{d.title}</li>
                          ))}
                        </ul>
                        <button type="button" className="staff-button" onClick={putBack}>
                          Put them back
                        </button>
                      </>
                    )}
                  </div>
                )
              }
            />
          )}
        </main>
        <Footer />
      </div>

      {showCard && <StaffCard onClose={() => go("calm")} />}
    </div>
  );
}
