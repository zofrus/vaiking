# Runbook

How to run Grace Period, ship a change, roll one back, and handle secrets. It also records how we operated on November 9, 2026, and the known limits. The public URL is <https://grace.effulgentpoint.com>. It's a proxy in front of the cluster's own address, <https://vaiking.cnh.radarhq.io>.

## Run it locally

You need Node 22 or newer. Elasticsearch and Dash0 are optional: without them the app starts, and only the routes that need them answer 503. The full steps are in the README's [Run it yourself](../README.md#run-it-yourself). In short, from the repo root:

```bash
(cd app && npm ci && npm test && npm start)   # API on http://localhost:8080 (no UI on this port)
(cd web && npm ci && npm run dev)             # UI on http://localhost:5173, in a second terminal
```

To run what CI runs: `npm run lint` and `npm test` in both `app/` and `web/`, then `npm run build` in `web/`. To run the production image: `docker build -t grace-period .` and `docker run --rm -p 8080:8080 grace-period`, then `curl localhost:8080/healthz`.

## How a change deploys

1. **Pull request.** Branch from the latest `main` (`git switch -c <branch>` as its own command), push, and open the PR with `gh pr create --fill --label gitar-managed`. Every change, including a rollback, goes through a PR.
2. **CI.** The `ci` workflow ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs on every pull request. Job `verify` installs, lints and tests `app/` and `web/`, builds the web app, and runs the axe accessibility check on it.
3. **Gitar.** Gitar reviews the PR against [`.gitar/`](../.gitar/) and can push fix commits to the branch, so run `git pull` before every push, and read every Gitar commit before merging.
4. **Merge.** Once CI is green and Gitar has commented (or after 10 minutes if Gitar is slow), merge with `gh pr merge <n> --merge`. Never squash, so Gitar's commits stay in the history.
5. **Build.** The `build-and-deploy` workflow ([`.github/workflows/deploy.yaml`](../.github/workflows/deploy.yaml)) runs on every push to `main`. It builds the image, pushes `ghcr.io/zofrus/vaiking:<sha>`, and commits `deploy: <sha> [skip ci]`, which points `deploy/kustomization.yaml` at that tag. It ignores changes that touch only `deploy/kustomization.yaml` or `*.md` files, so **a docs-only merge doesn't build or deploy**.
6. **Sync.** Argo CD Application `app` ([`argocd/application.yaml`](../argocd/application.yaml)) tracks `main`, path `deploy/`, with automated sync, prune and self-heal. It rolls out both Deployments, `app` and `reconciler`, in namespace `team-vaiking`.
7. **Verify through Radar.** Use Radar's MCP to inspect or sync the Application (`manage_gitops`) and to wait for the rollout (`wait_for`). Check three things before calling it deployed: the synced revision, workload health, and `https://grace.effulgentpoint.com/api/status` reporting the new `version`. A healthy old revision is not proof. If a rollout stalls, run `diagnose` on the Deployment first ([`STORY.md`](../STORY.md) tells the time it mattered).

Never apply or patch the app's manifests on the cluster by hand. Argo CD's self-heal puts the repo's version back.

## How to roll back

Revert the merge commit through a pull request. Never `git reset`, and never force-push.

```bash
gh pr view <n> --json mergeCommit --jq .mergeCommit.oid   # the merge commit of the PR to undo
git switch main
git pull
git switch -c revert/pr-<n>
git revert -m 1 <merge-sha>
git push -u origin revert/pr-<n>
gh pr create --fill --label gitar-managed
```

Merge it the same way as any PR. The push to `main` builds a new image of the reverted code, and Argo CD rolls it out. Verify it as in step 7. Rollouts drain safely: a 5-second `preStop` drain and a 45-second termination grace period ([#26](https://github.com/zofrus/vaiking/pull/26)). One measured rollout served 239 requests with 0 failures (STORY.md).

## Where secrets live

- **In the cluster only.** Kubernetes Secret `app-credentials` in namespace `team-vaiking` is created and updated by the project owner, never by an agent, and never in git. Its keys are listed in the README's [Run it yourself](../README.md#run-it-yourself). Every key is optional, so pods start without it.
- **Read at pod start.** After changing the Secret, restart the Deployments, for example with Radar's `manage_workload`, so the new values load.
- **Never in the repo.** `.gitignore` excludes `.env`, `.env.*` and `*.key`, and Gitar's [secrets and privacy rules](../.gitar/review/secrets-and-privacy.md) treat a committed credential as Critical. For local runs, export `ELASTICSEARCH_URL` and `ELASTICSEARCH_API_KEY` in your shell only.
- **The one public token.** `/api/public-config` serves the browser RUM token on purpose, because browser telemetry needs it. It is a different token from the Dash0 ingest and read tokens.

## How we operated on November 9

- **The watchdog.** From 13:44 MST, a watchdog in the coordinator's session on the owner's laptop recorded a snapshot about once a minute in a local `watchdog.log`, outside this repo. Each snapshot held the open PRs with their merge and CI state, the live site's HTTP status and `/api/status` version, whether Elasticsearch and telemetry were configured, and new status lines from the second Mac. It alerted the coordinator on failing checks, merge conflicts (for example #42), version changes on the live site, and each new status line.
- **The merge loop.** On the owner's say-so for the day, the coordinator session merged PRs once CI was green and Gitar had commented, with `gh pr merge <n> --merge`. A PR that conflicted with `main` went back to the agent that wrote it to merge `main` in, never rebase. Gitar sometimes pushed commits to a branch after its PR had merged, so those commits never reached `main`. We audited them, and the ones worth keeping came in through [#68](https://github.com/zofrus/vaiking/pull/68).
- Neither the watchdog nor the merge loop is part of the product or this repo. They were how a team of parallel agent sessions merged 85 PRs by 4:02 PM MST.

## Known limits

- **Room changes are polled, not pushed.** The phone checks `/api/changes` every 60 seconds while the app is open and online. The reconciler checks the Sessionize feed every 2 minutes. During the hackathon the official schedule really changed, and Grace Period's reconciler detected it: at 4:36 PM MST a talk was added (Open Cluster Management (OCM): Live Demo Using k3d/KIND, Tue Nov 10 1:40 PM MST, Salt Palace Level 1 Project Pavilion) and at 4:41 PM MST a talk was removed from the official feed. The walkthrough still shows a moved talk in preview as a labelled DRILL.
- **The board's counts include our own testing** during the hackathon, on the live site.
- **No wayfinding.** There's no map and no "nearest". Routes say "Estimated. Confirm routes with event staff."
- **One device.** The plan is kept on the phone, with no sync between devices.
- **One reconciler replica, on purpose.** It's a single control loop that serves no traffic. Radar Checks lists it as `singleReplica`, and we keep it (STORY.md).
