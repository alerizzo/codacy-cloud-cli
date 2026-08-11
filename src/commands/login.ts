import { Command } from "commander";
import ansis from "ansis";
import ora from "ora";
import { AccountService } from "../api/client/services/AccountService";
import { handleError } from "../utils/error";
import {
  applyAccountToken,
  repositoryTokenOption,
  warnUnusedRepositoryToken,
} from "../utils/auth";
import {
  saveCredentials,
  getCredentialsPath,
  promptForToken,
} from "../utils/credentials";

export function registerLoginCommand(program: Command) {
  program
    .command("login")
    .description("Authenticate with Codacy by storing your API token")
    .option("-t, --token <token>", "account API token (skips interactive prompt)")
    .addOption(repositoryTokenOption())
    .addHelpText(
      "after",
      `
Examples:
  $ codacy login
  $ codacy login --token <your-account-api-token>

Get your token at: https://app.codacy.com/account/access-management
  My Account > Access Management > API Tokens

login stores an account API token. Repository (project) tokens are not stored —
pass them per command with --repository-token, or set CODACY_PROJECT_TOKEN.`,
    )
    .action(async function (this: Command, options) {
      try {
        // login stores account tokens only: it validates against /user, which a
        // repository token can never reach, and the credentials store holds a
        // single bare token with no record of its kind.
        warnUnusedRepositoryToken(
          this,
          "`codacy login`, which stores an account API token. " +
            "Pass a repository token per command with --repository-token, or set CODACY_PROJECT_TOKEN.",
        );

        let token: string;

        if (options.token) {
          token = String(options.token).trim();

          if (!token) {
            throw new Error("Token cannot be empty.");
          }
        } else {
          console.log(ansis.bold("\nCodacy Login\n"));
          console.log("You need an Account API Token to authenticate.");
          console.log(
            `Get one at: ${ansis.cyan("https://app.codacy.com/account/access-management")}`,
          );
          console.log(
            ansis.dim("  My Account > Access Management > API Tokens\n"),
          );

          token = await promptForToken("API Token: ");

          if (!token.trim()) {
            throw new Error("Token cannot be empty.");
          }

          token = token.trim();
        }

        const spinner = ora("Validating token...").start();

        applyAccountToken(token);

        let userName: string;
        let userEmail: string;
        try {
          const response = await AccountService.getUser();
          userName = response.data.name || "Unknown";
          userEmail = response.data.mainEmail;
        } catch (apiErr: any) {
          spinner.fail("Authentication failed.");
          if (apiErr?.status === 401) {
            // A repository token lands here too — it is rejected by /user by
            // design — so name that case rather than only implying a bad token.
            throw new Error(
              "Invalid account API token. Check that it is correct and not expired. " +
                "If this is a repository (project) token, it can't be used to log in — " +
                "pass it per command with --repository-token, or set CODACY_PROJECT_TOKEN.",
            );
          }
          if (typeof apiErr?.status === "number") {
            throw new Error(
              `Codacy API returned an error (status ${apiErr.status}). Please try again or check your permissions.`,
            );
          }
          throw new Error(
            "Could not reach the Codacy API. Check your network connection.",
          );
        }

        saveCredentials(token);
        spinner.succeed(`Logged in as ${ansis.bold(userName)} (${userEmail})`);
        console.log(ansis.dim(`  Token stored at ${getCredentialsPath()}`));
      } catch (err) {
        handleError(err);
      }
    });
}
