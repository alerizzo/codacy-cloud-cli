# @codacy/codacy-cloud-cli

## 1.3.0

### Minor Changes

- [#16](https://github.com/codacy/codacy-cloud-cli/pull/16) [`8f86866`](https://github.com/codacy/codacy-cloud-cli/commit/8f86866ac41bf45dfe5d5be0593d180e95f99919) Thanks [@manufacturist](https://github.com/manufacturist)! - `codacy repo --output json` now includes a `fileCount` field on the repository object, plucked from `coverage.numberTotalFiles` on the existing `getRepositoryWithAnalysis` response. The field is present even on repos without coverage data, so no extra API call is needed. Lets consumers (e.g. the `configure-codacy-cloud` skill) read repo size without a separate roundtrip.

## 1.2.1

### Patch Changes

- [#14](https://github.com/codacy/codacy-cloud-cli/pull/14) [`ca896df`](https://github.com/codacy/codacy-cloud-cli/commit/ca896dfb7da127454fc042e63169ce05e2e11130) Thanks [@pedrobpereira](https://github.com/pedrobpereira)! - Adds possibility of using the cli againsta other environments

## 1.2.0

### Minor Changes

- [#11](https://github.com/codacy/codacy-cloud-cli/pull/11) [`12ad8a3`](https://github.com/codacy/codacy-cloud-cli/commit/12ad8a30641a903e3d7a914dfd255bc2401287e5) Thanks [@alerizzo](https://github.com/alerizzo)! - Auto-detect provider, organization, and repository from the git remote origin URL. All repository-scoped commands now work without explicitly passing `<provider> <organization> <repository>` — just run them inside a git repo with an `origin` remote pointing at GitHub, GitLab, or Bitbucket.

- [#13](https://github.com/codacy/codacy-cloud-cli/pull/13) [`f039b39`](https://github.com/codacy/codacy-cloud-cli/commit/f039b39922440cb29d2d7e0ea7c7ea5091c3eb42) Thanks [@alerizzo](https://github.com/alerizzo)! - Improve `issues --overview`. The False Positives table now uses human-friendly labels ("Not a False Positive" / "Potential False Positive") instead of the raw `belowThreshold` / `equalOrAboveThreshold` API bucket names. The overview also adds a "Suggested actions to reduce noise" section that flags noisy patterns — those accounting for at least 10% of all issues, or at least 3× the average issues-per-pattern — and prints a ready-to-run `codacy pattern <tool> <patternId> --disable` command for each (the owning tool is resolved automatically; suggestions whose tool can't be resolved are omitted). `--output json` output is unchanged.

- [#13](https://github.com/codacy/codacy-cloud-cli/pull/13) [`f039b39`](https://github.com/codacy/codacy-cloud-cli/commit/f039b39922440cb29d2d7e0ea7c7ea5091c3eb42) Thanks [@alerizzo](https://github.com/alerizzo)! - Make the pattern commands aware of local configuration files and coding standards.

  - `pattern <tool> <patternId>` with no action flag now **shows the pattern's information** (same card as the `patterns` command, with `--output json` support). Since there's no single-pattern endpoint, it searches by ID and keeps the exact match.
  - When a tool is driven by a local configuration file, `patterns` (list) and `pattern` (info) print `<tool> is using a local configuration file.` and skip fetching patterns; `patterns --enable-all/--disable-all` and `pattern --enable/--disable/--parameter` refuse with `Tool uses a local configuration file, can't be updated.`
  - `pattern --enable/--disable/--parameter` also refuses patterns enforced by a coding standard with `Pattern enforced by <standard> coding standard, can't be modified.`
  - `issues --overview` noise suggestions now adapt per pattern: a runnable `codacy pattern … --disable` command when possible, otherwise a manual step — `Update your local <tool> configuration file to disable the pattern` or `Update <coding standard> to disable the pattern`.

- [#13](https://github.com/codacy/codacy-cloud-cli/pull/13) [`f039b39`](https://github.com/codacy/codacy-cloud-cli/commit/f039b39922440cb29d2d7e0ea7c7ea5091c3eb42) Thanks [@alerizzo](https://github.com/alerizzo)! - Add a `--reanalyze-and-wait` (`-w`) variant to the `repository` and `pull-request` commands. Unlike `--reanalyze` (which triggers analysis and exits), this blocking variant captures a baseline of the current issues, triggers the reanalysis, polls until it finishes (every 10s, up to 20 minutes), and then prints how long the analysis took and what changed — issue deltas by pattern, severity, and category. Supports `--output json`.

## 1.1.1

### Patch Changes

- [#9](https://github.com/codacy/codacy-cloud-cli/pull/9) [`a973363`](https://github.com/codacy/codacy-cloud-cli/commit/a973363794b803e13124ab592778e6eced2be88d) Thanks [@alerizzo](https://github.com/alerizzo)! - Fix tools import to preserve cloud-only tools (only disable tools the local CLI supports), handle config-file mode correctly (skip pattern reset when useLocalConfigurationFile is set), and surface structured API error details on import failures.

## 1.1.0

### Minor Changes

- [#6](https://github.com/codacy/codacy-cloud-cli/pull/6) [`0280af1`](https://github.com/codacy/codacy-cloud-cli/commit/0280af162217f5eec2094aca6d2f9e7efa9e615b) Thanks [@alerizzo](https://github.com/alerizzo)! - ### Changes since v1.0.5

  - **`--tools` filter for issues command** ([#4](https://github.com/codacy/codacy-cloud-cli/issues/4)): Added `--tools` option to filter issues by the tool/pattern that detected them. Includes new formatting utilities for tool name display.

  - **Filter and bulk-ignore for false positives** ([#5](https://github.com/codacy/codacy-cloud-cli/issues/5)): Added `--category` and `--severity` filters to the issues command. Introduced bulk-ignore functionality to ignore multiple issues matching filter criteria, streamlining false-positive triage workflows.

  - **Pin GitHub Actions to SHA hashes** ([#2](https://github.com/codacy/codacy-cloud-cli/issues/2)): Pinned all GitHub Actions workflow dependencies to commit SHAs for improved supply-chain security.

  - **Adopt changesets for automated versioning and publishing** ([#6](https://github.com/codacy/codacy-cloud-cli/issues/6)): Replaced the manual publish workflow with a changesets-based release pipeline. PRs now require a changeset file, and merging to main triggers automated version bumps and npm publishing with provenance.
