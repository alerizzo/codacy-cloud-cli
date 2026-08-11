import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // CODACY_PROJECT_TOKEN outranks CODACY_API_TOKEN in the auth precedence, and
    // it is the variable the Codacy coverage reporter reads — so it is routinely
    // exported job-wide in CI and set in many developers' shells. Neutralize it
    // here so token resolution under test never depends on the ambient
    // environment. Empty string is falsy for every `if (env)` check.
    env: { CODACY_PROJECT_TOKEN: "" },
  },
});
