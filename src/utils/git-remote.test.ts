import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseGitRemoteUrl, detectRepoContext } from "./git-remote";

describe("parseGitRemoteUrl", () => {
  it("should parse GitHub SSH URL", () => {
    expect(parseGitRemoteUrl("git@github.com:codacy/codacy-cloud-cli.git")).toEqual({
      provider: "gh",
      organization: "codacy",
      repository: "codacy-cloud-cli",
    });
  });

  it("should parse GitHub HTTPS URL", () => {
    expect(parseGitRemoteUrl("https://github.com/codacy/codacy-cloud-cli.git")).toEqual({
      provider: "gh",
      organization: "codacy",
      repository: "codacy-cloud-cli",
    });
  });

  it("should parse GitHub HTTPS URL without .git suffix", () => {
    expect(parseGitRemoteUrl("https://github.com/codacy/codacy-cloud-cli")).toEqual({
      provider: "gh",
      organization: "codacy",
      repository: "codacy-cloud-cli",
    });
  });

  it("should parse GitLab SSH URL", () => {
    expect(parseGitRemoteUrl("git@gitlab.com:my-org/my-repo.git")).toEqual({
      provider: "gl",
      organization: "my-org",
      repository: "my-repo",
    });
  });

  it("should parse GitLab HTTPS URL", () => {
    expect(parseGitRemoteUrl("https://gitlab.com/my-org/my-repo.git")).toEqual({
      provider: "gl",
      organization: "my-org",
      repository: "my-repo",
    });
  });

  it("should parse Bitbucket SSH URL", () => {
    expect(parseGitRemoteUrl("git@bitbucket.org:team/project.git")).toEqual({
      provider: "bb",
      organization: "team",
      repository: "project",
    });
  });

  it("should parse Bitbucket HTTPS URL", () => {
    expect(parseGitRemoteUrl("https://bitbucket.org/team/project.git")).toEqual({
      provider: "bb",
      organization: "team",
      repository: "project",
    });
  });

  it("should return null for unknown host", () => {
    expect(parseGitRemoteUrl("git@custom-git.example.com:org/repo.git")).toBeNull();
  });

  it("should return null for invalid format", () => {
    expect(parseGitRemoteUrl("not-a-url")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(parseGitRemoteUrl("")).toBeNull();
  });

  it("should parse SSH URL without .git suffix", () => {
    expect(parseGitRemoteUrl("git@github.com:org/repo")).toEqual({
      provider: "gh",
      organization: "org",
      repository: "repo",
    });
  });
});

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

describe("detectRepoContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should detect repo context from git remote", async () => {
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue("git@github.com:codacy/codacy-cloud-cli.git\n");

    const result = detectRepoContext();
    expect(result).toEqual({
      provider: "gh",
      organization: "codacy",
      repository: "codacy-cloud-cli",
    });
  });

  it("should throw when git remote is not available", async () => {
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not a git repo");
    });

    expect(() => detectRepoContext()).toThrow("Could not detect repository from git remote");
  });

  it("should throw when remote URL has unknown provider", async () => {
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue("git@custom-host.com:org/repo.git\n");

    expect(() => detectRepoContext()).toThrow("Could not determine provider");
  });
});
