---
"@codacy/codacy-cloud-cli": minor
---

`issue`, `issues`, `pull-request --issue`, `finding`, and `findings` now show vulnerable/affected functions for SCA issues and findings with a linked OSV advisory (`CommitIssue.advisoryInformation` / `SrmItem.advisoryInformation`). Card views show a compact one-line summary; detail views show the full list with advisory ID and published date. Included in `--output json` for all five commands.
