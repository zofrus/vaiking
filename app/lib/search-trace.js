const { context, SpanStatusCode, trace } = require("@opentelemetry/api");
const { suppressTracing } = require("@opentelemetry/core");

const tracer = trace.getTracer("vaiking-search");

// Records the operation only, never ids or query text.
function withSpan(name, operation, fn, { traced = true } = {}) {
  if (!traced) return context.with(suppressTracing(context.active()), fn);
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute("db.system.name", "elasticsearch");
    span.setAttribute("db.operation.name", operation);
    try {
      return await fn();
    } catch (err) {
      span.recordException({ name: err?.name ?? "Error" });
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}

module.exports = { withSpan };
