import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFileSync } from "child_process";
import { RepositoryService } from "../api/client/services/RepositoryService";
import {
  normalizeRepoPath,
  resolveListingPath,
  getCwdRepoRelativePath,
  fetchAllDirectories,
  fetchAllFiles,
  resolveSort,
  resolveDirection,
} from "./repo-tree";

vi.mock("child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("../api/client/services/RepositoryService");

const mockExec = vi.mocked(execFileSync);

describe("normalizeRepoPath", () => {
  it("strips a leading ./", () => {
    expect(normalizeRepoPath("./src/website")).toBe("src/website");
  });

  it("strips leading and trailing slashes", () => {
    expect(normalizeRepoPath("/src/website/")).toBe("src/website");
  });

  it("leaves a clean path unchanged", () => {
    expect(normalizeRepoPath("src/website")).toBe("src/website");
  });

  it("trims whitespace and treats an empty string as the root", () => {
    expect(normalizeRepoPath("   ")).toBe("");
    expect(normalizeRepoPath("")).toBe("");
  });
});

describe("getCwdRepoRelativePath", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the cwd relative to the git root", () => {
    mockExec.mockReturnValue("/repo\n" as any);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo/src/website");
    expect(getCwdRepoRelativePath()).toBe("src/website");
    cwdSpy.mockRestore();
  });

  it("returns '' when the cwd is the repo root", () => {
    mockExec.mockReturnValue("/repo\n" as any);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo");
    expect(getCwdRepoRelativePath()).toBe("");
    cwdSpy.mockRestore();
  });

  it("returns '' when not inside a git repository", () => {
    mockExec.mockImplementation(() => {
      throw new Error("not a git repository");
    });
    expect(getCwdRepoRelativePath()).toBe("");
  });
});

describe("resolveListingPath", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses and normalizes an explicit path (wins over auto-detection)", () => {
    expect(resolveListingPath("/src/website/", true)).toBe("src/website");
    expect(resolveListingPath("src", false)).toBe("src");
  });

  it("defaults to the repo root when no path and repo is explicit", () => {
    expect(resolveListingPath(undefined, false)).toBe("");
  });

  it("uses the cwd-relative path when auto-detected and no explicit path", () => {
    mockExec.mockReturnValue("/repo\n" as any);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo/src");
    expect(resolveListingPath(undefined, true)).toBe("src");
    cwdSpy.mockRestore();
  });
});

describe("resolveSort", () => {
  it("returns undefined when no sort is requested", () => {
    expect(resolveSort(undefined, "file")).toBeUndefined();
    expect(resolveSort(undefined, "directory")).toBeUndefined();
  });

  it("maps 'name' to 'filename' for files but keeps it for directories", () => {
    expect(resolveSort("name", "file")).toBe("filename");
    expect(resolveSort("name", "directory")).toBe("name");
  });

  it("passes other fields through and is case-insensitive", () => {
    expect(resolveSort("issues", "file")).toBe("issues");
    expect(resolveSort("Coverage", "directory")).toBe("coverage");
  });

  it("throws on an invalid field", () => {
    expect(() => resolveSort("bogus", "file")).toThrow(/Invalid --sort/);
  });
});

describe("resolveDirection", () => {
  it("returns undefined when no direction is requested", () => {
    expect(resolveDirection(undefined)).toBeUndefined();
  });

  it("maps ascending/descending and short forms", () => {
    expect(resolveDirection("asc")).toBe("asc");
    expect(resolveDirection("ascending")).toBe("asc");
    expect(resolveDirection("desc")).toBe("desc");
    expect(resolveDirection("DESCENDING")).toBe("desc");
  });

  it("throws on an invalid direction", () => {
    expect(() => resolveDirection("sideways")).toThrow(/Invalid --direction/);
  });
});

describe("fetchAllDirectories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("follows pagination cursors and aggregates every page", async () => {
    vi.mocked(RepositoryService.listDirectories)
      .mockResolvedValueOnce({
        data: [{ name: "a" }, { name: "b" }],
        pagination: { cursor: "c1" },
      } as any)
      .mockResolvedValueOnce({ data: [{ name: "c" }] } as any);

    const result = await fetchAllDirectories("gh", "org", "repo", "main", "src");

    expect(result.map((d) => d.name)).toEqual(["a", "b", "c"]);
    expect(RepositoryService.listDirectories).toHaveBeenCalledTimes(2);
    // First call: no cursor; path passed through as the explicit string.
    expect(RepositoryService.listDirectories).toHaveBeenNthCalledWith(
      1,
      "gh",
      "org",
      "repo",
      "main",
      "src",
      undefined,
      undefined,
      undefined,
      100,
    );
    // Second call: passes the cursor from the first page.
    expect(RepositoryService.listDirectories).toHaveBeenNthCalledWith(
      2,
      "gh",
      "org",
      "repo",
      "main",
      "src",
      undefined,
      undefined,
      "c1",
      100,
    );
  });

  it("passes an explicit empty-string path for the repo root", async () => {
    vi.mocked(RepositoryService.listDirectories).mockResolvedValue({
      data: [],
    } as any);

    await fetchAllDirectories("gh", "org", "repo", undefined, "");

    expect(RepositoryService.listDirectories).toHaveBeenCalledWith(
      "gh",
      "org",
      "repo",
      undefined,
      "",
      undefined,
      undefined,
      undefined,
      100,
    );
  });
});

describe("fetchAllFiles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("follows pagination cursors and aggregates every page", async () => {
    vi.mocked(RepositoryService.listFiles)
      .mockResolvedValueOnce({
        data: [{ path: "a.ts" }],
        pagination: { cursor: "c1" },
      } as any)
      .mockResolvedValueOnce({ data: [{ path: "b.ts" }] } as any);

    const result = await fetchAllFiles("gh", "org", "repo", undefined, "");

    expect(result.map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
    expect(RepositoryService.listFiles).toHaveBeenCalledTimes(2);
    // Root listing must send an explicit "" (non-recursive), never undefined.
    expect(RepositoryService.listFiles).toHaveBeenNthCalledWith(
      1,
      "gh",
      "org",
      "repo",
      undefined,
      "",
      undefined,
      undefined,
      undefined,
      undefined,
      100,
    );
  });
});
