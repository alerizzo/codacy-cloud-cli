import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveRepoArgs } from "./resolve-repo-args";

vi.mock("./git-remote", () => ({
  detectRepoContext: vi.fn(() => ({
    provider: "gh",
    organization: "auto-org",
    repository: "auto-repo",
  })),
}));

vi.spyOn(console, "error").mockImplementation(() => {});

describe("resolveRepoArgs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("0 trailing args (e.g. issues, repository, tools)", () => {
    it("should return explicit args when all 3 are provided", () => {
      const result = resolveRepoArgs(["gh", "my-org", "my-repo"], 0, "issues", []);
      expect(result).toEqual({
        provider: "gh",
        organization: "my-org",
        repository: "my-repo",
        trailingArgs: [],
      });
    });

    it("should auto-detect when no args are provided", async () => {
      const { detectRepoContext } = await import("./git-remote");
      const result = resolveRepoArgs([undefined, undefined, undefined], 0, "issues", []);
      expect(detectRepoContext).toHaveBeenCalled();
      expect(result).toEqual({
        provider: "gh",
        organization: "auto-org",
        repository: "auto-repo",
        trailingArgs: [],
      });
    });

    it("should throw for 1 arg (ambiguous)", () => {
      expect(() =>
        resolveRepoArgs(["gh", undefined, undefined], 0, "issues", []),
      ).toThrow("Ambiguous arguments");
    });

    it("should throw for 2 args (ambiguous)", () => {
      expect(() =>
        resolveRepoArgs(["gh", "my-org", undefined], 0, "issues", []),
      ).toThrow("Ambiguous arguments");
    });
  });

  describe("1 trailing arg (e.g. issue, tool, pull-request)", () => {
    it("should return explicit args when all 4 are provided", () => {
      const result = resolveRepoArgs(["gh", "my-org", "my-repo", "12345"], 1, "issue", ["issueId"]);
      expect(result).toEqual({
        provider: "gh",
        organization: "my-org",
        repository: "my-repo",
        trailingArgs: ["12345"],
      });
    });

    it("should auto-detect when only trailing arg is provided", async () => {
      const { detectRepoContext } = await import("./git-remote");
      const result = resolveRepoArgs(["12345", undefined, undefined, undefined], 1, "issue", ["issueId"]);
      expect(detectRepoContext).toHaveBeenCalled();
      expect(result).toEqual({
        provider: "gh",
        organization: "auto-org",
        repository: "auto-repo",
        trailingArgs: ["12345"],
      });
    });

    it("should throw when no args are provided (missing trailing)", () => {
      expect(() =>
        resolveRepoArgs([undefined, undefined, undefined, undefined], 1, "issue", ["issueId"]),
      ).toThrow("Missing required argument: issueId");
    });

    it("should throw for 2 args (ambiguous)", () => {
      expect(() =>
        resolveRepoArgs(["gh", "org", undefined, undefined], 1, "issue", ["issueId"]),
      ).toThrow("Ambiguous arguments");
    });

    it("should throw for 3 args (ambiguous)", () => {
      expect(() =>
        resolveRepoArgs(["gh", "org", "repo", undefined], 1, "issue", ["issueId"]),
      ).toThrow("Ambiguous arguments");
    });
  });

  describe("2 trailing args (e.g. pattern)", () => {
    it("should return explicit args when all 5 are provided", () => {
      const result = resolveRepoArgs(
        ["gh", "my-org", "my-repo", "eslint", "no-undef"],
        2,
        "pattern",
        ["toolName", "patternId"],
      );
      expect(result).toEqual({
        provider: "gh",
        organization: "my-org",
        repository: "my-repo",
        trailingArgs: ["eslint", "no-undef"],
      });
    });

    it("should auto-detect when only trailing args are provided", async () => {
      const { detectRepoContext } = await import("./git-remote");
      const result = resolveRepoArgs(
        ["eslint", "no-undef", undefined, undefined, undefined],
        2,
        "pattern",
        ["toolName", "patternId"],
      );
      expect(detectRepoContext).toHaveBeenCalled();
      expect(result).toEqual({
        provider: "gh",
        organization: "auto-org",
        repository: "auto-repo",
        trailingArgs: ["eslint", "no-undef"],
      });
    });

    it("should throw when no args are provided (missing trailing)", () => {
      expect(() =>
        resolveRepoArgs(
          [undefined, undefined, undefined, undefined, undefined],
          2,
          "pattern",
          ["toolName", "patternId"],
        ),
      ).toThrow("Missing required arguments: toolName, patternId");
    });

    it("should throw for 1 arg (ambiguous)", () => {
      expect(() =>
        resolveRepoArgs(
          ["eslint", undefined, undefined, undefined, undefined],
          2,
          "pattern",
          ["toolName", "patternId"],
        ),
      ).toThrow("Ambiguous arguments");
    });
  });

  describe("error messages include usage examples", () => {
    it("should show usage for commands with 0 trailing args", () => {
      try {
        resolveRepoArgs(["gh", undefined, undefined], 0, "issues", []);
      } catch (e: any) {
        expect(e.message).toContain("codacy issues");
        expect(e.message).toContain("<provider> <organization> <repository>");
      }
    });

    it("should show usage for commands with 1 trailing arg", () => {
      try {
        resolveRepoArgs(["gh", "org", undefined, undefined], 1, "issue", ["issueId"]);
      } catch (e: any) {
        expect(e.message).toContain("codacy issue <issueId>");
        expect(e.message).toContain("<provider> <organization> <repository> <issueId>");
      }
    });
  });
});
