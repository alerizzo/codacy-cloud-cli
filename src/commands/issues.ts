import { Command } from "commander";
import ora from "ora";
import ansis from "ansis";
import { checkApiToken } from "../utils/auth";
import { handleError } from "../utils/error";
import { resolveRepoArgs } from "../utils/resolve-repo-args";
import {
  createTable,
  getOutputFormat,
  pickDeep,
  printJson,
  printPaginationWarning,
} from "../utils/output";
import {
  printSection,
  printIssueCard,
  resolveToolUuids,
  formatCount,
} from "../utils/formatting";
import { AnalysisService } from "../api/client/services/AnalysisService";
import { ToolsService } from "../api/client/services/ToolsService";
import { Tool } from "../api/client/models/Tool";
import { AnalysisTool } from "../api/client/models/AnalysisTool";
import { CommitIssue } from "../api/client/models/CommitIssue";
import { SeverityLevel } from "../api/client/models/SeverityLevel";
import { SearchRepositoryIssuesBody } from "../api/client/models/SearchRepositoryIssuesBody";
import { Count } from "../api/client/models/Count";
import { PatternsCount } from "../api/client/models/PatternsCount";

// API allows a maximum of 100 issue IDs per bulk-ignore call
const BULK_BATCH_SIZE = 100;

// A pattern is flagged as "noisy" (and suggested for disabling) when it dominates
// the issue set: either it alone accounts for at least NOISE_SHARE of all issues,
// or it has at least NOISE_AVG_MULTIPLE times the average issues-per-pattern.
const NOISE_SHARE = 0.1;
const NOISE_AVG_MULTIPLE = 3;
// Cap how many disable suggestions we print, to keep the section actionable.
const MAX_NOISE_SUGGESTIONS = 10;

// Human-friendly labels for the API's false-positive threshold buckets.
// `equalOrAboveThreshold` = FP probability >= threshold (a potential false
// positive); `belowThreshold` = below threshold (treated as a real issue).
const FALSE_POSITIVE_LABELS: Record<string, string> = {
  belowThreshold: "Not a False Positive",
  equalOrAboveThreshold: "Potential False Positive",
};

const SEVERITY_ORDER: Record<string, number> = {
  Error: 0,
  High: 1,
  Warning: 2,
  Info: 3,
};

/**
 * Map from normalized user input to the API enum value.
 * Accepts both the display label (Critical, Medium, Minor) and the enum value
 * (Error, Warning, Info), case-insensitive.
 *
 * Display label → enum: Critical→Error, High→High, Medium→Warning, Minor→Info
 */
const SEVERITY_NORMALIZE: Record<string, SeverityLevel> = {
  critical: "Error",
  error: "Error",
  high: "High",
  medium: "Warning",
  warning: "Warning",
  minor: "Info",
  info: "Info",
};

/**
 * Map from normalized user input (lowercase, no spaces) to the DB category value.
 * Allows inputs like "security", "code style", "error prone", etc.
 */
const CATEGORY_NORMALIZE: Record<string, string> = {
  errorprone: "ErrorProne",
  codestyle: "CodeStyle",
  unusedcode: "UnusedCode",
  compatibility: "Compatibility",
  security: "Security",
  performance: "Performance",
  complexity: "Complexity",
  documentation: "Documentation",
  bestpractice: "BestPractice",
  comprehensibility: "Comprehensibility",
};

function normalizeSeverity(input: string): SeverityLevel {
  return (
    SEVERITY_NORMALIZE[input.toLowerCase().trim()] ?? (input as SeverityLevel)
  );
}

/**
 * Normalize a category input to its exact DB value.
 * Strips spaces/underscores/hyphens and lowercases before matching.
 * Falls back to the original input if no match is found.
 */
function normalizeCategory(input: string): string {
  const key = input.toLowerCase().replace(/[\s_-]/g, "");
  return CATEGORY_NORMALIZE[key] ?? input;
}

function parseBooleanOption(value: string): boolean {
  return value.toLowerCase() !== "false";
}

function printIssuesList(issues: CommitIssue[], total: number): void {
  printSection("Issues", total, "issue");
  if (issues.length === 0) {
    console.log(ansis.dim("  No issues found."));
    return;
  }
  const sorted = [...issues].sort((a, b) => {
    const aOrder = SEVERITY_ORDER[a.patternInfo.severityLevel] ?? 99;
    const bOrder = SEVERITY_ORDER[b.patternInfo.severityLevel] ?? 99;
    return aOrder - bOrder;
  });
  for (const issue of sorted) {
    printIssueCard(issue);
  }
}

function printCountTable(title: string, counts: Count[]): void {
  if (counts.length === 0) return;
  const sorted = [...counts].sort((a, b) => b.total - a.total);
  const table = createTable({ head: [title, "Count"] });
  for (const c of sorted) {
    table.push([c.name, String(c.total)]);
  }
  console.log(table.toString());
}

function printPatternsTable(patterns: PatternsCount[]): void {
  if (patterns.length === 0) return;
  const sorted = [...patterns].sort((a, b) => b.total - a.total);
  const table = createTable({ head: ["Pattern", "Count"] });
  for (const p of sorted) {
    table.push([`${p.title} ${ansis.dim(p.id)}`, String(p.total)]);
  }
  console.log(table.toString());
}

function printOverview(counts: {
  categories: Count[];
  levels: Count[];
  languages: Count[];
  tags: Count[];
  patterns: PatternsCount[];
  authors: Count[];
  potentialFalsePositives: Count[];
}): void {
  printSection("Issues Overview");
  const hasData =
    counts.categories.length > 0 ||
    counts.levels.length > 0 ||
    counts.languages.length > 0 ||
    counts.tags.length > 0 ||
    counts.patterns.length > 0 ||
    counts.authors.length > 0 ||
    counts.potentialFalsePositives.length > 0;

  if (!hasData) {
    console.log(ansis.dim("  No issues data available."));
    return;
  }

  printCountTable("Category", counts.categories);
  if (counts.categories.length > 0 && counts.levels.length > 0) console.log();
  printCountTable("Severity", counts.levels);
  if (counts.levels.length > 0 && counts.languages.length > 0) console.log();
  printCountTable("Language", counts.languages);
  if (counts.languages.length > 0 && counts.tags.length > 0) console.log();
  printCountTable("Tag", counts.tags);
  if (counts.tags.length > 0 && counts.patterns.length > 0) console.log();
  printPatternsTable(counts.patterns);
  if (counts.patterns.length > 0 && counts.authors.length > 0) console.log();
  printCountTable("Author", counts.authors);
  if (counts.authors.length > 0 && counts.potentialFalsePositives.length > 0)
    console.log();
  printCountTable(
    "False Positives",
    relabelFalsePositives(counts.potentialFalsePositives),
  );
}

/** Map the API's threshold-bucket names to human-friendly false-positive labels. */
function relabelFalsePositives(counts: Count[]): Count[] {
  return counts.map((c) => ({
    ...c,
    name: FALSE_POSITIVE_LABELS[c.name] ?? c.name,
  }));
}

/**
 * Identify "noisy" patterns worth suggesting for disabling: a pattern is noisy
 * when it accounts for at least NOISE_SHARE of all issues, or has at least
 * NOISE_AVG_MULTIPLE times the average issues-per-pattern. Sorted by count desc.
 */
function detectNoisyPatterns(patterns: PatternsCount[]): PatternsCount[] {
  if (patterns.length === 0) return [];
  const total = patterns.reduce((sum, p) => sum + p.total, 0);
  if (total === 0) return [];
  const average = total / patterns.length;
  const shareFloor = NOISE_SHARE * total;
  const avgFloor = NOISE_AVG_MULTIPLE * average;
  return patterns
    .filter((p) => p.total >= shareFloor || p.total >= avgFloor)
    .sort((a, b) => b.total - a.total);
}

/**
 * Find the tool that owns a pattern by matching the pattern ID prefix against
 * each tool's `prefix` (the field Codacy uses to keep pattern names unique).
 * Longest matching prefix wins. Tools without a prefix can't be matched.
 */
function resolvePatternTool(
  patternId: string,
  tools: Tool[],
): Tool | undefined {
  let best: Tool | undefined;
  let bestLen = 0;
  for (const tool of tools) {
    if (!tool.prefix) continue;
    // The API prefix normally already carries the trailing underscore (e.g.
    // "ESLint_"), but normalize to "<prefix>_" so we match either way.
    const marker = tool.prefix.endsWith("_") ? tool.prefix : `${tool.prefix}_`;
    if (patternId.startsWith(marker) && marker.length > bestLen) {
      best = tool;
      bestLen = marker.length;
    }
  }
  return best;
}

interface NoiseSuggestion {
  title: string;
  total: number;
  // Exactly one of these is set: `command` is a runnable `codacy pattern …
  // --disable`; `action` is a manual step shown when the pattern can't be
  // disabled through the CLI (config-file-driven tool, or coding-standard
  // enforced).
  command?: string;
  action?: string;
}

/** Match a global tool to its repository-scoped tool by UUID, then by name. */
function findRepoTool(
  repoTools: AnalysisTool[],
  tool: Tool,
): AnalysisTool | undefined {
  return (
    repoTools.find((t) => t.uuid === tool.uuid) ??
    repoTools.find((t) => t.name.toLowerCase() === tool.name.toLowerCase())
  );
}

/**
 * Fetch the coding standards (if any) that enforce a pattern, by searching the
 * repo tool's patterns for an exact ID match and reading its `enabledBy`.
 */
async function fetchPatternStandards(
  ctx: { provider: string; organization: string; repository: string },
  toolUuid: string,
  patternId: string,
): Promise<string[]> {
  const resp = await AnalysisService.listRepositoryToolPatterns(
    ctx.provider,
    ctx.organization,
    ctx.repository,
    toolUuid,
    undefined, // languages
    undefined, // categories
    undefined, // severityLevels
    undefined, // tags
    patternId, // search by ID
  );
  const match = resp.data.find((cp) => cp.patternDefinition.id === patternId);
  return match?.enabledBy?.map((s) => s.name) ?? [];
}

/**
 * Build suggestions for noisy patterns. The owning tool is resolved by prefix;
 * patterns whose tool can't be resolved (no/unknown prefix) are silently
 * discarded. The suggested step depends on how the pattern is managed:
 *  - tool driven by a local config file → manual "update your config file" step
 *  - pattern enforced by a coding standard → manual "update the standard" step
 *  - otherwise → a runnable `codacy pattern … --disable` command
 */
async function buildNoiseSuggestions(
  noisy: PatternsCount[],
  globalTools: Tool[],
  repoTools: AnalysisTool[],
  ctx: { provider: string; organization: string; repository: string },
): Promise<NoiseSuggestion[]> {
  const results = await Promise.all(
    noisy.map(async (pattern): Promise<NoiseSuggestion | null> => {
      const tool = resolvePatternTool(pattern.id, globalTools);
      if (!tool) return null; // can't identify the tool — discard silently
      // The `pattern` command matches the tool by name; hyphenate spaces per its convention.
      const toolToken = tool.name.replace(/\s+/g, "-");
      const repoTool = findRepoTool(repoTools, tool);

      // A local configuration file overrides Codacy-side pattern config, so the
      // pattern must be disabled in that file rather than via the CLI.
      if (repoTool?.settings.usesConfigurationFile) {
        return {
          title: pattern.title,
          total: pattern.total,
          action: `Update your local ${tool.name} configuration file to disable the pattern`,
        };
      }

      // A pattern enforced by a coding standard must be changed in the standard.
      if (repoTool) {
        const standards = await fetchPatternStandards(
          ctx,
          repoTool.uuid,
          pattern.id,
        );
        if (standards.length > 0) {
          return {
            title: pattern.title,
            total: pattern.total,
            action: `Update ${standards.join(", ")} to disable the pattern`,
          };
        }
      }

      return {
        title: pattern.title,
        total: pattern.total,
        command: `codacy pattern ${toolToken} ${pattern.id} --disable`,
      };
    }),
  );
  return results.filter((s): s is NoiseSuggestion => s !== null);
}

/** Print the "Suggested actions to reduce noise" section. No-op when empty. */
function printNoiseSuggestions(suggestions: NoiseSuggestion[]): void {
  if (suggestions.length === 0) return;

  console.log(ansis.bold("\nSuggested actions to reduce noise\n"));

  const shown = suggestions.slice(0, MAX_NOISE_SUGGESTIONS);
  for (const s of shown) {
    const label = s.total === 1 ? "issue" : "issues";
    const reduction = ansis.green(`(-${formatCount(s.total)} ${label})`);
    console.log(`  Disable ${ansis.bold(`"${s.title}"`)} ${reduction}`);
    if (s.command) {
      console.log(`  ${ansis.dim(">")} ${s.command}`);
    } else if (s.action) {
      console.log(`  ${ansis.dim("→")} ${s.action}`);
    }
    console.log();
  }

  const remaining = suggestions.length - shown.length;
  if (remaining > 0) {
    console.log(
      ansis.dim(
        `  … (${remaining} more noisy pattern${remaining === 1 ? "" : "s"})`,
      ),
    );
  }
}

/**
 * Split a comma-separated CLI option into a trimmed array.
 * Returns undefined if the value is not set.
 */
function parseCommaList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Paginate through all tools and return the full list. */
async function fetchAllTools(): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const resp = await ToolsService.listTools(cursor, 100);
    tools.push(...resp.data);
    cursor = resp.pagination?.cursor;
  } while (cursor);
  return tools;
}

/**
 * Build the SearchRepositoryIssuesBody from parsed CLI options.
 * Resolves tool names/UUIDs via the Codacy API when --tools is provided.
 */
async function buildFilterBody(
  opts: Record<string, any>,
): Promise<SearchRepositoryIssuesBody> {
  const body: SearchRepositoryIssuesBody = {};

  if (opts.branch) body.branchName = opts.branch;

  const patterns = parseCommaList(opts.patterns);
  if (patterns) body.patternIds = patterns;

  const severity = parseCommaList(opts.severities);
  if (severity) body.levels = severity.map(normalizeSeverity);

  const category = parseCommaList(opts.categories);
  if (category) body.categories = category.map(normalizeCategory);

  const language = parseCommaList(opts.languages);
  if (language) body.languages = language;

  const tags = parseCommaList(opts.tags);
  if (tags) body.tags = tags;

  const author = parseCommaList(opts.authors);
  if (author) body.authorEmails = author;

  if (opts.falsePositives === true) body.potentialFalsePositives = true;
  else if (opts.falsePositives === false) body.potentialFalsePositives = false;

  const toolInputs = parseCommaList(opts.tools);
  if (toolInputs)
    body.toolUuids = await resolveToolUuids(toolInputs, fetchAllTools);

  return body;
}

/**
 * Fetch every false positive issue (all pages) then ignore them in batches of
 * BULK_BATCH_SIZE. Prints progress via spinners and exits when done.
 */
async function executeBulkIgnore(
  provider: string,
  organization: string,
  repository: string,
  body: SearchRepositoryIssuesBody,
  reason: string,
  comment?: string,
): Promise<void> {
  const fetchSpinner = ora("Fetching issues...").start();
  const allIssues: CommitIssue[] = [];
  let cursor: string | undefined;

  do {
    const resp = await AnalysisService.searchRepositoryIssues(
      provider,
      organization,
      repository,
      cursor,
      100,
      body,
    );
    allIssues.push(...resp.data);
    cursor = resp.pagination?.cursor;
  } while (cursor);

  fetchSpinner.stop();

  if (allIssues.length === 0) {
    console.log(ansis.green("No issues found matching the current filters."));
    return;
  }

  const count = allIssues.length;
  const plural = count === 1 ? "" : "s";
  console.log(`Found ${ansis.bold(String(count))} issue${plural}.`);

  const ignoreSpinner = ora(`Ignoring ${count} issue${plural}...`).start();
  const issueIds = allIssues.map((i) => i.issueId);

  for (let i = 0; i < issueIds.length; i += BULK_BATCH_SIZE) {
    await AnalysisService.bulkIgnoreIssues(provider, organization, repository, {
      issueIds: issueIds.slice(i, i + BULK_BATCH_SIZE),
      reason,
      comment,
    });
  }

  ignoreSpinner.succeed(`Ignored ${ansis.bold(String(count))} issue${plural}.`);
  console.log(
    ansis.dim(`Run a new analysis to see changes reflected: codacy repository ${provider} ${organization} ${repository} --reanalyze`),
  );
}

export function registerIssuesCommand(program: Command) {
  program
    .command("issues")
    .alias("is")
    .description("Search for issues in a repository")
    .argument("[provider]", "git provider (gh, gl, or bb) — auto-detected from git remote if omitted")
    .argument("[organization]", "organization name")
    .argument("[repository]", "repository name")
    .option(
      "-b, --branch <branch>",
      "branch name (defaults to the main branch)",
    )
    .option("-p, --patterns <patterns>", "comma-separated list of pattern IDs")
    .option(
      "-T, --tools <tools>",
      "comma-separated tool UUIDs or names to filter by",
    )
    .option(
      "-s, --severities <severities>",
      "comma-separated severity levels: Critical, High, Medium, Minor (or Error, Warning, Info)",
    )
    .option(
      "-c, --categories <categories>",
      "comma-separated category names (e.g. Security, CodeStyle, ErrorProne)",
    )
    .option(
      "-l, --languages <languages>",
      "comma-separated list of language names",
    )
    .option("-t, --tags <tags>", "comma-separated list of tag names")
    .option("-a, --authors <authors>", "comma-separated list of author emails")
    .option(
      "-n, --limit <n>",
      "maximum number of issues to return (default: 100, max: 1000)",
      "100",
    )
    .option(
      "-O, --overview",
      "show issue count totals instead of the issues list",
    )
    .option(
      "-F, --false-positives [value]",
      "filter by potential false positives (true, false, or omit)",
      parseBooleanOption,
    )
    .option("-I, --ignore", "ignore all issues matching the current filters")
    .option(
      "-R, --ignore-reason <reason>",
      "reason for ignoring (AcceptedUse|FalsePositive|NotExploitable|TestCode|ExternalCode)",
      "AcceptedUse",
    )
    .option(
      "-m, --ignore-comment <comment>",
      "optional comment when using --ignore",
    )
    .addHelpText(
      "after",
      `
Examples:
  $ codacy issues                                    # auto-detect from git remote
  $ codacy issues gh my-org my-repo
  $ codacy issues gh my-org my-repo --branch main --severities Critical,Medium
  $ codacy issues gh my-org my-repo --categories Security --overview
  $ codacy issues gh my-org my-repo --tools eslint,semgrep
  $ codacy issues gh my-org my-repo --limit 500
  $ codacy issues gh my-org my-repo --false-positives
  $ codacy issues gh my-org my-repo --false-positives false
  $ codacy issues gh my-org my-repo --ignore --branch main
  $ codacy issues gh my-org my-repo --false-positives --ignore --ignore-reason FalsePositive
  $ codacy issues gh my-org my-repo --ignore --ignore-reason NotExploitable --ignore-comment "Reviewed"
  $ codacy issues gh my-org my-repo --output json`,
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
          "issues",
          [],
        );
        const opts = this.opts();
        const format = getOutputFormat(this);
        const isOverview = !!opts.overview;

        const body = await buildFilterBody(opts);
        const limit = Math.min(
          Math.max(parseInt(opts.limit, 10) || 100, 1),
          1000,
        );

        if (opts.ignore) {
          if (isOverview) {
            this.error(
              "--overview cannot be used with --ignore; --overview is a read-only display mode",
            );
          }
          if (this.getOptionValueSource("limit") === "cli") {
            this.error(
              "--limit cannot be used with --ignore; the ignore path always processes all matching issues",
            );
          }
          await executeBulkIgnore(
            provider,
            organization,
            repository,
            body,
            opts.ignoreReason,
            opts.ignoreComment,
          );
          return;
        }

        const spinner = ora(
          isOverview ? "Fetching issues overview..." : "Fetching issues...",
        ).start();

        if (isOverview) {
          const overviewResponse = await AnalysisService.issuesOverview(
            provider,
            organization,
            repository,
            body,
          );

          const counts = overviewResponse.data.counts;

          if (format === "json") {
            spinner.stop();
            printJson(
              pickDeep({ overview: counts }, [
                "overview.categories",
                "overview.levels",
                "overview.languages",
                "overview.tags",
                "overview.patterns",
                "overview.authors",
                "overview.potentialFalsePositives",
              ]),
            );
            return;
          }

          // Resolve disable suggestions for noisy patterns. The extra tools fetch
          // only happens when there's something to suggest, and stays under the
          // spinner so the user sees progress rather than a stall.
          const noisy = detectNoisyPatterns(counts.patterns);
          let suggestions: NoiseSuggestion[] = [];
          if (noisy.length > 0) {
            spinner.text = "Checking for noisy patterns...";
            // Global tools give each pattern's owning tool (via prefix); repo
            // tools tell us which ones are config-file-driven and let us check
            // coding-standard enforcement per pattern.
            const [globalTools, repoToolsResponse] = await Promise.all([
              fetchAllTools(),
              AnalysisService.listRepositoryTools(
                provider,
                organization,
                repository,
              ),
            ]);
            suggestions = await buildNoiseSuggestions(
              noisy,
              globalTools,
              repoToolsResponse.data,
              { provider, organization, repository },
            );
          }
          spinner.stop();

          printOverview({
            categories: counts.categories,
            levels: counts.levels,
            languages: counts.languages,
            tags: counts.tags,
            patterns: counts.patterns,
            authors: counts.authors,
            potentialFalsePositives: counts.potentialFalsePositives,
          });
          printNoiseSuggestions(suggestions);
        } else {
          const pageSize = Math.min(limit, 100);
          let issues: CommitIssue[] = [];
          let cursor: string | undefined;
          let total: number | undefined;

          do {
            const issuesResponse = await AnalysisService.searchRepositoryIssues(
              provider,
              organization,
              repository,
              cursor,
              pageSize,
              body,
            );
            issues = issues.concat(issuesResponse.data);
            total ??= issuesResponse.pagination?.total;
            cursor = issuesResponse.pagination?.cursor;
          } while (cursor && issues.length < limit);

          // Trim to exact limit
          if (issues.length > limit) issues = issues.slice(0, limit);
          total ??= issues.length;
          spinner.stop();

          if (format === "json") {
            printJson({
              issues: issues.map((issue: any) =>
                pickDeep(issue, [
                  "patternInfo.id",
                  "patternInfo.severityLevel",
                  "patternInfo.category",
                  "patternInfo.subCategory",
                  "message",
                  "filePath",
                  "lineNumber",
                  "lineText",
                  "resultDataId",
                  "falsePositiveProbability",
                  "falsePositiveThreshold",
                  "falsePositiveReason",
                ]),
              ),
            });
            return;
          }

          printIssuesList(issues, total);
          if (total > issues.length) {
            printPaginationWarning(
              { cursor: "more", limit: issues.length },
              "Use --limit <n> (max 1000) to fetch more, or --severities, --categories, --languages to filter.",
            );
          }
        }
      } catch (err) {
        handleError(err);
      }
    });
}
