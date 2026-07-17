---
"@codacy/codacy-cloud-cli": minor
---

`codacy issues --ignore` now asks for confirmation before bulk-ignoring. It
prints how many issues match the current filters and only proceeds when you
answer `y`, guarding against a mistyped or too-broad filter ignoring far more
issues than intended. Pass `--skip-confirmation` (`-y`) to bypass the prompt in
CI or scripts; in a non-interactive shell without that flag the command aborts
without ignoring anything.
