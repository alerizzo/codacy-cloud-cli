import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerPullRequestsCommand } from "./pull-requests";
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
  registerPullRequestsCommand(program);
  return program;
}

function mockPr(overrides: Record<string, unknown> = {}) {
  return {
    isUpToStandards: true,
    isAnalysing: false,
    pullRequest: {
      id: 1,
      number: 42,
      updated: "2025-06-14T10:00:00Z",
      status: "Open",
      repository: "test-repo",
      title: "Add new feature",
      owner: { id: 1, name: "dev-user" },
      headCommitSha: "abc1234567890",
      commonAncestorCommitSha: "def456",
      originBranch: "feature/new",
      targetBranch: "main",
      gitHref: "https://github.com/test-org/test-repo/pull/42",
    },
    newIssues: 3,
    fixedIssues: 1,
    deltaComplexity: 2,
    deltaClonesCount: -1,
    coverage: {
      deltaCoverage: -1.5,
      diffCoverage: { value: 85.0, cause: "ValueIsPresent" },
      isUpToStandards: true,
      resultReasons: [],
    },
    quality: { isUpToStandards: true, resultReasons: [] },
    meta: {},
    ...overrides,
  };
}

function getAllOutput(): string {
  return (console.log as ReturnType<typeof vi.fn>).mock.calls
    .map((c) => c[0])
    .join("\n");
}

describe("pull-requests command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CODACY_API_TOKEN = "test-token";
  });

  it("should fetch and display pull requests for a repository", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr(), mockPr({ pullRequest: { ...mockPr().pullRequest, number: 43, title: "Fix bug" } })],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
    ]);

    expect(AnalysisService.listRepositoryPullRequests).toHaveBeenCalledWith(
      "gh", "test-org", "test-repo", 100, undefined, undefined, undefined, undefined,
    );

    const output = getAllOutput();
    expect(output).toContain("Add new feature");
    expect(output).toContain("Fix bug");
    expect(output).toContain("Pull Requests — Found 2 pull requests");
  });

  it("should map --search-text to the textQuery API param", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr()],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
      "--search-text", "flaky test",
    ]);

    expect(AnalysisService.listRepositoryPullRequests).toHaveBeenCalledWith(
      "gh", "test-org", "test-repo", 100, undefined, undefined, "flaky test", undefined,
    );
  });

  it("should map --branch to the targetBranch API param", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr()],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
      "--branch", "release/1.0",
    ]);

    expect(AnalysisService.listRepositoryPullRequests).toHaveBeenCalledWith(
      "gh", "test-org", "test-repo", 100, undefined, undefined, undefined, "release/1.0",
    );
  });

  it("should combine --search-text and --branch", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr()],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
      "--search-text", "flaky test", "--branch", "release/1.0",
    ]);

    expect(AnalysisService.listRepositoryPullRequests).toHaveBeenCalledWith(
      "gh", "test-org", "test-repo", 100, undefined, undefined, "flaky test", "release/1.0",
    );
  });

  it("should show a message when there are no pull requests", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
    ]);

    const output = getAllOutput();
    expect(output).toContain("No pull requests found.");
  });

  it("should paginate up to --limit, following the cursor", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests)
      .mockResolvedValueOnce({
        data: [mockPr({ pullRequest: { ...mockPr().pullRequest, number: 1 } })],
        pagination: { cursor: "page2", total: 3 },
      } as any)
      .mockResolvedValueOnce({
        data: [mockPr({ pullRequest: { ...mockPr().pullRequest, number: 2 } })],
        pagination: { total: 3 },
      } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
      "--limit", "2",
    ]);

    expect(AnalysisService.listRepositoryPullRequests).toHaveBeenCalledTimes(2);
    expect(AnalysisService.listRepositoryPullRequests).toHaveBeenNthCalledWith(
      2, "gh", "test-org", "test-repo", 2, "page2", undefined, undefined, undefined,
    );
  });

  it("should warn about pagination when more results exist than were fetched", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr()],
      pagination: { total: 5 },
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
    ]);

    const output = getAllOutput();
    expect(output).toContain("--limit");
  });

  it("should emit structured JSON with --output json", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr()],
      pagination: { total: 1 },
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "--output", "json", "pull-requests", "gh", "test-org", "test-repo",
    ]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"Add new feature"'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"targetBranch": "main"'),
    );
  });

  it("should fail when CODACY_API_TOKEN is not set", async () => {
    delete process.env.CODACY_API_TOKEN;

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const program = createProgram();
    await expect(
      program.parseAsync([
        "node", "test", "pull-requests", "gh", "test-org", "test-repo",
      ]),
    ).rejects.toThrow("process.exit called");

    mockExit.mockRestore();
  });

  describe("auto-detect from git remote", () => {
    it("should auto-detect provider/org/repo when no positional args are provided", async () => {
      vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
        data: [],
      } as any);

      const program = createProgram();
      await program.parseAsync(["node", "test", "pull-requests"]);

      expect(AnalysisService.listRepositoryPullRequests).toHaveBeenCalledWith(
        "gh", "auto-org", "auto-repo", 100, undefined, undefined, undefined, undefined,
      );
    });
  });
});
