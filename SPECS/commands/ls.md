# `ls` Command Spec

**Status:** ✅ Done (2026-07-07)

## Purpose

List the immediate directories **and** files at a path in a repository (like Unix `ls`), each with quality metrics. Repository is auto-detected from the git remote; the path is auto-detected from the current working directory relative to the repo root, or given via `--path`, or defaults to the repo root.

## Usage

```
codacy ls                                      # current directory (auto-detected)
codacy ls --path src/website                   # a specific folder
codacy ls gh my-org my-repo                    # root of an explicit repository
codacy ls gh my-org my-repo --path src/website
codacy ls --sort issues --direction desc       # worst files/folders first
codacy ls --path app/client --search config    # search files under a path
codacy ls --output json
```

## API Endpoints

- [`listDirectories`](https://api.codacy.com/api/api-docs#listdirectories) — `RepositoryService.listDirectories(provider, org, repo, branch, path, sort, direction, cursor, limit)`
- [`listFiles`](https://api.codacy.com/api/api-docs#listfiles) — `RepositoryService.listFiles(provider, org, repo, branch, path, search, sort, direction, cursor, limit)`

Both endpoints are cursor-paginated. This command **fetches every page** (via `fetchAllDirectories` / `fetchAllFiles` in `utils/repo-tree.ts`) — it does **not** show a pagination warning. The `path` argument is always passed as an explicit string (`""` = repo root, non-recursive); it is never `undefined`, which would make `listFiles` recursive.

## Options

| Option | Short | Description |
|---|---|---|
| `--path <path>` | `-p` | Repository-relative folder to list (defaults to the cwd relative to the repo root) |
| `--branch <branch>` | `-b` | Branch name (defaults to the main branch) |
| `--search <term>` | `-s` | Search files (any depth) under the path instead of listing immediate children |
| `--sort <field>` | `-S` | Sort by `name`, `issues`, `grade`, `duplication`, `complexity`, or `coverage` |
| `--direction <direction>` | `-d` | `asc`/`ascending` or `desc`/`descending` |

**Sorting.** With no `--sort`/`--direction`, results are ordered by name client-side. When either is given, ordering is delegated to the API (`sort`/`direction` params) — directories and files are sorted **independently** (each fully paginated, then concatenated), never merged. The CLI `name` field maps to the API's `filename` for files.

**Search.** `--search` lists **files only** (the directories endpoint has no search). The folder scope is folded into the search term (`<path>/%<term>`, or just `<term>` at the root) and `path` is **not** sent, so matches are found at any depth under the path. Results show each file's full repository-relative path.

## Output

Bold header `/<repo>/<path> — N directories, M files`, then a columnar table with directories first (each sorted by name), then files.

| Column | Source (directory / file) | Notes |
|---|---|---|
| Name | `▸ <dir.name>` / `· <basename(file.path)>` | `▸` folder, dim `·` file (no emojis); in search mode the file's full path is shown |
| Grade | `gradeLetter` | A/B green, C yellow, D/E/F red |
| Issues | `totalIssues` | Abbreviated (`formatCount`, e.g. `1.2k`) |
| Complexity | `complexity` | Highest file complexity under the path (hotspots); files show the file value |
| Duplication | `numberOfClones` | Number of cloned code blocks (matches Codacy's UI, not duplicated lines) |
| Coverage | `coverageWithDecimals` | e.g. `76.3%` |

Missing metrics render as a dim `-`. Only the Grade letter is colored (directory/file items carry no goal thresholds). No pagination warning (all pages fetched). Empty result prints "Nothing found at …".

JSON output: `{ path, directories: [...], files: [...] }`, each item projected via `pickDeep`.

## Tests

File: `src/commands/ls.test.ts` — 14 tests. Shared helpers (path/sort/direction resolution, fetch-all) covered in `src/utils/repo-tree.test.ts`.
