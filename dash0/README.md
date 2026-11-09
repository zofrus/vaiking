# Dash0 assets

Status: this folder holds no exported SLO or dashboard file. The repo has only the
metric definitions (`app/lib/metrics.js`), the counting rule (`app/routes/plan-timing.js`)
and the queries below, which are copy and paste into the Dash0 UI. Any SLO or dashboard
built from them lives in Dash0, not in this repo.

## SLO: "plan requests answered within 1 second"

Counts `GET /api/search` and `GET /api/talks`, the requests behind the plan screen.
`/api/changes` (the background poll) and `/api/similar` (it follows a break press) are left out.

Dash0 SLO queries must be bare vector selectors, and good must be a strict subset of total.

- Good:  `plan_requests_total{within_1s="true"}`
- Total: `plan_requests_total`

Both series are initialised to 0 at startup (`app/lib/metrics.js`), so they exist before the first request.
A failed response (5xx) counts as `within_1s="false"`.

## Dashboard panels

- Presses by floor, live: `round(sum by (scheduled_floor) (increase(grace_requests_total{mode="live"}[1h])))`
- Presses by floor, preview: same with `mode="preview"`
- Plan requests answered within 1 second: `sum(increase(plan_requests_total{within_1s="true"}[1h])) / sum(increase(plan_requests_total[1h]))`

## Reading metrics back (used by `/api/board`)

`GET {DASH0_API_URL}/api/prometheus/api/v1/query?query=...` with `Authorization: Bearer <read token>`.
Verified response shape: `{status, data: {resultType, result: [{metric, value: [ts, "n"]}]}}`.
