---
title: "Instrumented endpoints"
description: "New routes and jobs emit OpenTelemetry spans"
type: check
when: "PRs that add or change an HTTP route, background job, or Elasticsearch call"
actions: "Report any new route, job, or query with no span"
---

# Instrumented endpoints

Pass when each new route, job, and query produces a span.
