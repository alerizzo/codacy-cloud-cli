import { Command } from "commander";
import ora from "ora";
import ansis from "ansis";
import { checkApiToken } from "../utils/auth";
import { handleError } from "../utils/error";
import { resolveRepoArgs } from "../utils/resolve-repo-args";
import {
  createTable,
  formatFriendlyDate,
  getOutputFormat,
  pickDeep,
  printJson,
  printPaginationWarning,
} from "../utils/output";
import {
  printSection,
  truncate,
  buildGateStatus,
  formatStandards,
  formatDelta,
  formatPrCoverage,
  formatPrIssues,
} from "../utils/formatting";
import { sanitizeText } from "../utils/sanitize";
import { AnalysisService } from "../api/client/services/AnalysisService";
import { PullRequestWithAnalysis } from "../api/client/models/PullRequestWithAnalysis";

function printPullRequestsList(pullRequests: PullRequestWithAnalysis[]): void {
  const table = createTable({
    head: [
      "#",
      "Title",
      "Branch",
      ansis.dim("✓"),
      "Issues",
      "Coverage",
      "Complexity",
      "Duplication",
      "Updated",
    ],
  });
  for (const pr of pullRequests) {
    const gates = buildGateStatus(pr);
    table.push([
      String(pr.pullRequest.number),
      truncate(sanitizeText(pr.pullRequest.title), 40),
      truncate(sanitizeText(pr.pullRequest.targetBranch) || "N/A", 20),
      formatStandards(pr),
      formatPrIssues(pr, gates.issues),
      formatPrCoverage(pr, gates.coverage),
      formatDelta(pr.deltaComplexity, gates.complexity),
      formatDelta(pr.deltaClonesCount, gates.duplication),
      formatFriendlyDate(pr.pullRequest.updated),
    ]);
  }
  console.log(table.toString());
}

export function registerPullRequestsCommand(program: Command) {
  program
    .command("pull-requests")
    .alias("prs")
    .description("List pull requests for a repository, with analysis data")
    .argument(
      "[provider]",
      "git provider (gh, gl, or bb) — auto-detected from git remote if omitted",
    )
    .argument("[organization]", "organization name")
    .argument("[repository]", "repository name")
    .option(
      "-q, --search-text <text>",
      "filter by free-text search matched against the PR title or author handle",
    )
    .option("-b, --branch <name>", "filter by target branch name")
    .option(
      "-n, --limit <n>",
      "maximum number of pull requests to return (default: 100, max: 1000)",
      "100",
    )
    .addHelpText(
      "after",
      `
Examples:
  $ codacy pull-requests                                    # auto-detect from git remote
  $ codacy pull-requests gh my-org my-repo
  $ codacy pull-requests gh my-org my-repo --search-text "fix flaky"
  $ codacy pull-requests gh my-org my-repo --branch main
  $ codacy pull-requests gh my-org my-repo --output json`,
    )
    .action(async function (
      this: Command,
      providerArg?: string,
      organizationArg?: string,
      repositoryArg?: string,
    ) {
      try {
        checkApiToken();

        const { provider, organization, repository } = resolveRepoArgs(
          [providerArg, organizationArg, repositoryArg],
          0,
          "pull-requests",
          [],
        );

        const format = getOutputFormat(this);
        const opts = this.opts();
        const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 100, 1), 1000);

        const spinner = ora("Fetching pull requests...").start();

        const pageSize = Math.min(limit, 100);
        let items: PullRequestWithAnalysis[] = [];
        let cursor: string | undefined;
        let total: number | undefined;

        do {
          const response = await AnalysisService.listRepositoryPullRequests(
            provider,
            organization,
            repository,
            pageSize,
            cursor,
            undefined, // search (merged/last-updated classification) — not exposed by this command
            opts.searchText,
            opts.branch,
          );
          items = items.concat(response.data);
          total ??= response.pagination?.total;
          cursor = response.pagination?.cursor;
        } while (cursor && items.length < limit);

        // Trim to exact limit
        if (items.length > limit) items = items.slice(0, limit);
        total ??= items.length;
        spinner.stop();

        if (format === "json") {
          printJson({
            pullRequests: items.map((pr: any) => pickDeep(pr, [
              "isUpToStandards",
              "isAnalysing",
              "pullRequest.number",
              "pullRequest.title",
              "pullRequest.status",
              "pullRequest.originBranch",
              "pullRequest.targetBranch",
              "pullRequest.updated",
              "pullRequest.owner.name",
              "newIssues",
              "fixedIssues",
              "deltaComplexity",
              "deltaClonesCount",
              "coverage.deltaCoverage",
              "coverage.diffCoverage",
            ])),
            total,
          });
          return;
        }

        printSection("Pull Requests", total, "pull request");
        if (items.length === 0) {
          console.log(ansis.dim("  No pull requests found."));
          return;
        }

        printPullRequestsList(items);

        if (total > items.length) {
          printPaginationWarning(
            { cursor: "more", limit: items.length },
            "Use --limit <n> (max 1000) to fetch more, or --search-text, --branch to filter.",
          );
        }
      } catch (err) {
        handleError(err);
      }
    });
}
