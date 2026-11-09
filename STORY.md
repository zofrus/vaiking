# vAIking: the story of the day

## Before

Recorded 2026-11-09 13:11 MST, on the first GitOps deploy (image `41e283c`, Argo CD revision `fcdfd39`).

[Radar Checks for team-vaiking](https://app.radarhq.io/checks?scope=5JYX5CP_IYU&namespace=team-vaiking)

Findings by severity: 0 critical, 0 high, 4 medium, 0 low (Security 2, Reliability 2).

- Medium, Security: `automountServiceAccountToken` on `Deployment/team-vaiking/app`
- Medium, Security: `readOnlyRootFs` on `Deployment/team-vaiking/app`
- Medium, Reliability: `missingPDB` on `Deployment/team-vaiking/app`
- Medium, Reliability: `missingTopologySpread` on `Deployment/team-vaiking/app`
