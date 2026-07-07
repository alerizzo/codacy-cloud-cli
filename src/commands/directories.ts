import { Command } from "commander";
import ora from "ora";
import ansis from "ansis";
import pluralize from "pluralize";
import { checkApiToken } from "../utils/auth";
import { handleError } from "../utils/error";
import {
  createTable,
  getOutputFormat,
  pickDeep,
  printJson,
} from "../utils/output";
import {
  formatGrade,
  formatCountCell,
  formatCoverageCell,
} from "../utils/formatting";
import { resolveRepoArgs } from "../utils/resolve-repo-args";
import {
  fetchAllDirectories,
  resolveListingPath,
  resolveSort,
  resolveDirection,
  SORT_FIELDS,
} from "../utils/repo-tree";
import { DirectoryWithAnalysisInfo } from "../api/client/models/DirectoryWithAnalysisInfo";

// Leading marker for a directory row (see ls.ts for the rationale); children
// listed via --plus-children are indented under their parent with a tree
// connector instead of the glyph.
const FOLDER_GLYPH = "▸";
const CHILD_CONNECTOR = "    └─ ";

const TABLE_HEAD = [
  "Name",
  "Grade",
  "Issues",
  "Complexity",
  "Duplication",
  "Coverage",
];

// A directory optionally carrying its immediate sub-directories (--plus-children).
interface DirectoryNode extends DirectoryWithAnalysisInfo {
  children?: DirectoryWithAnalysisInfo[];
}

/** Display path shown in the header, e.g. "/my-repo/src/website". */
function displayPath(repository: string, targetPath: string): string {
  return "/" + [repository, targetPath].filter(Boolean).join("/");
}

const DIR_JSON_FIELDS = [
  "path",
  "name",
  "gradeLetter",
  "totalIssues",
  "complexity",
  "numberOfClones",
  "coverageWithDecimals",
  "nrFiles",
];

/** Metric cells shared by parent and child directory rows. */
function directoryMetricCells(d: DirectoryWithAnalysisInfo): string[] {
  return [
    formatGrade(d.gradeLetter),
    formatCountCell(d.totalIssues),
    // Complexity = highest file complexity under the folder (hotspots),
    // Duplication = number of cloned blocks — matching Codacy's UI.
    formatCountCell(d.complexity),
    formatCountCell(d.numberOfClones),
    formatCoverageCell(d.coverageWithDecimals),
  ];
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
    .option(
      "-S, --sort <field>",
      `sort by one of: ${SORT_FIELDS.join(", ")}`,
    )
    .option(
      "-d, --direction <direction>",
      "sort direction: asc (ascending) or desc (descending)",
    )
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
      options: {
        path?: string;
        branch?: string;
        plusChildren?: boolean;
        sort?: string;
        direction?: string;
      },
    ) {
      try {
        checkApiToken();
        const format = getOutputFormat(this);

        const autoDetected = !(providerArg && organizationArg && repositoryArg);
        const { provider, organization, repository } = resolveRepoArgs(
          [providerArg, organizationArg, repositoryArg],
          0,
          "directories",
          [],
        );
        const targetPath = resolveListingPath(options.path, autoDetected);

        // Sorting/direction, when requested, are applied server-side to both the
        // top-level listing and each children listing; otherwise order by name.
        const sort = resolveSort(options.sort, "directory");
        const direction = resolveDirection(options.direction);
        const useServerSort =
          options.sort !== undefined || options.direction !== undefined;
        const sortByName = (arr: DirectoryWithAnalysisInfo[]) => {
          if (!useServerSort) arr.sort((a, b) => a.name.localeCompare(b.name));
        };

        const spinner = ora(
          `Listing directories in ${displayPath(repository, targetPath)}...`,
        ).start();

        const dirs: DirectoryNode[] = await fetchAllDirectories(
          provider,
          organization,
          repository,
          options.branch,
          targetPath,
          sort,
          direction,
        );
        sortByName(dirs);

        // --plus-children: pull each folder's immediate sub-folders (one extra
        // level), concurrently. Each of these is itself fully paginated.
        if (options.plusChildren) {
          spinner.text = "Fetching sub-directories...";
          await Promise.all(
            dirs.map(async (d) => {
              const children = await fetchAllDirectories(
                provider,
                organization,
                repository,
                options.branch,
                d.path,
                sort,
                direction,
              );
              sortByName(children);
              d.children = children;
            }),
          );
        }

        spinner.stop();

        if (format === "json") {
          printJson({
            path: targetPath,
            directories: dirs.map((d) => {
              const projected = pickDeep(d, DIR_JSON_FIELDS);
              if (d.children) {
                projected.children = d.children.map((c) =>
                  pickDeep(c, DIR_JSON_FIELDS),
                );
              }
              return projected;
            }),
          });
          return;
        }

        if (dirs.length === 0) {
          console.log(
            ansis.dim(
              `\nNo directories found at ${displayPath(repository, targetPath)}.`,
            ),
          );
          return;
        }

        let header =
          `${displayPath(repository, targetPath)} — ` +
          `${dirs.length} ${pluralize("directory", dirs.length)}`;
        if (options.plusChildren) {
          const subdirs = dirs.reduce(
            (n, d) => n + (d.children?.length ?? 0),
            0,
          );
          header += `, ${subdirs} ${pluralize("subdirectory", subdirs)}`;
        }
        console.log(ansis.bold(`\n${header}\n`));

        const table = createTable({ head: TABLE_HEAD });

        for (const d of dirs) {
          table.push([`${FOLDER_GLYPH} ${d.name}`, ...directoryMetricCells(d)]);
          for (const child of d.children ?? []) {
            table.push([
              `${ansis.dim(CHILD_CONNECTOR)}${child.name}`,
              ...directoryMetricCells(child),
            ]);
          }
        }

        console.log(table.toString());
      } catch (err) {
        handleError(err);
      }
    });
}
