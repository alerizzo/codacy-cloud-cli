import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerLsCommand } from "./ls";
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
  registerLsCommand(program);
  return program;
}

const mockDirs = [
  {
    path: "pages",
    name: "pages",
    nrFiles: 12,
    totalIssues: 1200,
    grade: 90,
    gradeLetter: "A",
    complexity: 45,
    numberOfClones: 234,
    coverageWithDecimals: 76.3,
  },
];

const mockFiles = [
  {
    fileId: 1,
    branchId: 1,
    path: "src/common.js",
    totalIssues: 2,
    grade: 70,
    gradeLetter: "C",
    coverageWithDecimals: 34.2,
    numberOfMethods: 3,
    // complexity + numberOfClones intentionally absent -> rendered as "-"
  },
];

function mockList(dirs: unknown[], files: unknown[]) {
  vi.mocked(RepositoryService.listDirectories).mockResolvedValue({
    data: dirs,
  } as any);
  vi.mocked(RepositoryService.listFiles).mockResolvedValue({
    data: files,
  } as any);
}

describe("ls command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CODACY_API_TOKEN = "test-token";
  });

  it("lists directories before files with the ▸ / · markers", async () => {
    mockList(mockDirs, mockFiles);

    const program = createProgram();
    await program.parseAsync(["node", "test", "ls", "gh", "org", "repo"]);

    const out = consoleOutput();
    expect(out).toContain("▸ pages");
    expect(out).toContain("· common.js");
    // directory row appears before the file row
    expect(out.indexOf("▸ pages")).toBeLessThan(out.indexOf("· common.js"));
    // header with combined totals
    expect(out).toContain("/repo — 1 directory, 1 file");
    // absent metrics render as a dim "-"
    expect(out).toContain("-");
  });

  it("passes an explicit empty-string path when listing the repo root", async () => {
    mockList([], []);

    const program = createProgram();
    await program.parseAsync(["node", "test", "ls", "gh", "org", "repo"]);

    expect(
      vi.mocked(RepositoryService.listDirectories).mock.calls[0][4],
    ).toBe("");
    expect(vi.mocked(RepositoryService.listFiles).mock.calls[0][4]).toBe("");
  });

  it("passes a normalized --path through to both endpoints", async () => {
    mockList(mockDirs, mockFiles);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "ls",
      "gh",
      "org",
      "repo",
      "--path",
      "/src/website/",
    ]);

    expect(
      vi.mocked(RepositoryService.listDirectories).mock.calls[0][4],
    ).toBe("src/website");
    expect(vi.mocked(RepositoryService.listFiles).mock.calls[0][4]).toBe(
      "src/website",
    );
  });

  it("forwards the --branch option", async () => {
    mockList(mockDirs, mockFiles);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "ls",
      "gh",
      "org",
      "repo",
      "--branch",
      "develop",
    ]);

    expect(
      vi.mocked(RepositoryService.listDirectories).mock.calls[0][3],
    ).toBe("develop");
  });

  it("auto-detects the repository from the git remote when no positionals are given", async () => {
    mockList(mockDirs, mockFiles);

    const program = createProgram();
    await program.parseAsync(["node", "test", "ls"]);

    expect(
      vi.mocked(RepositoryService.listDirectories).mock.calls[0].slice(0, 3),
    ).toEqual(["gh", "auto-org", "auto-repo"]);
  });

  it("aggregates across multiple pages", async () => {
    vi.mocked(RepositoryService.listDirectories)
      .mockResolvedValueOnce({
        data: [{ ...mockDirs[0], name: "pages" }],
        pagination: { cursor: "c1" },
      } as any)
      .mockResolvedValueOnce({
        data: [{ ...mockDirs[0], name: "components" }],
      } as any);
    vi.mocked(RepositoryService.listFiles).mockResolvedValue({ data: [] } as any);

    const program = createProgram();
    await program.parseAsync(["node", "test", "ls", "gh", "org", "repo"]);

    const out = consoleOutput();
    expect(out).toContain("▸ pages");
    expect(out).toContain("▸ components");
    expect(out).toContain("2 directories");
  });

  it("forwards --sort/--direction to both endpoints (server-side)", async () => {
    mockList(mockDirs, mockFiles);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "ls",
      "gh",
      "org",
      "repo",
      "--sort",
      "issues",
      "--direction",
      "desc",
    ]);

    const dcall = vi.mocked(RepositoryService.listDirectories).mock.calls[0];
    expect(dcall[5]).toBe("issues"); // sort
    expect(dcall[6]).toBe("desc"); // direction
    const fcall = vi.mocked(RepositoryService.listFiles).mock.calls[0];
    expect(fcall[6]).toBe("issues"); // sort
    expect(fcall[7]).toBe("desc"); // direction
  });

  it("maps --sort name to 'filename' for files but 'name' for directories", async () => {
    mockList(mockDirs, mockFiles);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "ls",
      "gh",
      "org",
      "repo",
      "--sort",
      "name",
    ]);

    expect(
      vi.mocked(RepositoryService.listDirectories).mock.calls[0][5],
    ).toBe("name");
    expect(vi.mocked(RepositoryService.listFiles).mock.calls[0][6]).toBe(
      "filename",
    );
  });

  it("search mode lists files only, folds the path into the search, and omits path", async () => {
    mockList(mockDirs, mockFiles);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "ls",
      "gh",
      "org",
      "repo",
      "--path",
      "app/client",
      "--search",
      "config",
    ]);

    // directories are not searched
    expect(RepositoryService.listDirectories).not.toHaveBeenCalled();
    // files: path omitted (undefined), search = "<path>/%<term>"
    const fcall = vi.mocked(RepositoryService.listFiles).mock.calls[0];
    expect(fcall[4]).toBeUndefined(); // path
    expect(fcall[5]).toBe("app/client/%config"); // search
  });

  it("shows full file paths and a 'matching' header in search mode", async () => {
    vi.mocked(RepositoryService.listFiles).mockResolvedValue({
      data: [
        {
          fileId: 1,
          branchId: 1,
          path: "src/commands/finding.ts",
          totalIssues: 4,
          grade: 20,
          gradeLetter: "F",
          numberOfMethods: 1,
        },
      ],
    } as any);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "ls",
      "gh",
      "org",
      "repo",
      "--search",
      "find",
    ]);

    const out = consoleOutput();
    expect(out).toContain("· src/commands/finding.ts");
    expect(out).toContain('matching "find"');
    // at repo root the search term is sent as-is (no path prefix)
    expect(vi.mocked(RepositoryService.listFiles).mock.calls[0][5]).toBe("find");
  });

  it("shows a message when a search finds nothing", async () => {
    vi.mocked(RepositoryService.listFiles).mockResolvedValue({ data: [] } as any);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "ls",
      "gh",
      "org",
      "repo",
      "--search",
      "nope",
    ]);

    expect(consoleOutput()).toContain('No files matching "nope"');
  });

  it("outputs JSON with a { path, directories, files } shape", async () => {
    mockList(mockDirs, mockFiles);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "--output",
      "json",
      "ls",
      "gh",
      "org",
      "repo",
    ]);

    const out = consoleOutput();
    expect(out).toContain('"directories"');
    expect(out).toContain('"files"');
    expect(out).toContain('"name": "pages"');
    expect(out).toContain('"path": "src/common.js"');
  });

  it("shows a message when nothing is found", async () => {
    mockList([], []);

    const program = createProgram();
    await program.parseAsync(["node", "test", "ls", "gh", "org", "repo"]);

    const out = consoleOutput();
    expect(out).toContain("Nothing found");
  });

  it("fails when CODACY_API_TOKEN is not set", async () => {
    delete process.env.CODACY_API_TOKEN;
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const program = createProgram();
    await expect(
      program.parseAsync(["node", "test", "ls", "gh", "org", "repo"]),
    ).rejects.toThrow("process.exit called");

    mockExit.mockRestore();
  });
});
