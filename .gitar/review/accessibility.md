# Accessibility

This app serves conference attendees who use screen readers, keyboards only,
captions, or low-vision settings. Report these as blocking findings.

- Flag `onClick` on a `div` or `span`. Use a real `<button>` or `<a>`.
- Flag form inputs with no programmatic label. A placeholder is not a label.
- Flag images with no `alt`. Decorative images use `alt=""`.
- Flag status conveyed by color alone (talk full, track, live now).
  It needs text or an icon with a text alternative.
- Flag text colors likely under 4.5:1 contrast, or 3:1 for large text.
- Flag click targets smaller than 24 by 24 CSS pixels.
- Search results and live updates must announce through an `aria-live`
  region. Flag new dynamic results without one.
- Talk times must show a time zone.
- Audio or video features must offer captions or a transcript.
- Information must never be available only by sound, only by a map, or only
  by speaking.
