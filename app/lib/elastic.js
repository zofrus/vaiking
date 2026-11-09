// The Elasticsearch client exists only when both settings are present, so the
// app starts and serves with no environment at all.
const { Client } = require("@elastic/elasticsearch");

const NOT_CONFIGURED = Object.freeze({ configured: false, client: null });

function createElastic(env = process.env) {
  const node = env.ELASTICSEARCH_URL;
  const apiKey = env.ELASTICSEARCH_API_KEY;
  if (!node || !apiKey) return NOT_CONFIGURED;
  try {
    const client = new Client({
      node,
      auth: { apiKey },
      serverMode: "serverless",
      requestTimeout: 10_000,
      maxRetries: 1,
    });
    return { configured: true, client };
  } catch {
    // A malformed URL must not stop the app. The error text can echo the URL.
    return NOT_CONFIGURED;
  }
}

module.exports = { createElastic, NOT_CONFIGURED };
