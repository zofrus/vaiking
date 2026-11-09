import type { PlanItem } from "./reconcile";

// The plan lives on this phone only. The server never sees it.
const KEY = "grace-plan-v1";
const BUFFER_KEY = "grace-buffer-v1";

export function loadPlan(): PlanItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function savePlan(plan: PlanItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    // Storage can be blocked. The plan then lasts until the page closes.
  }
}

export function loadBuffer(): number {
  try {
    const n = Number(localStorage.getItem(BUFFER_KEY));
    return Number.isInteger(n) && n >= 5 && n <= 120 ? n : 15;
  } catch {
    return 15;
  }
}

export function saveBuffer(minutes: number): void {
  try {
    localStorage.setItem(BUFFER_KEY, String(minutes));
  } catch {
    // Same as above: fall back to memory only.
  }
}

// Display preference only. Stored even in preview, since it holds no plan data.
const KUBECTL_KEY = "grace-kubectl-v1";

export function loadKubectl(): boolean {
  try {
    return localStorage.getItem(KUBECTL_KEY) === "1";
  } catch (error) {
    console.warn("Could not read kubectl preference", error);
    return false;
  }
}

export function saveKubectl(on: boolean): void {
  try {
    localStorage.setItem(KUBECTL_KEY, on ? "1" : "0");
  } catch (error) {
    console.warn("Could not save kubectl preference", error);
  }
}

// A break carries over a reload in this tab only, and only until it would end
// anyway (the next must-see). A shared or bookmarked link to the calm screen
// opens in a new tab with no break, so it never claims one the person did not start.
const BREAK_KEY = "grace-break-until-v1";

export function loadBreak(nowMs: number): boolean {
  try {
    const until = sessionStorage.getItem(BREAK_KEY);
    return until !== null && Date.parse(until) > nowMs;
  } catch {
    return false;
  }
}

export function saveBreak(until: string | null): void {
  try {
    if (until) sessionStorage.setItem(BREAK_KEY, until);
    else sessionStorage.removeItem(BREAK_KEY);
  } catch {
    // Storage can be blocked. The break then lasts until the page closes.
  }
}
