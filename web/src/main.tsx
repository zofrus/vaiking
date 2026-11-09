import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import BoardPage from "./pages/Board";
import { initTelemetry } from "./telemetry";
import "./index.css";

void initTelemetry();

const Page = window.location.pathname === "/board" ? BoardPage : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
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
