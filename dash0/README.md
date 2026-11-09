# Dash0 assets

Status: the SLO and dashboard YAML are not exported yet. They must be built in the
Dash0 UI and exported, because the asset schema has not been verified from here.
This file records the exact queries so the UI build is copy and paste.

## SLO: "share answered within 1 second"

Dash0 SLO queries must be bare vector selectors, and good must be a strict subset of total.

- Good:  `plan_requests_total{within_1s="true"}`
- Total: `plan_requests_total`

Both series are initialised to 0 at startup (`app/lib/metrics.js`), so they exist before the first request.
A failed response (5xx) counts as `within_1s="false"`.

## Dashboard panels

- Presses by floor, live: `round(sum by (scheduled_floor) (increase(grace_requests_total{mode="live"}[1h])))`
- Presses by floor, preview: same with `mode="preview"`
- Share answered within 1 second: `sum(increase(plan_requests_total{within_1s="true"}[1h])) / sum(increase(plan_requests_total[1h]))`

## Reading metrics back (used by `/api/board`)

`GET {DASH0_API_URL}/api/prometheus/api/v1/query?query=...` with `Authorization: Bearer <read token>`.
Verified response shape: `{status, data: {resultType, result: [{metric, value: [ts, "n"]}]}}`.
