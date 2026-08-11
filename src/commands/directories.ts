import { Command } from "commander";
import ora from "ora";
import ansis from "ansis";
import pluralize from "pluralize";
import { repositoryTokenOption, resolveAccountAuth } from "../utils/auth";
import { handleError } from "../utils/error";
import { createTable, getOutputFormat, printJson } from "../utils/output";
import { sanitizeText } from "../utils/sanitize";
import { resolveRepoArgs } from "../utils/resolve-repo-args";
import {
  fetchAllDirectories,
  mapWithConcurrency,
  resolveListingPath,
  resolveSort,
  resolveDirection,
  SORT_FIELDS,
} from "../utils/repo-tree";
import {
  FOLDER_GLYPH,
  CHILD_CONNECTOR,
  TABLE_HEAD,
  displayPath,
  metricCells,
  projectDir,
} from "./tree-view";
import { DirectoryWithAnalysisInfo } from "../api/client/models/DirectoryWithAnalysisInfo";

// Cap on concurrent children fetches (--plus-children) so a directory with many
// sub-folders doesn't flood the API with unbounded parallel requests.
const CHILDREN_CONCURRENCY = 10;

// A directory optionally carrying its immediate sub-directories (--plus-children).
interface DirectoryNode extends DirectoryWithAnalysisInfo {
  children?: DirectoryWithAnalysisInfo[];
}

interface DirOptions {
  path?: string;
  branch?: string;
  plusChildren?: boolean;
  sort?: string;
  direction?: string;
}

interface DirContext {
  provider: string;
  organization: string;
  repository: string;
  targetPath: string;
  branch?: string;
  sort?: string;
  direction?: string;
  useServerSort: boolean;
  plusChildren: boolean;
}

function resolveDirContext(
  providerArg: string | undefined,
  organizationArg: string | undefined,
  repositoryArg: string | undefined,
  options: DirOptions,
): DirContext {
  const autoDetected = !(providerArg && organizationArg && repositoryArg);
  const { provider, organization, repository } = resolveRepoArgs(
    [providerArg, organizationArg, repositoryArg],
    0,
    "directories",
    [],
  );
  return {
    provider,
    organization,
    repository,
    targetPath: resolveListingPath(options.path, autoDetected),
    branch: options.branch,
    sort: resolveSort(options.sort, "directory"),
    direction: resolveDirection(options.direction),
    useServerSort: options.sort !== undefined || options.direction !== undefined,
    plusChildren: !!options.plusChildren,
  };
}

/**
 * Fetch the directories at the path (all pages), and — with --plus-children —
 * each one's immediate sub-directories (bounded concurrency). Ordering is by
 * name unless a server-side sort was requested.
 */
async function fetchDirTree(ctx: DirContext): Promise<DirectoryNode[]> {
  const sortByName = (arr: DirectoryWithAnalysisInfo[]) => {
    if (!ctx.useServerSort) arr.sort((a, b) => a.name.localeCompare(b.name));
  };

  const dirs: DirectoryNode[] = await fetchAllDirectories(
    ctx.provider,
    ctx.organization,
    ctx.repository,
    ctx.branch,
    ctx.targetPath,
    ctx.sort,
    ctx.direction,
  );
  sortByName(dirs);

  if (ctx.plusChildren) {
    await mapWithConcurrency(dirs, CHILDREN_CONCURRENCY, async (d) => {
      const children = await fetchAllDirectories(
        ctx.provider,
        ctx.organization,
        ctx.repository,
        ctx.branch,
        d.path,
        ctx.sort,
        ctx.direction,
      );
      sortByName(children);
      d.children = children;
    });
  }
  return dirs;
}

function dirJson(ctx: DirContext, dirs: DirectoryNode[]): Record<string, unknown> {
  return {
    path: ctx.targetPath,
    directories: dirs.map((d) => {
      const projected = projectDir(d);
      if (d.children) projected.children = d.children.map(projectDir);
      return projected;
    }),
  };
}

function dirHeader(ctx: DirContext, dirs: DirectoryNode[]): string {
  let header =
    `${displayPath(ctx.repository, ctx.targetPath)} — ` +
    `${dirs.length} ${pluralize("directory", dirs.length)}`;
  if (ctx.plusChildren) {
    const subdirs = dirs.reduce((n, d) => n + (d.children?.length ?? 0), 0);
    header += `, ${subdirs} ${pluralize("subdirectory", subdirs)}`;
  }
  return header;
}

function renderDir(ctx: DirContext, dirs: DirectoryNode[]): void {
  if (dirs.length === 0) {
    console.log(
      ansis.dim(
        `\nNo directories found at ${displayPath(ctx.repository, ctx.targetPath)}.`,
      ),
    );
    return;
  }
  console.log(ansis.bold(`\n${dirHeader(ctx, dirs)}\n`));
  const table = createTable({ head: TABLE_HEAD });
  for (const d of dirs) {
    table.push([`${FOLDER_GLYPH} ${sanitizeText(d.name)}`, ...metricCells(d)]);
    for (const child of d.children ?? []) {
      table.push([
        `${ansis.dim(CHILD_CONNECTOR)}${sanitizeText(child.name)}`,
        ...metricCells(child),
      ]);
    }
  }
  console.log(table.toString());
}

export function registerDirectoriesCommand(program: Command) {
  program
    .command("directories")
    .alias("dirs")
    .description(
      "List directories at a path in a repository, with quality metrics",
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
      "-c, --plus-children",
      "also list each directory's immediate sub-directories",
    )
    .option("-S, --sort <field>", `sort by one of: ${SORT_FIELDS.join(", ")}`)
    .option(
      "-d, --direction <direction>",
      "sort direction: asc (ascending) or desc (descending)",
    )
    .addOption(repositoryTokenOption())
    .addHelpText(
      "after",
      `
Examples:
  $ codacy directories                             list the current directory's folders (auto-detected)
  $ codacy directories --plus-children             also show one more level of sub-folders
  $ codacy directories --path src/website
  $ codacy directories --sort issues --direction desc
  $ codacy directories gh my-org my-repo --plus-children
  $ codacy dirs --output json`,
    )
    .action(async function (
      this: Command,
      providerArg: string | undefined,
      organizationArg: string | undefined,
      repositoryArg: string | undefined,
      options: DirOptions,
    ) {
      try {
        resolveAccountAuth(this, "Codacy does not accept repository tokens on the directory listing endpoints");
        const format = getOutputFormat(this);
        const ctx = resolveDirContext(
          providerArg,
          organizationArg,
          repositoryArg,
          options,
        );

        const spinner = ora(
          `Listing directories in ${displayPath(ctx.repository, ctx.targetPath)}...`,
        ).start();
        const dirs = await fetchDirTree(ctx);
        spinner.stop();

        if (format === "json") {
          printJson(dirJson(ctx, dirs));
          return;
        }
        renderDir(ctx, dirs);
      } catch (err) {
        handleError(err);
      }
    });
}
