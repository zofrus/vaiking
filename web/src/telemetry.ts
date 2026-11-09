// Browser telemetry. The token comes from /api/public-config at runtime so it
// is never baked into the image. Telemetry must never break the page.
interface PublicConfig {
  rum: { endpoint: string; token: string; dataset: string | null } | null;
}

export function reportRequestFailure(endpoint: string, error: unknown): void {
  const message = `Request failed: ${endpoint}`;
  const reportedError = error instanceof Error ? error : new Error(message);
  console.error(message, error);
  void import("@dash0/sdk-web")
    .then(({ reportError, sendEvent }) => {
      reportError(reportedError, { attributes: { "http.route": endpoint } });
      sendEvent("request_failure", {
        title: message,
        attributes: { "http.route": endpoint },
        severity: "ERROR",
      });
    })
    .catch(() => {
      // Telemetry must never break the page.
    });
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
      // The grace-count beacon and search requests never get a span or trace
      // header, so the button press and the words typed in search stay out of
      // browser telemetry.
      ignoreUrls: [/\/api\/grace(?:[?#]|$)/, /\/api\/search(?:[?#/]|$)/],
      sessionInactivityTimeoutMillis: 30 * 60 * 1000,
      sessionTerminationTimeoutMillis: 4 * 60 * 60 * 1000,
    });
  } catch {
    // No telemetry is better than a broken page; don't log config or endpoint details.
    console.warn("Browser telemetry initialization failed");
  }
}
