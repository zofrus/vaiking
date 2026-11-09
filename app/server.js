// HTTP entry point. Keep listening on $PORT and keep /healthz and /readyz: the
// manifests in deploy/ depend on them.
const fs = require("node:fs");
const path = require("node:path");
const Fastify = require("fastify");
const fastifyStatic = require("@fastify/static");
const { createElastic } = require("./lib/elastic");

const SESSIONIZE_URL = "https://sessionize.com/api/v2/svi82w6c/view/All";
const DEEP_CACHE_MS = 30_000;
const CHECK_TIMEOUT_MS = 3_000;

const LOGGER_OPTIONS = {
  level: process.env.LOG_LEVEL || "info",
  redact: ["req.headers.authorization", "req.headers.cookie"],
};

async function timed(check) {
  const started = performance.now();
  let result;
  try {
    result = await check();
  } catch (err) {
    // Only a numeric status leaves here: error messages can contain URLs.
    const status = Number.isInteger(err?.statusCode) ? err.statusCode : null;
    result = { ok: false, status };
  }
  return { ...result, durationMs: Math.round(performance.now() - started) };
}

async function headCheck(fetchImpl, url, isOk) {
  const res = await fetchImpl(url, {
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  return { ok: isOk(res.status), status: res.status };
}

function runDeepChecks({ elastic, env, fetchImpl }) {
  const elasticCheck = elastic.configured
    ? timed(async () => {
        const res = await elastic.client.info(
          {},
          { requestTimeout: CHECK_TIMEOUT_MS, maxRetries: 0, meta: true },
        );
        return { ok: true, status: res.statusCode };
      })
    : { ok: false, skipped: true };

  let dash0Check = { ok: false, skipped: true };
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    dash0Check = timed(() => {
      const { origin } = new URL(env.OTEL_EXPORTER_OTLP_ENDPOINT);
      // Any HTTP answer proves the host is reachable; no token is sent.
      return headCheck(fetchImpl, origin, (status) => status < 500);
    });
  }

  const sessionizeCheck = timed(() =>
    headCheck(
      fetchImpl,
      SESSIONIZE_URL,
      (status) => status >= 200 && status < 300,
    ),
  );

  return Promise.all([elasticCheck, dash0Check, sessionizeCheck]).then(
    ([elasticsearch, dash0, sessionize]) => ({
      elasticsearch,
      dash0,
      sessionize,
    }),
  );
}

function build(opts = {}) {
  const env = opts.env ?? process.env;
  const elastic = opts.elastic ?? createElastic(env);
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const publicDir = opts.publicDir ?? path.join(__dirname, "public");
  const version = env.APP_VERSION || "dev";

  const app = Fastify({ logger: opts.logger ?? false });

  if (elastic.client) app.addHook("onClose", () => elastic.client.close());

  const probe = { logLevel: "warn" };
  app.get("/healthz", probe, async () => "ok\n");
  app.get("/readyz", probe, async () => "ok\n");

  // One shared run, reused for 30 seconds, so the public endpoint cannot be
  // used to multiply outbound requests.
  let deepRun = null;
  let deepExpires = 0;
  function deepChecks() {
    if (deepRun && (deepExpires === 0 || Date.now() < deepExpires))
      return deepRun;
    deepExpires = 0;
    deepRun = runDeepChecks({ elastic, env, fetchImpl }).finally(() => {
      deepExpires = Date.now() + DEEP_CACHE_MS;
    });
    return deepRun;
  }

  app.get("/api/status", async (request) => {
    const status = {
      version,
      elastic: { configured: elastic.configured },
      telemetry: {
        configured: Boolean(
          env.OTEL_EXPORTER_OTLP_ENDPOINT && env.DASH0_AUTH_TOKEN,
        ),
      },
    };
    if (request.query.deep === "1") status.checks = await deepChecks();
    return status;
  });

  app.get("/api/public-config", async () => {
    const endpoint = env.DASH0_RUM_ENDPOINT;
    const token = env.DASH0_RUM_TOKEN;
    return {
      version,
      rum:
        endpoint && token
          ? { endpoint, token, dataset: env.DASH0_DATASET || null }
          : null,
    };
  });

  const hasPublicDir = fs.existsSync(path.join(publicDir, "index.html"));
  if (hasPublicDir) app.register(fastifyStatic, { root: publicDir });

  app.setNotFoundHandler((request, reply) => {
    const { pathname } = new URL(request.url, "http://localhost");
    const isPage =
      request.method === "GET" &&
      hasPublicDir &&
      !pathname.startsWith("/api/") &&
      path.extname(pathname) === "";
    if (isPage) return reply.sendFile("index.html");
    return reply.code(404).send({ error: "not found" });
  });

  return app;
}

async function main() {
  const app = build({ logger: LOGGER_OPTIONS });
  const shutdown = () => {
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  // Exit cleanly when Kubernetes stops the pod, so rollouts don't drop requests.
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  await app.listen({ port: Number(process.env.PORT || 8080), host: "0.0.0.0" });
}

if (require.main === module) {
  main().catch((err) => {
    console.error("startup failed:", err.code || err.name);
    process.exit(1);
  });
}

module.exports = { build };
