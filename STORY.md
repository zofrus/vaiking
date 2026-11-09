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

Recorded 2026-11-09 14:16 MST on image `48dc5c7`, in the same [Radar Checks view](https://app.radarhq.io/checks?scope=5JYX5CP_IYU&namespace=team-vaiking).

Findings by severity: 0 critical, 0 high, 1 medium, 0 low, down from 4 medium.

| Before | Fixed by |
|---|---|
| `automountServiceAccountToken` | The app never calls the Kubernetes API, so no token is mounted ([PR #19](https://github.com/zofrus/vaiking/pull/19)) |
| `readOnlyRootFs` | Root filesystem is read-only (PR #19) |
| `missingPDB` | PodDisruptionBudget keeps one pod up during a drain (PR #19) |
| `missingTopologySpread` | Replicas spread across nodes when the cluster can (PR #19) |

The one open finding is new: `singleReplica` on `Deployment/team-vaiking/reconciler`. We are leaving it. The reconciler is a single control loop that serves no traffic, so a second replica would add duplicate work, not availability.

## Practising what the product preaches

Kubernetes gives every pod a grace period, so we made ours count ([PR #26](https://github.com/zofrus/vaiking/pull/26)): a 5-second `preStop` drain, a 45-second termination grace period, and telemetry flushed on SIGTERM.

**Measured on one ordinary rollout, synthetic traffic:** one request per second to the public `/api/status` for four minutes, spanning the rollout from `ecfc75d` to `48dc5c7` (14:15:13 to 14:15:43 MST in Radar's timeline). **239 requests, 0 failed.** During the rollout, answers came from both versions, as expected. This is a single run at a low request rate, so it shows the drain working, not a guarantee under load.
