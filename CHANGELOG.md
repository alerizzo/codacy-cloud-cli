# @codacy/codacy-cloud-cli

## 1.6.0

### Minor Changes

- [#28](https://github.com/codacy/codacy-cloud-cli/pull/28) [`440a57f`](https://github.com/codacy/codacy-cloud-cli/commit/440a57fec915aae6fcebf9cc8dde6fca9d71c266) Thanks [@claudiacodacy](https://github.com/claudiacodacy)! - `codacy issues --ignore` now asks for confirmation before bulk-ignoring. It
  prints how many issues match the current filters and only proceeds when you
  answer `y`, guarding against a mistyped or too-broad filter ignoring far more
  issues than intended. Pass `--skip-confirmation` (`-y`) to bypass the prompt in
  CI or scripts; in a non-interactive shell without that flag the command aborts
  without ignoring anything.

- [#28](https://github.com/codacy/codacy-cloud-cli/pull/28) [`440a57f`](https://github.com/codacy/codacy-cloud-cli/commit/440a57fec915aae6fcebf9cc8dde6fca9d71c266) Thanks [@claudiacodacy](https://github.com/claudiacodacy)! - Add `codacy issues --ignored` (`-i`) to list issues that were marked as ignored
  on Codacy. Without the flag, `codacy issues` behaves exactly as before; pass
  `--ignored` to see the ignored ones instead. The
  ignored listing accepts all the same filters as the normal search (`--branch`,
  `--severities`, `--categories`, `--tools`, `--patterns`, `--languages`, `--tags`,
  `--authors`, `--limit`, and `--false-positives`), and each ignored issue shows
  who ignored it, when, the reason, and any comment. It cannot be combined with
  `--overview` or `--ignore`. `--output json` emits an `ignoredIssues` array.
  Unignoring individual issues stays with `codacy issue <id> --unignore`.

## 1.5.0

### Minor Changes

- [#26](https://github.com/codacy/codacy-cloud-cli/pull/26) [`bf903e4`](https://github.com/codacy/codacy-cloud-cli/commit/bf903e45f6aaa96a25d4cdbfdf19966d2a5f1c38) Thanks [@alerizzo](https://github.com/alerizzo)! - Add `ls` and `directories` commands to browse a repository's tree with quality
  metrics. `ls` lists the directories and files at a path — showing Grade, Issues,
  Complexity, Duplication, and Coverage per row — and `directories` (alias `dirs`)
  lists folders only, with `--plus-children` to also show one level of
  sub-directories as a `└─` tree. Both auto-detect the provider/organization/repository
  from the git remote and the path from your current directory (relative to the
  repo root); override with positional args, `--path`, and `--branch`. Sort with
  `--sort <field>` (`name`, `issues`, `grade`, `duplication`, `complexity`,
  `coverage`) and `--direction asc|desc`. `codacy ls --search <term>` finds files
  at any depth under the path. Folders and files are marked with `▸` and `·` (no
  emojis). Both commands fetch every page of results, so nothing is truncated.

- [#24](https://github.com/codacy/codacy-cloud-cli/pull/24) [`bf527ad`](https://github.com/codacy/codacy-cloud-cli/commit/bf527ad694a3f7d78576a5a3647dd4d53984e088) Thanks [@alerizzo](https://github.com/alerizzo)! - Add an npm-style "update available" notice. When a newer version is published, the
  CLI prints a one-time upgrade hint to stderr — it never auto-updates. The notice
  only shows with the default `--output table` in an interactive terminal; it is
  suppressed for `--output json`, when piped, in CI, and under `npx`/npm scripts, so
  machine-readable stdout stays byte-clean. The version lookup runs in a non-blocking
  background process (at most once a day) and never affects timing or exit codes. Opt
  out via `CODACY_DISABLE_UPDATE_CHECK`, `NO_UPDATE_NOTIFIER`, or `--no-update-notifier`.
  A package.json `overrides` entry pins `update-notifier`'s transitive `got`/`package-json`
  to patched, still-CommonJS versions to avoid CVE-2022-33987.

### Patch Changes

- [#27](https://github.com/codacy/codacy-cloud-cli/pull/27) [`c5c9af5`](https://github.com/codacy/codacy-cloud-cli/commit/c5c9af57f63bbdc2762acb59800de65247cdf94a) Thanks [@alerizzo](https://github.com/alerizzo)! - Stop `issues --overview` from suggesting noise reduction on repositories that aren't
  actually noisy. The "Suggested actions to reduce noise" section now requires two absolute
  floors before anything is suggested: the repository must have at least 200 issues in total,
  and an individual pattern must produce at least 100 issues on its own. The per-pattern floor
  matters because a repository with a long tail of tiny patterns pulls the median issues-per-
  pattern very low, which previously made a pattern with only a handful of issues look
  disproportionate — now a rule has to genuinely flood the repo before it's flagged. On top of
  those floors, a pattern must still show a relative signal: the "dominant share" rule (≥10% of
  all issues) only applies when there are at least 11 distinct patterns (an even split of N
  patterns only drops below 10% once N is above 10, so 8-10 balanced patterns would otherwise
  all be flagged), and the "disproportionate count" rule now compares each
  pattern against the **median** issues-per-pattern instead of the mean, so a single huge
  pattern can no longer inflate the baseline and hide smaller-but-still-disproportionate ones.

## 1.4.0

### Minor Changes

- [#20](https://github.com/codacy/codacy-cloud-cli/pull/20) [`cbf62d5`](https://github.com/codacy/codacy-cloud-cli/commit/cbf62d59da02d45b00a94cba2a1d275e615a7c5d) Thanks [@alerizzo](https://github.com/alerizzo)! - `codacy findings` and `codacy finding` now show the vulnerable dependency's import chain for SCA findings that carry the new `dependencyChains` field. Each finding is labelled **Direct** (`Update <pkg> to <fixedVersion>`) or **Transitive** (`<pkg> → … → <pkg> (Fixed in <fixedVersion>)`), and chains with 4+ packages collapse their middle to `<first> → ... N more ... → <last>`. The list shows the first chain plus `... and X more`; the detail lists every chain aligned under a single label. `dependencyChains` is also included in `--output json`.

## 1.3.1

### Patch Changes

- [#18](https://github.com/codacy/codacy-cloud-cli/pull/18) [`7b09b5b`](https://github.com/codacy/codacy-cloud-cli/commit/7b09b5ba254f7cd7f46a86bd594352e8d3751eb9) Thanks [@manufacturist](https://github.com/manufacturist)! - Fix `--version` flag reporting hardcoded `1.0.0` instead of the actual package version. The CLI now reads the version dynamically from `package.json` at runtime via `require`, so the reported version stays in sync with every release automatically.

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
