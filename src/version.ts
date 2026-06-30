/**
 * Single source of truth for the CLI's own name and version at runtime.
 *
 * The values are read from the package's `package.json` rather than hardcoded,
 * so they stay in sync with whatever version is actually published.
 *
 * Why `require` instead of a static `import ... from "../package.json"`:
 * `tsconfig` does not set `resolveJsonModule`/`rootDir`, so a static JSON import
 * would fail type checking. `require` (already the idiom used in `index.ts`)
 * resolves correctly in both modes:
 *  - built CLI: `__dirname` is `dist/`, so `../package.json` is the package's own
 *    manifest (always shipped in the npm tarball alongside `dist/`).
 *  - under Vitest: `__dirname` is `src/`, so `../package.json` is the same file.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../package.json") as { name: string; version: string };

/** The CLI's npm package name, e.g. `@codacy/codacy-cloud-cli`. */
export const cliName: string = pkg.name;

/** The CLI's current version, e.g. `1.4.0`. */
export const cliVersion: string = pkg.version;
