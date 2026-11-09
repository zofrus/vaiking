# Secrets and attendee privacy

This repository is public and judged. Anything committed, printed in CI,
or quoted in a PR comment is public. Report these as Critical.

- Any API key, token, or credential in code, config, fixtures, or test
  output. This includes Elasticsearch API keys, Dash0 tokens, and kubeconfigs.
- A server secret read in browser code, or exposed through a public
  env prefix such as `VITE_`.
- Real attendee, speaker, or sponsor contact details in seed data, fixtures,
  logs, or span attributes. Seed data must be synthetic or from the public
  schedule.
- Data taken from behind a login. Event rule 4 forbids it.
- Logging a full request body, auth header, or token.
- Anything that records an attendee's identity alongside an access need.
