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

  it("should parse repo names containing dots", () => {
    expect(parseGitRemoteUrl("git@github.com:org/my.repo.git")).toEqual({
      provider: "gh",
      organization: "org",
      repository: "my.repo",
    });
    expect(parseGitRemoteUrl("https://github.com/org/my.dotted.repo")).toEqual({
      provider: "gh",
      organization: "org",
      repository: "my.dotted.repo",
    });
  });

  it("should strip credentials from HTTPS URL for provider lookup", () => {
    expect(parseGitRemoteUrl("https://token@github.com/org/repo.git")).toEqual({
      provider: "gh",
      organization: "org",
      repository: "repo",
    });
    expect(parseGitRemoteUrl("https://user:pass@github.com/org/repo")).toEqual({
      provider: "gh",
      organization: "org",
      repository: "repo",
    });
  });
});

vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}));

describe("detectRepoContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should detect repo context from git remote", async () => {
    const { execFileSync } = await import("child_process");
    vi.mocked(execFileSync).mockReturnValue("git@github.com:codacy/codacy-cloud-cli.git\n");

    const result = detectRepoContext();
    expect(result).toEqual({
      provider: "gh",
      organization: "codacy",
      repository: "codacy-cloud-cli",
    });
  });

  it("should throw when git remote is not available", async () => {
    const { execFileSync } = await import("child_process");
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("not a git repo");
    });

    expect(() => detectRepoContext()).toThrow("Could not detect repository from git remote");
  });

  it("should throw when remote URL has unknown provider", async () => {
    const { execFileSync } = await import("child_process");
    vi.mocked(execFileSync).mockReturnValue("git@custom-host.com:org/repo.git\n");

    expect(() => detectRepoContext()).toThrow("Could not determine provider");
  });

  it("should redact credentials in error messages", async () => {
    const { execFileSync } = await import("child_process");
    vi.mocked(execFileSync).mockReturnValue("https://secret-token@custom-host.com/org/repo.git\n");

    expect(() => detectRepoContext()).toThrow("***@custom-host.com");
    expect(() => detectRepoContext()).not.toThrow("secret-token");
  });
});
