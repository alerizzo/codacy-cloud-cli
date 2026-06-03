import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerPatternCommand } from "./pattern";
import { AnalysisService } from "../api/client/services/AnalysisService";

vi.mock("../api/client/services/AnalysisService");
vi.mock("../utils/credentials", () => ({ loadCredentials: vi.fn(() => null) }));
vi.mock("../utils/git-remote", () => ({
  detectRepoContext: vi.fn(() => ({
    provider: "gh",
    organization: "auto-org",
    repository: "auto-repo",
  })),
}));
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

function createProgram(): Command {
  const program = new Command();
  program.option("-o, --output <format>", "output format", "table");
  registerPatternCommand(program);
  return program;
}

const mockTools = [
  {
    uuid: "uuid-eslint",
    name: "ESLint",
    isClientSide: false,
    settings: {
      isEnabled: true,
      followsStandard: false,
      isCustom: false,
      hasConfigurationFile: false,
      usesConfigurationFile: false,
      enabledBy: [],
    },
  },
];

const mockConfiguredPattern = {
  patternDefinition: {
    id: "no-unused-vars",
    title: "No Unused Variables",
    category: "ErrorProne",
    severityLevel: "Warning",
    enabled: true,
  },
  enabled: false, // currently disabled
  parameters: [],
  enabledBy: [],
};

// A tool whose patterns are driven by a local configuration file.
const mockConfigFileTools = [
  {
    uuid: "uuid-eslint",
    name: "ESLint",
    isClientSide: false,
    settings: {
      isEnabled: true,
      followsStandard: false,
      isCustom: false,
      hasConfigurationFile: true,
      usesConfigurationFile: true,
      enabledBy: [],
    },
  },
];

function getAllOutput(): string {
  return (console.log as ReturnType<typeof vi.fn>).mock.calls
    .map((c) => c[0])
    .join("\n");
}

describe("pattern command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CODACY_API_TOKEN = "test-token";
    vi.mocked(AnalysisService.listRepositoryTools).mockResolvedValue({
      data: mockTools,
      pagination: undefined,
    } as any);
    vi.mocked(AnalysisService.listRepositoryToolPatterns).mockResolvedValue({
      data: [mockConfiguredPattern],
      pagination: undefined,
    } as any);
    vi.mocked(AnalysisService.configureTool).mockResolvedValue(undefined as any);
  });

  it("should enable a pattern", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "pattern",
      "gh",
      "test-org",
      "test-repo",
      "eslint",
      "no-unused-vars",
      "--enable",
    ]);

    expect(AnalysisService.configureTool).toHaveBeenCalledWith(
      "gh",
      "test-org",
      "test-repo",
      "uuid-eslint",
      {
        patterns: [
          {
            id: "no-unused-vars",
            enabled: true,
          },
        ],
      },
    );

    // Patterns are fetched to check coding-standard enforcement before updating
    expect(AnalysisService.listRepositoryToolPatterns).toHaveBeenCalledWith(
      "gh",
      "test-org",
      "test-repo",
      "uuid-eslint",
      undefined,
      undefined,
      undefined,
      undefined,
      "no-unused-vars",
    );

    const output = getAllOutput();
    expect(output).toContain("enabled");
    expect(output).toContain("no-unused-vars");
  });

  it("should disable a pattern", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "pattern",
      "gh",
      "test-org",
      "test-repo",
      "eslint",
      "no-unused-vars",
      "--disable",
    ]);

    expect(AnalysisService.configureTool).toHaveBeenCalledWith(
      "gh",
      "test-org",
      "test-repo",
      "uuid-eslint",
      {
        patterns: [
          {
            id: "no-unused-vars",
            enabled: false,
          },
        ],
      },
    );

    const output = getAllOutput();
    expect(output).toContain("disabled");
  });

  it("should set parameters (fetches current enabled state)", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "pattern",
      "gh",
      "test-org",
      "test-repo",
      "eslint",
      "no-unused-vars",
      "--parameter",
      "max=3",
    ]);

    // Should fetch patterns to determine current enabled state
    expect(AnalysisService.listRepositoryToolPatterns).toHaveBeenCalledWith(
      "gh",
      "test-org",
      "test-repo",
      "uuid-eslint",
      undefined,
      undefined,
      undefined,
      undefined,
      "no-unused-vars",
    );

    expect(AnalysisService.configureTool).toHaveBeenCalledWith(
      "gh",
      "test-org",
      "test-repo",
      "uuid-eslint",
      {
        patterns: [
          {
            id: "no-unused-vars",
            enabled: false, // current state from mock (disabled)
            parameters: [{ name: "max", value: "3" }],
          },
        ],
      },
    );

    const output = getAllOutput();
    expect(output).toContain("max");
    expect(output).toContain("3");
  });

  it("should enable a pattern and set parameters in one command", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "pattern",
      "gh",
      "test-org",
      "test-repo",
      "eslint",
      "no-unused-vars",
      "--enable",
      "--parameter",
      "max=5",
      "--parameter",
      "min=1",
    ]);

    expect(AnalysisService.configureTool).toHaveBeenCalledWith(
      "gh",
      "test-org",
      "test-repo",
      "uuid-eslint",
      {
        patterns: [
          {
            id: "no-unused-vars",
            enabled: true,
            parameters: [
              { name: "max", value: "5" },
              { name: "min", value: "1" },
            ],
          },
        ],
      },
    );

    // Patterns are fetched to check coding-standard enforcement before updating
    expect(AnalysisService.listRepositoryToolPatterns).toHaveBeenCalled();
  });

  it("should show pattern info when no action flag is specified", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "pattern",
      "gh",
      "test-org",
      "test-repo",
      "eslint",
      "no-unused-vars",
    ]);

    // Searches by ID, renders the card, and does not modify anything
    expect(AnalysisService.listRepositoryToolPatterns).toHaveBeenCalledWith(
      "gh",
      "test-org",
      "test-repo",
      "uuid-eslint",
      undefined,
      undefined,
      undefined,
      undefined,
      "no-unused-vars",
    );
    expect(AnalysisService.configureTool).not.toHaveBeenCalled();

    const output = getAllOutput();
    expect(output).toContain("No Unused Variables");
    expect(output).toContain("no-unused-vars");
  });

  it("should output pattern info as JSON when --output json is set", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "--output",
      "json",
      "pattern",
      "gh",
      "test-org",
      "test-repo",
      "eslint",
      "no-unused-vars",
    ]);

    expect(AnalysisService.configureTool).not.toHaveBeenCalled();
    const output = getAllOutput();
    const parsed = JSON.parse(output);
    expect(parsed.patternDefinition.id).toBe("no-unused-vars");
  });

  it("should exit when pattern not found in info mode", async () => {
    vi.mocked(AnalysisService.listRepositoryToolPatterns).mockResolvedValue({
      data: [],
      pagination: undefined,
    } as any);

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const program = createProgram();
    await expect(
      program.parseAsync([
        "node",
        "test",
        "pattern",
        "gh",
        "test-org",
        "test-repo",
        "eslint",
        "nonexistent-pattern",
      ]),
    ).rejects.toThrow("process.exit called");

    expect(AnalysisService.configureTool).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it("should exit with error when tool is not found", async () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const program = createProgram();
    await expect(
      program.parseAsync([
        "node",
        "test",
        "pattern",
        "gh",
        "test-org",
        "test-repo",
        "nonexistent-tool",
        "some-pattern",
        "--enable",
      ]),
    ).rejects.toThrow("process.exit called");

    expect(AnalysisService.configureTool).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it("should exit with error when pattern is not found (parameters-only mode)", async () => {
    vi.mocked(AnalysisService.listRepositoryToolPatterns).mockResolvedValue({
      data: [],
      pagination: undefined,
    } as any);

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const program = createProgram();
    await expect(
      program.parseAsync([
        "node",
        "test",
        "pattern",
        "gh",
        "test-org",
        "test-repo",
        "eslint",
        "nonexistent-pattern",
        "--parameter",
        "max=3",
      ]),
    ).rejects.toThrow("process.exit called");

    expect(AnalysisService.configureTool).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it("should fail when CODACY_API_TOKEN is not set", async () => {
    delete process.env.CODACY_API_TOKEN;

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const program = createProgram();
    await expect(
      program.parseAsync([
        "node",
        "test",
        "pattern",
        "gh",
        "test-org",
        "test-repo",
        "eslint",
        "no-unused-vars",
        "--enable",
      ]),
    ).rejects.toThrow("process.exit called");

    mockExit.mockRestore();
  });

  describe("configuration file guard", () => {
    beforeEach(() => {
      vi.mocked(AnalysisService.listRepositoryTools).mockResolvedValue({
        data: mockConfigFileTools,
        pagination: undefined,
      } as any);
    });

    it("shows a notice and skips fetching patterns in info mode", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "test",
        "pattern",
        "gh",
        "test-org",
        "test-repo",
        "eslint",
        "no-unused-vars",
      ]);

      const output = getAllOutput();
      expect(output).toContain("ESLint is using a local configuration file.");
      expect(AnalysisService.listRepositoryToolPatterns).not.toHaveBeenCalled();
      expect(AnalysisService.configureTool).not.toHaveBeenCalled();
    });

    it("refuses to modify and exits 1", async () => {
      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });

      const program = createProgram();
      await expect(
        program.parseAsync([
          "node",
          "test",
          "pattern",
          "gh",
          "test-org",
          "test-repo",
          "eslint",
          "no-unused-vars",
          "--disable",
        ]),
      ).rejects.toThrow("process.exit called");

      expect(AnalysisService.configureTool).not.toHaveBeenCalled();
      expect(AnalysisService.listRepositoryToolPatterns).not.toHaveBeenCalled();
      mockExit.mockRestore();
    });
  });

  describe("coding standard enforcement guard", () => {
    beforeEach(() => {
      vi.mocked(AnalysisService.listRepositoryToolPatterns).mockResolvedValue({
        data: [
          {
            ...mockConfiguredPattern,
            enabled: true,
            enabledBy: [{ id: 1, name: "OWASP Top 10" }],
          },
        ],
        pagination: undefined,
      } as any);
    });

    it("refuses to modify an enforced pattern and exits 1", async () => {
      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });

      const program = createProgram();
      await expect(
        program.parseAsync([
          "node",
          "test",
          "pattern",
          "gh",
          "test-org",
          "test-repo",
          "eslint",
          "no-unused-vars",
          "--disable",
        ]),
      ).rejects.toThrow("process.exit called");

      expect(AnalysisService.configureTool).not.toHaveBeenCalled();
      mockExit.mockRestore();
    });

    it("still shows an enforced pattern in info mode", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "test",
        "pattern",
        "gh",
        "test-org",
        "test-repo",
        "eslint",
        "no-unused-vars",
      ]);

      const output = getAllOutput();
      expect(output).toContain("Enforced by: OWASP Top 10");
      expect(AnalysisService.configureTool).not.toHaveBeenCalled();
    });
  });

  describe("auto-detect from git remote", () => {
    it("should auto-detect provider/org/repo when only toolName and patternId are provided", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node", "test", "pattern", "eslint", "no-unused-vars", "--enable",
      ]);

      expect(AnalysisService.listRepositoryTools).toHaveBeenCalledWith(
        "gh",
        "auto-org",
        "auto-repo",
      );
      expect(AnalysisService.configureTool).toHaveBeenCalledWith(
        "gh",
        "auto-org",
        "auto-repo",
        "uuid-eslint",
        {
          patterns: [
            {
              id: "no-unused-vars",
              enabled: true,
            },
          ],
        },
      );
    });
  });
});
