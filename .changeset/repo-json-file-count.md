---
"@codacy/codacy-cloud-cli": minor
---

`codacy repo --output json` now includes a `fileCount` field on the repository object, plucked from `coverage.numberTotalFiles` on the existing `getRepositoryWithAnalysis` response. The field is present even on repos without coverage data, so no extra API call is needed. Lets consumers (e.g. the `configure-codacy-cloud` skill) read repo size without a separate roundtrip.
