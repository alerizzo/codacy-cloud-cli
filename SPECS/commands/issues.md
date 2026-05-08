# `issues` Command Spec

**Status:** ✅ Done (2026-02-19)

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

Both accept the same `SearchRepositoryIssuesBody` for filtering.

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

────────────────────────────────────────
```

Severity colors: Error=red, High=orange, Warning=yellow, Info=blue.

Shows pagination warning if more results exist.

### Overview mode (`--overview`)

Six count tables sorted descending by count: Category, Severity, Language, Tag, Pattern, Author.

## Tests

File: `src/commands/issues.test.ts` — 39 tests.
