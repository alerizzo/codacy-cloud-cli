---
"@codacy/codacy-cloud-cli": patch
---

Sanitize vulnerable/affected function names and the advisory ID (`CommitIssue.advisoryInformation` / `SrmItem.advisoryInformation`) before printing them in `issue`, `issues`, `pull-request --issue`, `finding`, and `findings`. These values come from the linked OSV advisory, so — like other repository-derived output — they are now passed through `sanitizeText()` to strip ANSI/OSC control bytes (CWE-150) instead of being printed raw.
