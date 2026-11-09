# OpenTelemetry coverage

Observability is a product feature here. Report gaps as Important.

- Every new HTTP route, background job, and outbound call to Elasticsearch or
  a model API must produce a span, through auto-instrumentation or a manual
  span.
- Flag a `catch` that swallows an error with no log and no exception recorded
  on the current span.
- Flag span attributes that carry email addresses, tokens, or raw personal
  data.
- Use OpenTelemetry semantic convention attribute names where one exists.
- Flag raw user query text or user IDs used as metric labels. They are
  high cardinality.
- New frontend flows must report to RUM.
