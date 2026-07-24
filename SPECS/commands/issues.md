# `issues` Command Spec

**Status:** ✅ Done (2026-02-19); vulnerable functions line added 2026-07-24

## Purpose

Search for issues in a repository, with filters and an optional overview mode.

## Usage

```
codacy issues <provider> <organization> <repository>
codacy issues gh my-org my-repo --branch main --severities Critical,High
codacy issues gh my-org my-repo --overview
codacy is gh my-org my-repo --output json
```

## API Endpoints

- [`searchRepositoryIssues`](https://api.codacy.com/api/api-docs#searchrepositoryissues) — `AnalysisService.searchRepositoryIssues(provider, org, repo, cursor, limit, body)`
- [`issuesOverview`](https://api.codacy.com/api/api-docs#issuesoverview) — `AnalysisService.issuesOverview(provider, org, repo, body)` (only when `--overview` is given)
- [`listTools`](https://api.codacy.com/api/api-docs#listtools) — `ToolsService.listTools(cursor, limit)` (only when `--overview` surfaces noisy patterns, to map each pattern's `prefix` to its owning tool)
- [`listRepositoryTools`](https://api.codacy.com/api/api-docs#listrepositorytools) — `AnalysisService.listRepositoryTools(provider, org, repo)` (only when `--overview` surfaces noisy patterns, to detect config-file-driven tools)
- [`listRepositoryToolPatterns`](https://api.codacy.com/api/api-docs#listrepositorytoolpatterns) — `search=<patternId>` (only for noisy patterns on non-config-file tools, to detect coding-standard enforcement)

`searchRepositoryIssues` and `issuesOverview` accept the same `SearchRepositoryIssuesBody` for filtering.

## Options

| Option | Short | Description |
|---|---|---|
| `--branch <branch>` | `-b` | Branch name |
| `--patterns <patterns>` | `-p` | Comma-separated pattern IDs |
| `--severities <severities>` | `-s` | Comma-separated severity levels: Critical, High, Medium, Minor (or Error, Warning, Info) |
| `--categories <categories>` | `-c` | Comma-separated category names (e.g. Security, CodeStyle, ErrorProne) |
| `--languages <languages>` | `-l` | Comma-separated language names |
| `--tags <tags>` | `-t` | Comma-separated tag names |
| `--authors <authors>` | `-a` | Comma-separated author emails |
| `--tools <tools>` | `-T` | Comma-separated tool UUIDs or names |
| `--limit <n>` | `-n` | Maximum number of issues (default: 100, max: 1000) |
| `--overview` | `-O` | Show overview counts instead of list |
| `--false-positives [value]` | `-F` | Filter by potential false positives (true, false, or omit) |
| `--ignore` | `-I` | Ignore all issues matching current filters |
| `--ignore-reason <reason>` | `-R` | Reason for ignoring (AcceptedUse, FalsePositive, NotExploitable, TestCode, ExternalCode) |
| `--ignore-comment <comment>` | `-m` | Optional comment when using --ignore |

## Output

### List mode (default)

Card-style format, sorted by severity (Error > High > Warning > Info):

```
────────────────────────────────────────

{Severity colored} | {Category} {SubCategory?}   #{resultDataId dimmed}
{Issue message}

{FilePath}:{LineNumber}
{LineText}
{Optional: Potential false positive warning}
{Optional: Vulnerable functions: fn1, fn2, fn3 (+N more)}

────────────────────────────────────────
```

Severity colors: Error=red, High=orange, Warning=yellow, Info=blue.

The "Vulnerable functions" line is shown when `issue.advisoryInformation` is present (SCA
issues linked to an OSV advisory), listing up to 3 function names with a "(+N more)" suffix
for longer lists. Rendered via `printIssueCard` in `utils/formatting.ts`. `--output json`
includes the full `advisoryInformation` object (`advisoryId`, `vulnerableFunctions`,
`publishedAt`) — no truncation there.

Shows pagination warning if more results exist.

### Overview mode (`--overview`)

Seven count tables sorted descending by count: Category, Severity, Language, Tag,
Pattern, Author, and False Positives.

The **False Positives** table relabels the API's raw bucket names for readability:
`belowThreshold` → "Not a False Positive", `equalOrAboveThreshold` → "Potential
False Positive" (the bucket is keyed on FP probability vs. the configured
threshold, so at/above threshold = a potential false positive).

After the tables, a **"Suggested actions to reduce noise"** section lists patterns
worth disabling. A pattern is "noisy" when it accounts for **≥10% of all issues**
shown, **or** has **≥3× the average** issues-per-pattern. The owning tool is
resolved by matching the pattern ID against each tool's `prefix` (longest match
wins); patterns whose tool can't be resolved (no/unknown prefix) are dropped
silently. The list is capped at 10 with a "… (N more)" note.

The suggested step depends on **how the pattern is managed**, since not every
pattern can be disabled through the CLI:

```
Suggested actions to reduce noise

  Disable "Use of assert detected" (-2.5k issues)
  > codacy pattern Bandit Bandit_B101 --disable
```

- **Default** — a runnable `> codacy pattern <tool> <patternId> --disable` command.
- **Tool uses a local configuration file** — no command; instead
  `→ Update your local <tool> configuration file to disable the pattern`.
- **Pattern enforced by a coding standard** — no command; instead
  `→ Update <standard name(s)> to disable the pattern`.

To classify each noisy pattern, the command additionally fetches the repository
tools (`listRepositoryTools`, for `usesConfigurationFile` and the repo tool
UUID) and, for non-config-file tools, the pattern's `enabledBy` via
`listRepositoryToolPatterns` (`search=<patternId>`, one call per noisy pattern).
A config file takes precedence over coding-standard enforcement. These extra
calls only run when at least one noisy pattern exists.

`--output json` is unaffected (raw counts only — no relabeling or suggestions).

## Tests

File: `src/commands/issues.test.ts` — 50 tests (46 + 4 for the vulnerable functions line).
