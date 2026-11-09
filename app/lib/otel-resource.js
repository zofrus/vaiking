// Adds service.version to OTEL_RESOURCE_ATTRIBUTES, so Dash0 can tell which
// release a trace, log or metric came from. The value is the image tag the
// build already sets as APP_VERSION. No user data is involved.
const SAFE_VERSION = /^[A-Za-z0-9._-]{1,64}$/;

function withServiceVersion(env = process.env) {
  const current = env.OTEL_RESOURCE_ATTRIBUTES ?? "";
  const version = env.APP_VERSION;
  // An unset or "dev" version is not worth a label, and an existing value wins.
  if (!version || version === "dev" || !SAFE_VERSION.test(version))
    return current;
  if (/(^|,)\s*service\.version=/.test(current)) return current;
  return current
    ? `${current},service.version=${version}`
    : `service.version=${version}`;
}

module.exports = { withServiceVersion };
