# @codacy/codacy-cloud-cli

## 1.1.0

### Minor Changes

- [#6](https://github.com/codacy/codacy-cloud-cli/pull/6) [`0280af1`](https://github.com/codacy/codacy-cloud-cli/commit/0280af162217f5eec2094aca6d2f9e7efa9e615b) Thanks [@alerizzo](https://github.com/alerizzo)! - ### Changes since v1.0.5

  - **`--tools` filter for issues command** ([#4](https://github.com/codacy/codacy-cloud-cli/issues/4)): Added `--tools` option to filter issues by the tool/pattern that detected them. Includes new formatting utilities for tool name display.

  - **Filter and bulk-ignore for false positives** ([#5](https://github.com/codacy/codacy-cloud-cli/issues/5)): Added `--category` and `--severity` filters to the issues command. Introduced bulk-ignore functionality to ignore multiple issues matching filter criteria, streamlining false-positive triage workflows.

  - **Pin GitHub Actions to SHA hashes** ([#2](https://github.com/codacy/codacy-cloud-cli/issues/2)): Pinned all GitHub Actions workflow dependencies to commit SHAs for improved supply-chain security.

  - **Adopt changesets for automated versioning and publishing** ([#6](https://github.com/codacy/codacy-cloud-cli/issues/6)): Replaced the manual publish workflow with a changesets-based release pipeline. PRs now require a changeset file, and merging to main triggers automated version bumps and npm publishing with provenance.
