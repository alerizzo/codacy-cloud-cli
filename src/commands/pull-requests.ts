import { Command } from "commander";
import ora from "ora";
import ansis from "ansis";
import { repositoryTokenOption, resolveAccountAuth } from "../utils/auth";
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
  hasAnyPrCoverage,
  prQualityMetric,
} from "../utils/formatting";
import { sanitizeText } from "../utils/sanitize";
import { AnalysisService } from "../api/client/services/AnalysisService";
import { PullRequestWithAnalysis } from "../api/client/models/PullRequestWithAnalysis";

function printPullRequestsList(pullRequests: PullRequestWithAnalysis[]): void {
  // A repo with no coverage set up returns no coverage numbers on any PR —
  // drop the column instead of rendering it entirely empty.
  const showCoverage = hasAnyPrCoverage(pullRequests);
  const table = createTable({
    head: [
      ansis.dim("✓"),
      "#",
      "Title",
      "Branches",
      // Metric order matches the `repositories` command.
      "Issues",
      "Complexity",
      "Duplication",
      ...(showCoverage ? ["Coverage"] : []),
      "Updated",
    ],
  });
  for (const pr of pullRequests) {
    const gates = buildGateStatus(pr);
    const origin = sanitizeText(pr.pullRequest.originBranch) || "-";
    const target = sanitizeText(pr.pullRequest.targetBranch) || "-";
    table.push([
      formatStandards(pr),
      String(pr.pullRequest.number),
      truncate(sanitizeText(pr.pullRequest.title), 40),
      truncate(`${origin} → ${target}`, 30),
      formatPrIssues(pr, gates.issues),
      formatDelta(prQualityMetric(pr, "deltaComplexity"), gates.complexity),
      formatDelta(prQualityMetric(pr, "deltaClonesCount"), gates.duplication),
      ...(showCoverage ? [formatPrCoverage(pr, gates.coverage)] : []),
      formatFriendlyDate(pr.pullRequest.updated),
    ]);
  }
  console.log(table.toString());
}

async function fetchPullRequests(
  provider: string,
  organization: string,
  repository: string,
  limit: number,
  search: string,
  textQuery?: string,
  targetBranch?: string,
): Promise<{ items: PullRequestWithAnalysis[]; total: number; hasMore: boolean }> {
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
      search,
      textQuery,
      targetBranch,
    );
    items = items.concat(response.data);
    total ??= response.pagination?.total;
    cursor = response.pagination?.cursor;
  } while (cursor && items.length < limit);

  // A cursor can still be set even once `total` (when the API omits it and we
  // fall back to `items.length`) makes the naive `total > items.length` check
  // false — that's how a trailing page silently went unreported before.
  const hasMore = Boolean(cursor);
  if (items.length > limit) items = items.slice(0, limit);
  total ??= items.length;

  return { items, total, hasMore };
}

function printPullRequestsJson(
  items: PullRequestWithAnalysis[],
  total: number,
): void {
  printJson({
    pullRequests: items.map((pr: any) => pickDeep(pr, [
      "isUpToStandards",
      "isAnalysing",
      "pullRequest.number",
      "pullRequest.title",
      "pullRequest.originBranch",
      "pullRequest.targetBranch",
      "pullRequest.updated",
      "newIssues",
      "fixedIssues",
      "deltaComplexity",
      "deltaClonesCount",
      "coverage.deltaCoverage",
      "coverage.diffCoverage",
      "coverage.isUpToStandards",
      // `quality.*` mirrors of the flat metric fields: the API omits some of
      // the top-level ones (notably `deltaComplexity`), and these are what the
      // table actually renders.
      "quality.newIssues",
      "quality.fixedIssues",
      "quality.deltaComplexity",
      "quality.deltaClonesCount",
      "quality.isUpToStandards",
      // resultReasons drive the per-metric gate coloring in the table output —
      // include them so JSON consumers can tell which gates passed or failed.
      "quality.resultReasons",
      "coverage.resultReasons",
    ])),
    total,
  });
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
      "-q, --search <text>",
      "filter by free-text search matched against the PR title or author handle",
    )
    .option("-B, --base <name>", "filter by target (base) branch name")
    .option(
      "-S, --state <state>",
      "filter by PR state (open|closed)",
      "open",
    )
    .option(
      "-n, --limit <n>",
      "maximum number of pull requests to return (default: 100, max: 1000)",
      "100",
    )
    .addOption(repositoryTokenOption())
    .addHelpText(
      "after",
      `
Examples:
  $ codacy pull-requests                                    # auto-detect from git remote
  $ codacy pull-requests gh my-org my-repo
  $ codacy pull-requests gh my-org my-repo --search "fix flaky"
  $ codacy pull-requests gh my-org my-repo --base main
  $ codacy pull-requests gh my-org my-repo --state closed
  $ codacy pull-requests gh my-org my-repo --output json`,
    )
    .action(async function (
      this: Command,
      providerArg?: string,
      organizationArg?: string,
      repositoryArg?: string,
    ) {
      try {
        resolveAccountAuth(this, "Codacy does not accept repository tokens on the pull request endpoints");

        const { provider, organization, repository } = resolveRepoArgs(
          [providerArg, organizationArg, repositoryArg],
          0,
          "pull-requests",
          [],
        );

        const format = getOutputFormat(this);
        const opts = this.opts();
        const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 100, 1), 1000);
        // API classification param: "closed" here maps to the API's "merged" search
        // value, which also includes closed-but-not-merged PRs — "merged" would be
        // a misleading name to expose on the CLI for that reason.
        const search = opts.state === "closed" ? "merged" : "last-updated";

        const spinner = ora("Fetching pull requests...").start();
        const { items, total, hasMore } = await fetchPullRequests(
          provider,
          organization,
          repository,
          limit,
          search,
          opts.search,
          opts.base,
        );
        spinner.stop();

        if (format === "json") {
          printPullRequestsJson(items, total);
          return;
        }

        printSection("Pull Requests", total, "pull request");
        if (items.length === 0) {
          console.log(ansis.dim("  No pull requests found."));
          return;
        }

        printPullRequestsList(items);

        if (total > items.length || hasMore) {
          printPaginationWarning(
            { cursor: "more", limit: items.length },
            "Use --limit <n> (max 1000) to fetch more, or --search, --base, --state to filter.",
          );
        }
      } catch (err) {
        handleError(err);
      }
    });
}
