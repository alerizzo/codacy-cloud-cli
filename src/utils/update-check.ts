/**
 * "Update available" notice, npm-style.
 *
 * The CLI checks npm for a newer published version and, when one exists, prints a
 * one-time courtesy notice suggesting how to upgrade. It never auto-updates.
 *
 * Hard guarantees (commands can emit machine-readable output via `--output json`
 * that must stay byte-clean):
 *  - The notice is written to **stderr only** and only in human-readable `table`
 *    mode — never when output is `json`, which agents, IDEs and scripts parse
 *    from stdout.
 *  - The check never blocks and never fails the command. The network lookup runs
 *    in a detached background process (handled by `update-notifier`) and refreshes
 *    a cache for the *next* invocation; the foreground only reads that cache.
 *
 * `update-notifier` already suppresses the notice when stdout is not a TTY, in CI,
 * when run via npm/npx (`npm_config_user_agent`), under `NODE_ENV=test`, when
 * `NO_UPDATE_NOTIFIER` or `--no-update-notifier` is set, and when no newer version
 * exists. The only layers we add on top are the `table`-mode gate and a
 * Codacy-branded opt-out env var.
 */
import updateNotifier from "update-notifier";

import { cliName, cliVersion } from "../version";
import type { OutputFormat } from "./output";

/** Check npm at most once per day; the background refresh is non-blocking. */
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 24;

/** Env var to fully disable the update check, alongside `NO_UPDATE_NOTIFIER`. */
const DISABLE_ENV_VAR = "CODACY_DISABLE_UPDATE_CHECK";

/**
 * Surface an "update available" notice if appropriate for the given output format.
 *
 * Call this once per command invocation with the command's resolved output format.
 * Safe to call unconditionally: it self-suppresses and never throws.
 *
 * @param format - the command's `--output` value (`table` or `json`). Treated as
 *   `table` (human-readable) when `undefined`.
 */
export function maybeNotifyUpdate(format?: OutputFormat): void {
  try {
    // Full opt-out: bail before constructing the notifier so no background
    // network/disk lookup is even scheduled. (update-notifier also honors
    // NO_UPDATE_NOTIFIER and --no-update-notifier on its own.)
    if (process.env[DISABLE_ENV_VAR]) return;

    // Construct first (even in json mode): this warms the cached result via
    // update-notifier's non-blocking detached check. It self-disables in CI,
    // NODE_ENV=test and when NO_UPDATE_NOTIFIER is set, so no process is spawned
    // in those environments.
    const notifier = updateNotifier({
      pkg: { name: cliName, version: cliVersion },
      updateCheckInterval: UPDATE_CHECK_INTERVAL_MS,
    });

    // Never print a notice into machine-readable output. Only `table` qualifies.
    if (format && format !== "table") return;

    // `defer` (default) prints the notice to stderr on process exit, which fires
    // even though commands may call process.exit() explicitly. `isGlobal` makes
    // the suggested command an `npm i -g …`, matching how this CLI is installed.
    notifier.notify({ isGlobal: true });
  } catch {
    // An update check must never break the CLI — swallow any error.
  }
}
