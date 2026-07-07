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
  fetchAllFiles,
  resolveListingPath,
  resolveSort,
  resolveDirection,
  SORT_FIELDS,
} from "../utils/repo-tree";

// Leading row markers (no emojis, for terminal safety — same Unicode family as
// the ⊙ used by the repositories command): ▸ folder, dim · file.
const FOLDER_GLYPH = "▸";
const FILE_GLYPH = "·";

const TABLE_HEAD = [
  "Name",
  "Grade",
  "Issues",
  "Complexity",
  "Duplication",
  "Coverage",
];

/** Last path segment of a repository-relative file path. */
function basename(filePath: string): string {
  const segments = filePath.split("/");
  return segments[segments.length - 1] || filePath;
}

/** Display path shown in the header, e.g. "/my-repo/src/website". */
function displayPath(repository: string, targetPath: string): string {
  return "/" + [repository, targetPath].filter(Boolean).join("/");
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
      options: {
        path?: string;
        branch?: string;
        search?: string;
        sort?: string;
        direction?: string;
      },
    ) {
      try {
        checkApiToken();
        const format = getOutputFormat(this);

        // When the repo is auto-detected (not all three positionals given), the
        // path defaults to the current working directory; when it's explicit,
        // no cwd inference is made.
        const autoDetected = !(providerArg && organizationArg && repositoryArg);
        const { provider, organization, repository } = resolveRepoArgs(
          [providerArg, organizationArg, repositoryArg],
          0,
          "ls",
          [],
        );
        const targetPath = resolveListingPath(options.path, autoDetected);

        // Sorting/direction, when requested, are applied server-side (order is
        // preserved across pages). Directories and files are sorted and listed
        // independently — never merged — so the type grouping stays intact.
        const direction = resolveDirection(options.direction);
        const dirSort = resolveSort(options.sort, "directory");
        const fileSort = resolveSort(options.sort, "file");
        const useServerSort =
          options.sort !== undefined || options.direction !== undefined;

        // Search mode (files only): the folder scope is folded into the search
        // term (`<path>/%<term>`) so matches are found at any depth, and `path`
        // is NOT sent (which would restrict to immediate children).
        const searching = !!options.search;
        const searchValue = searching
          ? targetPath
            ? `${targetPath}/%${options.search}`
            : options.search
          : undefined;

        const spinner = ora(
          searching
            ? `Searching "${options.search}" under ${displayPath(repository, targetPath)}...`
            : `Listing ${displayPath(repository, targetPath)}...`,
        ).start();

        // Both endpoints are cursor-paginated; fetch every page so the listing
        // is complete (no pagination warning, by design). Directories are
        // skipped in search mode (the files endpoint alone supports search).
        const [dirs, files] = await Promise.all([
          searching
            ? Promise.resolve([])
            : fetchAllDirectories(
                provider,
                organization,
                repository,
                options.branch,
                targetPath,
                dirSort,
                direction,
              ),
          fetchAllFiles(
            provider,
            organization,
            repository,
            options.branch,
            searching ? undefined : targetPath,
            searchValue,
            fileSort,
            direction,
          ),
        ]);

        spinner.stop();

        // Search results span multiple folders, so show each file's full
        // repository-relative path; a plain listing shows just the basename.
        const fileLabel = (filePath: string): string =>
          searching ? filePath : basename(filePath);

        // With no explicit --sort/--direction, order deterministically by name;
        // otherwise trust the server-side ordering.
        if (!useServerSort) {
          dirs.sort((a, b) => a.name.localeCompare(b.name));
          files.sort((a, b) => fileLabel(a.path).localeCompare(fileLabel(b.path)));
        }

        if (format === "json") {
          printJson({
            path: targetPath,
            directories: dirs.map((d) =>
              pickDeep(d, [
                "path",
                "name",
                "gradeLetter",
                "totalIssues",
                "complexity",
                "numberOfClones",
                "coverageWithDecimals",
                "nrFiles",
              ]),
            ),
            files: files.map((f) =>
              pickDeep(f, [
                "path",
                "gradeLetter",
                "totalIssues",
                "complexity",
                "numberOfClones",
                "coverageWithDecimals",
              ]),
            ),
          });
          return;
        }

        if (dirs.length === 0 && files.length === 0) {
          console.log(
            ansis.dim(
              searching
                ? `\nNo files matching "${options.search}" under ${displayPath(repository, targetPath)}.`
                : `\nNothing found at ${displayPath(repository, targetPath)}.`,
            ),
          );
          return;
        }

        const header = searching
          ? `${displayPath(repository, targetPath)} — ` +
            `${files.length} ${pluralize("file", files.length)} matching "${options.search}"`
          : `${displayPath(repository, targetPath)} — ` +
            `${dirs.length} ${pluralize("directory", dirs.length)}, ` +
            `${files.length} ${pluralize("file", files.length)}`;
        console.log(ansis.bold(`\n${header}\n`));

        const table = createTable({ head: TABLE_HEAD });

        for (const d of dirs) {
          table.push([
            `${FOLDER_GLYPH} ${d.name}`,
            formatGrade(d.gradeLetter),
            formatCountCell(d.totalIssues),
            // Complexity = highest file complexity under the folder (hotspots),
            // Duplication = number of cloned blocks — matching Codacy's UI.
            formatCountCell(d.complexity),
            formatCountCell(d.numberOfClones),
            formatCoverageCell(d.coverageWithDecimals),
          ]);
        }

        for (const f of files) {
          table.push([
            `${ansis.dim(FILE_GLYPH)} ${fileLabel(f.path)}`,
            formatGrade(f.gradeLetter),
            formatCountCell(f.totalIssues),
            formatCountCell(f.complexity),
            formatCountCell(f.numberOfClones),
            formatCoverageCell(f.coverageWithDecimals),
          ]);
        }

        console.log(table.toString());
      } catch (err) {
        handleError(err);
      }
    });
}
