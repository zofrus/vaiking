import { QueryShape } from "./QueryShape";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { quietRoom, restrooms } from "./data/facilities";
import { countPress } from "./lib/grace";
import { PlanSection } from "./Plan";
import { AddToCalendar } from "./AddToCalendar";
import { DayViewSection } from "./DayView";
import { InstallPrompt } from "./InstallPrompt";
import { FocusToggle } from "./FocusToggle";
import { OfflineChip } from "./OfflineChip";
import { loadBreak, loadBuffer, loadPlan, saveBreak, saveBuffer, savePlan } from "./lib/plan";
import { isDrill, isPreview, now, samplePlan, useSample } from "./lib/clock";
import { useAlternatives, useChanges, useSimilar } from "./lib/live";
import { formatTime, reconcile, type Notice, type PlanItem } from "./lib/reconcile";
import { closestReachable } from "./lib/reach";
import { placeLabel } from "./lib/place";
import { Sticker } from "./Sticker";
import { VENUE_SOURCE_LINE, venueFacts } from "./data/facilities";
import { ShareQR } from "./ShareQR";
import { ChangesChecked } from "./ChangesChecked";
import { nextRoom } from "./lib/nextRoom";
import { BreakBar } from "./BreakBar";
import { ReplayTour, Tour, TourInvite } from "./Tour";
import { VenueHelp } from "./VenueHelp";
import { SoundPanel } from "./SoundPanel";
import { Breathe } from "./Breathe";
import { ReadAloud } from "./ReadAloud";

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

const svg = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const MoonIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="2" {...svg}>
    <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4a8.5 8.5 0 1 0 11.5 11.5z" />
  </svg>
);
const CheckIcon = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="2.2" {...svg}>
    <path d="M5 12l4 4 10-10" />
  </svg>
);
const PersonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="1.7" {...svg}>
    <circle cx="12" cy="5" r="2" />
    <path d="M8 21v-6H6.5L8 9h8l1.5 6H16v6M12 9v12" />
  </svg>
);
const CardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="1.8" {...svg}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </svg>
);
const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...svg}>
    <path d="M4 12h14M13 6l6 6-6 6" />
  </svg>
);

function BreakButton({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="break-button"
      id="break-main"
      aria-labelledby="break-label"
      aria-describedby="break-desc"
    >
      <span className="break-top" aria-hidden="true">
        <span className="break-icon">
          <MoonIcon />
        </span>
        <span className="break-meta">One tap · no sign-in</span>
      </span>
      <span>
        <span id="break-label" className="break-title">
          I need a break
        </span>
        <span id="break-desc" className="break-sub">
          The quiet room, a card to show staff, and restrooms. Works without signal after your first visit.
        </span>
      </span>
    </button>
  );
}

function Footer({ showReplay }: { showReplay: boolean }) {
  return (
    <footer className="mx-auto flex max-w-xl flex-col gap-1.5 px-5 pb-28 pt-6 text-xs leading-relaxed text-ink-soft">
      <span className="gp-credit gp-secondary self-start">
        This release reviewed by <b>Gitar</b>
      </span>
      <p className="text-xs">
        Made with{" "}
        <svg
          className="inline-block align-[-0.125em]"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 5 6 5c2.1 0 3.6 1.2 4.5 2.6h3C14.4 6.2 15.9 5 18 5c3.4 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z" />
        </svg>
        <span className="sr-only">love</span> by{" "}
        <span className="font-semibold text-ink">Effulgent Point</span>
        <span className="block sm:inline"> · open source, offered to the CNCF events team</span>
      </p>
      <p>
        Schedule data: KubeCon + CloudNativeCon North America 2026, The Linux
        Foundation, CC BY 3.0.
      </p>
      {/* One wrapping row of quiet links, each at least 44px tall. Calm has its own
          Replay tour panel, so the footer one shows only off calm. */}
      <div className="footer-links mt-2 flex flex-wrap items-center gap-x-4">
        {showReplay && <ReplayTour />}
        <ShareQR />{/* mount: ShareQR */}
        <a href="/board">Organizer board</a>
      </div>
      <Tour />{/* mount: Tour */}
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
  const firstAid = venueFacts.find((f) => f.id === "first-aid");

  return (
    <section aria-labelledby="calm-h" className="space-y-6">
      <div className="flex flex-col items-start gap-5">
        <div className="calm-mark gp-secondary" aria-hidden="true">
          <span className="c-ring c-ring-1" />
          <span className="c-ring c-ring-2" />
          <span className="core">
            <CheckIcon />
          </span>
        </div>
        <div>
          <h2
            id="calm-h"
            ref={heading}
            tabIndex={-1}
            className="text-[1.875rem] font-medium leading-[1.18] outline-none"
          >
            Take your time. The quiet room is open to everyone.
          </h2>
          <p className="mt-2.5 text-lg text-ink-soft">
            Nothing here needs an answer from you.
          </p>
        </div>
      </div>

      <div className="panel space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[1.625rem] font-semibold leading-tight">{quietRoom.name}</h3>
            <p className="mt-1 text-lg">
              {quietRoom.venue}, Level {quietRoom.level}
            </p>
          </div>
          <span className="gp-icon !h-10 !w-10 !rounded-full !bg-[var(--gp-accent-soft)]" aria-hidden="true">
            <MoonIcon size={20} />
          </span>
        </div>
        <p className="text-base text-ink-soft">
          Hours not listed. Estimated. Confirm routes with event staff.
        </p>
        {/* mount: ReadAloud */}<div className="mt-4"><ReadAloud text={`${quietRoom.name}, ${quietRoom.venue}, Level ${quietRoom.level}.`} /></div>
        <button
          ref={staffBtn}
          type="button"
          onClick={onCard}
          className="staff-button"
        >
          <CardIcon />
          Show this to staff
        </button>
        <p className="text-[0.9375rem] text-ink-soft">
          Opens a large card you can hold up instead of speaking.
        </p>
      </div>

      <div id="restrooms" className="panel !py-2">
        <h3 className="pt-2 text-lg font-semibold">All-gender restrooms</h3>
        {["Salt Palace", "Hyatt Regency"].map((venue) => (
          <div key={venue} className="mt-2">
            <h4 className="eyebrow pt-2">{venue}</h4>
            <ul>
              {byVenue(venue).map((r) => (
                <li key={r.id} className="gp-row">
                  <span className="gp-icon">
                    <PersonIcon />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      Level {r.level}
                      <span className="sr-only">. </span>
                    </span>
                    <span className="text-base text-ink-soft">{r.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="py-3 text-base text-ink-soft">
          Estimated. Confirm routes with event staff.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="gp-credit gp-secondary">
          Counted anonymously, by floor · <b>Dash0</b>
        </span>
      </div>

      {planResult}

      {/* Always visible on calm: the one place the Focus switch is shown here. */}
      <div className="panel"><FocusToggle /></div>{/* mount: FocusToggle (calm) */}

      {/* Safety information is never behind a tap: the first-aid sentence, as the
          page words it, with its source. The other venue facts stay inside. */}
      {firstAid && (
        <section aria-labelledby="aid-h" className="panel space-y-2">
          <h3 id="aid-h" className="text-lg font-semibold">
            {firstAid.title}
          </h3>
          <p>{firstAid.text}</p>
          <p className="text-sm text-ink-soft">{VENUE_SOURCE_LINE}</p>
        </section>
      )}

      {/* Everything optional sits behind one disclosure, under the essentials. */}
      <details className="panel more-support">
        <summary>More support</summary>
        <div className="more-support-body">
          {/* mount: Sticker */}<Sticker />
          {/* mount: VenueHelp */}<VenueHelp />
          {/* mount: Breathe */}<Breathe />
          {/* mount: SoundPanel */}<SoundPanel />
          <div><ReplayTour /></div>{/* mount: ReplayTour */}
        </div>
      </details>

      <button type="button" onClick={onBack} className="quiet-button">
        Back to the start
      </button>
    </section>
  );
}

// Held up to someone else, so it is sized for arm's length: vmin keeps the
// words large in portrait and still on screen when the phone is turned.
function StaffCard({ onClose, nextRoom }: { onClose: () => void; nextRoom: string | null }) {
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
      className="staff-card fixed inset-0 z-10 flex flex-col bg-white text-black"
    >
      {/* Auto margins centre the words but drop to 0 if they overflow, so the
          first line can always be scrolled back into view. */}
      <div tabIndex={0} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-8">
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
          {nextRoom && (
            <p className="mt-[6vmin] border-t-2 border-black pt-[4vmin] text-[clamp(1.5rem,7.5vmin,2.75rem)] font-semibold leading-tight">
              Please point me to: {nextRoom}
            </p>
          )}
        </div>
      </div>
      <div className="border-t-2 border-black px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* mount: ReadAloud */}<div className="mb-3 text-black"><ReadAloud text={`Please point me to ${quietRoom.name}, Level ${quietRoom.level}. I may not be able to talk right now. ${quietRoom.venue}.${nextRoom ? ` Please point me to: ${nextRoom}.` : ""}`} /></div>
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
  const [grace, setGrace] = useState(() => viewFromHash() !== "home" && loadBreak(now().getTime(), isPreview ? "preview" : "live"));
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
  // A similar talk is only worth naming if the person could go: it starts after
  // their own buffer and clashes with nothing in their plan (same rule as notices).
  const similarTalks = useSimilar(grace ? result.dropped[0] : undefined);
  const similar =
    grace && result.dropped[0]
      ? closestReachable(similarTalks, [...result.kept, ...result.dropped], result.dropped[0].id, now(), buffer)
      : null;
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
      {/* mount: QueryShape */}
      {lines.some((l) => l.reach) && <QueryShape />}
    </>
  );

  const press = () => {
    setGrace(true);
    saveBreak(result.clearUntil ?? new Date(now().getTime() + 3 * 3_600_000).toISOString(), isPreview ? "preview" : "live");
    countPress(isPreview ? "preview" : "live", plan, now());
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
    saveBreak(null, isPreview ? "preview" : "live");
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
    <div data-view={view} className="min-h-screen bg-ground text-ink">
      <p role="status" aria-live="polite" className="sr-only">
        {view === "home" ? "" : announce}
      </p>
      {/* One node per notice, so additions and text changes are announced independently. */}
      <div role="status" aria-live="polite" aria-atomic="false" aria-relevant="additions text" className="sr-only">
        {lines.map((l) => (
          <p key={l.id}>{l.text}</p>
        ))}
      </div>
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
          <p className="preview-banner px-5 py-3 text-center text-sm font-semibold">
            {isDrill && <strong className="mono mr-2 uppercase tracking-wider">Drill</strong>}
            Preview of {previewDay}. Times are real, the moment is simulated.
            {useSample && " The plan below is a sample."}
          </p>
        )}

        <header className="app-header mx-auto max-w-xl px-5 pt-6">
          <h1 className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...svg}>
                <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            Grace Period
          </h1>
          <span className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
            <FocusToggle compact />{/* mount: FocusToggle (header) */}
            <OfflineChip />{/* mount: OfflineChip */}
          </span>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto max-w-xl space-y-6 px-5 pb-6 pt-5"
        >
          <BreakButton onPress={press} />
          {view === "home" ? (
            <>
            <section aria-labelledby="home-h" className="space-y-3">
              <h2 id="home-h" tabIndex={-1} className="text-xl font-semibold">
                One tap, no setup.
              </h2>
              <p className="text-[0.9375rem] text-ink-soft">
                Press the button whenever you need a pause. You get the quiet
                room, a card to show staff, and a list of all-gender restrooms. It
                needs no account, and works with no signal after your first visit.
              </p>
              <p className="gp-secondary text-xs text-ink-soft">
                Unofficial attendee companion for KubeCon + CloudNativeCon North
                America 2026 · built at the Cloud Native Hackathon
              </p>
            </section>
            {result.notices.length > 0 && (
              <section aria-labelledby="news-h" className="notice">
                <h2 id="news-h"><ArrowIcon />What changed</h2>
                {notices}
              </section>
            )}
            <TourInvite />{/* mount: TourInvite */}
            <div className="gp-secondary">
              <InstallPrompt />
            </div>
            <PlanSection plan={plan} setPlan={setPlan} buffer={buffer} setBuffer={setBuffer} />
            <DayViewSection plan={plan} changes={changes} result={result} now={now()} bufferMinutes={buffer} />
            {plan.length > 0 && <ChangesChecked />}
            <AddToCalendar talks={[...result.kept, ...result.dropped]} />{/* mount: AddToCalendar */}
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
                    {similar && (
                      <p className="text-ink-soft">
                        Similar talk later today: {similar.title}, {formatTime(similar.starts_at)} MST, {placeLabel(similar.room)}.
                      </p>
                    )}
                    {result.dropped.length > 0 && (
                      <>
                        <p id="aside-h" className="font-semibold">Set aside for now</p>
                        <ul aria-labelledby="aside-h" className="list-disc space-y-1 pl-6 text-ink-soft">
                          {result.dropped.map((d) => (
                            <li key={d.id}>{d.title}</li>
                          ))}
                        </ul>
                        <button type="button" className="quiet-button" onClick={putBack}>
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
        {view === "home" && <BreakBar onPress={press} />}
        <Footer showReplay={view !== "calm"} />
      </div>

      {showCard && <StaffCard onClose={() => go("calm")} nextRoom={nextRoom(result.kept, now())} />}
    </div>
  );
}
