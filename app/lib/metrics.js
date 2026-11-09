// Product metrics. Labels are deliberately tiny and fixed so no identifier can
// ride along: scheduled_floor comes from an allowlist, mode is live or preview.
const { metrics } = require("@opentelemetry/api");

const FLOORS = ["1", "2", "3", "4", "5", "ground", "lobby", "mezzanine"];
const KNOWN_FLOOR_LABELS = [...FLOORS, "unknown"];
const MODES = ["live", "preview"];

// "Level 2", "L2", "2nd floor", " 2 " all become "2". Anything else is unknown.
function normalizeFloor(value) {
  if (typeof value !== "string") return "unknown";
  const v = value
    .trim()
    .toLowerCase()
    .replace(/^(level|floor|l)\s*/, "")
    .replace(/(st|nd|rd|th)?\s*floor$/, "");
  return FLOORS.includes(v) ? v : "unknown";
}

function createMetrics(meter = metrics.getMeter("vaiking-app")) {
  const grace = meter.createCounter("grace_requests_total", {
    description: "Times the break button was pressed",
  });
  const plan = meter.createCounter("plan_requests_total", {
    description: "Plan shares, split by whether they answered within 1 second",
  });

  // Adding 0 for every label set at startup makes the series exist before the
  // first tap, so increase() has a baseline.
  for (const mode of MODES) {
    for (const floor of KNOWN_FLOOR_LABELS) {
      grace.add(0, { scheduled_floor: floor, mode });
    }
  }
  for (const within of ["true", "false"]) plan.add(0, { within_1s: within });

  return {
    recordGrace(floor, mode) {
      grace.add(1, { scheduled_floor: normalizeFloor(floor), mode });
    },
    recordPlan(durationMs) {
      plan.add(1, { within_1s: durationMs <= 1000 ? "true" : "false" });
    },
  };
}

let shared;
function getMetrics() {
  shared ??= createMetrics();
  return shared;
}

module.exports = {
  FLOORS,
  KNOWN_FLOOR_LABELS,
  MODES,
  normalizeFloor,
  createMetrics,
  getMetrics,
};
