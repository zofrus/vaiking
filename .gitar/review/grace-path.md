# The grace path

The grace path is everything between pressing "I need a break" and seeing the
calm screen, plus the plan and reconcile code behind it. Report these as
blocking findings.

- The first render after the button must not await the network. Flag any
  `await`, `fetch`, `.then` or loading state that runs before the calm screen
  is on screen. The count beacon (`navigator.sendBeacon`) must be fire and
  forget, and later fetches (similar talk) must have a short timeout and no
  spinner.
- No LLM client may be imported in `app/` or `web/`. Flag any import of an
  Anthropic, OpenAI, Gemini, or similar SDK, and any call to a model API.
  Elastic semantic search is the only AI and it is disclosed.
- No output may depend on colour, a map, or speech alone. Every status needs
  text. Every route or place needs words, not only a pin or a picture.
- No span, log, metric label, or beacon body may carry an attendee identity
  or an access need. Reasons for a break stay on the phone. Only talk IDs,
  a floor, and a mode (`live` or `preview`) may leave it.
- `web/src/lib/reconcile.ts` must stay pure: no network, no storage, no
  clock reads. The caller passes `now`.
- Times show a time zone. Say "the quiet room", never "the nearest". Hours
  that are not verified read "Hours not listed".
