import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatAnalysisStatus,
  resolveToolUuids,
  formatDuration,
  isBeingAnalyzed,
  formatVersionSegment,
  formatDependencyChain,
  formatDependencyChainsLine,
  formatDependencyChainsBlock,
  formatGrade,
  formatCountCell,
  formatCoverageCell,
} from "./formatting";

// Mock ansis to return raw text for easier testing
vi.mock("ansis", () => ({
  default: {
    dim: (s: string) => s,
    blueBright: (s: string) => s,
    yellow: (s: string) => s,
    bold: (s: string) => s,
    red: (s: string) => s,
    green: (s: string) => s,
    blue: (s: string) => s,
    hex: () => (s: string) => s,
    white: (s: string) => s,
    magenta: (s: string) => s,
  },
}));

describe("formatAnalysisStatus", () => {
  it("should show 'Finished' when analysis is complete and no coverage expected", () => {
    const result = formatAnalysisStatus({
      commitSha: "abc1234567890",
      startedAnalysis: "2025-06-15T10:00:00Z",
      endedAnalysis: "2025-06-15T10:05:00Z",
      expectsCoverage: false,
      hasCoverageData: false,
    });
    expect(result).toContain("Finished");
    expect(result).toContain("abc1234");
  });

  it("should show 'In progress...' for first analysis", () => {
    const result = formatAnalysisStatus({
      commitSha: "def5678901234",
      startedAnalysis: "2025-06-15T10:00:00Z",
      endedAnalysis: undefined,
      expectsCoverage: false,
      hasCoverageData: false,
    });
    expect(result).toContain("In progress...");
    expect(result).toContain("def5678");
  });

  it("should show 'Reanalysis in progress...' when reanalysis is running", () => {
    const result = formatAnalysisStatus({
      commitSha: "abc1234567890",
      startedAnalysis: "2025-06-15T12:00:00Z",
      endedAnalysis: "2025-06-15T10:05:00Z",
      expectsCoverage: false,
      hasCoverageData: false,
    });
    expect(result).toContain("Reanalysis in progress...");
    expect(result).toContain("Finished");
    expect(result).toContain("abc1234");
  });

  it("should show 'Waiting for coverage reports...' when coverage expected within 3h", () => {
    const recentEnd = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
    const result = formatAnalysisStatus({
      commitSha: "cov1234567890",
      startedAnalysis: "2025-06-15T10:00:00Z",
      endedAnalysis: recentEnd,
      expectsCoverage: true,
      hasCoverageData: false,
    });
    expect(result).toContain("Waiting for coverage reports...");
    expect(result).toContain("cov1234");
  });

  it("should show 'Missing coverage reports' when coverage expected after 3h", () => {
    const oldEnd = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(); // 4h ago
    const result = formatAnalysisStatus({
      commitSha: "old1234567890",
      startedAnalysis: "2025-06-15T10:00:00Z",
      endedAnalysis: oldEnd,
      expectsCoverage: true,
      hasCoverageData: false,
    });
    expect(result).toContain("Missing coverage reports");
    expect(result).toContain("old1234");
  });

  it("should show 'Never' when no analysis data", () => {
    const result = formatAnalysisStatus({
      commitSha: "abc1234567890",
      startedAnalysis: undefined,
      endedAnalysis: undefined,
      expectsCoverage: false,
      hasCoverageData: false,
    });
    expect(result).toBe("Never");
  });
});

describe("resolveToolUuids", () => {
  const mockTools = [
    { uuid: "uuid-eslint", name: "ESLint", shortName: "eslint", prefix: "ESLint_" },
    { uuid: "uuid-eslint9", name: "ESLint 9", shortName: "eslint9", prefix: "ESLint9_" },
    { uuid: "uuid-semgrep", name: "Semgrep", shortName: "semgrep", prefix: "Semgrep_" },
    { uuid: "uuid-markdownlint", name: "Markdownlint", shortName: "markdownlint", prefix: "Markdownlint_" },
    { uuid: "uuid-remarklint", name: "Remarklint", shortName: "remarklint", prefix: "Remarklint_" },
  ] as any[];

  const fetchTools = vi.fn(async () => mockTools);

  beforeEach(() => {
    fetchTools.mockClear();
  });

  it("should pass UUIDs through without fetching tools", async () => {
    const result = await resolveToolUuids(
      ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
      fetchTools,
    );
    expect(result).toEqual(["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]);
    expect(fetchTools).not.toHaveBeenCalled();
  });

  it("should resolve exact name match (case-insensitive)", async () => {
    const result = await resolveToolUuids(["eslint"], fetchTools);
    expect(result).toEqual(["uuid-eslint"]);
  });

  it("should resolve exact shortName match (case-insensitive)", async () => {
    const result = await resolveToolUuids(["eslint9"], fetchTools);
    expect(result).toEqual(["uuid-eslint9"]);
  });

  it("should resolve a unique substring match via name", async () => {
    const result = await resolveToolUuids(["semgr"], fetchTools);
    expect(result).toEqual(["uuid-semgrep"]);
  });

  it("should error on ambiguous substring match", async () => {
    await expect(resolveToolUuids(["mark"], fetchTools)).rejects.toThrow(
      /ambiguous.*Markdownlint.*Remarklint/,
    );
  });

  it("should error when tool is not found", async () => {
    await expect(resolveToolUuids(["zzz"], fetchTools)).rejects.toThrow(
      'Tool "zzz" not found',
    );
  });

  it("should deduplicate resolved UUIDs", async () => {
    const result = await resolveToolUuids(["eslint", "eslint"], fetchTools);
    expect(result).toEqual(["uuid-eslint"]);
  });

  it("should handle mixed UUIDs and names, fetching tools only once", async () => {
    const result = await resolveToolUuids(
      ["a1b2c3d4-e5f6-7890-abcd-ef1234567890", "semgrep", "eslint"],
      fetchTools,
    );
    expect(result).toEqual([
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "uuid-semgrep",
      "uuid-eslint",
    ]);
    expect(fetchTools).toHaveBeenCalledTimes(1);
  });
});

describe("formatDuration", () => {
  it("shows seconds only for sub-minute durations", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(999)).toBe("1s");
  });

  it("shows minutes and seconds", () => {
    expect(formatDuration(94_000)).toBe("1m 34s");
    expect(formatDuration(60_000)).toBe("1m 0s");
  });

  it("shows hours and minutes (dropping seconds)", () => {
    expect(formatDuration(7_380_000)).toBe("2h 3m");
  });

  it("clamps negatives to 0s", () => {
    expect(formatDuration(-5_000)).toBe("0s");
  });
});

describe("formatGrade", () => {
  // ansis is mocked to identity, so we assert on the letter and N/A fallback.
  it("returns the grade letter for A–F including E", () => {
    for (const g of ["A", "B", "C", "D", "E", "F"]) {
      expect(formatGrade(g)).toBe(g);
    }
  });

  it("returns N/A when the grade is missing", () => {
    expect(formatGrade(undefined)).toBe("N/A");
    expect(formatGrade("")).toBe("N/A");
  });
});

describe("formatCountCell", () => {
  it("abbreviates a count", () => {
    expect(formatCountCell(1200)).toBe("1.2k");
    expect(formatCountCell(0)).toBe("0");
  });

  it("renders a dash when the value is absent", () => {
    expect(formatCountCell(undefined)).toBe("-");
  });
});

describe("formatCoverageCell", () => {
  it("renders a one-decimal percentage", () => {
    expect(formatCoverageCell(76.3)).toBe("76.3%");
    expect(formatCoverageCell(0)).toBe("0.0%");
  });

  it("renders a dash when coverage is absent", () => {
    expect(formatCoverageCell(undefined)).toBe("-");
  });
});

describe("isBeingAnalyzed", () => {
  it("is true when started but never finished", () => {
    expect(isBeingAnalyzed("2025-06-15T10:00:00Z", undefined)).toBe(true);
  });

  it("is true when started after the last finish (a fresh reanalysis)", () => {
    expect(
      isBeingAnalyzed("2025-06-15T10:10:00Z", "2025-06-15T10:05:00Z"),
    ).toBe(true);
  });

  it("is false when finished after it started", () => {
    expect(
      isBeingAnalyzed("2025-06-15T10:00:00Z", "2025-06-15T10:05:00Z"),
    ).toBe(false);
  });

  it("is false when never started", () => {
    expect(isBeingAnalyzed(undefined, undefined)).toBe(false);
  });
});

describe("formatVersionSegment", () => {
  it("returns null when there is no affected version", () => {
    expect(formatVersionSegment(undefined, ["1.0.1"])).toBeNull();
  });

  it("formats affected → fixed without a prefix by default", () => {
    expect(formatVersionSegment("1.0.0", ["1.0.1", "1.1.0"])).toBe(
      "1.0.0 → 1.0.1, 1.1.0",
    );
  });

  it("prepends 'Update ' when requested", () => {
    expect(
      formatVersionSegment("1.0.0", ["1.0.1"], { includeUpdatePrefix: true }),
    ).toBe("Update 1.0.0 → 1.0.1");
  });

  it("omits the fixed suffix when no fixed version is given", () => {
    expect(formatVersionSegment("1.0.0", [])).toBe("1.0.0");
    expect(formatVersionSegment("1.0.0")).toBe("1.0.0");
  });
});

describe("formatDependencyChain", () => {
  it("shows a 2-package chain in full", () => {
    expect(formatDependencyChain(["a@1", "m@0.1.2"])).toBe("a@1 → m@0.1.2");
  });

  it("shows a 3-package chain in full", () => {
    expect(formatDependencyChain(["a@1", "b@2", "m@0.1.2"])).toBe(
      "a@1 → b@2 → m@0.1.2",
    );
  });

  it("collapses the middle of a 4-package chain to '2 more'", () => {
    expect(formatDependencyChain(["a@1", "b@2", "c@3", "d@4"])).toBe(
      "a@1 → ... 2 more ... → d@4",
    );
  });

  it("collapses the middle of a 5-package chain to '3 more'", () => {
    expect(formatDependencyChain(["a@1", "b@2", "c@3", "d@4", "e@5"])).toBe(
      "a@1 → ... 3 more ... → e@5",
    );
  });

  it("shows a single-package chain as-is", () => {
    expect(formatDependencyChain(["m@0.1.2"])).toBe("m@0.1.2");
  });
});

describe("formatDependencyChainsLine", () => {
  it("returns null for empty/undefined chains", () => {
    expect(formatDependencyChainsLine([])).toBeNull();
    expect(formatDependencyChainsLine(undefined)).toBeNull();
  });

  it("renders a direct dependency as actionable update text", () => {
    expect(formatDependencyChainsLine([["minimatch@0.1.2"]], ["0.1.5"])).toBe(
      "Direct - Update minimatch@0.1.2 to 0.1.5",
    );
  });

  it("renders a transitive chain with the fixed version", () => {
    expect(
      formatDependencyChainsLine(
        [["package@1.0.0", "anotherPackage@0.5.2", "minimatch@0.1.2"]],
        ["0.1.5"],
      ),
    ).toBe(
      "Transitive - package@1.0.0 → anotherPackage@0.5.2 → minimatch@0.1.2 (Fixed in 0.1.5)",
    );
  });

  it("appends '... and N more' when there are extra chains", () => {
    expect(
      formatDependencyChainsLine(
        [
          ["a@1", "m@0.1.2"],
          ["b@1", "m@0.1.2"],
          ["c@1", "m@0.1.2"],
        ],
        ["0.1.5"],
      ),
    ).toBe("Transitive - a@1 → m@0.1.2 (Fixed in 0.1.5) ... and 2 more");
  });

  it("omits the fixed-version suffix when none is provided", () => {
    expect(formatDependencyChainsLine([["a@1", "m@0.1.2"]])).toBe(
      "Transitive - a@1 → m@0.1.2",
    );
    expect(formatDependencyChainsLine([["minimatch@0.1.2"]])).toBe(
      "Direct - Update minimatch@0.1.2",
    );
  });
});

describe("formatDependencyChainsBlock", () => {
  it("returns null for empty/undefined chains", () => {
    expect(formatDependencyChainsBlock([])).toBeNull();
    expect(formatDependencyChainsBlock(undefined)).toBeNull();
  });

  it("renders all chains with the label once and aligned continuation lines", () => {
    const block = formatDependencyChainsBlock(
      [
        ["package@1.0.0", "anotherPackage@0.5.2", "minimatch@0.1.2"],
        ["anotherPackage@1.0.0", "b@1", "c@2", "d@3", "e@4", "minimatch@0.1.1"],
      ],
      ["0.1.5"],
    );
    expect(block).toBe(
      "Transitive - package@1.0.0 → anotherPackage@0.5.2 → minimatch@0.1.2 (Fixed in 0.1.5)\n" +
        "           - anotherPackage@1.0.0 → ... 4 more ... → minimatch@0.1.1 (Fixed in 0.1.5)",
    );
  });

  it("aligns continuation lines under a shorter 'Direct' label", () => {
    const block = formatDependencyChainsBlock(
      [["minimatch@0.1.2"], ["minimatch@0.1.3"]],
      ["0.1.5"],
    );
    expect(block).toBe(
      "Direct - Update minimatch@0.1.2 to 0.1.5\n" +
        "       - Update minimatch@0.1.3 to 0.1.5",
    );
  });
});
