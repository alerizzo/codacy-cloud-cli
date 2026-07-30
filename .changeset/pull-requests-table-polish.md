---
"@codacy/codacy-cloud-cli": patch
---

Fix PR complexity showing as no data, and polish the `pull-requests` table. Complexity is now read from the API's nested `quality` object, which is where the pull-request endpoints actually return it — `pull-requests`, `pull-request` and `repository` all previously rendered it as empty. The `pull-requests` table now leads with the up-to-standards column, orders metrics the same way `repositories` does (issues, complexity, duplication, coverage), hides the Coverage column when no listed PR has coverage data, and shows `-` instead of `N/A` for metrics with no value. `--output json` now includes the quality and coverage `resultReasons`, so consumers can see which gates passed or failed.
