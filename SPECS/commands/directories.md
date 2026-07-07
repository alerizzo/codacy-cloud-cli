# `directories` Command Spec

**Status:** ✅ Done (2026-07-07)

## Purpose

List the immediate directories at a path in a repository, each with quality metrics — like `ls` but folders only. With `--plus-children`, also lists each directory's immediate sub-directories (one extra level) so you can see a bigger picture of the folder structure and its metrics.

## Usage

```
codacy directories                             # current directory's folders (auto-detected)
codacy directories --plus-children             # also one more level of sub-folders
codacy directories --path src/website
codacy directories --sort issues --direction desc
codacy directories gh my-org my-repo --plus-children
codacy dirs --output json
```

## API Endpoints

- [`listDirectories`](https://api.codacy.com/api/api-docs#listdirectories) — `RepositoryService.listDirectories(provider, org, repo, branch, path, sort, direction, cursor, limit)`

Cursor-paginated; **all pages are fetched** (`fetchAllDirectories` in `utils/repo-tree.ts`) with no pagination warning. `--plus-children` issues one additional (fully paginated) `listDirectories` call per directory, concurrently, listing that directory's `path`.

## Options

| Option | Short | Description |
|---|---|---|
| `--path <path>` | `-p` | Repository-relative folder to list (defaults to the cwd relative to the repo root) |
| `--branch <branch>` | `-b` | Branch name (defaults to the main branch) |
| `--plus-children` | `-c` | Also list each directory's immediate sub-directories |
| `--sort <field>` | `-S` | Sort by `name`, `issues`, `grade`, `duplication`, `complexity`, or `coverage` |
| `--direction <direction>` | `-d` | `asc`/`ascending` or `desc`/`descending` |

`--sort`/`--direction`, when given, are applied server-side to both the top-level listing and each `--plus-children` listing; otherwise directories are ordered by name.

## Output

Bold header `/<repo>/<path> — N directories` (with `--plus-children`, also `, M subdirectories` — the total children across all directories), then a columnar table (same columns as `ls`). Parent rows are prefixed `▸ <name>`; with `--plus-children`, each child is rendered on its own indented row `    └─ <name>` under its parent.

| Column | Source | Notes |
|---|---|---|
| Name | `▸ <name>` / `    └─ <name>` | `▸` parent folder, `└─` child connector |
| Grade | `gradeLetter` | A/B green, C yellow, D/E/F red |
| Issues | `totalIssues` | Abbreviated (`formatCount`) |
| Complexity | `complexity` | Highest file complexity under the path (hotspots) |
| Duplication | `numberOfClones` | Number of cloned code blocks (matches Codacy's UI) |
| Coverage | `coverageWithDecimals` | e.g. `76.3%` |

Missing metrics render as a dim `-`. Only the Grade letter is colored. No pagination warning. Empty result prints "No directories found at …".

JSON output: `{ path, directories: [ { …, children?: [...] } ] }`, each item projected via `pickDeep`; `children` present only with `--plus-children`.

## Tests

File: `src/commands/directories.test.ts` — 8 tests. Shared helpers covered in `src/utils/repo-tree.test.ts`.
