import { Command } from "commander";
import ansis from "ansis";
import {
  deleteCredentials,
  getCredentialsPath,
} from "../utils/credentials";
import { handleError } from "../utils/error";
import { repositoryTokenOption, warnUnusedRepositoryToken } from "../utils/auth";

export function registerLogoutCommand(program: Command) {
  program
    .command("logout")
    .description("Remove stored Codacy API token")
    .addOption(repositoryTokenOption())
    .addHelpText(
      "after",
      `
Examples:
  $ codacy logout`,
    )
    .action(function (this: Command) {
      try {
        // Nothing to log out of for a repository token: login never stores one,
        // so there is no stored copy for this command to remove.
        warnUnusedRepositoryToken(
          this,
          "`codacy logout`, which only removes the locally stored account API token.",
        );

        const deleted = deleteCredentials();
        if (deleted) {
          console.log(
            ansis.green("Logged out.") +
              ansis.dim(` Removed ${getCredentialsPath()}`),
          );
        } else {
          console.log("No stored credentials found.");
        }
      } catch (err) {
        handleError(err);
      }
    });
}
