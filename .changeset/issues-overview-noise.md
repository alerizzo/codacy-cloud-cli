---
"@codacy/codacy-cloud-cli": minor
---

Improve `issues --overview`. The False Positives table now uses human-friendly labels ("Not a False Positive" / "Potential False Positive") instead of the raw `belowThreshold` / `equalOrAboveThreshold` API bucket names. The overview also adds a "Suggested actions to reduce noise" section that flags noisy patterns — those accounting for at least 10% of all issues, or at least 3× the average issues-per-pattern — and prints a ready-to-run `codacy pattern <tool> <patternId> --disable` command for each (the owning tool is resolved automatically; suggestions whose tool can't be resolved are omitted). `--output json` output is unchanged.
