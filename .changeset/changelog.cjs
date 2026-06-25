// Resilient changelog generator for changesets.
//
// We normally use @changesets/changelog-github so the generated CHANGELOG gets
// rich, linked entries (PR numbers, author credits). That generator calls the
// GitHub GraphQL API, which is intermittently flaky in CI: a single dropped
// connection surfaces as
//
//   Failed to parse data from GitHub
//   Invalid response body while trying to fetch https://api.github.com/graphql: Premature close
//
// and, because @changesets/apply-release-plan generates all entries inside one
// Promise.all(), that single rejection aborts the entire `changeset version`
// run ("We have escaped applying the changesets..."). The release PR never gets
// created and a human has to babysit re-runs.
//
// This wrapper makes the GitHub enrichment best-effort:
//   1. Retry the GitHub call a few times. @changesets/get-github-info batches
//      via dataloader, which clears failed keys on rejection, so each retry
//      re-issues the GraphQL query rather than replaying a cached failure.
//   2. If GitHub is still unreachable, fall back to @changesets/changelog-git —
//      plain entries with commit SHAs, no network required.
//
// The release proceeds either way; the only downside when GitHub is down is a
// less decorated changelog for that one release (which can be polished by hand
// afterwards if desired). Warnings are logged so the degradation is visible in
// the CI output.

const github = require("@changesets/changelog-github").default;
const git = require("@changesets/changelog-git").default;

// Read tunables at call time (not module load) so tests can override them via
// process.env without fighting ES module import hoisting.
function getConfig() {
  return {
    maxAttempts: Number(process.env.CHANGELOG_GITHUB_ATTEMPTS) || 3,
    retryDelayMs:
      process.env.CHANGELOG_GITHUB_RETRY_MS !== undefined
        ? Number(process.env.CHANGELOG_GITHUB_RETRY_MS)
        : 1000,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Run the GitHub generator with retries; fall back to the git generator if it
// keeps failing. `label` is only used for log messages.
async function withFallback(label, githubFn, gitFn) {
  const { maxAttempts, retryDelayMs } = getConfig();
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await githubFn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        console.warn(
          `[changelog] GitHub enrichment for ${label} failed ` +
            `(attempt ${attempt}/${maxAttempts}): ${error.message}. Retrying...`,
        );
        // Linear backoff: 1x, 2x, ... the base delay.
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  console.warn(
    `[changelog] GitHub enrichment for ${label} failed after ${maxAttempts} ` +
      `attempts: ${lastError && lastError.message}. Falling back to a plain ` +
      `(git) changelog entry for this release.`,
  );
  return gitFn();
}

async function getReleaseLine(changeset, type, options) {
  return withFallback(
    "release line",
    () => github.getReleaseLine(changeset, type, options),
    () => git.getReleaseLine(changeset, type, options),
  );
}

async function getDependencyReleaseLine(changesets, dependenciesUpdated, options) {
  return withFallback(
    "dependency release line",
    () => github.getDependencyReleaseLine(changesets, dependenciesUpdated, options),
    () => git.getDependencyReleaseLine(changesets, dependenciesUpdated, options),
  );
}

// `withFallback` is exported for unit testing (vi.mock cannot intercept the
// require() of the underlying generators across the CJS boundary, so the retry
// /fallback logic is tested directly with injected fakes instead).
module.exports = { getReleaseLine, getDependencyReleaseLine, withFallback };
