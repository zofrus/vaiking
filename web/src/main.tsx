import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { reloadOnceForNewBuild } from "./lib/staleBuild";
import { initTelemetry } from "./telemetry";
import "./index.css";
import "./focus.css";
import { initFocus } from "./lib/focusMode";

initFocus(); // sets data-focus before the first render, so nothing flashes

void initTelemetry();

// After a deploy, an open tab's lazy chunks are gone from the server. Reload once.
addEventListener("vite:preloadError", () => {
  reloadOnceForNewBuild(
    () => sessionStorage,
    () => location.reload(),
  );
});

// Two pages, so a path check is enough. /board is the organizer page.
const Board = lazy(() => import("./pages/Board"));
const onBoard = location.pathname.replace(/\/+$/, "") === "/board";

// /demo is the judge-facing projector page. Inside its iframe the app loads at /,
// so this path check never recurses.
const Demo = lazy(() => import("./pages/Demo"));
const onDemo = location.pathname.replace(/\/+$/, "") === "/demo";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {onDemo ? (
      <Suspense fallback={<p className="p-4">Loading.</p>}>
        <Demo />
      </Suspense>
    ) : onBoard ? (
      <Suspense fallback={<p className="p-4">Loading.</p>}>
        <Board />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);

// Register after load so it never competes with the first render.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("Service worker registration failed", error);
      // Offline support is a bonus. The app works without it.
    });
  });
}
