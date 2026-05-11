---
"@codacy/codacy-cloud-cli": minor
---

### Changes since v1.0.5

- **`--tools` filter for issues command** (#4): Added `--tools` option to filter issues by the tool/pattern that detected them. Includes new formatting utilities for tool name display.

- **Filter and bulk-ignore for false positives** (#5): Added `--category` and `--severity` filters to the issues command. Introduced bulk-ignore functionality to ignore multiple issues matching filter criteria, streamlining false-positive triage workflows.

- **Pin GitHub Actions to SHA hashes** (#2): Pinned all GitHub Actions workflow dependencies to commit SHAs for improved supply-chain security.

- **Adopt changesets for automated versioning and publishing** (#6): Replaced the manual publish workflow with a changesets-based release pipeline. PRs now require a changeset file, and merging to main triggers automated version bumps and npm publishing with provenance.

