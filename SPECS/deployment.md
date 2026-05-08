# Deployment & CI Spec

**Status:** ✅ Done (updated 2026-05-08)

## npm Package

- **Binary name:** `codacy` (registered in `package.json` under `bin`)
- **Included files:** `dist/` and `README.md` (via `files` field)
- **Pre-publish:** `prepublishOnly` runs `npm run update-api && npm run build` as a safety net for local publishes
- **Engines:** requires Node.js >= 20
- **Install globally:** `npm install -g "@codacy/codacy-cloud-cli"`

## GitHub Actions

### Build + Test (`ci.yml`)

Triggers on: push and pull requests to `main`.

Matrix: Node.js 18, 20, 22.

Jobs:
- **build-and-test**: checkout → setup node → install → generate API client → type check → build → test
- **changeset-check** (PRs only): verifies at least one `.changeset/*.md` file is present in the PR diff

### Release (`release.yml`)

Triggers on: push to `main`.

Uses the [changesets/action](https://github.com/changesets/changesets) to automate versioning and publishing.

Steps:
1. Checkout
2. Setup Node with `registry-url: https://registry.npmjs.org`
3. `npm ci`
4. Generate API client (`npm run update-api`)
5. Build (`npm run build`)
6. Test (`npm test`)
7. `changesets/action` — either:
   - Creates/updates a "chore: version packages" PR (bumps version, updates CHANGELOG.md)
   - If that PR was just merged, runs `changeset publish` to publish to npm with provenance

## Homebrew Formula

Planned for future distribution as a separate brew formula for macOS/Linux/Windows. No implementation yet.

## Required Secrets

| Secret | Used by |
|---|---|
| `NPM_TOKEN` | Release workflow (`NODE_AUTH_TOKEN` for npm publish) |
| `CODACY_API_TOKEN` | CLI runtime (env var, not a secret in CI) |
