# Codacy Cloud CLI — review style guide

Project-specific conventions for reviewing this repository (a TypeScript +
Commander.js CLI). Please weigh these before flagging style or correctness
concerns.

## Testing
- Tests mutate `process.env` directly: assign the variable in the test and
  `delete` it in `beforeEach`/`afterEach` for isolation. This is the repo-wide
  convention (see `src/utils/auth.test.ts` and ~10 other test files). Do **not**
  suggest `vi.stubEnv` / `vi.unstubAllEnvs` — the codebase deliberately does not
  use them, and consistency across the suite is preferred.
- API service calls are mocked with `vi.mock(...)`; tests are co-located as
  `<module>.test.ts` next to the source.

## Output streams
- The command's data payload goes to **stdout**; all human-readable diagnostics
  (spinners via `ora`, the "update available" notice) go to **stderr**.
  `--output json` must keep stdout byte-clean.
- The update-available notice uses `update-notifier`, which prints to stderr and
  self-suppresses for non-TTY / CI / `--output json`. Don't flag it as stdout or
  JSON-output pollution.

## Dependencies
- Runtime dependencies, devDependencies, and `overrides` are all pinned to exact
  versions (no `^`/`~`) for reproducibility and to avoid dependency-confusion
  risk. Flagging an unpinned range is correct; suggesting a range is not.

## Generated files
- `package-lock.json` and everything under `src/api/client/**` are generated.
  Complexity, duplication, and size findings on these are false positives.
