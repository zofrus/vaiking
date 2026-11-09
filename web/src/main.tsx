import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initTelemetry } from "./telemetry";
import "./index.css";

void initTelemetry();

// Two pages, so a path check is enough. /board is the organizer page.
const Board = lazy(() => import("./pages/Board"));
const onBoard = location.pathname.replace(/\/+$/, "") === "/board";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {onBoard ? (
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
