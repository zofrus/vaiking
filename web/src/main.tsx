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
