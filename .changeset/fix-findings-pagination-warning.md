---
"@codacy/codacy-cloud-cli": patch
---

Fix `findings`'s pagination warning silently not firing when the API response omits `pagination.total`: the guard now also checks for a remaining `cursor`, so a trailing page of results is no longer hidden from the `--limit` hint.
