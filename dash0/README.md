# Dash0 assets

Status: this folder holds no exported SLO or dashboard file. The repo has only the
metric definitions (`app/lib/metrics.js`), the counting rule (`app/routes/plan-timing.js`)
and the queries below, which are copy and paste into the Dash0 UI. Any SLO or dashboard
built from them lives in Dash0, not in this repo.

## Live in Dash0

Both links need a login to the team's Dash0 organization; Dash0 has no public share link.

- [Vaiking Overview dashboard](https://app.dash0.com/dashboards?org=26f0e5c9-8de7-4e6c-9253-bf2c2d9c5327&s=eJwdjEEOgyAQRe8ya4laqQrX6AmGzJhOQmrDYDeEuxdc_pf3X4ERfAHCjMoZPBAfeMUMdYCRUN_hxETanSjahALnlz_gc7p4AKF2YXJ22ldnHnZBY5E245YjGBvWeX-SC_O09d5PVELkFyfhXuwIk2Bj96z1D4mlLWo%3D) (team login):
  service health, plan requests within 1 s, break presses, schedule changes, website RUM and runtime for vaiking-app, vaiking-reconciler and vaiking-web.
- [SLO "Grace Period: plan requests answered within 1 second"](https://app.dash0.com/alerting/slos/details?org=26f0e5c9-8de7-4e6c-9253-bf2c2d9c5327&s=eJxljb0OwjAMhN_Fc6u0DIV2hYUVIVbkNk5IlSai-UGo6ruTDEVILLbOvvtuAQbdAhw9OvLQASeBQXsoQNghOOJXNdEFjSToTND6ez-FGb2y5ue3FsBQ0-yVkcxp6zI67aM1QskscPAq0k3R68xzGbpHVcYky2wvt_L1j8Q4eVR6I6Zsmveqnvb1YaD3KJ5Tz_s2NnXTt3LcJcQHUTNNPQ%3D%3D) (team login):
  the SLO below, built as Good / Total on `plan_requests_total` for service vaiking-app, with a 99% target over a rolling 28-day window.

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
