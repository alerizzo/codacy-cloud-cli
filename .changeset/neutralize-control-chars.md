---
"@codacy/codacy-cloud-cli": patch
---

Neutralize terminal control characters in human-readable output (CWE-150).
Repository-derived values shown by the CLI — PR and finding titles, author
names, branches, file paths, diff and file content, issue messages, and package
names — are now stripped of ANSI/OSC escape and other control bytes before being
printed, so a crafted pull request can no longer repaint or hide findings, spoof
gate status, or trigger terminal side effects (e.g. clipboard writes) when you
run the CLI against it. Offending bytes are shown in visible caret notation
(e.g. `^[`) instead of being interpreted. `--output json` is unaffected — it
still returns the original values, escaped by JSON encoding.
