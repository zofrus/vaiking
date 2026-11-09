// Counts one press. Fire and forget: nothing here is awaited and no one's
// reason or identity is sent. The floor is unknown because we have no location.
export function countPress(mode: "live" | "preview"): void {
  try {
    const body = new Blob([JSON.stringify({ scheduled_floor: "unknown", mode })], {
      type: "application/json",
    });
    if (!navigator.sendBeacon("/api/grace", body)) console.warn("Grace count not queued");
  } catch {
    console.warn("Grace count failed");
  }
}
