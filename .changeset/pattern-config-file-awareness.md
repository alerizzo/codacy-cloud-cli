---
"@codacy/codacy-cloud-cli": minor
---

Make the pattern commands aware of local configuration files and coding standards.

- `pattern <tool> <patternId>` with no action flag now **shows the pattern's information** (same card as the `patterns` command, with `--output json` support). Since there's no single-pattern endpoint, it searches by ID and keeps the exact match.
- When a tool is driven by a local configuration file, `patterns` (list) and `pattern` (info) print `<tool> is using a local configuration file.` and skip fetching patterns; `patterns --enable-all/--disable-all` and `pattern --enable/--disable/--parameter` refuse with `Tool uses a local configuration file, can't be updated.`
- `pattern --enable/--disable/--parameter` also refuses patterns enforced by a coding standard with `Pattern enforced by <standard> coding standard, can't be modified.`
- `issues --overview` noise suggestions now adapt per pattern: a runnable `codacy pattern … --disable` command when possible, otherwise a manual step — `Update your local <tool> configuration file to disable the pattern` or `Update <coding standard> to disable the pattern`.
