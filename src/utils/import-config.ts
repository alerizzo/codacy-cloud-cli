import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import ansis from "ansis";
import pluralize from "pluralize";
import { CodacyConfig, CodacyToolConfig } from "../types/codacy-config";
import { Tool } from "../api/client/models/Tool";
import { AnalysisTool } from "../api/client/models/AnalysisTool";
import { CodingStandardInfo } from "../api/client/models/CodingStandardInfo";
import { ConfigurePattern } from "../api/client/models/ConfigurePattern";
import { ConfiguredPattern } from "../api/client/models/ConfiguredPattern";
import { AnalysisService } from "../api/client/services/AnalysisService";
import { ToolsService } from "../api/client/services/ToolsService";
import { CodingStandardsService } from "../api/client/services/CodingStandardsService";
import { ApiError } from "../api/client/core/ApiError";
import type ora from "ora";

const execAsync = promisify(exec);

export interface ResolvedTool {
  configTool: CodacyToolConfig;
  tool: Tool;
  repoTool?: AnalysisTool;
  // Patterns locked by a coding standard that must stay enabled even though
  // the config file doesn't list them (see buildImportPreview).
  keepEnabledPatternIds?: string[];
}

export interface ImportSkip {
  tool: string;
  patternId?: string;
  standards: string[];
  reason: string;
}

export interface ImportPreview {
  toolsToDisable: AnalysisTool[];
  toolsToEnable: ResolvedTool[];
  toolsToReconfigure: ResolvedTool[];
  unresolvedTools: string[];
  cloudOnlyTools: AnalysisTool[];
  localCliAvailable: boolean;
  totalPatterns: number;
  standards: CodingStandardInfo[];
  configPath: string;
  skipped: ImportSkip[];
}

export interface ImportFailure {
  tool: string;
  error: string;
  status?: number;
  details: string[];
}

function parseApiErrorBody(body: unknown): string[] {
  if (body && typeof body === "object") {
    const details: string[] = [];
    const obj = body as Record<string, unknown>;
    if (typeof obj.message === "string") {
      details.push(obj.message);
    }
    if (Array.isArray(obj.errors)) {
      for (const e of obj.errors) {
        details.push(typeof e === "string" ? e : ((e as any)?.message ?? JSON.stringify(e)));
      }
    }
    if (details.length === 0) {
      const serialized = JSON.stringify(body);
      if (serialized !== "{}" && serialized !== "null") {
        details.push(serialized);
      }
    }
    return details;
  }
  if (typeof body === "string" && body.length > 0) {
    return [body];
  }
  return [];
}

function extractErrorDetails(err: unknown): Pick<ImportFailure, "error" | "status" | "details"> {
  if (!(err instanceof ApiError)) {
    return {
      error: err instanceof Error ? err.message : String(err),
      details: [],
    };
  }
  return { error: err.message, status: err.status, details: parseApiErrorBody(err.body) };
}

export function readConfigFile(filePath: string): CodacyConfig {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Configuration file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    const config = JSON.parse(raw) as CodacyConfig;
    if (!config.version || !Array.isArray(config.tools)) {
      throw new Error("Invalid configuration file: missing 'version' or 'tools' fields.");
    }
    for (let i = 0; i < config.tools.length; i++) {
      const tool = config.tools[i];
      if (!tool || typeof tool !== "object") {
        throw new Error(`Invalid configuration file: tools[${i}] must be an object.`);
      }
      if (typeof tool.toolId !== "string" || tool.toolId.trim() === "") {
        throw new Error(`Invalid configuration file: tools[${i}] is missing a valid 'toolId'.`);
      }
      if (!Array.isArray(tool.patterns)) {
        tool.patterns = [];
      }
    }
    return config;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${filePath}`);
    }
    throw err;
  }
}

export function resolveToolId(
  toolId: string,
  allTools: Tool[],
): Tool | undefined {
  const id = toolId.toLowerCase();

  // Match by prefix (strip trailing _ before comparing)
  const byPrefix = allTools.find(
    (t) => t.prefix && t.prefix.replace(/_$/, "").toLowerCase() === id,
  );
  if (byPrefix) return byPrefix;

  // Fall back to shortName
  return allTools.find((t) => t.shortName.toLowerCase() === id);
}

export async function fetchAllTools(): Promise<Tool[]> {
  const all: Tool[] = [];
  let cursor: string | undefined;
  do {
    const response = await ToolsService.listTools(cursor, 100);
    all.push(...response.data);
    cursor = response.pagination?.cursor;
  } while (cursor);
  return all;
}

// Fetches only currently-enabled patterns so we can tell which of them a
// coding standard enforces before the import diff disables them.
async function fetchEnabledToolPatterns(
  provider: string,
  organization: string,
  repository: string,
  toolUuid: string,
): Promise<ConfiguredPattern[]> {
  const all: ConfiguredPattern[] = [];
  let cursor: string | undefined;
  do {
    const response = await AnalysisService.listRepositoryToolPatterns(
      provider,
      organization,
      repository,
      toolUuid,
      undefined, // languages
      undefined, // categories
      undefined, // severityLevels
      undefined, // tags
      undefined, // search
      true, // enabled
      undefined, // recommended
      undefined, // sort
      undefined, // direction
      cursor,
      100,
    );
    all.push(...response.data);
    cursor = response.pagination?.cursor;
  } while (cursor);
  return all;
}

export async function getLocalSupportedToolIds(): Promise<string[] | null> {
  try {
    const { stdout } = await execAsync("codacy-analysis info -f json", {
      timeout: 30000,
    });
    const info = JSON.parse(stdout);
    if (!info.tools || !Array.isArray(info.tools)) return null;
    return info.tools
      .filter((t: any) => t && t.supported && typeof t.id === "string")
      .map((t: any) => t.id as string);
  } catch {
    return null;
  }
}

export async function buildImportPreview(
  provider: string,
  organization: string,
  repository: string,
  config: CodacyConfig,
  repoTools: AnalysisTool[],
  allTools: Tool[],
  standards: CodingStandardInfo[],
  configPath: string,
  localToolIds?: string[] | null,
): Promise<ImportPreview> {
  const resolved: ResolvedTool[] = [];
  const unresolvedTools: string[] = [];

  for (const configTool of config.tools) {
    const tool = resolveToolId(configTool.toolId, allTools);
    if (!tool) {
      unresolvedTools.push(configTool.toolId);
      continue;
    }
    const repoTool = repoTools.find((rt) => rt.uuid === tool.uuid);
    resolved.push({ configTool, tool, repoTool });
  }

  // Tools in the config that need enabling (currently disabled or not present)
  const toolsToEnable = resolved.filter(
    (r) => !r.repoTool || !r.repoTool.settings.isEnabled,
  );

  // Tools in the config that are already enabled (need reconfiguration)
  const toolsToReconfigure = resolved.filter(
    (r) => r.repoTool && r.repoTool.settings.isEnabled,
  );

  // Repo tools that are currently enabled but NOT in the config
  const resolvedUuids = new Set(resolved.map((r) => r.tool.uuid));
  const enabledNotInConfig = repoTools.filter(
    (rt) => rt.settings.isEnabled && !resolvedUuids.has(rt.uuid),
  );

  // Only disable tools the local CLI supports; leave cloud-only tools unchanged
  const localCliAvailable = localToolIds != null;
  let toolsToDisable: AnalysisTool[];
  let cloudOnlyTools: AnalysisTool[];

  if (localToolIds) {
    const localUuids = new Set(
      localToolIds
        .map((id) => resolveToolId(id, allTools))
        .filter((t): t is Tool => t !== undefined)
        .map((t) => t.uuid),
    );
    toolsToDisable = enabledNotInConfig.filter((rt) => localUuids.has(rt.uuid));
    cloudOnlyTools = enabledNotInConfig.filter((rt) => !localUuids.has(rt.uuid));
  } else {
    toolsToDisable = [];
    cloudOnlyTools = [];
  }

  const skipped: ImportSkip[] = [];

  // Tool level: the server 409s a disable enforced by a coding standard —
  // drop those from the disable set client-side instead of attempting it.
  const lockedToolsToDisable = toolsToDisable.filter((t) => t.settings.enabledBy.length > 0);
  toolsToDisable = toolsToDisable.filter((t) => t.settings.enabledBy.length === 0);
  for (const t of lockedToolsToDisable) {
    skipped.push({
      tool: t.name,
      standards: t.settings.enabledBy.map((s) => s.name),
      reason: "enforced by coding standard",
    });
  }

  // Pattern level: only for tools whose patterns the import will actually
  // replace. A config-file-driven tool never touches patterns, so it's not
  // fetched.
  for (const r of toolsToReconfigure) {
    if (r.configTool.useLocalConfigurationFile) continue;

    const configuredPatternIds = new Set(r.configTool.patterns.map((p) => p.patternId));
    const currentlyEnabled = await fetchEnabledToolPatterns(
      provider,
      organization,
      repository,
      r.tool.uuid,
    );
    // Enabled patterns the file would disable, but a standard enforces —
    // the server 409s their disable, so keep them enabled instead.
    const locked = currentlyEnabled.filter(
      (cp) => cp.enabledBy.length > 0 && !configuredPatternIds.has(cp.patternDefinition.id),
    );
    if (locked.length > 0) {
      r.keepEnabledPatternIds = locked.map((cp) => cp.patternDefinition.id);
      for (const cp of locked) {
        skipped.push({
          tool: r.tool.name,
          patternId: cp.patternDefinition.id,
          standards: cp.enabledBy.map((s) => s.name),
          reason: "enforced by coding standard",
        });
      }
    }
  }

  const totalPatterns = config.tools.reduce(
    (sum, t) => sum + (Array.isArray(t.patterns) ? t.patterns.length : 0),
    0,
  );

  return {
    toolsToDisable,
    toolsToEnable,
    toolsToReconfigure,
    unresolvedTools,
    cloudOnlyTools,
    localCliAvailable,
    totalPatterns,
    standards,
    configPath,
    skipped,
  };
}

const MAX_PREVIEW_SKIP_LINES = 5;

export function printImportPreview(
  preview: ImportPreview,
  repoName: string,
  force: boolean,
  /**
   * Whether the token in use can unlink coding standards. False under a
   * repository token, where both remedies the default hint suggests (`--force`
   * and `codacy repository --unlink-standard`) are themselves refused — so the
   * hint has to point somewhere the user can actually go.
   */
  options: { canUnlinkStandards?: boolean } = {},
): void {
  const canUnlinkStandards = options.canUnlinkStandards ?? true;
  console.log();

  // Standards
  if (preview.standards.length > 0) {
    const names = preview.standards.map((s) => s.name).join(", ");
    if (force) {
      console.log(
        `${repoName} will stop following ${preview.standards.length} ${pluralize("coding standard", preview.standards.length)}: ${names}`,
      );
    } else {
      console.log(
        ansis.yellow(
          `⚠ ${repoName} follows ${preview.standards.length} ${pluralize("coding standard", preview.standards.length)}: ${names}`,
        ),
      );
      console.log(
        ansis.yellow(
          canUnlinkStandards
            ? "  Standards may override tool configuration. Use --force to unlink them, or --unlink-standard to remove them manually."
            : "  Standards may override tool configuration. They can't be unlinked with a repository token — unlink them in Codacy (Repository > Settings > Coding standards), or re-run with an account API token.",
        ),
      );
    }
    console.log();
  }

  // Skipped: tools/patterns a coding standard enforces
  if (preview.skipped.length > 0) {
    console.log("Skipped (enforced by coding standard):");
    const shown = preview.skipped.slice(0, MAX_PREVIEW_SKIP_LINES);
    for (const s of shown) {
      const target = s.patternId ? `${s.tool}:${s.patternId}` : s.tool;
      console.log(`  ${target} (${s.standards.join(", ")})`);
    }
    const remaining = preview.skipped.length - shown.length;
    if (remaining > 0) {
      console.log(`  ... and ${remaining} more`);
    }
    console.log();
  }

  // Local CLI availability warning
  if (!preview.localCliAvailable) {
    console.log(
      ansis.yellow(
        "⚠ Could not query codacy-analysis CLI. No tools will be disabled — only tools in the config will be enabled/reconfigured.",
      ),
    );
    console.log();
  }

  // Unresolved tools warning
  if (preview.unresolvedTools.length > 0) {
    console.log(
      ansis.yellow(
        `⚠ ${preview.unresolvedTools.length} ${pluralize("tool", preview.unresolvedTools.length)} in the config could not be matched: ${preview.unresolvedTools.join(", ")}`,
      ),
    );
    console.log();
  }

  // Cloud-only tools (unchanged)
  if (preview.cloudOnlyTools.length > 0) {
    const names = preview.cloudOnlyTools.map((t) => t.name).join(", ");
    console.log(
      ansis.dim(
        `${preview.cloudOnlyTools.length} cloud-only ${pluralize("tool", preview.cloudOnlyTools.length)} unchanged: ${names}`,
      ),
    );
  }

  // Tools to disable
  if (preview.toolsToDisable.length > 0) {
    const names = preview.toolsToDisable.map((t) => t.name).join(", ");
    console.log(
      `${preview.toolsToDisable.length} ${pluralize("tool", preview.toolsToDisable.length)} will be disabled: ${names}`,
    );
  }

  // Tools to enable
  if (preview.toolsToEnable.length > 0) {
    const names = preview.toolsToEnable.map((r) => r.tool.name).join(", ");
    console.log(
      `${preview.toolsToEnable.length} ${pluralize("tool", preview.toolsToEnable.length)} will be enabled: ${names}`,
    );
  }

  // Tools to reconfigure
  if (preview.toolsToReconfigure.length > 0) {
    const names = preview.toolsToReconfigure.map((r) => r.tool.name).join(", ");
    console.log(
      `${preview.toolsToReconfigure.length} ${pluralize("tool", preview.toolsToReconfigure.length)} will be reconfigured: ${names}`,
    );
  }

  const allResolved = [
    ...preview.toolsToEnable,
    ...preview.toolsToReconfigure,
  ];
  const configFileTools = allResolved.filter(
    (r) => r.configTool.useLocalConfigurationFile,
  );
  const patternTools = allResolved.filter(
    (r) => !r.configTool.useLocalConfigurationFile,
  );

  console.log();
  if (patternTools.length > 0) {
    console.log(
      `Existing patterns in ${patternTools.length} ${pluralize("tool", patternTools.length)} will be replaced with the patterns in ${ansis.bold(preview.configPath)}.`,
    );
    console.log(
      `${ansis.bold(String(preview.totalPatterns))} ${pluralize("pattern", preview.totalPatterns)} will be enabled.`,
    );
  }
  if (configFileTools.length > 0) {
    const names = configFileTools.map((r) => r.tool.name).join(", ");
    console.log(
      `${configFileTools.length} ${pluralize("tool", configFileTools.length)} will use their local configuration file: ${names}`,
    );
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function buildConfigurePatterns(
  toolConfig: CodacyToolConfig,
): ConfigurePattern[] {
  return toolConfig.patterns.map((p) => ({
    id: p.patternId,
    enabled: true,
    parameters: p.parameters
      ? Object.entries(p.parameters).map(([name, value]) => ({
          name,
          value: String(value),
        }))
      : undefined,
  }));
}

export async function executeImport(
  provider: string,
  organization: string,
  repository: string,
  preview: ImportPreview,
  config: CodacyConfig,
  allTools: Tool[],
  spinner: ReturnType<typeof ora>,
  force: boolean = false,
): Promise<{ succeeded: string[]; failed: ImportFailure[]; skipped: ImportSkip[] }> {
  const succeeded: string[] = [];
  const failed: ImportFailure[] = [];

  // Unlink coding standards when --force is used
  if (force) {
    for (const standard of preview.standards) {
      spinner.text = `Unlinking coding standard "${standard.name}"...`;
      try {
        await CodingStandardsService.applyCodingStandardToRepositories(
          provider,
          organization,
          standard.id,
          { link: [], unlink: [repository] },
        );
      } catch (err) {
        failed.push({
          tool: `Standard: ${standard.name}`,
          ...extractErrorDetails(err),
        });
      }
    }
  }

  // Configure each tool from the config file
  const allResolved = [...preview.toolsToEnable, ...preview.toolsToReconfigure];
  for (const resolved of allResolved) {
    spinner.text = `Configuring ${resolved.tool.name}...`;
    try {
      if (resolved.configTool.useLocalConfigurationFile) {
        // Config file mode: just enable the tool with the config file flag, no pattern changes
        await AnalysisService.configureTool(
          provider,
          organization,
          repository,
          resolved.tool.uuid,
          { enabled: true, useConfigurationFile: true },
        );
      } else {
        // Pattern mode: reset existing patterns, then apply new ones
        await AnalysisService.updateRepositoryToolPatterns(
          provider,
          organization,
          repository,
          resolved.tool.uuid,
          { enabled: false },
        );

        const patterns = buildConfigurePatterns(resolved.configTool);
        // Re-enable standard-locked patterns the reset below would otherwise drop.
        for (const id of resolved.keepEnabledPatternIds ?? []) {
          patterns.push({ id, enabled: true });
        }
        const batches = chunk(patterns, 1000);

        for (const batch of batches) {
          await AnalysisService.configureTool(
            provider,
            organization,
            repository,
            resolved.tool.uuid,
            {
              enabled: true,
              useConfigurationFile: false,
              patterns: batch,
            },
          );
        }

        if (batches.length === 0) {
          await AnalysisService.configureTool(
            provider,
            organization,
            repository,
            resolved.tool.uuid,
            { enabled: true, useConfigurationFile: false },
          );
        }
      }

      succeeded.push(resolved.tool.name);
    } catch (err) {
      failed.push({
        tool: resolved.tool.name,
        ...extractErrorDetails(err),
      });
    }
  }

  // Disable tools not in config
  for (const tool of preview.toolsToDisable) {
    spinner.text = `Disabling ${tool.name}...`;
    try {
      await AnalysisService.configureTool(
        provider,
        organization,
        repository,
        tool.uuid,
        { enabled: false },
      );
      succeeded.push(`${tool.name} (disabled)`);
    } catch (err) {
      failed.push({
        tool: tool.name,
        ...extractErrorDetails(err),
      });
    }
  }

  return { succeeded, failed, skipped: preview.skipped };
}
