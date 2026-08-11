---
"@codacy/codacy-cloud-cli": minor
---

Add repository (project) token support

You can now authenticate with a **repository token** — scoped to a single repository — instead of a personal account API token that reaches every organization and repository you can see. This is the right credential for CI and for the auto-configuration agent: if it leaks, the blast radius is one repository.

```bash
codacy tools --repository-token <your-repository-token>
# or, for a whole CI job:
export CODACY_PROJECT_TOKEN=<your-repository-token>
```

Get one from **Codacy > Repository > Settings > Integrations > Project API token**. The new `--repository-token <token>` flag is accepted by every command, and `CODACY_PROJECT_TOKEN` is picked up automatically.

**Token precedence** (identical to the Codacy Analysis CLI): `--repository-token` > `CODACY_PROJECT_TOKEN` > `CODACY_API_TOKEN` > stored `codacy login`. An explicit `--repository-token` wins outright, so a deliberately scoped run is never silently widened. Note that `CODACY_PROJECT_TOKEN` outranks `CODACY_API_TOKEN` — unset it if you want your account token used.

**Not every command accepts a repository token**, because Codacy only honours them on a limited set of repository-scoped operations:

- **Fully supported:** `tools`, `tool`, `patterns`, `pattern`, `issues` (including `--overview`), `tools --import`, `repository --reanalyze` / `--reanalyze-and-wait`.
- **Partially supported:** `repository` works but omits the pull request and coverage sections. In `--output json`, `pullRequests` stays an empty array and a new `unavailable: ["pullRequests"]` field marks what couldn't be fetched. Output under an account token is unchanged.
- **Account token required:** `info`, `repositories`, `ls`, `directories`, `pull-request`, `pull-requests`, `issue`, `findings`, `finding`, `issues --ignore`/`--ignored`, `tools --import --force`, and `repository`'s `--add`/`--remove`/`--follow`/`--unfollow`/`--link-standard`/`--unlink-standard`.

Unsupported combinations now fail immediately with a message naming the operation, why a repository token can't perform it, and which token is in use — instead of sending a request that comes back as a bare `Unauthorized`.

`codacy login` continues to store account tokens only; repository tokens are passed per command or via the environment.

Also fixed: `codacy repository` no longer loses the entire dashboard when the pull request lookup fails, and `codacy login` no longer reports a repository token as "invalid" when it is rejected for being the wrong kind of token.
