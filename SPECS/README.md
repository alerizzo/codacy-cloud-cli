# Codacy Cloud CLI — Specs

This is the single source of truth for all project tasks and specs.

**Agents: read this file at the start of every session.** Pick up the next pending task, then read the relevant spec file for full details.

## Pending Tasks

_No pending tasks._ All commands implemented.

## Command Inventory

| Command | Alias | Status | Spec |
|---|---|---|---|
| `info` | `inf` | ✅ Done | [info.md](commands/info.md) |
| `repositories` | `repos` | ✅ Done | [repositories.md](commands/repositories.md) |
| `repository` | `repo` | ✅ Done (actions added) | [repository.md](commands/repository.md) |
| `ls` | N/A | ✅ Done | [ls.md](commands/ls.md) |
| `directories` | `dirs` | ✅ Done | [directories.md](commands/directories.md) |
| `pull-request` | `pr` | ✅ Done (--diff + Diff Coverage Summary added) | [pull-request.md](commands/pull-request.md) |
| `issues` | `is` | ✅ Done | [issues.md](commands/issues.md) |
| `issue` | `iss` | ✅ Done | [issue.md](commands/issue.md) |
| `findings` | `fins` | ✅ Done | [findings.md](commands/findings.md) |
| `finding` | `fin` | ✅ Done (CVE enrichment included) | [finding.md](commands/finding.md) |
| `tools` | `tls` | ✅ Done | [tools-and-patterns.md](commands/tools-and-patterns.md) |
| `tool` | `tl` | ✅ Done | [tools-and-patterns.md](commands/tools-and-patterns.md) |
| `patterns` | `pats` | ✅ Done | [tools-and-patterns.md](commands/tools-and-patterns.md) |
| `pattern` | `pat` | ✅ Done (info mode + guards added) | [tools-and-patterns.md](commands/tools-and-patterns.md) |
| `analysis` | N/A | ✅ Done | [analysis.md](commands/analysis.md) |
| `json-output` | N/A | ✅ Done | [json-output.md](commands/json-output.md) |
| `login` | N/A | ✅ Done | — |
| `logout` | N/A | ✅ Done | — |


## Other Specs

- [setup.md](setup.md) — test framework, build, CI/CD setup
- [deployment.md](deployment.md) — npm publishing, brew formula

## Changelog

| Date | What was done |
|---|---|
| 2026-02-17 | Project setup: Vitest, `--output json`, `src/index.ts` cleaned up |
| 2026-02-17 | `info` command + tests (4 tests) |
| 2026-02-17 | `repositories` command + tests (5 tests) |
| 2026-02-17 | Utility tests: `auth`, `providers` (6 tests) |
| 2026-02-17 | `src/commands/CLAUDE.md` created with design decisions |
| 2026-02-18 | `repository` command + tests (5 tests) |
| 2026-02-18 | Shared formatting helpers extracted to `utils/formatting.ts` |
| 2026-02-18 | `pull-request` command + tests (11 tests) |
| 2026-02-18 | npm package ready (bin, files, prepublishOnly, tsconfig.build.json, engines) |
| 2026-02-18 | CI pipelines: build+test on Node 18/20/22, publish to npm on release |
| 2026-02-18 | CLI help examples added to all commands |
| 2026-02-19 | `issues` command + tests (11 tests) |
| 2026-02-20 | `findings` command + tests (13 tests) |
| 2026-02-23 | `issue` command + tests (8 tests); `issues` cards now show `resultDataId` |
| 2026-02-23 | `pull-request --issue <id>` option added (4 new tests) |
| 2026-02-24 | `finding` command + tests (9 tests); `findings` cards now show finding `id` |
| 2026-02-24 | CVE enrichment for `finding`: fetches `cveawg.mitre.org` in parallel, shows CVSS/description/references (5 new tests, 102 total) |
| 2026-02-24 | SPECS folder created — TODO.md split into `SPECS/README.md` + per-command specs + setup/deployment |
| 2026-02-25 | `pull-request --diff` option + Diff Coverage Summary section (6 new tests, 108 total) |
| 2026-02-25 | `repository` actions: `--add`, `--remove`, `--follow`, `--unfollow` (4 new tests, 112 total) |
| 2026-02-25 | `tools`, `tool`, `patterns`, `pattern` commands + tests (35 new tests, 147 total); `findToolByName` helper added to `utils/formatting.ts` |
| 2026-03-02 | `issue --ignore`, `pull-request --ignore-issue` / `--ignore-all-false-positives`, `finding --ignore` + tests (17 new tests, 164 total); all use `-R/--ignore-reason` and `-m/--ignore-comment` options |
| 2026-03-05 | Analysis status in `repository` and `pull-request` About sections using `formatAnalysisStatus()`; `--reanalyze` option for both commands (13 new tests, 185 total) |
| 2026-03-05 | JSON output filtering with `pickDeep` across all commands: `info`, `repositories`, `repository`, `pull-request`, `issues`, `issue`, `findings`, `finding`, `tools`, `patterns`; documented pattern in `src/commands/CLAUDE.md` |
| 2026-03-12 | `patterns --enable-all` / `--disable-all` bulk update with filter support (6 new tests, 196 total) |
| 2026-03-12 | `login` and `logout` commands: encrypted token storage in `~/.codacy/credentials`, masked interactive prompt, `--token` flag for non-interactive use, token resolution chain (env var → stored credentials); `checkApiToken()` updated to set `OpenAPI.HEADERS` dynamically (9 new tests, 219 total) |
| 2026-06-02 | `--reanalyze-and-wait` (`-w`) blocking variant for `repository` and `pull-request`: triggers reanalysis, polls to completion (10s interval, 20min cap), then prints issue deltas by pattern/severity/category. New `src/utils/reanalyze-wait.ts` + `formatDuration`/`isBeingAnalyzed` helpers (26 new tests, 356 total) |
| 2026-06-02 | `issues --overview` improvements: relabel False Positives buckets (`belowThreshold`/`equalOrAboveThreshold` → "Not a False Positive"/"Potential False Positive"), and a "Suggested actions to reduce noise" section that flags noisy patterns (≥10% of issues or ≥3× the average) with a runnable `codacy pattern … --disable` command, resolving the tool via its `prefix` (3 new tests, 360 total) |
| 2026-06-02 | Pattern config-file & coding-standard awareness: new `pattern <tool> <id>` **info mode** (same card as `patterns`); `pattern`/`patterns` skip listing and refuse updates when a tool uses a local config file; `pattern` refuses to modify coding-standard-enforced patterns; `issues --overview` noise suggestions now render a manual "update your config file / coding standard" step instead of a command when a pattern can't be disabled via CLI. `printPatternCard`/`PATTERN_JSON_FIELDS` moved to `utils/formatting.ts` (11 new tests, 371 total) |
| 2026-06-18 | `repo --output json` now includes `repository.fileCount`, plucked from `coverage.numberTotalFiles` on the existing `getRepositoryWithAnalysis` response (present even without coverage data — no extra API call). Unlocks repo-size visibility for downstream consumers like the `configure-codacy-cloud` skill (1 new test, 373 total) |
| 2026-06-24 | `findings` and `finding` now surface the vulnerable dependency's import chain from the new `dependencyChains` field: Direct (`Update <pkg> to <fixed>`) vs Transitive (`<chain> (Fixed in <fixed>)`), with the middle collapsed to `... N more ...` for 4+ packages. List shows the first chain + `... and X more`; detail shows all chains aligned under a single label. New helpers in `utils/formatting.ts` (`formatDependencyChain`, `formatDependencyChainsLine`, `formatDependencyChainsBlock`); `dependencyChains` added to both JSON projections (17 new tests, 390 total) |
| 2026-06-30 | npm-style "update available" notice via `update-notifier@5`: one-time stderr hint when a newer version is published, gated to `--output table` (suppressed for `json`, when piped, in CI, under `npx`). Non-blocking daily background check; never auto-updates. New `src/version.ts` (single source of name/version) + `src/utils/update-check.ts` (`maybeNotifyUpdate`); `preAction` hook + `--no-update-notifier` flag wired in `index.ts`. Opt-outs: `CODACY_DISABLE_UPDATE_CHECK`, `NO_UPDATE_NOTIFIER`, `--no-update-notifier`. `package.json` `overrides` pin transitive `got@^11.8.6`/`package-json@^7` (CVE-2022-33987) (7 new tests, 409 total) |
| 2026-07-07 | `ls` and `directories` commands: browse a repository's folders/files with quality metrics (Grade/Issues/Complexity/Duplication/Coverage). Auto-detect provider/org/repo and the cwd-relative path; `--path`/`--branch` options; `directories --plus-children` shows one extra level as a `└─` tree (header adds `, M subdirectories`). `--sort`/`--direction` (server-side; in `ls`, directories and files sorted independently), and `ls --search <term>` (files only; folds the path into the search as `<path>/%<term>` and shows full paths). Duplication uses `numberOfClones`; Complexity uses `complexity` (hotspots). Both fetch **all** pages (no pagination warning) via new `src/utils/repo-tree.ts` (path resolution + `resolveSort`/`resolveDirection` + `fetchAllDirectories`/`fetchAllFiles`). Row markers `▸` folder / dim `·` file (no emojis). Promoted `formatGrade` to `utils/formatting.ts` (now also colors E red) and added `formatCountCell`/`formatCoverageCell` (48 new tests, 457 total) |
| 2026-07-16 | `issues --ignored` (`-i`): new read-only mode listing issues marked as ignored on Codacy, via the dedicated `searchRepositoryIgnoredIssues` endpoint. Boolean flag modeled on `--false-positives` for consistency (not a `--state <value>` selector). Reuses `buildFilterBody` (all existing filters + `--false-positives` pass through) and the paginate-to-`--limit` loop; errors when combined with `--overview`/`--ignore`. New `printIgnoredIssueCard` in `utils/formatting.ts` renders the ignore metadata line (`Ignored as <reason> by <name> · <date>` + optional comment) and the string `issueId` (ignored issues have no numeric `resultDataId`). Omitting the flag keeps existing behavior unchanged (10 new tests, 475 total) |
| 2026-07-08 | `issues --overview` noise suggestions tuned to stop firing on low-volume repos: added a `NOISE_MIN_TOTAL` (200) floor on the repo's total issues that suppresses the whole "reduce noise" section below it, and a `NOISE_MIN_PATTERN` (100) absolute floor on each pattern's own count (AND-gated with the relative rules) so a long tail of tiny patterns can't drag the median down and make a ~9-issue pattern look noisy — the total floor is kept above the per-pattern floor so it isn't dead code; the ≥10% share rule now only applies with ≥11 distinct patterns (`NOISE_MIN_PATTERNS_FOR_SHARE` — an even split only drops below 10% once N > 10, so 8–10 balanced patterns would otherwise all be flagged); and the ≥3× multiple rule (`NOISE_MEDIAN_MULTIPLE`) now measures against the **median** (via new `medianOf()`) instead of the mean, so a single huge pattern can no longer inflate the baseline and mask smaller disproportionate patterns (5 new tests, 465 total) |
| 2026-07-17 | `issues --ignore` now confirms before bulk-ignoring: `executeBulkIgnore` prints the match count then prompts via shared `confirmAction` (`utils/prompt.ts`), proceeding only on `y`. New `--skip-confirmation` (`-y`) bypasses the prompt for CI/scripts (same short flag as `tools --import --skip-approval`); non-TTY without the flag aborts rather than ignoring by accident. Confirmation runs after the fetch (count is shown) but before any `bulkIgnoreIssues` call (3 new tests, 478 total) |
| 2026-07-24 | Security (CWE-150, HackerOne): neutralize terminal control characters in human-readable output. New `src/utils/sanitize.ts` (`sanitizeText`) strips C0 (0x00–0x1F except TAB/LF), DEL (0x7F) and C1 (0x80–0x9F) — CR included — replacing each with visible caret/`\xNN` notation so a crafted PR can't inject ANSI/OSC sequences to repaint or hide findings, spoof gate status, or drive terminal side effects (OSC 52 clipboard, OSC 8 hyperlinks). Applied *before* the CLI's own `ansis` styling (can't sanitize at the console boundary — that would strip the CLI's legitimate colours, and allow-listing SGR would still pass attacker SGR through). Covers every render path: shared helpers in `utils/formatting.ts` (issue cards/detail, code context, CVE block, dependency chains, version segments) plus `pull-request` (About table, Files, diff-coverage, annotated diff line/hunk/path), `findings`/`finding`, `issues` (overview tables, noise suggestions), `issue`, `repository` (About, PRs, overview), `ls`/`directories`. JSON output left intact (JSON encoding already escapes control bytes). New `src/utils/sanitize.test.ts` + pull-request table/diff regression tests (12 new tests, 490 total) |
