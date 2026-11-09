const test = require("node:test");
const assert = require("node:assert/strict");
const { withServiceVersion } = require("../lib/otel-resource");

test("adds service.version after the existing attributes", () => {
  const env = {
    APP_VERSION: "37ccc42",
    OTEL_RESOURCE_ATTRIBUTES:
      "k8s.pod.name=app-1,deployment.environment.name=hackathon",
  };
  assert.equal(
    withServiceVersion(env),
    "k8s.pod.name=app-1,deployment.environment.name=hackathon,service.version=37ccc42",
  );
});

test("works when no attributes are set yet", () => {
  assert.equal(
    withServiceVersion({ APP_VERSION: "37ccc42" }),
    "service.version=37ccc42",
  );
});

test("leaves the attributes alone for an unset or dev version", () => {
  assert.equal(withServiceVersion({ OTEL_RESOURCE_ATTRIBUTES: "a=b" }), "a=b");
  assert.equal(
    withServiceVersion({ APP_VERSION: "dev", OTEL_RESOURCE_ATTRIBUTES: "a=b" }),
    "a=b",
  );
  assert.equal(withServiceVersion({}), "");
});

test("an existing service.version wins", () => {
  const env = {
    APP_VERSION: "37ccc42",
    OTEL_RESOURCE_ATTRIBUTES: "service.version=1.2.3",
  };
  assert.equal(withServiceVersion(env), "service.version=1.2.3");
});

test("refuses a version that could break the attribute list", () => {
  for (const bad of ["a,b=c", "x y", "v=1", "a".repeat(65)]) {
    assert.equal(
      withServiceVersion({ APP_VERSION: bad, OTEL_RESOURCE_ATTRIBUTES: "a=b" }),
      "a=b",
    );
  }
});
