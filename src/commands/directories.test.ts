import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerDirectoriesCommand } from "./directories";
import { RepositoryService } from "../api/client/services/RepositoryService";
import { consoleOutput } from "../test-support";

vi.mock("../api/client/services/RepositoryService");
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
  registerDirectoriesCommand(program);
  return program;
}

function dir(name: string, path = name) {
  return {
    path,
    name,
    nrFiles: 5,
    totalIssues: 10,
    grade: 85,
    gradeLetter: "B",
    complexity: 42,
    numberOfClones: 12,
    coverageWithDecimals: 70,
  };
}

describe("directories command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CODACY_API_TOKEN = "test-token";
  });

  it("lists directories with the ▸ marker and no files", async () => {
    vi.mocked(RepositoryService.listDirectories).mockResolvedValue({
      data: [dir("pages"), dir("components")],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "directories",
      "gh",
      "org",
      "repo",
    ]);

    const out = consoleOutput();
    expect(out).toContain("▸ pages");
    expect(out).toContain("▸ components");
    expect(out).toContain("2 directories");
    // files endpoint must not be called
    expect(RepositoryService.listFiles).not.toHaveBeenCalled();
  });

  it("--plus-children fetches each directory's children and renders a tree", async () => {
    vi.mocked(RepositoryService.listDirectories)
      // root call
      .mockResolvedValueOnce({ data: [dir("pages", "pages")] } as any)
      // children of "pages"
      .mockResolvedValueOnce({
        data: [dir("account", "pages/account"), dir("admin", "pages/admin")],
      } as any);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "directories",
      "gh",
      "org",
      "repo",
      "--plus-children",
    ]);

    // one root call + one per directory
    expect(RepositoryService.listDirectories).toHaveBeenCalledTimes(2);
    // child call lists the parent's path
    expect(
      vi.mocked(RepositoryService.listDirectories).mock.calls[1][4],
    ).toBe("pages");

    const out = consoleOutput();
    expect(out).toContain("▸ pages");
    expect(out).toContain("└─ account");
    expect(out).toContain("└─ admin");
  });

  it("shows a subdirectory count in the header with --plus-children", async () => {
    vi.mocked(RepositoryService.listDirectories)
      // root: two directories
      .mockResolvedValueOnce({
        data: [dir("pages", "pages"), dir("src", "src")],
      } as any)
      // children of "pages" (fetched first in map order)
      .mockResolvedValueOnce({
        data: [dir("a", "pages/a"), dir("b", "pages/b")],
      } as any)
      // children of "src"
      .mockResolvedValueOnce({ data: [dir("c", "src/c")] } as any);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "directories",
      "gh",
      "org",
      "repo",
      "--plus-children",
    ]);

    expect(consoleOutput()).toContain("2 directories, 3 subdirectories");
  });

  it("forwards --sort/--direction to the root and children listings", async () => {
    vi.mocked(RepositoryService.listDirectories)
      .mockResolvedValueOnce({ data: [dir("pages", "pages")] } as any)
      .mockResolvedValueOnce({
        data: [dir("account", "pages/account")],
      } as any);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "directories",
      "gh",
      "org",
      "repo",
      "--plus-children",
      "--sort",
      "issues",
      "--direction",
      "desc",
    ]);

    const root = vi.mocked(RepositoryService.listDirectories).mock.calls[0];
    expect(root[5]).toBe("issues"); // sort
    expect(root[6]).toBe("desc"); // direction
    const child = vi.mocked(RepositoryService.listDirectories).mock.calls[1];
    expect(child[5]).toBe("issues");
    expect(child[6]).toBe("desc");
  });

  it("passes a normalized --path through to the endpoint", async () => {
    vi.mocked(RepositoryService.listDirectories).mockResolvedValue({
      data: [],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "directories",
      "gh",
      "org",
      "repo",
      "--path",
      "src/website/",
    ]);

    expect(
      vi.mocked(RepositoryService.listDirectories).mock.calls[0][4],
    ).toBe("src/website");
  });

  it("includes children in JSON output", async () => {
    vi.mocked(RepositoryService.listDirectories)
      .mockResolvedValueOnce({ data: [dir("pages", "pages")] } as any)
      .mockResolvedValueOnce({
        data: [dir("account", "pages/account")],
      } as any);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "--output",
      "json",
      "directories",
      "gh",
      "org",
      "repo",
      "--plus-children",
    ]);

    const out = consoleOutput();
    expect(out).toContain('"children"');
    expect(out).toContain('"name": "account"');
  });

  it("shows a message when no directories are found", async () => {
    vi.mocked(RepositoryService.listDirectories).mockResolvedValue({
      data: [],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "directories",
      "gh",
      "org",
      "repo",
    ]);

    const out = consoleOutput();
    expect(out).toContain("No directories found");
  });

  it("fails when CODACY_API_TOKEN is not set", async () => {
    delete process.env.CODACY_API_TOKEN;
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const program = createProgram();
    await expect(
      program.parseAsync(["node", "test", "directories", "gh", "org", "repo"]),
    ).rejects.toThrow("process.exit called");

    mockExit.mockRestore();
  });
});
