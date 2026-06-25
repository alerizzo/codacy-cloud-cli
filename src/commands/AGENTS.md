# Commands Design Decisions

## Structure

Each command is a single file that exports a `register<Name>Command(program: Command)` function. Commands are registered in `src/index.ts`.

## Command Aliases

Every command must declare a short alias via `.alias()`. Keep aliases short (2–4 characters) and intuitive:
- `repositories` → `repos`
- `repository` → `repo`
- `pull-request` → `pr`
- `issues` → `is`

## Option Short Flags

Every command option must have both a short flag and a long flag: `-X, --long-name <value>`. Pick single letters that are intuitive and don't conflict with Commander's built-in flags (`-V/--version`, `-h/--help`) or the global `-o/--output` option. When the natural letter is already taken, use uppercase (e.g. `-O, --overview` instead of `-o`).

## Option Naming: Singular vs Plural

Use a **singular** option name when the parameter accepts a single value, and a **plural** name when it accepts a comma-separated list:

- `--branch main` → singular (one branch)
- `--severities Critical,High` → plural (list of severity levels)
- `--categories Security,CodeStyle` → plural (list of categories)
- `--languages TypeScript,Python` → plural (list of languages)
- `--authors dev@example.com,other@example.com` → plural (list of emails)

This applies to both the long flag name and the metavar: `--severities <severities>`, not `--severities <severity>`.

## Output Format

All commands support `--output json` via the global `-o, --output` option. Commands use `getOutputFormat(this)` (from `utils/output.ts`) to check the format and either:
- Render tables/styled output for `table` (default)
- Call `printJson(data)` for `json`

The `this` context in Commander action handlers gives access to the command instance, which is used to read global options via `optsWithGlobals()`.

## Table Styling

Tables are created via `createTable()` from `utils/output.ts`, which applies default styling:
- No pipe borders — clean tabular format with space separators only
- Column headers are **bold white** (not the default red from cli-table3)

## Pagination

All commands that call paginated API endpoints must check for a cursor in the response and call `printPaginationWarning()` when more results exist. The warning includes a command-specific hint suggesting how to filter results:
- `info` (organizations): generic message ("Not all organizations are shown.")
- `repositories`: suggests `--search <query>` to filter by name

New commands must follow this pattern: after printing the table, call `printPaginationWarning(response.pagination, "<hint>")`.

## Date Formatting

When displaying "Last Updated" or similar dates, use `formatFriendlyDate()` from `utils/output.ts`:
- Same day: relative time ("Just now", "10 minutes ago", "3 hours ago")
- Yesterday: "Yesterday"
- Older: "YYYY-MM-DD"

## info command (`info.ts`)

- Calls `AccountService.getUser()` and `AccountService.listUserOrganizations()` in parallel
- Displays user details in a key-value table (cli-table3 without headers)
- Displays organizations in a columnar table
- Provider codes (gh, gl, bb) are mapped to display names via `utils/providers.ts`
- Shows pagination warning if organizations response has more pages

## Visibility Indicator

Instead of a dedicated "Visibility" column (wastes horizontal space), public repositories are marked with a dimmed `⊙` (U+2299, circled dot operator) appended to the name. Private repositories show the name alone. This character is in the Mathematical Operators Unicode block and renders reliably across terminals.

## repositories command (`repositories.ts`)

- Takes `<provider>` and `<organization>` as required arguments
- Optional `--search <query>` passes through to the API's `search` parameter
- Public repos show `⊙` after the name instead of a separate Visibility column
- Quality metrics (complexity, duplication, coverage) are colored red/green based on `goals` thresholds from `RepositoryQualitySettings`:
  - **Max thresholds** (issues, complexity, duplication): green if under, red if over
  - **Min thresholds** (coverage): green if above, red if below
- Grade letters are colored: A/B = green, C = yellow, D/F = red
- Last Updated uses friendly date formatting (relative for today, "Yesterday", otherwise YYYY-MM-DD)
- Shows pagination warning if more results exist, suggesting `--search` to filter

## repository command (`repository.ts`)

- Takes `<provider>`, `<organization>`, and `<repository>` as required arguments
- Calls three API endpoints in parallel: `getRepositoryWithAnalysis`, `listRepositoryPullRequests`, `issuesOverview`
- Displays a multi-section dashboard:
  - **About**: provider/org/name, visibility, default branch, last updated (friendly date), last analysis (time + short SHA)
  - **Setup**: languages, coding standards, quality gate, problems (yellow if present, green "None" otherwise)
  - **Metrics**: issues (count + per kLoC), coverage, complexity, duplication — colored by goals thresholds
  - **Open Pull Requests**: filtered to open status, columns:
    - `#`, `Title` (truncated at 50), `Branch` (truncated at 40)
    - `✓` (header is a gray ✓) — green ✓ if `isUpToStandards` is true, red ✗ if false, dim `-` if undefined
    - `Issues` — combined `+newIssues / -fixedIssues`
    - `Coverage` — `diffCoverage% (+/-deltaCoverage%)`
    - `Complexity` — delta value with +/- sign
    - `Duplication` — delta clones count with +/- sign
    - `Updated` — friendly date
    - **Metric coloring via `resultReasons`**: The `quality.resultReasons` and `coverage.resultReasons` arrays contain per-gate pass/fail info (`gate` name + `isUpToStandards`). Gate names are matched by keyword to color the corresponding metric column:
      - `"issue"` (not security) → Issues column
      - `"coverage"` → Coverage column
      - `"complexity"` → Complexity column
      - `"duplication"` or `"clone"` → Duplication column
      - Green if gate passes, red if gate fails; no coloring if no matching gate exists
  - **Issues Overview**: three count tables — by category, severity level, and language — sorted descending by count within each group
- Shows pagination warning for pull requests if more exist
- JSON output bundles all three API responses into a single object, plus a `repository.fileCount` field plucked from `data.coverage.numberTotalFiles` (present on the existing `getRepositoryWithAnalysis` response even when the repo has no coverage data — no extra API call). Omitted when that field is absent
- **`--reanalyze` mode** (`-R`): fetches HEAD commit SHA, calls `RepositoryService.reanalyzeCommitById`; early return
- **`--reanalyze-and-wait` mode** (`-w`): blocking variant — see "Reanalyze and wait" below. Baseline comes from `issuesOverview`; polling reads the repo's first commit via `listRepositoryCommits(limit=1)` analysis timestamps

## Shared Formatting Utilities (`utils/formatting.ts`)

Several helpers are shared between `repository.ts` and `pull-request.ts` via `utils/formatting.ts`:
- `printSection(title)` — bold section header
- `truncate(text, max)` — truncate with "..." suffix
- `colorMetric(value, threshold, mode)` — threshold-based coloring (max/min)
- `colorByGate(display, passing)` — green/red based on gate status
- `formatDelta(value, passing)` — +/- signed value with optional gate coloring
- `buildGateStatus(pr)` — maps `resultReasons` gate names to metric columns
- `formatStandards(pr)` — ✓/✗/- from quality + coverage `isUpToStandards`
- `formatPrCoverage(pr, passing)` — diffCoverage% (+/-deltaCoverage%)
- `formatPrIssues(pr, passing)` — +newIssues (colored by gate) / -fixedIssues (always gray)

Dependency-chain helpers shared between `findings.ts` (list) and `finding.ts` (detail):
- `formatVersionSegment(affectedVersion, fixedVersion, { includeUpdatePrefix })` — the `affected → fixed` status-line segment shown when a finding has no dependency chains; `includeUpdatePrefix` prepends `Update ` (list uses it, detail doesn't); returns `null` when there's no affected version
- `formatDependencyChain(chain)` — joins a chain with ` → `, collapsing the middle to `<first> → ... N more ... → <last>` when it has 4+ packages (≤ 3 shown in full)
- `formatDependencyChainsLine(chains, fixedVersion)` — one-line list summary: first chain with its Direct/Transitive label + `... and N more`; returns `null` for no chains
- `formatDependencyChainsBlock(chains, fixedVersion)` — multi-line detail block: all chains, label shown once, continuation lines aligned under the label; returns `null` for no chains

Pattern helpers shared between `patterns.ts` (list) and `pattern.ts` (single info):
- `printPatternCard(cp)` — the configured-pattern card (icons, enforced-by line, metadata, why/how, parameters)
- `PATTERN_JSON_FIELDS` — `pickDeep` paths for the JSON projection of a `ConfiguredPattern`
- `patternEnforcedBy(cp)` — coding-standard names from `cp.enabledBy` (empty = not enforced)

## pattern / patterns commands — config-file & coding-standard guards

Patterns can be unmodifiable for two reasons, surfaced consistently across
`pattern`, `patterns`, and the `issues --overview` noise suggestions:

- **Local configuration file** — `tool.settings.usesConfigurationFile` (from
  `listRepositoryTools`). The tool's patterns are overwritten by the file, so
  the API can't list or change them.
- **Coding-standard enforcement** — a `ConfiguredPattern.enabledBy` array with
  entries. The pattern is managed in the standard, not at repo level.

There is no single-pattern endpoint, so a pattern is looked up via
`listRepositoryToolPatterns(search=<patternId>)` filtered to the **exact** ID
match. Modify-mode refusals (`pattern --enable/--disable/--parameter`, and
`patterns --enable-all/--disable-all`) print the reason and `process.exit(1)`;
info/list displays print a notice and exit 0.

## Reanalyze and wait (`utils/reanalyze-wait.ts`)

Shared by the `repository` and `pull-request` `--reanalyze-and-wait` (`-w`) modes.
Keeps the two command handlers thin: they only supply the API-specific callbacks
(get HEAD SHA, fetch baseline/after snapshot, `getStatus`).

- **Snapshots**: `IssueSnapshot { total, bySeverity, byCategory, byPattern }`.
  `snapshotFromOverview()` (repo) builds independent dimension counts and pattern
  buckets with **no** category/severity. `snapshotFromPrIssues()` (PR) tallies the
  same dimensions from the raw issue list and **annotates** each pattern bucket
  with its category + severity.
- **`diffSnapshots(before, after)`**: signed **net** deltas per dimension (drops
  unchanged buckets). Severity sorted Critical→Minor; category/pattern sorted by
  |delta|. The overview can't decompose net change into added-vs-removed, so the
  report shows net deltas, not a literal "new/resolved" split or a cross-tab.
- **`pollForAnalysis(getStatus, opts)`**: two-phase loop — wait for a new analysis
  to start (or detect it already finished), then wait for it to finish. `getStatus`
  returns the first commit's `{ startedAnalysis, endedAnalysis }` (from the `/commits`
  endpoint). In-progress = `startedAnalysis` more recent than both `endedAnalysis`
  and `triggeredAt` (t0); done = `startedAnalysis` after t0 and `endedAnalysis` ≥
  `startedAnalysis` (helpers `isAnalysisInProgress`/`isAnalysisDone`). Comparing to
  t0 ensures we track *our* analysis, not a stale one. Returns `{ status, timedOut }`.
  Defaults: `POLL_INTERVAL_MS=10s`, `MAX_WAIT_MS=20min`.
- **`timers.sleep`**: polling delay wrapped in an exported object so tests stub it
  (`vi.spyOn(timers, "sleep").mockResolvedValue()`) for instant polling. Drive the
  poll loop in command tests with sequential `mockResolvedValueOnce` status values;
  use the optional `now` injection in `pollForAnalysis` to unit-test the timeout.
- **Rendering**: `renderReanalyzeReport(delta, durationMs)` prints the
  `Analysis finished in <duration>` headline + By pattern / By severity /
  By category lists (pattern rows soft-capped at `PATTERN_LIMIT=20`) + an
  `In total: before → after (net ±N)` line. `reanalyzeJson()` is the `--output json`
  payload. `durationFromStatus()` derives the duration from commit timestamps.

## issue command (`issue.ts`)

- Takes `<provider>`, `<organization>`, `<repository>`, and `<issueId>` (the numeric `resultDataId` shown on issue cards) as required arguments
- Fetches the issue, pattern info, and ±5 lines of file context in parallel
- **Default mode**: displays full issue detail — header, code context, false positive warning, pattern documentation
- **`--ignore` mode** (`-I`): calls `AnalysisService.updateIssueState` with `{ ignored: true, reason, comment }`; skips rendering issue details
  - `-R, --ignore-reason`: `AcceptedUse` (default) | `FalsePositive` | `NotExploitable` | `TestCode` | `ExternalCode`
  - `-m, --ignore-comment`: optional free-text comment
- **`--unignore` mode** (`-U`): calls `AnalysisService.updateIssueState` with `{ ignored: false }`; skips rendering issue details
- The API uses the string UUID (`issue.issueId`), not the numeric `resultDataId`, for the `updateIssueState` call

## issues command (`issues.ts`)

- Takes `<provider>`, `<organization>`, and `<repository>` as required arguments
- **List mode** (default): card-style format sorted by severity (Error > High > Warning > Info)
- **Overview mode** (`-O, --overview`): seven count tables — Category, Severity, Language, Tag, Pattern, Author, False Positives
  - The False Positives table relabels the API's raw bucket names via `FALSE_POSITIVE_LABELS`: `belowThreshold` → "Not a False Positive", `equalOrAboveThreshold` → "Potential False Positive" (the threshold is on FP probability, so at/above = potential FP — matching `printIssueCard`)
  - **Noise suggestions**: after the tables, `detectNoisyPatterns()` flags patterns that account for ≥10% of all issues (`NOISE_SHARE`) **or** have ≥3× the average issues-per-pattern (`NOISE_AVG_MULTIPLE`), sorted by count desc. For each, `resolvePatternTool()` maps the pattern ID to its owning tool by matching `Tool.prefix` (e.g. `Bandit_B101` → prefix `Bandit_`; longest match wins) against the global tool list (`fetchAllTools()` / `ToolsService.listTools`). Resolved ones print a `> codacy pattern <tool> <patternId> --disable` line under "Suggested actions to reduce noise". Patterns whose tool can't be resolved (no/unmatched prefix) are **silently discarded**. The tools fetch only happens when noisy patterns exist; JSON output is unaffected (raw counts only)
- **Filters**: `--branch`, `--patterns`, `--tools`, `--severities`, `--categories`, `--languages`, `--tags`, `--authors`, `--limit`
- **`--false-positives [value]`** (`-F`): tri-state filter — `true` (default when flag present) sends `onlyPotentialFalsePositives: true`, `false` sends `onlyPotentialFalsePositives: false`, omitted sends nothing
- **`--ignore` mode** (`-I`): fetches all issues matching current filters (all pages), then calls `AnalysisService.bulkIgnoreIssues` in batches of 100
  - `-R, --ignore-reason`: `AcceptedUse` (default) | `FalsePositive` | `NotExploitable` | `TestCode` | `ExternalCode`
  - `-m, --ignore-comment`: optional free-text comment
  - Cannot be combined with `--overview` or `--limit`
  - Works with any combination of filters; use `--false-positives --ignore` to ignore only FP issues

## finding command (`finding.ts`)

- Takes `<provider>`, `<organization>`, and `<findingId>` (UUID shown on finding cards) as required arguments — **no `<repository>` argument**
- Fetches the security item; for Codacy-source findings, also fetches the linked quality issue, pattern, and file context
- Fetches CVE enrichment in parallel when the finding has a `cve` field
- **Default mode**: displays full finding detail — header, prose fields, code context (Codacy-source only), CVE block
- **`--ignore` mode** (`-I`): calls `SecurityService.ignoreSecurityItem` with `{ reason, comment }`; skips rendering finding details
  - `-R, --ignore-reason`: `AcceptedUse` (default) | `FalsePositive` | `NotExploitable` | `TestCode` | `ExternalCode`
  - `-m, --ignore-comment`: optional free-text comment
- **`--unignore` mode** (`-U`): calls `SecurityService.unignoreSecurityItem`; skips rendering finding details
- **Dependency import chains** (SCA findings): when `item.dependencyChains` (`string[][]`) is present, both `finding` (detail) and `findings` (list) render the vulnerable dependency's import path. A chain with a single package is a **direct** dependency (`Direct - Update <pkg> to <fixedVersion>`); 2+ packages is **transitive** (`Transitive - <chain> (Fixed in <fixedVersion>)`). Chains with **4+ packages** collapse the middle to `<first> → ... N more ... → <last>` (N = length − 2). The list shows only the first chain + `... and X more`; the detail lists **all** chains with the Direct/Transitive label shown once and continuation lines indented so the `-` aligns. When chains are present, the redundant `AffectedVersion → FixedVersion` segment is dropped from the status line. Mixed direct/transitive chains (rare) take their label from the first chain. Rendering lives in `formatDependencyChainsLine` / `formatDependencyChainsBlock` (see Shared Formatting Utilities).

## pull-request command (`pull-request.ts`)

- Takes `<provider>`, `<organization>`, `<repository>`, and `<prNumber>` as required arguments
- Action modes are mutually exclusive and checked in this order: `--ignore-issue`, `--ignore-all-false-positives`, `--unignore-issue`, `--issue`, `--diff`, default
- **Default mode**: calls four API endpoints in parallel:
  - `getRepositoryPullRequest` — PR metadata + analysis summary
  - `listPullRequestIssues` (status=new, onlyPotential=false) — new confirmed issues
  - `listPullRequestIssues` (status=new, onlyPotential=true) — new potential issues
  - `listPullRequestFiles` — files with metric deltas
- Displays a multi-section view:
  - **About**: provider/org/repo, PR number + title, status, author, branches (origin → target), updated (friendly date), head commit SHA
  - **Analysis**: analyzing status, up-to-standards (✓/✗ computed from quality + coverage), issues, coverage, complexity, duplication — all colored by gate status
    - Gate failure/pass reasons shown inline next to the metric (e.g. "Fails <= 2 warning issues", "Fails <= 0 security issues")
    - "To check" hints shown inline when a gate is configured but the metric has no data yet (e.g. "To check >= 50% coverage")
    - Security gates (`securityIssueThreshold`) are handled explicitly — not falling through to generic formatting
  - **Issues**: single merged list of confirmed + potential issues, card-style format (not a table), sorted by severity (Error > High > Warning > Info)
    - Each card shows: colored severity | category + subcategory | POTENTIAL (if potential issue)
    - Message, file:line, line content
    - Severity colors: Error=red, High=orange (#FF8C00), Warning=yellow, Info=blue
    - False positive detection: if `falsePositiveProbability >= falsePositiveThreshold`, shows "Potential false positive: {reason}" below line content
  - **Files**: table showing only files with any metric delta change
    - File path (truncated at 50), issues (new red, fixed green), coverage delta, complexity delta, duplication delta
    - Zero values shown in gray without +/- sign; N/A also gray
- Shows pagination warnings for issues and files
- JSON output bundles PR data, new issues, potential issues, and files
- **`--ignore-issue <id>` mode** (`-I`): fetches all PR issues (new + potential, paginated), finds by `resultDataId`, calls `updateIssueState` with `{ ignored: true, reason, comment }`
  - Supports `-R/--ignore-reason` (default: `AcceptedUse`) and `-m/--ignore-comment`
- **`--ignore-all-false-positives` mode** (`-F`): fetches all potential false positive issues (onlyPotential=true, paginated), ignores them all in parallel with hardcoded reason `FalsePositive`; supports `-m/--ignore-comment`
- **`--unignore-issue <id>` mode** (`-U`): same lookup as `--ignore-issue`, calls `updateIssueState` with `{ ignored: false }`
- **`--reanalyze` mode** (`-A`): fetches PR data to get `headCommitSha`, calls `RepositoryService.reanalyzeCommitById`; early return
- **`--reanalyze-and-wait` mode** (`-w`): blocking variant — see "Reanalyze and wait" below. Baseline comes from paging `listPullRequestIssues(status="new")`; polling reads the PR's first commit via `getPullRequestCommits(limit=1)` analysis timestamps
- **Analysis status in About**: replaced "Head Commit" with "Analysis" row using `formatAnalysisStatus()` from `utils/formatting.ts`; fetches `getPullRequestCommits(limit=1)` and `listCoverageReports(limit=1)` in parallel with existing calls

## JSON Output Filtering (`pickDeep`)

All commands that output JSON now filter their response using `pickDeep(data, paths)` from `utils/output.ts`. This ensures the JSON output only includes fields that correspond to what's shown in the console table/card output.

**Pattern for new commands:**
```typescript
if (format === "json") {
  printJson(pickDeep(data, [
    "field.nested.path",
    "another.field",
  ]));
  return;
}
```

**For arrays of items**, map each item through `pickDeep`:
```typescript
printJson(items.map((item: any) => pickDeep(item, [...])));
```

**Special rules for JSON output:**
- Commit SHAs: include the full SHA (not truncated)
- Dates: include full ISO timestamps (not formatted)
- IDs: only include IDs already shown in console output
