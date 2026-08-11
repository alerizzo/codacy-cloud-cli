import { Command } from "commander";
import ora from "ora";
import ansis from "ansis";
import { repositoryTokenOption, resolveAuth } from "../utils/auth";
import { handleError } from "../utils/error";
import { resolveRepoArgs } from "../utils/resolve-repo-args";
import { getOutputFormat, pickDeep, printJson } from "../utils/output";
import { AnalysisService } from "../api/client/services/AnalysisService";
import {
  findToolByName,
  printPatternCard,
  patternEnforcedBy,
  configFileNotice,
  CONFIG_FILE_LOCKED_MESSAGE,
  PATTERN_JSON_FIELDS,
} from "../utils/formatting";
import { ConfigureToolBody } from "../api/client/models/ConfigureToolBody";
import { ConfigurePattern } from "../api/client/models/ConfigurePattern";

export function registerPatternCommand(program: Command) {
  program
    .command("pattern")
    .alias("pat")
    .description(
      "Show a pattern, or enable, disable, or set parameters for it",
    )
    .argument("[provider]", "git provider (gh, gl, or bb) — auto-detected from git remote if omitted")
    .argument("[organization]", "organization name")
    .argument("[repository]", "repository name")
    .argument(
      "[toolName]",
      "tool name (use hyphens for spaces, e.g. eslint-(deprecated))",
    )
    .argument("[patternId]", "pattern ID")
    .option("-e, --enable", "enable the pattern")
    .option("-d, --disable", "disable the pattern")
    .option(
      "-p, --parameter <name=value>",
      "set a parameter (name=value format, repeatable)",
      (val: string, acc: string[]) => [...acc, val],
      [] as string[],
    )
    .addOption(repositoryTokenOption())
    .addHelpText(
      "after",
      `
Examples:
  $ codacy-cloud-cli pattern eslint some-pattern-id              # show pattern info (auto-detect from git remote)
  $ codacy-cloud-cli pattern gh my-org my-repo eslint some-pattern-id
  $ codacy-cloud-cli pattern gh my-org my-repo eslint some-pattern-id --enable
  $ codacy-cloud-cli pattern gh my-org my-repo eslint some-pattern-id --disable
  $ codacy-cloud-cli pattern gh my-org my-repo eslint some-pattern-id --parameter maxParams=3
  $ codacy-cloud-cli pattern gh my-org my-repo eslint some-pattern-id --enable --parameter maxParams=3 --parameter minParams=1`,
    )
    .action(async function (
      this: Command,
      providerArg?: string,
      organizationArg?: string,
      repositoryArg?: string,
      toolNameArg?: string,
      patternIdArg?: string,
    ) {
      try {
        resolveAuth(this);
        const { provider, organization, repository, trailingArgs } =
          resolveRepoArgs(
            [providerArg, organizationArg, repositoryArg, toolNameArg, patternIdArg],
            2,
            "pattern",
            ["toolName", "patternId"],
          );
        const [toolName, patternId] = trailingArgs;
        const opts = this.opts();
        const format = getOutputFormat(this);

        // Modify mode = at least one action flag. With no flags we just show the
        // pattern's information.
        const isModify =
          Boolean(opts.enable) ||
          Boolean(opts.disable) ||
          opts.parameter.length > 0;

        const spinner = ora(`Looking up tool "${toolName}"...`).start();

        const toolsResponse = await AnalysisService.listRepositoryTools(
          provider,
          organization,
          repository,
        );
        const tool = findToolByName(toolsResponse.data, toolName);

        if (!tool) {
          spinner.fail(`Tool "${toolName}" not found in this repository.`);
          process.exit(1);
        }

        // When the tool is driven by a local configuration file, its patterns
        // are overwritten and can't be shown or changed through the API.
        if (tool.settings.usesConfigurationFile) {
          if (isModify) {
            spinner.fail(CONFIG_FILE_LOCKED_MESSAGE);
            process.exit(1);
          }
          spinner.stop();
          if (format === "json") {
            printJson({ tool: tool.name, usesConfigurationFile: true });
          } else {
            console.log(ansis.yellow(configFileNotice(tool.name)));
          }
          return;
        }

        // There is no endpoint to fetch a single pattern at repo level, so we
        // search by ID and keep only the exact match. This also yields the
        // current enabled state and any coding-standard enforcement.
        spinner.text = `Fetching pattern "${patternId}"...`;
        const patternsResponse =
          await AnalysisService.listRepositoryToolPatterns(
            provider,
            organization,
            repository,
            tool.uuid,
            undefined, // languages
            undefined, // categories
            undefined, // severityLevels
            undefined, // tags
            patternId, // search by ID
          );
        const match = patternsResponse.data.find(
          (cp) => cp.patternDefinition.id === patternId,
        );
        if (!match) {
          spinner.fail(
            `Pattern "${patternId}" not found for tool "${tool.name}".`,
          );
          process.exit(1);
        }

        // ── Info mode: no action flags → render the pattern card ────────────
        if (!isModify) {
          spinner.stop();
          if (format === "json") {
            printJson(pickDeep(match, PATTERN_JSON_FIELDS));
          } else {
            printPatternCard(match);
            console.log(ansis.dim("─".repeat(40)));
          }
          return;
        }

        // ── Modify mode ─────────────────────────────────────────────────────
        // Patterns enforced by a coding standard are managed there, not at the
        // repository level, so they can't be changed here.
        const enforcedBy = patternEnforcedBy(match);
        if (enforcedBy.length > 0) {
          const names = enforcedBy.join(", ");
          const noun =
            enforcedBy.length === 1 ? "coding standard" : "coding standards";
          spinner.fail(
            `Pattern enforced by ${names} ${noun}, can't be modified.`,
          );
          process.exit(1);
        }

        // Determine target enabled state. For parameters-only updates we keep
        // the pattern's current state.
        let enabled: boolean;
        if (opts.enable) {
          enabled = true;
        } else if (opts.disable) {
          enabled = false;
        } else {
          enabled = match.enabled;
        }

        // Parse name=value parameters
        const parameters = opts.parameter.map((param: string) => {
          const eqIdx = param.indexOf("=");
          if (eqIdx === -1) {
            throw new Error(
              `Invalid parameter format "${param}". Use name=value format.`,
            );
          }
          return {
            name: param.slice(0, eqIdx),
            value: param.slice(eqIdx + 1),
          };
        });

        const patternConfig: ConfigurePattern = {
          id: patternId,
          enabled,
          ...(parameters.length > 0 && { parameters }),
        };

        const body: ConfigureToolBody = {
          patterns: [patternConfig],
        };

        spinner.text = `Configuring pattern "${patternId}"...`;
        await AnalysisService.configureTool(
          provider,
          organization,
          repository,
          tool.uuid,
          body,
        );
        spinner.stop();

        const actions: string[] = [];
        if (opts.enable) {
          actions.push(`Pattern ${ansis.bold(patternId)} enabled`);
        } else if (opts.disable) {
          actions.push(`Pattern ${ansis.bold(patternId)} disabled`);
        }
        for (const p of parameters) {
          actions.push(
            `Pattern ${ansis.bold(patternId)} parameter ${ansis.bold(p.name)} set to ${ansis.bold(p.value)}`,
          );
        }

        for (const msg of actions) {
          console.log(`${ansis.green("✓")} ${msg}.`);
        }
      } catch (err) {
        handleError(err);
      }
    });
}
