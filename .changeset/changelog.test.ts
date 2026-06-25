import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-expect-error - plain CJS module, no type declarations
import changelog from "./changelog.cjs";

const { withFallback } = changelog;

// The wrapper delegates getReleaseLine / getDependencyReleaseLine to
// `withFallback`, which holds the retry-then-fall-back logic. We test that logic
// directly with injected fakes rather than mocking @changesets/changelog-github
// (vi.mock cannot intercept the require() inside the .cjs module).
describe("changelog withFallback", () => {
  beforeEach(() => {
    // Remove retry delays so the failing-path tests run instantly. vi.stubEnv +
    // vi.unstubAllEnvs keeps these mutations from leaking out of the file.
    vi.stubEnv("CHANGELOG_GITHUB_RETRY_MS", "0");
    vi.stubEnv("CHANGELOG_GITHUB_ATTEMPTS", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the GitHub generator when it succeeds (no fallback)", async () => {
    const githubFn = vi.fn().mockResolvedValue("- GH line");
    const gitFn = vi.fn().mockResolvedValue("- git line");

    const result = await withFallback("release line", githubFn, gitFn);

    expect(result).toBe("- GH line");
    expect(githubFn).toHaveBeenCalledTimes(1);
    expect(gitFn).not.toHaveBeenCalled();
  });

  it("retries the GitHub generator and keeps its result on recovery", async () => {
    const githubFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Premature close"))
      .mockResolvedValue("- GH line");
    const gitFn = vi.fn().mockResolvedValue("- git line");

    const result = await withFallback("release line", githubFn, gitFn);

    expect(result).toBe("- GH line");
    expect(githubFn).toHaveBeenCalledTimes(2);
    expect(gitFn).not.toHaveBeenCalled();
  });

  it("falls back to the git generator after GitHub keeps failing", async () => {
    const githubFn = vi.fn().mockRejectedValue(new Error("Premature close"));
    const gitFn = vi.fn().mockResolvedValue("- abc1234: git line");

    const result = await withFallback("release line", githubFn, gitFn);

    expect(result).toBe("- abc1234: git line");
    expect(githubFn).toHaveBeenCalledTimes(3); // default maxAttempts
    expect(gitFn).toHaveBeenCalledTimes(1);
  });

  it("falls back without throwing when GitHub rejects with a non-Error value", async () => {
    // A non-Error rejection must not make `.message` throw inside the catch.
    const githubFn = vi.fn().mockRejectedValue(undefined);
    const gitFn = vi.fn().mockResolvedValue("- git line");

    const result = await withFallback("release line", githubFn, gitFn);

    expect(result).toBe("- git line");
    expect(githubFn).toHaveBeenCalledTimes(3);
    expect(gitFn).toHaveBeenCalledTimes(1);
  });

  it("honours a custom attempt count via CHANGELOG_GITHUB_ATTEMPTS", async () => {
    vi.stubEnv("CHANGELOG_GITHUB_ATTEMPTS", "5");
    const githubFn = vi.fn().mockRejectedValue(new Error("Premature close"));
    const gitFn = vi.fn().mockResolvedValue("- git line");

    await withFallback("release line", githubFn, gitFn);

    expect(githubFn).toHaveBeenCalledTimes(5);
    expect(gitFn).toHaveBeenCalledTimes(1);
  });

  it("ignores an invalid attempt-count override and uses the default", async () => {
    vi.stubEnv("CHANGELOG_GITHUB_ATTEMPTS", "-1");
    const githubFn = vi.fn().mockRejectedValue(new Error("Premature close"));
    const gitFn = vi.fn().mockResolvedValue("- git line");

    await withFallback("release line", githubFn, gitFn);

    expect(githubFn).toHaveBeenCalledTimes(3); // -1 ignored -> default 3
    expect(gitFn).toHaveBeenCalledTimes(1);
  });

  it("tolerates a non-numeric retry-delay override without producing NaN waits", async () => {
    vi.stubEnv("CHANGELOG_GITHUB_RETRY_MS", "not-a-number");
    vi.stubEnv("CHANGELOG_GITHUB_ATTEMPTS", "1"); // 1 attempt -> no sleep path
    const githubFn = vi.fn().mockRejectedValue(new Error("Premature close"));
    const gitFn = vi.fn().mockResolvedValue("- git line");

    const result = await withFallback("release line", githubFn, gitFn);

    expect(result).toBe("- git line");
    expect(githubFn).toHaveBeenCalledTimes(1);
  });

  it("exposes getReleaseLine and getDependencyReleaseLine for changesets", () => {
    expect(typeof changelog.getReleaseLine).toBe("function");
    expect(typeof changelog.getDependencyReleaseLine).toBe("function");
  });
});
