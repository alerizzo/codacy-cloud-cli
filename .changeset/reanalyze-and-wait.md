---
"@codacy/codacy-cloud-cli": minor
---

Add a `--reanalyze-and-wait` (`-w`) variant to the `repository` and `pull-request` commands. Unlike `--reanalyze` (which triggers analysis and exits), this blocking variant captures a baseline of the current issues, triggers the reanalysis, polls until it finishes (every 10s, up to 20 minutes), and then prints how long the analysis took and what changed — issue deltas by pattern, severity, and category. Supports `--output json`.
