# Analysis Status & Reanalyze Spec

**Status:** ✅ Done (2026-03-05)

## Purpose

Show analysis status of the HEAD commit in the `repository` and `pull-request` commands, and allow triggering reanalysis.

## Usage

```
codacy repository <provider> <organization> <repository> --reanalyze
codacy pull-request <provider> <organization> <repository> <prNumber> --reanalyze
```

On success, show: "Reanalysis requested successfully, new results will be available in a few minutes."
On failure, show: "Failed to request reanalysis: \<error message\>".

### `--reanalyze-and-wait` (`-w`) — blocking variant

A second variant triggers the reanalysis and **waits** for it to complete, then
prints what changed. The fire-and-forget `--reanalyze` stays as-is.

```
codacy repository <provider> <organization> <repository> --reanalyze-and-wait
codacy pull-request <provider> <organization> <repository> <prNumber> --reanalyze-and-wait
```

Flow:
1. Capture a **baseline** of current issues — for the repository from
   `issuesOverview` (counts by severity / category / pattern as independent
   lists); for the pull request by paging `listPullRequestIssues(status="new")`
   (each issue carries its pattern's category + severity).
2. Trigger `reanalyzeCommitById` on the HEAD commit.
3. **Poll every 10 s** (giving up after **20 min**), with the spinner showing
   `"Analysis requested. Waiting for it to start..."` → `"Analysis in progress.
   This may take a few minutes..."` → `"Analysis done. Fetching results to
   compare..."`. On each poll, read the **first commit** from the `/commits`
   endpoint (`listRepositoryCommits` for the repo, `getPullRequestCommits` for
   the PR, both `limit=1`) and look at its `startedAnalysis`/`endedAnalysis`:
   - **In progress** = `startedAnalysis` more recent than `endedAnalysis` **and**
     more recent than `t0` (the moment we triggered) — i.e. the analysis that
     started is ours, not a previous one.
   - **Done** = `startedAnalysis` more recent than `t0` **and** `endedAnalysis`
     at or after `startedAnalysis` (our analysis has since finished).
4. Fetch a fresh snapshot, diff against the baseline, and print:
   - `Analysis finished in <duration>` headline (from the commit's
     `startedAnalysis`→`endedAnalysis`, falling back to wall-clock).
   - **By pattern / By severity / By category** signed net-delta lists. PR
     pattern rows are annotated `(Category · Severity)`; repo pattern rows are
     title-only (the overview doesn't map patterns to category/severity).
   - `In total: <before> → <after> issues (net ±N)`.

Notes:
- The overview only exposes **net** per-bucket change, so deltas are signed net
  values per dimension, not a literal "added vs removed" split or a
  severity×category cross-tab.
- The pattern list is soft-capped at 20 rows with a `… (N more)` line.
- `--output json` emits `{ durationMs, durationHuman, totals, deltas }`.
- On timeout, the spinner fails with a "didn't finish within 20 minutes" message.

Shared logic lives in `src/utils/reanalyze-wait.ts` (`pollForAnalysis`,
`snapshotFromOverview`, `snapshotFromPrIssues`, `diffSnapshots`,
`renderReanalyzeReport`, `reanalyzeJson`, and a `timers.sleep` indirection that
tests stub for instant polling). `formatDuration` lives in `utils/formatting.ts`.

## Updates to existing commands

### `repository` command — About section

The "Last Analysis" row is replaced by "Analysis", showing the current analysis status of the HEAD commit:

- Reanalysis in progress (HEAD commit already analyzed, but currently being reanalyzed):
```
Analysis       Finished 12h ago (c00e638) — Reanalysis in progress...
```

- First analysis (HEAD commit not yet analyzed):
```
Analysis       In progress... (c00e638)
```

- Analysis finished, waiting for coverage (within 3h):
```
Analysis       Finished 12h ago (c00e638) — Waiting for coverage reports...
```

- Analysis finished, coverage overdue (>3h):
```
Analysis       Finished 12h ago (c00e638) — Missing coverage reports
```

- Normal finished state:
```
Analysis       Finished 12h ago (c00e638)
```

"In progress..." and "Reanalysis in progress..." are colored light blue. "Missing coverage reports" is yellow.

### `pull-request` command — About section

Same "Analysis" row replaces the former "Head Commit" row, with the same status logic applied to the PR's HEAD commit.

## Analysis Status Logic

- **Being analyzed**: `startedAnalysis` is set AND (`endedAnalysis` is absent OR `startedAnalysis > endedAnalysis`)
- **Coverage expected**: determined by `listCoverageReports(limit=1).data.hasCoverageOverview`
- **Coverage data present**: `diffCoverage.value !== undefined OR deltaCoverage !== undefined` (PR); `coveragePercentage !== undefined` (repo)
- **Wait threshold**: 3 hours from `endedAnalysis`

Implemented in `formatAnalysisStatus()` in `src/utils/formatting.ts`.

## API Endpoints

- [`reanalyzeCommitById`](https://api.codacy.com/api/api-docs#reanalyzecommitbyid) — `RepositoryService.reanalyzeCommitById(provider, org, repo, { commitUuid: sha })`
- [`getPullRequestCommits`](https://api.codacy.com/api/api-docs#getpullrequestcommits) with `limit=1` — head commit timing for PR
- [`listRepositoryCommits`](https://api.codacy.com/api/api-docs#listrepositorycommits) with `limit=1` — head commit timing for repo
- [`listCoverageReports`](https://api.codacy.com/api/api-docs#listcoveragereports) with `limit=1` — check `hasCoverageOverview`

Additionally used by `--reanalyze-and-wait`:
- `listRepositoryCommits` (`limit=1`) — repo first-commit analysis timestamps, polled for status
- `getPullRequestCommits` (`limit=1`) — PR first-commit analysis timestamps, polled for status
- `getRepositoryPullRequest` — fetched once to resolve the PR `headCommitSha`
- `issuesOverview` — repo baseline/after issue counts (severity / category / pattern)
- `listPullRequestIssues` (`status="new"`, paginated) — PR baseline/after issue list

## Tasks

- [x] Update analysis status in the About section of the `repository` command
- [x] Update analysis status in the About section of the `pull-request` command
- [x] Add `--reanalyze` option to the `repository` command
- [x] Add `--reanalyze` option to the `pull-request` command
- [x] Update existing tests for the status sections
- [x] Add tests for the new `--reanalyze` option
- [x] Add `--reanalyze-and-wait` (`-w`) blocking variant to both commands (2026-06-02)

## Tests

- `src/utils/formatting.test.ts` — 6 unit tests for `formatAnalysisStatus`; + `formatDuration` and `isBeingAnalyzed` tests
- `src/commands/repository.test.ts` — 4 tests (analysis status, reanalyze) + 3 for `--reanalyze-and-wait`
- `src/commands/pull-request.test.ts` — 3 tests (analysis status, reanalyze) + 3 for `--reanalyze-and-wait`
- `src/utils/reanalyze-wait.test.ts` — 12 unit tests (snapshots, diff, poll loop incl. timeout, render, json)
