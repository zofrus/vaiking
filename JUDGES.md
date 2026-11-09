# Judge this in 2 minutes

**Grace Period** is a phone app for KubeCon attendees who need a break. It has one button with zero setup, and a day plan that is kept in line with the real schedule, the way a Kubernetes controller reconciles desired state. Built by team vAIking at the Cloud Native Hackathon, November 9, 2026. Everything below is merged and was live on build `f1aceff` at 4:05 PM MST.

## Try it

- Open <https://grace.effulgentpoint.com> on your phone. There's no account and nothing to install. To use a QR code instead, scan the one at the top of <https://grace.effulgentpoint.com/demo>.
- **Offline test:** open the app, close it, and open it a second time. The first visit caches it, and the chip then says "Ready offline". Turn on airplane mode and tap **I need a break**. The calm screen, the quiet room and the staff card still appear.

<!-- TODO: when https://grace.effulgentpoint.com/qr-grace.svg is live (Builder A), add: ![QR code that opens https://grace.effulgentpoint.com](https://grace.effulgentpoint.com/qr-grace.svg) -->

## The 60-second tour

1. Tap **I need a break**: one tap, no sign-in.
2. **The calm screen** shows Quiet Room 260A, Level 2, with "Hours not listed", the all-gender restrooms, and venue facts copied from the event's [Inclusion + Accessibility page](https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/attend/inclusion-accessibility/): first aid, prayer room, nursing room, captions, reserved seating and the quiet-room rule. **Read this aloud** speaks it with the phone's own voice.
3. Tap **Show this to staff**. A full-screen card says "Please point me to Quiet Room 260A, Level 2. I may not be able to talk right now.", and it has its own **Read this aloud**.
4. Under **More support** on the calm screen is the **KubeCon communication sticker card**. Pick Green, Yellow or Red, and the card shows the event's own words: "Open to communicate.", "Only if you know me, please." and "I’m not interested in communicating (or being videotaped or photographed) at this time." The breathing guide and background sound are there too.
5. The **Focus** switch at the top shows fewer things, with no motion and larger text, and it has an easier-to-read font option (Atkinson Hyperlegible).
6. **Your day, with a labelled drill:** open the [preview of Tuesday](https://grace.effulgentpoint.com/?preview=2026-11-10T15:25:00-07:00&sample=1). The banner says **DRILL**, and "What changed" says "Drill: simulated change, not from the official schedule.", then which talk moved, whether it still fits, and the closest talk you can still reach.
7. Turn on **Show as kubectl** to see the same plan as `kubectl get` and `describe` output.

## Sponsor evidence

- **Elasticsearch.** 582 KubeCon sessions in the `talks` index, searched with hybrid retrieval: a typo-tolerant keyword leg (`fuzziness: AUTO`) plus a `semantic_text` leg, fused with RRF ([`app/lib/search.js`](app/lib/search.js), [#6](https://github.com/zofrus/vaiking/pull/6)). Each result says whether it matched your words or your meaning ([#34](https://github.com/zofrus/vaiking/pull/34)), and a collapsed **How this was found** note shows how a similar-talk lookup was built ([#61](https://github.com/zofrus/vaiking/pull/61)). It's the only AI in the product, and it isn't RAG: no model reads the results.
- **Dash0.** The API and the reconciler send traces, logs and metrics, and the phone sends browser RUM. Two custom metrics: `grace_requests_total` (presses by floor, no identifiers) and `plan_requests_total` (search and talks answered within 1 second). [`/board`](https://grace.effulgentpoint.com/board) and [`/demo`](https://grace.effulgentpoint.com/demo) read them back live. The SLO "plan requests answered within 1 second" is defined by the queries in [`dash0/README.md`](dash0/README.md); no SLO or dashboard file is exported to this repo. **Agent0** found a real bug from browser telemetry: a deliberate 800 ms cutoff was reported as a failure ([evidence on #38](https://github.com/zofrus/vaiking/pull/38#issuecomment-6751879772), fixed in #38 and [#52](https://github.com/zofrus/vaiking/pull/52)).
- **Radar.** Cluster `vaiking`, namespace `team-vaiking`, deployed by GitOps. The reconciler's loop is visible in Radar's logs on `Deployment/reconciler` every 2 minutes, for example `{"msg":"reconcile cycle","outcome":"reconciled","talks":582,"changes":0,"updated":0,"failed":0}` (3:43 PM MST). Checks went from 4 medium findings to 1 after [#19](https://github.com/zofrus/vaiking/pull/19), and the remaining one is kept on purpose. `diagnose` found a real crash loop in one call ([#23](https://github.com/zofrus/vaiking/pull/23)). The [AI investigation](https://app.radarhq.io/c/5JYX5CP_IYU/investigations/chat_PGWBGa7JZrBMXlTN) reached the wrong conclusion, and we say so. It opens for judges only if the owner has marked it Shared. The full story is in [`STORY.md`](STORY.md).
- **Gitar.** Gitar reviewed 82 of our 85 merged pull requests (as of 4:02 PM MST). The three without a review are #1 and #2, the setup, and #23, a one-line hotfix. It reviews against our own rules in [`.gitar/`](.gitar/) and pushes fixes that we read before merging; the README's [How Gitar was used](README.md#how-gitar-was-used-to-build-this) section lists them. On [#3](https://github.com/zofrus/vaiking/pull/3), Gitar's cleanup commit [`ef32d4c`](https://github.com/zofrus/vaiking/commit/ef32d4c) pruned stale talks after each ingest, so a short or failed feed would have wiped the index. We caught it in review and added a guard, [`9957b8c`](https://github.com/zofrus/vaiking/commit/9957b8c), which prunes only after a clean write of at least 400 talks.

## Merge Forward and accessibility

- **Defaults:** no account, no plan and no reason asked. The app asks what helps, never what someone has: no diagnosis words, no checkboxes. Focus mode is suggested on when the phone is set to reduce motion. Background sound starts only when you tap Play, and makes no health claims. The buffer between talks is your own number, 15 minutes by default.
- **What we test:**
  - axe against WCAG 2.0, 2.1 and 2.2 A and AA rules, on 13 page states in CI ([`web/scripts/axe.mjs`](web/scripts/axe.mjs), [`.github/workflows/ci.yml`](.github/workflows/ci.yml))
  - a Gitar accessibility gate ([`.gitar/review/accessibility.md`](.gitar/review/accessibility.md))
  - keyboard use and Chrome's accessibility tree
  - no horizontal scrolling at 200% zoom or 320 px wide, checked live at 3:52 PM MST

  We have not tested with VoiceOver or TalkBack.

## Honest limits

- **No wayfinding.** There's no map and no "nearest", because the app has no location signal. Routes say "Estimated. Confirm routes with event staff.", and the staff card names the quiet room and, if you have a plan, the room of your next talk.
- **Room changes are polled, not pushed.** The phone checks `/api/changes` every 60 seconds while the app is open and online. No real change has appeared in the feed today (the reconciler logs `changes: 0`), so the moved-talk notice is shown in preview as a labelled DRILL.
- **The board's counts include our own testing** during the hackathon. "Real button presses" means presses on the live site, not presses by attendees we have verified.
- Your plan is kept on one phone, with no sync between devices.
