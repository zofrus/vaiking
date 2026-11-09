const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");

new NodeSDK({
  instrumentations: getNodeAutoInstrumentations({
    "@opentelemetry/instrumentation-http": {
      ignoreIncomingRequestHook: (req) => (req.url ?? "").startsWith("/api/grace"),
    },
  }),
}).start();
