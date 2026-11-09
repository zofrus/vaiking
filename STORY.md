# vAIking: the story of the day

## Before

Recorded 2026-11-09 13:11 MST, on the first GitOps deploy (image `41e283c`, Argo CD revision `fcdfd39`).

[Radar Checks for team-vaiking](https://app.radarhq.io/checks?scope=5JYX5CP_IYU&namespace=team-vaiking)

Findings by severity: 0 critical, 0 high, 4 medium, 0 low (Security 2, Reliability 2).

- Medium, Security: `automountServiceAccountToken` on `Deployment/team-vaiking/app`
- Medium, Security: `readOnlyRootFs` on `Deployment/team-vaiking/app`
- Medium, Reliability: `missingPDB` on `Deployment/team-vaiking/app`
- Medium, Reliability: `missingTopologySpread` on `Deployment/team-vaiking/app`

## The rollout that silently stalled

A real failure, not staged. All times are 2026-11-09 MST.

**What happened.** From 13:32, three images in a row (`c7859e9`, `3281c10`, `ac98efd`) reached the cluster, but the site kept answering with the older `0711476`. The public URL looked fine. The only outside clue was `/api/status` reporting an older version than the Deployment's image.

**What Radar's logs showed.** At 13:41, `wait_for` reported the rollout as blocked on a `CrashLoopBackOff`, and `diagnose` on the Deployment returned the cause in one call: exit code 1 and `startup failed: MODULE_NOT_FOUND`. The pod reached 5 restarts. Starting the server from only the files the Dockerfile copies reproduced the error: `routes/facilities.js` requires `data/facilities.json`, and the image never contained `app/data`. Tests passed all along because they run from the full repository.

**What we changed.** [PR #23](https://github.com/zofrus/vaiking/pull/23) added one line to the Dockerfile. It merged at 13:43, and by 13:45 both pods were Ready on `8ee0e0d`, the Secret's credentials had loaded, and search and facilities answered 200.

**What the AI investigation said.** We ran a [Radar AI investigation](https://app.radarhq.io/c/5JYX5CP_IYU/investigations/chat_PGWBGa7JZrBMXlTN) at 13:44:32, 17 seconds after the fixed image began rolling out. It concluded "transient startup probe failures during a fast rollout", healthy at 2 of 2, and said its restart chart showed zero restarts, which "rules out a crash loop". That conclusion was wrong about the cause. It looked at a system that was already recovering, and the crash-looping pod had just gone. It did correctly note that the Secret had been written after the old pods started. We kept the primary evidence, the pod logs and restart count, over the summary.

**The decision Radar helped make.** The stalled rollout was the signal: the healthy old pods hid it, and reading the actual failure in Radar turned "the site is fine" into a one-line fix. We also learned to check the running image, not just health.

**A smaller repeat.** At 13:51, the first reconciler pod crash-looped for about a minute, because the manifest arrived while it still pointed at an image built before `reconciler.js` existed. It cleared by itself when that merge's own build (`f725f0c`) rolled out, and the reconciler then recorded its baseline: 582 talks, 0 updated.

## After

As of 4:45 PM MST, 2026-11-09, on the final deploy before the freeze: image `dc65ed4`. Argo CD Application `app` is Synced and Healthy at revision `88b50ab` ("deploy: dc65ed4"), sync history entry 61. `app` is 2/2 Ready and `reconciler` 1/1, and `/api/status` reports `dc65ed4`. First recorded at 14:16 on image `48dc5c7`, and unchanged since, in the same [Radar Checks view](https://app.radarhq.io/checks?scope=5JYX5CP_IYU&namespace=team-vaiking).

Findings by severity: 0 critical, 0 high, 1 medium, 0 low, down from 4 medium.

| Before | Fixed by |
|---|---|
| `automountServiceAccountToken` | The app never calls the Kubernetes API, so no token is mounted ([PR #19](https://github.com/zofrus/vaiking/pull/19)) |
| `readOnlyRootFs` | Root filesystem is read-only (PR #19) |
| `missingPDB` | PodDisruptionBudget keeps one pod up during a drain (PR #19) |
| `missingTopologySpread` | Replicas spread across nodes when the cluster can (PR #19) |

The one open finding is new: `singleReplica` on `Deployment/team-vaiking/reconciler`. We are leaving it. The reconciler is a single control loop that serves no traffic, so a second replica would add duplicate work, not availability.

**The loop, running live.** The reconciler logs one line per 2-minute cycle, which Radar shows in the workload's logs. A routine cycle, at 15:43:22:

```
{"msg":"reconcile cycle","outcome":"reconciled","talks":582,"changes":0,"updated":0,"failed":0}
```

At 16:36:04 it detected a real change in the official schedule: talk 1372568, "Open Cluster Management (OCM): Live Demo Using k3d/KIND", was added for Tuesday 13:40 to 14:05 in the Project Pavilion. At 16:41:19 it detected that talk 1370500, "CNCF Project Demos", had been removed from the same slot. The organizers had swapped the session. Both are in `/api/changes`. Radar still had the log line for the second cycle:

```
2026-11-09T23:41:19.743811876Z {"msg":"reconcile cycle","outcome":"reconciled","talks":582,"changes":1,"updated":0,"failed":0}
```

We don't have the line for 16:36. The reconciler pod that wrote it was replaced by a later deploy, and its logs went with it.

## A platform node drain, seen in Radar

A real event, not staged. All times are 2026-11-09 MST.

**What happened.** At 16:29, Argo CD synced `c48e246`, and a new app pod was scheduled on node `i-05908fcb46c4b7713`. At 16:29:38, 27 seconds later, the host's autoscaler cordoned that node to drain it. The pod waited about 3.5 minutes for its container to start, then got no CPU to speak of: no log lines, 4.6 MB of memory, and probes answering "connection refused". Our deploy watch flagged it as a stalled rollout at about 16:34.

**What Radar showed.** `diagnose` on the pod gave the timeline and the probe failures, and `get_resource` on the node showed it `Cordoned` with the `unschedulable` taint added at 23:29:38 UTC. It was the platform, not our code. Users saw nothing: the two old pods stayed Ready on `58bb75a`, and the PodDisruptionBudget from PR #19 kept at least one up throughout.

**What it also took out.** The pre-installed `kube-state-metrics` pod was on the same node. It crash-looped (6 restarts, last exit `Error`): its logs show a start too slow to finish before the liveness probe killed it. So from about 16:29 every `kube_*` series in Prometheus went blank, and with it the cluster tiles on our `/demo` page.

**What we did.** The app needed nothing: the next deploy, `ea25d3b` at about 16:33, scheduled new pods on healthy nodes and replaced the stuck one. For metrics, we did one rolling restart of `monitoring/prometheus-kube-state-metrics` through Radar's `manage_workload` at 16:41, with no configuration change. Its new pod was Ready in 6 seconds on a healthy node, and `query_prometheus` for `kube_pod_status_ready{namespace="team-vaiking"}` returned our three pods, all ready.

## Practising what the product preaches

Kubernetes gives every pod a grace period, so we made ours count ([PR #26](https://github.com/zofrus/vaiking/pull/26)): a 5-second `preStop` drain, a 45-second termination grace period, and telemetry flushed on SIGTERM.

**Measured on one ordinary rollout, synthetic traffic:** one request per second to the public `/api/status` for four minutes, spanning the rollout from `ecfc75d` to `48dc5c7` (14:15:13 to 14:15:43 MST in Radar's timeline). **239 requests, 0 failed.** During the rollout, answers came from both versions, as expected. This is a single run at a low request rate, so it shows the drain working, not a guarantee under load.
