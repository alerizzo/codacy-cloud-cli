import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerLoginCommand } from "./login";
import { AccountService } from "../api/client/services/AccountService";

vi.mock("../api/client/services/AccountService");
vi.mock("../utils/credentials", () => ({
  saveCredentials: vi.fn(),
  getCredentialsPath: vi.fn(() => "/home/test/.codacy/credentials"),
  promptForToken: vi.fn(),
}));

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

import { saveCredentials, promptForToken } from "../utils/credentials";

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerLoginCommand(program);
  return program;
}

const mockUser = {
  id: 1,
  name: "Test User",
  mainEmail: "test@example.com",
  otherEmails: [],
  isAdmin: false,
  isActive: true,
  created: "2024-01-01",
};

describe("login command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should validate and store token via --token flag", async () => {
    vi.mocked(AccountService.getUser).mockResolvedValue({ data: mockUser });

    const program = createProgram();
    await program.parseAsync(["node", "test", "login", "--token", "my-token"]);

    expect(AccountService.getUser).toHaveBeenCalledOnce();
    expect(saveCredentials).toHaveBeenCalledWith("my-token");
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Token stored at"),
    );
  });

  it("should show error on invalid token (401)", async () => {
    const apiError = new Error("Unauthorized");
    (apiError as any).status = 401;
    vi.mocked(AccountService.getUser).mockRejectedValue(apiError);

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const program = createProgram();
    await expect(
      program.parseAsync(["node", "test", "login", "--token", "bad-token"]),
    ).rejects.toThrow("process.exit called");

    expect(saveCredentials).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it("should show network error when API is unreachable", async () => {
    vi.mocked(AccountService.getUser).mockRejectedValue(
      new Error("fetch failed"),
    );

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const program = createProgram();
    await expect(
      program.parseAsync(["node", "test", "login", "--token", "some-token"]),
    ).rejects.toThrow("process.exit called");

    expect(saveCredentials).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it("should use interactive prompt when no --token flag", async () => {
    vi.mocked(promptForToken).mockResolvedValue("prompted-token");
    vi.mocked(AccountService.getUser).mockResolvedValue({ data: mockUser });

    const program = createProgram();
    await program.parseAsync(["node", "test", "login"]);

    expect(promptForToken).toHaveBeenCalledWith("API Token: ");
    expect(saveCredentials).toHaveBeenCalledWith("prompted-token");
  });

  it("should reject empty token from interactive prompt", async () => {
    vi.mocked(promptForToken).mockResolvedValue("   ");

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const program = createProgram();
    await expect(
      program.parseAsync(["node", "test", "login"]),
    ).rejects.toThrow("process.exit called");

    expect(saveCredentials).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  describe("--repository-token", () => {
    function warnings(): string {
      return (console.error as ReturnType<typeof vi.fn>).mock.calls
        .flat()
        .join("\n");
    }

    it("warns that the flag is ignored, but still stores the account token", async () => {
      vi.mocked(AccountService.getUser).mockResolvedValue({ data: mockUser } as any);

      const program = createProgram();
      await program.parseAsync([
        "node", "test", "login", "--token", "account-token",
        "--repository-token", "rt",
      ]);

      expect(warnings()).toContain("--repository-token is ignored by");
      // The flag is inert here, not fatal — the login itself must still work.
      expect(saveCredentials).toHaveBeenCalledWith("account-token");
    });

    it("stays silent when only CODACY_PROJECT_TOKEN is set", async () => {
      // That variable is exported job-wide in CI, so warning on it would fire on
      // every unrelated login and train users to ignore warnings.
      process.env.CODACY_PROJECT_TOKEN = "env-project-token";
      vi.mocked(AccountService.getUser).mockResolvedValue({ data: mockUser } as any);

      const program = createProgram();
      await program.parseAsync(["node", "test", "login", "--token", "account-token"]);

      expect(warnings()).not.toContain("--repository-token");
      delete process.env.CODACY_PROJECT_TOKEN;
    });

    it("explains that a repository token cannot be used to log in", async () => {
      vi.mocked(AccountService.getUser).mockRejectedValue(
        Object.assign(new Error("Unauthorized"), { status: 401 }),
      );
      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });

      const program = createProgram();
      await expect(
        program.parseAsync(["node", "test", "login", "--token", "a-repo-token"]),
      ).rejects.toThrow("process.exit called");

      // A repository token is rejected by /user by design, so the 401 message has
      // to name that case instead of only implying the token is invalid.
      expect(warnings()).toContain("repository (project) token");
      expect(warnings()).toContain("--repository-token");
      expect(saveCredentials).not.toHaveBeenCalled();
      mockExit.mockRestore();
    });
  });
});
