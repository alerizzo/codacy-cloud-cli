---
"@codacy/codacy-cloud-cli": minor
---

Add `codacy issues --state <active|ignored>` (`-S`) to list issues that were
marked as ignored on Codacy. `--state` defaults to `active`, so `codacy issues`
behaves exactly as before; pass `--state ignored` to see the ignored ones. The
ignored listing accepts all the same filters as the normal search (`--branch`,
`--severities`, `--categories`, `--tools`, `--patterns`, `--languages`, `--tags`,
`--authors`, `--limit`, and `--false-positives`), and each ignored issue shows
who ignored it, when, the reason, and any comment. It cannot be combined with
`--overview` or `--ignore`. `--output json` emits an `ignoredIssues` array.
Unignoring individual issues stays with `codacy issue <id> --unignore`.
