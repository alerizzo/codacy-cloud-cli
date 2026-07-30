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

  it("should fetch and display pull requests for a repository, defaulting to open state", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr(), mockPr({ pullRequest: { ...mockPr().pullRequest, number: 43, title: "Fix bug" } })],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
    ]);

    expect(AnalysisService.listRepositoryPullRequests).toHaveBeenCalledWith(
      "gh", "test-org", "test-repo", 100, undefined, "last-updated", undefined, undefined,
    );

    const output = getAllOutput();
    expect(output).toContain("Add new feature");
    expect(output).toContain("Fix bug");
    expect(output).toContain("Pull Requests — Found 2 pull requests");
    expect(output).toContain("feature/new → main");
  });

  it("should map --search to the textQuery API param", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr()],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
      "--search", "flaky test",
    ]);

    expect(AnalysisService.listRepositoryPullRequests).toHaveBeenCalledWith(
      "gh", "test-org", "test-repo", 100, undefined, "last-updated", "flaky test", undefined,
    );
  });

  it("should map --base to the targetBranch API param", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr()],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
      "--base", "release/1.0",
    ]);

    expect(AnalysisService.listRepositoryPullRequests).toHaveBeenCalledWith(
      "gh", "test-org", "test-repo", 100, undefined, "last-updated", undefined, "release/1.0",
    );
  });

  it("should combine --search and --base", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr()],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
      "--search", "flaky test", "--base", "release/1.0",
    ]);

    expect(AnalysisService.listRepositoryPullRequests).toHaveBeenCalledWith(
      "gh", "test-org", "test-repo", 100, undefined, "last-updated", "flaky test", "release/1.0",
    );
  });

  it("should map --state closed to the API's merged search classification", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr()],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
      "--state", "closed",
    ]);

    expect(AnalysisService.listRepositoryPullRequests).toHaveBeenCalledWith(
      "gh", "test-org", "test-repo", 100, undefined, "merged", undefined, undefined,
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

  it("should show a dim in-progress marker instead of ✓/✗ while a PR is still analysing", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr({ isAnalysing: true, isUpToStandards: undefined })],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
    ]);

    const output = getAllOutput();
    expect(output).toContain("⋯");
    expect(output).not.toContain("✗");
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
      2, "gh", "test-org", "test-repo", 2, "page2", "last-updated", undefined, undefined,
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

  it("should warn about pagination when a cursor remains even though the API omitted total", async () => {
    vi.mocked(AnalysisService.listRepositoryPullRequests).mockResolvedValue({
      data: [mockPr()],
      pagination: { cursor: "next" },
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node", "test", "pull-requests", "gh", "test-org", "test-repo",
      "--limit", "1",
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
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"originBranch": "feature/new"'),
    );
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining('"owner"'),
    );
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining('"status"'),
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
        "gh", "auto-org", "auto-repo", 100, undefined, "last-updated", undefined, undefined,
      );
    });
  });
});
