import { useSyncExternalStore } from "react";

// A small, optional suggestion to add the app to the home screen. It only ever
// renders on the home screen (App decides where), never on the calm screen or
// the staff card, and it sits below the "I need a break" button.

const DISMISS_KEY = "grace-install-dismissed";

// Chromium hands us one event; keep it at module level so it survives the
// prompt unmounting when someone moves between screens.
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferred: InstallEvent | null = null;
let installed = false;
let dismissed = readDismissed();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false; // storage blocked: the prompt may show again, that is fine
  }
}

if (typeof window !== "undefined") {
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own, calmer prompt instead of the browser bar
    deferred = e as InstallEvent;
    emit();
  });
  addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function isStandalone(): boolean {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isMobile(): boolean {
  const ua = navigator.userAgent;
  const ipadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod/.test(ua) || ipadOs;
}

// iOS Safari only: other iOS browsers put Add to Home Screen elsewhere.
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
}

type Mode = "install" | "ios" | null;

// One string snapshot keeps useSyncExternalStore stable between renders.
function snapshot(): Mode {
  if (dismissed || installed || !isMobile() || isStandalone()) return null;
  if (deferred) return "install";
  return isIosSafari() ? "ios" : null;
}

export function InstallPrompt() {
  const mode = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!mode) return null;

  const dismiss = () => {
    dismissed = true;
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Not saved, but it stays hidden for this visit.
    }
    emit();
    // The focused button is about to disappear: keep keyboard and screen reader
    // users in the page instead of dropping them at the top.
    document.getElementById("main")?.focus();
  };

  const install = async () => {
    const event = deferred;
    if (!event) return;
    deferred = null; // the browser allows one prompt per event
    emit();
    await event.prompt();
    await event.userChoice.catch(() => undefined);
    document.getElementById("main")?.focus();
  };

  return (
    <section aria-labelledby="install-h" className="panel space-y-3">
      <h2 id="install-h" className="text-xl font-semibold">
        Keep Grace Period on your phone
      </h2>
      <p>
        {mode === "install"
          ? "Add it to your home screen so it opens quickly, even with no signal."
          : "Tap Share, then Add to Home Screen."}
      </p>
      <div className="flex flex-wrap gap-3">
        {mode === "install" && (
          <button type="button" className="install-button install-primary" onClick={() => void install()}>
            Install
          </button>
        )}
        <button type="button" className="install-button" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
