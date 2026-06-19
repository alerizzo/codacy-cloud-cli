---
"@codacy/codacy-cloud-cli": patch
---

Fix `--version` flag reporting hardcoded `1.0.0` instead of the actual package version. The CLI now reads the version dynamically from `package.json` at runtime via `require`, so the reported version stays in sync with every release automatically.
