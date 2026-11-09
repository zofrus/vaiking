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
