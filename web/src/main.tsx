import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initTelemetry } from "./telemetry";
import "./index.css";

void initTelemetry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register after load so it never competes with the first render.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is a bonus. The app works without it.
    });
  });
}
