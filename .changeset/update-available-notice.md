---
"@codacy/codacy-cloud-cli": minor
---

Add an npm-style "update available" notice. When a newer version is published, the
CLI prints a one-time upgrade hint to stderr — it never auto-updates. The notice
only shows with the default `--output table` in an interactive terminal; it is
suppressed for `--output json`, when piped, in CI, and under `npx`/npm scripts, so
machine-readable stdout stays byte-clean. The version lookup runs in a non-blocking
background process (at most once a day) and never affects timing or exit codes. Opt
out via `CODACY_DISABLE_UPDATE_CHECK`, `NO_UPDATE_NOTIFIER`, or `--no-update-notifier`.
A package.json `overrides` entry pins `update-notifier`'s transitive `got`/`package-json`
to patched, still-CommonJS versions to avoid CVE-2022-33987.
