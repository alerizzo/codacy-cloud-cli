# `pull-requests` Command Spec

**Status:** ✅ Done (2026-07-28)

## Purpose

List pull requests for a repository, with analysis data — the plural counterpart to `pull-request` (which shows a single PR by number). Supports a free-text search filter and a target-branch filter.

## Usage

```
codacy pull-requests [provider] [organization] [repository]
codacy pull-requests                                    # auto-detect from git remote
codacy pull-requests gh my-org my-repo
codacy prs gh my-org my-repo --search-text "fix flaky"
codacy prs gh my-org my-repo --branch main
codacy prs gh my-org my-repo --output json
```

## Options

| Option | Short | Description |
|---|---|---|
| `--search-text <text>` | `-q` | Filter by free-text search matched against the PR title or author handle (maps to the API's `textQuery` param) |
| `--branch <name>` | `-b` | Filter by target branch name (maps to the API's `targetBranch` param) |
| `--limit <n>` | `-n` | Maximum number of pull requests to return (default: 100, max: 1000) |

Omitting both filters mirrors the API's own default: all branches, no text filter, `Open` status, most-recently-updated first (the API's own `search`/classification param, which toggles Merged vs. last-updated, is not exposed here — it's a different axis from these two filters and out of scope for this command).

## API Endpoint

[`listRepositoryPullRequests`](https://api.codacy.com/api/api-docs#listrepositorypullrequests) — `AnalysisService.listRepositoryPullRequests(provider, org, repository, limit, cursor, search, textQuery, targetBranch)`. `search` (classification) is always passed as `undefined` by this command.

Pages through `cursor` up to `--limit` (page size capped at 100 per request), same loop shape as `findings`/`issues`.

## Output

Table format, columns:

| # | Title | Branch | ✓ | Issues | Coverage | Complexity | Duplication | Updated |
|---|---|---|---|---|---|---|---|---|

- **Branch** shows `pullRequest.targetBranch` (truncated at 20) — the branch this command's `--branch` filter narrows by.
- **✓**, **Issues**, **Coverage**, **Complexity**, **Duplication** reuse the same shared helpers as `repository`'s "Open Pull Requests" table (`buildGateStatus`, `formatStandards`, `formatPrIssues`, `formatPrCoverage`, `formatDelta`) and `pull-request`'s own Analysis section — gate-colored the same way.
- Shows pagination warning (suggesting `--limit`, `--search-text`, `--branch`) if more results exist than were fetched.

## Tests

File: `src/commands/pull-requests.test.ts` — 10 tests.
