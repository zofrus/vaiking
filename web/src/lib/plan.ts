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
