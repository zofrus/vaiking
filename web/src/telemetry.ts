// Browser telemetry. The token comes from /api/public-config at runtime so it
// is never baked into the image. Telemetry must never break the page.
interface PublicConfig {
  rum: { endpoint: string; token: string; dataset: string | null } | null;
}

export async function initTelemetry(): Promise<void> {
  try {
    const res = await fetch("/api/public-config");
    if (!res.ok) return;
    const { rum } = (await res.json()) as PublicConfig;
    if (!rum) return;

    const { init } = await import("@dash0/sdk-web");
    init({
      serviceName: "vaiking-web",
      endpoint: {
        url: rum.endpoint,
        authToken: rum.token,
        ...(rum.dataset ? { dataset: rum.dataset } : {}),
      },
      // The break-button beacon must never be tied to a browser session. It uses
      // sendBeacon, which the SDK does not instrument, and this keeps it that way
      // if the call ever becomes a fetch. Session replay stays off: no recorder is
      // passed, and the SDK only records when one is provided.
      ignoreUrls: [/\/api\/grace(\?|$)/],
      sessionInactivityTimeoutMillis: 30 * 60 * 1000,
      sessionTerminationTimeoutMillis: 4 * 60 * 60 * 1000,
    });
  } catch {
    // No telemetry is better than a broken page; don't log config or endpoint details.
    console.warn("Browser telemetry initialization failed");
  }
}
