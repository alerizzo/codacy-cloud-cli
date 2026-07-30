# `pull-requests` Command Spec

**Status:** ✅ Done (2026-07-28)

## Purpose

List pull requests for a repository, with analysis data — the plural counterpart to `pull-request` (which shows a single PR by number). Supports a free-text search filter, a target-branch filter, and an open/closed state filter.

## Usage

```
codacy pull-requests [provider] [organization] [repository]
codacy pull-requests                                    # auto-detect from git remote
codacy pull-requests gh my-org my-repo
codacy prs gh my-org my-repo --search "fix flaky"
codacy prs gh my-org my-repo --base main
codacy prs gh my-org my-repo --state closed
codacy prs gh my-org my-repo --output json
```

## Options

| Option | Short | Description |
|---|---|---|
| `--search <text>` | `-q` | Filter by free-text search matched against the PR title or author handle (maps to the API's `textQuery` param) |
| `--base <name>` | `-B` | Filter by target (base) branch name (maps to the API's `targetBranch` param) |
| `--state <state>` | `-S` | `open` (default) or `closed` — maps to the API's `search` classification param (see below) |
| `--limit <n>` | `-n` | Maximum number of pull requests to return (default: 100, max: 1000) |

`--search`/`-q` and `--base`/`-B` match the flag names already established elsewhere in the CLI (`findings`/`patterns` use `-q, --search`; `--base` avoids colliding with `-b, --branch`'s different meaning — "the analysed branch" — in `ls`/`directories`/`issues`).

## State filtering

The API's `search` param (not exposed directly) toggles between a `last-updated` classification (default) and a `merged` one; leaving it `undefined` returns closed/merged PRs mixed in with open ones with no way to tell them apart (no Status column in this command's table) — the same problem `repository.ts`'s "Open Pull Requests" table works around by filtering `status === "open" || "Open"` client-side. This command instead always passes an explicit `search` value:

- `--state open` (default) → `search = "last-updated"`
- `--state closed` → `search = "merged"` — named `closed` on the CLI, not `merged`, because that API classification also returns closed-but-not-merged PRs, so `"merged"` would be a factually wrong label to expose.

## API Endpoint

[`listRepositoryPullRequests`](https://api.codacy.com/api/api-docs#listrepositorypullrequests) — `AnalysisService.listRepositoryPullRequests(provider, org, repository, limit, cursor, search, textQuery, targetBranch)`.

Pages through `cursor` up to `--limit` (page size capped at 100 per request), same loop shape as `findings`/`issues`. The pagination-warning guard checks `total > items.length || hasMore` (not just `total`) — the API can omit `pagination.total`, and falling back to `total = items.length` would otherwise mask a page still pending behind a live `cursor`. The same latent bug (guard was `total > items.length` alone) was fixed in `findings.ts` at the same time, since that's where this loop shape was copied from.

## Output

Table format, columns:

| ✓ | # | Title | Branches | Issues | Complexity | Duplication | Coverage | Updated |
|---|---|---|---|---|---|---|---|---|

- **✓** is the leading column — the gate verdict is the first thing you scan a PR list for, so it reads before the number and title. It's dim `⋯` while `isAnalysing` is true (rather than falling through to a hard ✗ for gate data that isn't final yet), otherwise ✓/✗/`-` from quality + coverage `isUpToStandards` — a shared fix in `formatStandards()` (`utils/formatting.ts`), so it also applies to `repository`'s and `pull-request`'s uses of the same helper.
- **Branches** shows `originBranch → targetBranch` (truncated at 30) — same pairing `pull-request.ts`'s About section uses, so the "Branch" label doesn't collide with `repository.ts`'s Open PR table (which shows `originBranch` alone under the same header) or ambiguously imply which branch `--base` filters on.
- **Issues**, **Complexity**, **Duplication**, **Coverage** reuse the same shared helpers as `repository`'s "Open Pull Requests" table (`buildGateStatus`, `formatPrIssues`, `formatPrCoverage`, `formatDelta`) and `pull-request`'s own Analysis section — gate-colored the same way. The metric order matches the `repositories` command (issues → complexity → duplication → coverage) so the same four metrics read in the same order across the CLI.
- **Complexity/Duplication read `quality.deltaComplexity`/`quality.deltaClonesCount` first**, via the shared `prQualityMetric()` helper. The API populates the flat top-level fields and the nested `quality` object inconsistently — the pull-request endpoints return `quality.deltaComplexity` but omit the top-level `deltaComplexity` (while still sending a top-level `deltaClonesCount`), so reading only the flat field rendered every PR's complexity as "no data". `quality` is the newer, structured shape (same direction as `coverage` vs. the deprecated top-level coverage fields), so it wins with the flat field as fallback. Applied to `repository` and `pull-request` too, which had the same bug.
- **Coverage is hidden entirely when no listed PR has a coverage value** (`hasAnyPrCoverage()`). A repo without coverage set up returns `diffCoverage.cause` (e.g. `MissingRequirements`) and no numbers on any PR, so the column would otherwise be a full column of `-`. The helper lives next to `formatPrCoverage` so both agree on what counts as "has data".
- **Missing values render as a dim `-`, not `N/A`** — in `formatDelta`, `formatPrCoverage`, and `formatPrIssues`, matching the convention already used by `formatStandards`, `formatCountCell`, and `formatCoverageCell`. Being shared helpers, this also applies to `repository`'s Open PR table and `pull-request`'s Analysis section. (`N/A` survives elsewhere in the CLI for non-metric fields — grades, dates, author names, default branch — which is a separate sweep.)
- Shows pagination warning (suggesting `--limit`, `--search`, `--base`, `--state`) if more results exist than were fetched.
- JSON whitelist includes `pullRequest.originBranch`/`targetBranch` (both rendered in the Branches column), `coverage.isUpToStandards`/`quality.isUpToStandards` (needed to reproduce the ✓ column programmatically), the `quality.*` mirrors of the flat metric fields (the API omits some of the top-level ones, and these are what the table actually renders), and `quality.resultReasons`/`coverage.resultReasons` (which drive the per-metric gate coloring — without them a JSON consumer can't tell which gate passed or failed). It drops `pullRequest.status`/`pullRequest.owner.name` (neither rendered anywhere in the table) — matching the `pickDeep` convention in `AGENTS.md` ("only includes fields that correspond to what's shown in the console table").

## Tests

File: `src/commands/pull-requests.test.ts` — 19 tests.

Manually verified against `gh codacy codacy-website`: `--base main` → 0 results (repo's PRs all target `master`), `--base master` → matches the unfiltered count, `--search "AI"` → narrows to exactly the one matching title, `--output json` shape correct, and `[provider] [org] [repo]` auto-detect from the git remote works from inside a real checkout.

Also verified against `gh codacy codacy-worker` (a repo with no coverage set up): PR #1218 renders Complexity `+21` (previously `N/A`, since the API omits the flat `deltaComplexity`), the Coverage column is dropped from the table, and `codacy pr gh codacy codacy-worker 1218` shows the same `+21` in its Analysis section.
