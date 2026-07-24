---
"@codacy/codacy-cloud-cli": minor
---

`issue`, `issues`, and `pull-request --issue` now show vulnerable/affected functions for SCA issues with a linked OSV advisory (`CommitIssue.advisoryInformation`). Card views show a compact one-line summary; detail views show the full list with advisory ID and published date. Included in `--output json` for all three commands.
