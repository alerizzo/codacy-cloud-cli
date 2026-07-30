---
"@codacy/codacy-cloud-cli": patch
---

`formatStandards()` (used by `repository`'s Open Pull Requests table, `pull-request`'s Up to Standards row, and `pull-requests`' ✓ column) now shows a dim `⋯` while a pull request is still being analysed, instead of falling through to a hard ✗ on gate data that isn't final yet.
