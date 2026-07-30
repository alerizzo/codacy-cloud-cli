# Codacy Cloud CLI

A command-line tool to interact with [Codacy Cloud](https://app.codacy.com) directly from your terminal. Built with Node.js and TypeScript.

## Installation

### From npm

```bash
npm install -g "@codacy/codacy-cloud-cli"
```

### From source

```bash
git clone https://github.com/alerizzo/codacy-cloud-cli.git
cd codacy-cloud-cli
npm install
npm run build
npm link
```

## Authentication

Log in interactively (recommended):

```bash
codacy login
```

Or set the `CODACY_API_TOKEN` environment variable:

```bash
export CODACY_API_TOKEN=your-token-here
```

You can get a token from **Codacy > My Account > Access Management > API Tokens** ([link](https://app.codacy.com/account/access-management)).

The `login` command stores the token encrypted at `~/.codacy/credentials`. The environment variable takes precedence over stored credentials when both are present.

## Usage

```bash
codacy <command> [options]
codacy <command> --help   # Detailed usage for any command
```

### Global Options

| Option | Description |
|---|---|
| `-o, --output <format>` | Output format: `table` (default) or `json` |
| `-V, --version` | Show version |
| `-h, --help` | Show help |

### Repository Auto-Detection

When you run a command inside a git repository, the CLI automatically detects the **provider**, **organization**, and **repository** from the `origin` remote URL. This means you can skip those arguments entirely:

```bash
# Inside a GitHub repo — auto-detects provider/org/repo
codacy issues
codacy pull-request 42
codacy tools

# Or specify them explicitly
codacy issues gh my-org my-repo
```

Supported providers: GitHub (`gh`), GitLab (`gl`), Bitbucket (`bb`).

### Commands

| Command | Description |
|---|---|
| `login` | Authenticate with Codacy by storing your API token |
| `logout` | Remove stored Codacy API token |
| `info` | Show authenticated user info and their organizations |
| `repositories <provider> <org>` | List repositories for an organization |
| `repository [provider] [org] [repo]` | Show metrics for a repository, or add/remove/follow/unfollow/reanalyze it (optionally waiting for results) |
| `ls [provider] [org] [repo]` | List (or search) directories and files at a path in a repository, with quality metrics and sorting |
| `directories [provider] [org] [repo]` | List directories at a path in a repository (optionally one level of sub-directories), with quality metrics |
| `issues [provider] [org] [repo]` | Search issues in a repository with filters |
| `issue [provider] [org] [repo] <id>` | Show details for a single issue, or ignore/unignore it |
| `findings [provider] [org] [repo]` | Show security findings for a repository or organization |
| `finding <provider> <org> <id>` | Show details for a single security finding, or ignore/unignore it |
| `pull-request [provider] [org] [repo] <pr>` | Show PR analysis, issues, diff coverage, and changed files; or reanalyze it (optionally waiting for results) |
| `pull-requests [provider] [org] [repo]` | List pull requests for a repository, with analysis data and text/branch filters |
| `tools [provider] [org] [repo]` | List analysis tools configured for a repository |
| `tool [provider] [org] [repo] <tool>` | Enable, disable, or configure an analysis tool |
| `patterns [provider] [org] [repo] <tool>` | List patterns for a tool, or bulk enable/disable them |
| `pattern [provider] [org] [repo] <tool> <id>` | Show a pattern, or enable, disable, or set parameters for it |

Run `codacy <command> --help` for full argument and option details for any command.

## Development

```bash
npm start -- <command>   # Run in development mode
npm test                 # Run tests
npm run type-check       # Type-check without emitting
npm run build            # Build for production
npm run update-api       # Update the auto-generated API client
```

### CI/CD

- **CI**: Runs on every push to `main` and on PRs. Builds and tests across Node.js 18, 20, and 22.
- **Release**: Uses [changesets](https://github.com/changesets/changesets) for automated versioning and npm publishing.

#### Publishing a new version

1. When making changes, run `npx changeset` and describe your change (select `patch`, `minor`, or `major`)
2. Include the generated `.changeset/*.md` file in your PR
3. CI enforces that every PR includes a changeset (use `npx changeset --empty` for changes that don't need a version bump, like docs or CI)
4. When PRs are merged to `main`, the release workflow automatically creates a **"chore: version packages"** PR that bumps the version and updates `CHANGELOG.md`
5. Merging that PR publishes to npm with provenance

**Prerequisite**: An `NPM_TOKEN` secret must be configured in the GitHub repository settings.

## License

MIT
