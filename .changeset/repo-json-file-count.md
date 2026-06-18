---
"@codacy/codacy-cloud-cli": minor
---

`codacy repo --output json` now includes a `fileCount` field on the repository object, derived from the analysis of the last analysed commit. Lets consumers (e.g. the `configure-codacy-cloud` skill) read repo size without a separate API call. Returns `undefined` when the repo has no analysed commit.
