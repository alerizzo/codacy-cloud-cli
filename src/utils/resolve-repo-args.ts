import ansis from "ansis";
import { detectRepoContext } from "./git-remote";

export interface ResolvedArgs {
  provider: string;
  organization: string;
  repository: string;
  trailingArgs: string[];
}

export function resolveRepoArgs(
  rawArgs: (string | undefined)[],
  trailingCount: number,
  commandName: string,
  trailingNames: string[],
): ResolvedArgs {
  const defined = rawArgs.filter((v): v is string => v !== undefined);
  const fullCount = 3 + trailingCount;

  if (defined.length === fullCount) {
    return {
      provider: defined[0],
      organization: defined[1],
      repository: defined[2],
      trailingArgs: defined.slice(3),
    };
  }

  if (defined.length === trailingCount && trailingCount > 0) {
    const ctx = detectRepoContext();
    printAutoDetected(ctx);
    return {
      ...ctx,
      trailingArgs: defined,
    };
  }

  if (defined.length === 0 && trailingCount === 0) {
    const ctx = detectRepoContext();
    printAutoDetected(ctx);
    return { ...ctx, trailingArgs: [] };
  }

  const trailDesc =
    trailingNames.length > 0
      ? " " + trailingNames.map((n) => `<${n}>`).join(" ")
      : "";
  const autoExample = `codacy ${commandName}${trailDesc}`;
  const explicitExample = `codacy ${commandName} <provider> <organization> <repository>${trailDesc}`;

  let message: string;
  if (defined.length === 0 && trailingCount > 0) {
    message =
      `Missing required argument${trailingCount > 1 ? "s" : ""}: ${trailingNames.join(", ")}.\n\n` +
      `Usage:\n  ${autoExample}    (auto-detect repo from git remote)\n  ${explicitExample}`;
  } else {
    message =
      `Ambiguous arguments for '${commandName}'. ` +
      `Expected ${trailingCount > 0 ? trailingCount : "0"} or ${fullCount} positional arguments, got ${defined.length}.\n\n` +
      `Usage:\n  ${autoExample}    (auto-detect repo from git remote)\n  ${explicitExample}`;
  }

  throw new Error(message);
}

function printAutoDetected(ctx: {
  provider: string;
  organization: string;
  repository: string;
}): void {
  console.error(
    ansis.dim(
      `  Using ${ctx.provider} / ${ctx.organization} / ${ctx.repository} (from git remote)`,
    ),
  );
}
