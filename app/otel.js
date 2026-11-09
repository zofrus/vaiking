const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");

const sdk = new NodeSDK({
  instrumentations: getNodeAutoInstrumentations({
    "@opentelemetry/instrumentation-http": {
      ignoreIncomingRequestHook: (req) =>
        (req.url ?? "").startsWith("/api/grace"),
    },
  }),
});
sdk.start();

// Send what is still buffered when Kubernetes stops the pod. A failed export
// must not change how the process exits.
let flushed = false;
function flush() {
  if (flushed) return;
  flushed = true;
  sdk.shutdown().catch((err) => {
    // Name only: export errors can carry the endpoint.
    console.error("otel shutdown failed:", err?.name ?? "Error");
  });
}
process.on("SIGTERM", flush);
process.once("beforeExit", flush);
