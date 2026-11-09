# Grace Period

Your KubeCon day as desired state. You say what you came for, and the app keeps reconciling your day against the real schedule. It tells you plainly what changed and what it kept, and one large "I need a break" button needs no account. It also works offline once the page has loaded one time, because the offline cache is set up on the first visit.

Live at <https://vaiking.cnh.radarhq.io>. Built at the Cloud Native Hackathon, November 9, 2026.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Web app | `web/` | React phone UI, built into the server's image. The button path never waits on the network. |
| API server | `app/server.js`, `app/routes/` | Fastify. Each file in `app/routes/` is an auto-loaded route. |
| Reconciler | `app/reconciler.js`, `deploy/reconciler.yaml` | Second Deployment on the same image. Every 2 minutes it compares the Sessionize feed with the `talks` index and records what moved. |
| Search and data | Elasticsearch | `talks` (hybrid keyword and semantic search), `changes`, and `facilities-v1`. |
| Telemetry | OpenTelemetry to Dash0 | Traces, logs and metrics. Attendee identity and access needs stay out of them. |
| Delivery | `deploy/`, Argo CD, Radar | A push to `main` builds an image, and Argo CD syncs the `team-vaiking` namespace. |

Semantic search through Elasticsearch's embeddings is the only AI in the product. Nothing on the break-button path calls a model.

## Run it yourself

You need Node 22 or newer. Elasticsearch and Dash0 are optional. Without them the app still starts: `/api/search`, `/api/talks`, `/api/similar` and `/api/changes` answer 503 with a JSON error, while the break button, `/api/facilities` and `/api/board` keep working.

Run the API and the UI in two terminals, each starting from the repo root:

```bash
# Terminal 1: the API on http://localhost:8080. It serves /healthz, /readyz and /api/*, not the UI.
cd app && npm ci && npm test && npm start
```

```bash
# Terminal 2: the UI. Open http://localhost:5173. It sends /api calls to localhost:8080.
cd web && npm ci && npm run dev
```

To check the code the way CI does, from the repo root:

```bash
(cd app && npm ci && npm run lint && npm test)
(cd web && npm ci && npm run lint && npm test && npm run build)
```

To run the complete image, as production does (this is also how to see the UI on port 8080):

```bash
docker build -t grace-period .
docker run --rm -p 8080:8080 grace-period
```

Then, in another terminal:

```bash
curl localhost:8080/healthz                                   # ok
curl localhost:8080/readyz                                    # ok
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/      # 200, the web app
```

Connecting Elasticsearch needs two environment variables, which also let you load the data:

```bash
export ELASTICSEARCH_URL=...      # never commit these
export ELASTICSEARCH_API_KEY=...
node scripts/ingest-sessionize.mjs   # add --dry-run to preview without Elasticsearch
node scripts/ingest-facilities.mjs
cd app && node reconciler.js         # optional: the schedule loop
```

To deploy on a cluster, create Secret `app-credentials` in the app's namespace with the keys `elasticsearch-url`, `elasticsearch-api-key`, `otlp-endpoint`, `dash0-auth-token`, `rum-endpoint`, `rum-token`, `dataset`, `dash0-read-token` and `dash0-api-url`, then apply `argocd/application.yaml`. Every key is optional, so pods start without it.

The hackathon's notes on the team cluster (Radar, Argo CD, kubectl, a local cluster) are in [docs/RADAR-STARTER.md](docs/RADAR-STARTER.md). You don't need them to run the app.

## How Gitar was used to build this

Gitar reviewed our pull requests against rules we wrote for this product in [`.gitar/review/`](.gitar/review/) and [`.gitar/rules/`](.gitar/rules/): no personal data in telemetry, times always show a time zone, an accessible UI, and a span for every endpoint. [`.gitar/config/apply.md`](.gitar/config/apply.md) lets it push fixes for some kinds of findings, and it pushed each fix commit below itself. We read every Gitar commit before merging.

| PR | What Gitar found | Gitar's fix commit | CI and review |
|---|---|---|---|
| [#13 Grace route security fixes](https://github.com/zofrus/vaiking/pull/13) ([review](https://github.com/zofrus/vaiking/pull/13#issuecomment-6750912301)) | Security: the server span for `/api/grace` still exported the client IP and User-Agent, which would link an identifier to a break request. Our review rules forbid that. | [c4ef373](https://github.com/zofrus/vaiking/commit/c4ef373) "fix: omit grace requests from server spans" | [Passed](https://github.com/zofrus/vaiking/actions/runs/42695192084) on c4ef373. Gitar approved, 1 of 1 finding closed. |
| [#12 Plan timing metric, /api/board and Board page](https://github.com/zofrus/vaiking/pull/12) ([review](https://github.com/zofrus/vaiking/pull/12#issuecomment-6751125861)) | Bug: if Dash0 failed after one success, `/api/board` served old counts with no age limit and no stale marker, so the page kept saying "last hour" for old numbers. | [fe436e2](https://github.com/zofrus/vaiking/commit/fe436e2) "fix: mark stale board counts" | [Passed](https://github.com/zofrus/vaiking/actions/runs/42694283040) on fe436e2. Gitar approved, 1 of 1 closed. |
| [#16 Dash0 read path fix, RUM exclusion](https://github.com/zofrus/vaiking/pull/16) ([review](https://github.com/zofrus/vaiking/pull/16#issuecomment-6751308642)) | Two bugs: the board's sample note said "Small sample: 0 presses" when only preview data existed, and the Board page was never mounted, so nobody could reach it. | [61c89de](https://github.com/zofrus/vaiking/commit/61c89de) "fix: expose organizer board and clarify sample note" | [Passed](https://github.com/zofrus/vaiking/actions/runs/42696093291) on the next commit after the fix. Gitar approved, 2 of 2 closed. |
| [#22 Axe accessibility check in CI and grace-path review rules](https://github.com/zofrus/vaiking/pull/22) ([review](https://github.com/zofrus/vaiking/pull/22#issuecomment-6751267272)) | Five findings. One was blocking under our rules: change notices showed talk times with no time zone. The others: a wrong "only talk numbers are sent" privacy line, an unchecked buffer input, no suggestion on empty search results, and catch blocks that swallowed errors. | [fa79a3c](https://github.com/zofrus/vaiking/commit/fa79a3c) "fix: address web review findings" (7 files) | Failed earlier on this PR (see below), then [passed](https://github.com/zofrus/vaiking/actions/runs/42697722465) before merge. Gitar approved, 5 of 5 closed. |
| [#25 Privacy and honesty: search text copy, logs, telemetry](https://github.com/zofrus/vaiking/pull/25) ([review](https://github.com/zofrus/vaiking/pull/25#issuecomment-6751313843)) | No findings. Gitar checked it against our three rules (accessible UI, instrumented endpoints, no private data) and approved. | None needed | Merged with Gitar's approval. |

The one CI failure: [run 42695403818](https://github.com/zofrus/vaiking/actions/runs/42695403818) on PR #22 failed at job `verify`, step "Lint web", because the new axe script under `web/scripts` used Node globals that eslint was not configured for. We fixed it by hand in [a146970](https://github.com/zofrus/vaiking/commit/a146970) at 20:46:57 UTC, and CI went [green](https://github.com/zofrus/vaiking/actions/runs/42696238736). Gitar pushed the identical one-file fix, [f8bf65d](https://github.com/zofrus/vaiking/commit/f8bf65d), about four minutes later at 20:50:45 UTC.

## AI use

_To be written by the project owner before submission._

## Credits

Schedule data: KubeCon + CloudNativeCon North America 2026, The Linux Foundation, CC BY 3.0.
