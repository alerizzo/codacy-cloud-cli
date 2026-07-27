import { Command } from "commander";
import ora from "ora";
import ansis from "ansis";
import pluralize from "pluralize";
import { checkApiToken } from "../utils/auth";
import { handleError } from "../utils/error";
import { createTable, getOutputFormat, printJson } from "../utils/output";
import { sanitizeText } from "../utils/sanitize";
import {
  fetchAllDirectories,
  fetchAllFiles,
  resolveListingPath,
  resolveSort,
  resolveDirection,
  SORT_FIELDS,
} from "../utils/repo-tree";
import { resolveRepoArgs } from "../utils/resolve-repo-args";
import {
  FOLDER_GLYPH,
  FILE_GLYPH,
  TABLE_HEAD,
  basename,
  displayPath,
  metricCells,
  projectDir,
  projectFile,
} from "./tree-view";
import { DirectoryWithAnalysisInfo } from "../api/client/models/DirectoryWithAnalysisInfo";
import { FileWithAnalysisInfo } from "../api/client/models/FileWithAnalysisInfo";

interface LsOptions {
  path?: string;
  branch?: string;
  search?: string;
  sort?: string;
  direction?: string;
}

interface LsContext {
  provider: string;
  organization: string;
  repository: string;
  targetPath: string;
  branch?: string;
  dirSort?: string;
  fileSort?: string;
  direction?: string;
  useServerSort: boolean;
  searching: boolean;
  searchTerm?: string;
  searchValue?: string;
}

/** Resolve repo, path, sort/direction, and search from the args + options. */
function resolveLsContext(
  providerArg: string | undefined,
  organizationArg: string | undefined,
  repositoryArg: string | undefined,
  options: LsOptions,
): LsContext {
  // When the repo is auto-detected (not all three positionals given), the path
  // defaults to the current working directory; when explicit, no cwd inference.
  const autoDetected = !(providerArg && organizationArg && repositoryArg);
  const { provider, organization, repository } = resolveRepoArgs(
    [providerArg, organizationArg, repositoryArg],
    0,
    "ls",
    [],
  );
  const targetPath = resolveListingPath(options.path, autoDetected);
  const searching = !!options.search;
  // Search folds the folder scope into the term (`<path>/%<term>`) so matches
  // are found at any depth; `path` is not sent (see fetchLsEntries).
  const searchValue = searching
    ? targetPath
      ? `${targetPath}/%${options.search}`
      : options.search
    : undefined;
  return {
    provider,
    organization,
    repository,
    targetPath,
    branch: options.branch,
    dirSort: resolveSort(options.sort, "directory"),
    fileSort: resolveSort(options.sort, "file"),
    direction: resolveDirection(options.direction),
    useServerSort: options.sort !== undefined || options.direction !== undefined,
    searching,
    searchTerm: options.search,
    searchValue,
  };
}

/** The file label: full path in search mode (results span folders), else basename. */
function fileLabel(ctx: LsContext, filePath: string): string {
  return ctx.searching ? filePath : basename(filePath);
}

/**
 * Fetch every page of directories and files (no pagination warning, by design).
 * Directories are skipped in search mode (only the files endpoint supports
 * search) and the two lists are ordered independently — never merged.
 */
async function fetchLsEntries(ctx: LsContext): Promise<{
  dirs: DirectoryWithAnalysisInfo[];
  files: FileWithAnalysisInfo[];
}> {
  const [dirs, files] = await Promise.all([
    ctx.searching
      ? Promise.resolve<DirectoryWithAnalysisInfo[]>([])
      : fetchAllDirectories(
          ctx.provider,
          ctx.organization,
          ctx.repository,
          ctx.branch,
          ctx.targetPath,
          ctx.dirSort,
          ctx.direction,
        ),
    fetchAllFiles(
      ctx.provider,
      ctx.organization,
      ctx.repository,
      ctx.branch,
      ctx.searching ? undefined : ctx.targetPath,
      ctx.searchValue,
      ctx.fileSort,
      ctx.direction,
    ),
  ]);
  // With no explicit --sort/--direction, order deterministically by name.
  if (!ctx.useServerSort) {
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) =>
      fileLabel(ctx, a.path).localeCompare(fileLabel(ctx, b.path)),
    );
  }
  return { dirs, files };
}

function lsJson(
  ctx: LsContext,
  dirs: DirectoryWithAnalysisInfo[],
  files: FileWithAnalysisInfo[],
): Record<string, unknown> {
  return {
    path: ctx.targetPath,
    directories: dirs.map(projectDir),
    files: files.map(projectFile),
  };
}

function lsHeader(
  ctx: LsContext,
  dirCount: number,
  fileCount: number,
): string {
  const where = displayPath(ctx.repository, ctx.targetPath);
  if (ctx.searching) {
    return `${where} — ${fileCount} ${pluralize("file", fileCount)} matching "${ctx.searchTerm}"`;
  }
  return (
    `${where} — ${dirCount} ${pluralize("directory", dirCount)}, ` +
    `${fileCount} ${pluralize("file", fileCount)}`
  );
}

function renderLs(
  ctx: LsContext,
  dirs: DirectoryWithAnalysisInfo[],
  files: FileWithAnalysisInfo[],
): void {
  if (dirs.length === 0 && files.length === 0) {
    const where = displayPath(ctx.repository, ctx.targetPath);
    console.log(
      ansis.dim(
        ctx.searching
          ? `\nNo files matching "${ctx.searchTerm}" under ${where}.`
          : `\nNothing found at ${where}.`,
      ),
    );
    return;
  }
  console.log(ansis.bold(`\n${lsHeader(ctx, dirs.length, files.length)}\n`));
  const table = createTable({ head: TABLE_HEAD });
  for (const d of dirs) {
    table.push([`${FOLDER_GLYPH} ${sanitizeText(d.name)}`, ...metricCells(d)]);
  }
  for (const f of files) {
    table.push([
      `${ansis.dim(FILE_GLYPH)} ${sanitizeText(fileLabel(ctx, f.path))}`,
      ...metricCells(f),
    ]);
  }
  console.log(table.toString());
}

export function registerLsCommand(program: Command) {
  program
    .command("ls")
    .description(
      "List directories and files at a path in a repository, with quality metrics",
    )
    .argument(
      "[provider]",
      "git provider (gh, gl, or bb) — auto-detected from git remote if omitted",
    )
    .argument("[organization]", "organization name")
    .argument("[repository]", "repository name")
    .option(
      "-p, --path <path>",
      "repository-relative folder to list (defaults to the current directory relative to the repo root)",
    )
    .option("-b, --branch <branch>", "branch name (defaults to the main branch)")
    .option(
      "-s, --search <term>",
      "search files (at any depth) under the path, instead of listing immediate children",
    )
    .option("-S, --sort <field>", `sort by one of: ${SORT_FIELDS.join(", ")}`)
    .option(
      "-d, --direction <direction>",
      "sort direction: asc (ascending) or desc (descending)",
    )
    .addHelpText(
      "after",
      `
Examples:
  $ codacy ls                                      list the current directory (auto-detected)
  $ codacy ls --path src/website                   list a specific folder
  $ codacy ls gh my-org my-repo                    list the root of an explicit repository
  $ codacy ls gh my-org my-repo --path src/website
  $ codacy ls --sort issues --direction desc       worst files/folders first
  $ codacy ls --path app/client --search config    find files matching "config" under app/client
  $ codacy ls --output json`,
    )
    .action(async function (
      this: Command,
      providerArg: string | undefined,
      organizationArg: string | undefined,
      repositoryArg: string | undefined,
      options: LsOptions,
    ) {
      try {
        checkApiToken();
        const format = getOutputFormat(this);
        const ctx = resolveLsContext(
          providerArg,
          organizationArg,
          repositoryArg,
          options,
        );

        const where = displayPath(ctx.repository, ctx.targetPath);
        const spinner = ora(
          ctx.searching
            ? `Searching "${ctx.searchTerm}" under ${where}...`
            : `Listing ${where}...`,
        ).start();
        const { dirs, files } = await fetchLsEntries(ctx);
        spinner.stop();

        if (format === "json") {
          printJson(lsJson(ctx, dirs, files));
          return;
        }
        renderLs(ctx, dirs, files);
      } catch (err) {
        handleError(err);
      }
    });
}
