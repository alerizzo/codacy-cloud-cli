import { describe, it, expect, beforeEach, vi } from "vitest";
import { Command } from "commander";
import { OpenAPI } from "../api/client/core/OpenAPI";
import {
  NO_TOKEN_MESSAGE,
  applyAccountToken,
  applyAuthHeaders,
  fetchIfAccountToken,
  repositoryTokenFlag,
  repositoryTokenOption,
  requireAccountToken,
  resolveAccountAuth,
  resolveAuth,
  resolveAuthFromToken,
  warnUnusedRepositoryToken,
} from "./auth";

vi.mock("./credentials", () => ({
  loadCredentials: vi.fn(() => null),
}));

import { loadCredentials } from "./credentials";

beforeEach(() => {
  delete process.env.CODACY_API_TOKEN;
  delete process.env.CODACY_PROJECT_TOKEN;
  vi.mocked(loadCredentials).mockReturnValue(null);
  // OpenAPI.HEADERS is real module state shared across tests in this file.
  OpenAPI.HEADERS = undefined;
  vi.restoreAllMocks();
});

describe("resolveAuthFromToken precedence", () => {
  it("prefers an explicit --repository-token over every other source", () => {
    process.env.CODACY_PROJECT_TOKEN = "env-project";
    process.env.CODACY_API_TOKEN = "env-account";
    vi.mocked(loadCredentials).mockReturnValue("stored");

    expect(resolveAuthFromToken("flag-token")).toEqual({
      kind: "repository-token",
      token: "flag-token",
      source: "flag",
    });
    // An explicit flag wins outright: no stored login is even loaded.
    expect(loadCredentials).not.toHaveBeenCalled();
  });

  it("prefers CODACY_PROJECT_TOKEN over CODACY_API_TOKEN (matches codacy-analysis)", () => {
    process.env.CODACY_PROJECT_TOKEN = "env-project";
    process.env.CODACY_API_TOKEN = "env-account";

    expect(resolveAuthFromToken()).toEqual({
      kind: "repository-token",
      token: "env-project",
      source: "CODACY_PROJECT_TOKEN",
    });
  });

  it("uses CODACY_API_TOKEN when no repository token is available", () => {
    process.env.CODACY_API_TOKEN = "env-account";
    vi.mocked(loadCredentials).mockReturnValue("stored");

    expect(resolveAuthFromToken()).toEqual({
      kind: "account-token",
      token: "env-account",
      source: "CODACY_API_TOKEN",
    });
    expect(loadCredentials).not.toHaveBeenCalled();
  });

  it("falls back to stored credentials last", () => {
    vi.mocked(loadCredentials).mockReturnValue("stored");

    expect(resolveAuthFromToken()).toEqual({
      kind: "account-token",
      token: "stored",
      source: "credentials",
    });
  });

  it("throws when no token can be resolved", () => {
    expect(() => resolveAuthFromToken()).toThrow(NO_TOKEN_MESSAGE);
  });

  it("ignores an empty CODACY_PROJECT_TOKEN", () => {
    process.env.CODACY_PROJECT_TOKEN = "";
    process.env.CODACY_API_TOKEN = "env-account";

    expect(resolveAuthFromToken().kind).toBe("account-token");
  });
});

describe("applyAuthHeaders", () => {
  it("sends an account token on the api-token header", () => {
    applyAuthHeaders({ kind: "account-token", token: "a", source: "CODACY_API_TOKEN" });

    expect(OpenAPI.HEADERS).toEqual({
      "api-token": "a",
      "X-Codacy-Origin": "cli-cloud-tool",
    });
  });

  it("sends a repository token on the project-token header", () => {
    applyAuthHeaders({ kind: "repository-token", token: "r", source: "flag" });

    expect(OpenAPI.HEADERS).toEqual({
      "project-token": "r",
      "X-Codacy-Origin": "cli-cloud-tool",
    });
  });

  it("never leaves the other token's header behind when switching kinds", () => {
    applyAuthHeaders({ kind: "account-token", token: "a", source: "CODACY_API_TOKEN" });
    applyAuthHeaders({ kind: "repository-token", token: "r", source: "flag" });

    expect(OpenAPI.HEADERS).not.toHaveProperty("api-token");
    expect(OpenAPI.HEADERS).toHaveProperty("project-token", "r");
  });

  it("installs the header as part of resolving", () => {
    process.env.CODACY_PROJECT_TOKEN = "env-project";
    resolveAuthFromToken();

    expect(OpenAPI.HEADERS).toHaveProperty("project-token", "env-project");
  });

  it("applyAccountToken installs an account header for login", () => {
    applyAccountToken("login-token");

    expect(OpenAPI.HEADERS).toEqual({
      "api-token": "login-token",
      "X-Codacy-Origin": "cli-cloud-tool",
    });
  });
});

describe("repositoryTokenFlag", () => {
  /** Builds a root program plus one subcommand, both declaring the option. */
  function buildProgram(): { program: Command; sub: Command } {
    const program = new Command();
    program.addOption(repositoryTokenOption());
    const sub = program.command("thing").addOption(repositoryTokenOption());
    sub.action(() => {});
    return { program, sub };
  }

  it("reads the flag passed after the subcommand", () => {
    const { program, sub } = buildProgram();
    program.parse(["node", "test", "thing", "--repository-token", "own"]);

    expect(repositoryTokenFlag(sub)).toBe("own");
  });

  it("reads the flag passed before the subcommand", () => {
    const { program, sub } = buildProgram();
    program.parse(["node", "test", "--repository-token", "global", "thing"]);

    expect(repositoryTokenFlag(sub)).toBe("global");
  });

  it("prefers the command's own value over the inherited one", () => {
    const { program, sub } = buildProgram();
    program.parse([
      "node", "test", "--repository-token", "global", "thing", "--repository-token", "own",
    ]);

    expect(repositoryTokenFlag(sub)).toBe("own");
  });

  it("returns undefined when the flag is absent", () => {
    const { program, sub } = buildProgram();
    program.parse(["node", "test", "thing"]);

    expect(repositoryTokenFlag(sub)).toBeUndefined();
  });

  it("returns a distinct Option instance per call", () => {
    expect(repositoryTokenOption()).not.toBe(repositoryTokenOption());
  });
});

describe("requireAccountToken", () => {
  const accountAuth = {
    kind: "account-token",
    token: "a",
    source: "CODACY_API_TOKEN",
  } as const;

  it("passes an account token straight through", () => {
    expect(requireAccountToken(accountAuth, "codacy info", "why")).toBe(accountAuth);
  });

  it("names the operation, the reason and the flag source", () => {
    expect(() =>
      requireAccountToken(
        { kind: "repository-token", token: "r", source: "flag" },
        "codacy info",
        "it reads account-level data",
      ),
    ).toThrow(
      "codacy info requires an account API token — it reads account-level data. " +
        "The token in use is a repository token (provided with --repository-token). " +
        "Set CODACY_API_TOKEN or run 'codacy login'.",
    );
  });

  it("names CODACY_PROJECT_TOKEN when the token came from the environment", () => {
    expect(() =>
      requireAccountToken(
        { kind: "repository-token", token: "r", source: "CODACY_PROJECT_TOKEN" },
        "--add",
        "adding a repository is an account-level operation",
      ),
    ).toThrow(/repository token \(from CODACY_PROJECT_TOKEN\)/);
  });
});

describe("resolveAccountAuth", () => {
  function commandNamed(name: string): Command {
    const cmd = new Command(name);
    cmd.addOption(repositoryTokenOption());
    return cmd;
  }

  it("resolves an account token normally", () => {
    process.env.CODACY_API_TOKEN = "env-account";

    expect(resolveAccountAuth(commandNamed("info"), "why").kind).toBe("account-token");
  });

  it("refuses a repository token, deriving the command name", () => {
    process.env.CODACY_PROJECT_TOKEN = "env-project";

    expect(() => resolveAccountAuth(commandNamed("info"), "why")).toThrow(
      /^codacy info requires an account API token/,
    );
  });
});

describe("resolveAuth", () => {
  it("resolves from a command's parsed flag", () => {
    const program = new Command();
    program.addOption(repositoryTokenOption());
    const sub = program.command("thing").addOption(repositoryTokenOption());
    sub.action(() => {});
    program.parse(["node", "test", "thing", "--repository-token", "rt"]);

    expect(resolveAuth(sub)).toEqual({
      kind: "repository-token",
      token: "rt",
      source: "flag",
    });
  });
});

describe("fetchIfAccountToken", () => {
  it("calls fetch under an account token", async () => {
    const fetch = vi.fn().mockResolvedValue("real");

    await expect(
      fetchIfAccountToken(
        { kind: "account-token", token: "a", source: "CODACY_API_TOKEN" },
        "fallback",
        fetch,
      ),
    ).resolves.toBe("real");
    expect(fetch).toHaveBeenCalled();
  });

  it("returns the fallback without calling fetch under a repository token", async () => {
    const fetch = vi.fn().mockResolvedValue("real");

    await expect(
      fetchIfAccountToken(
        { kind: "repository-token", token: "r", source: "flag" },
        "fallback",
        fetch,
      ),
    ).resolves.toBe("fallback");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("warnUnusedRepositoryToken", () => {
  function parsedCommand(argv: string[]): Command {
    const program = new Command();
    const sub = program.command("thing").addOption(repositoryTokenOption());
    sub.action(() => {});
    program.parse(["node", "test", "thing", ...argv]);
    return sub;
  }

  it("warns when the flag was passed explicitly", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnUnusedRepositoryToken(parsedCommand(["--repository-token", "rt"]), "`codacy login`");

    expect(errorSpy.mock.calls.join("\n")).toContain(
      "--repository-token is ignored by `codacy login`",
    );
  });

  it("stays silent when only CODACY_PROJECT_TOKEN is set", () => {
    process.env.CODACY_PROJECT_TOKEN = "env-project";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnUnusedRepositoryToken(parsedCommand([]), "`codacy login`");

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
