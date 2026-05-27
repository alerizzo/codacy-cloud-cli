---
description: Changeset + branch + commit + push + PR for the current working tree
---

# Ship it

Take the current uncommitted changes on `main` (or on a branch already derived
from `main` for this task) and turn them into an open PR. End-to-end: make
sure there's a changeset, cut a branch, commit, push, open the PR. This is a
user-triggered action — invoking this command IS the explicit authorisation
required by the repo's "never commit, push, or open PRs without asking" rule,
so you can proceed without further confirmation once you've sanity-checked
what's about to be shipped.

**Arguments:** `$ARGUMENTS`

Optional, space-separated, in any order:

- A branch name (must not contain spaces; e.g. `feat/tools-command`). If
  absent, derive one — see Phase 3.
- A bump type: `patch`, `minor`, or `major`. If absent, infer — see Phase 1.
- A quoted PR title (wrap in double quotes if it contains spaces). If absent,
  derive from the commit/changeset — see Phase 5.

---

## Phase 0: Sanity-check what's about to be shipped

1. `git status --short` — confirm there are changes. If the working tree is
   clean AND the current branch has no commits ahead of `origin/main`,
   stop and tell the user there's nothing to ship.
2. `git diff --stat HEAD` — eyeball the scope. If the diff touches files
   that look unrelated (e.g. `src/api/client/` auto-generated code, stray
   lockfile churn, or secrets/`.env`/credentials), flag them and ask before
   proceeding.
3. Confirm we're in a git repo with an `origin` remote pointing at GitHub.
   If not, stop and ask.

Do NOT run tests or builds here — that's the user's call. The command assumes
the user has already validated the change.

---

## Phase 1: Ensure a changeset exists

CI on `main` fails any PR without a changeset, so this step is mandatory.

1. Check `.changeset/` for a **new** `.md` file — one that isn't already
   committed on the current branch. Use:

   ```bash
   git status --short .changeset/ | grep -E '^\?\?|^ M|^A ' | awk '{print $2}'
   ```

   plus `git diff --name-only HEAD .changeset/` for modified ones.

   If at least one uncommitted changeset file exists, you're done with this
   phase — move on.

2. If no changeset exists, create one. Determine the bump type:
   - Use the argument if provided.
   - Otherwise infer from the diff: bug fixes and comment/docs tweaks → `patch`;
     new user-visible features or command additions → `minor`; anything that
     changes a public API signature or removes a flag → `major`. When
     genuinely ambiguous, default to `patch` and mention it in the
     end-of-turn summary.
   - If the change touches only CI config, docs outside the README, or
     is a pure refactor with no user-facing change, use `npx changeset --empty`
     instead — that satisfies the CI check without bumping versions.

3. This is a single-package repo (`@codacy/codacy-cloud-cli`), so the
   changeset frontmatter always lists that one package.

4. Write the changeset as `.changeset/<slug>.md` (the slug should be
   hyphenated and descriptive of the change, e.g.
   `add-tools-command.md`). Frontmatter format:

   ```
   ---
   "@codacy/codacy-cloud-cli": patch
   ---

   <one paragraph describing what changed and why — focus on why, not what>
   ```

   Use `Write` for the file; do NOT run `npx changeset` interactively — it
   requires a TTY.

---

## Phase 2: Decide the base branch

1. Current branch: `git branch --show-current`.
2. If already on a feature branch (not `main`), use that — don't create a
   new one. Skip to Phase 4.
3. If on `main`, continue to Phase 3.

---

## Phase 3: Create a branch

1. Derive a branch name when the user didn't pass one:
   - Prefix based on the change type: `fix/` for bug fixes, `feat/` for
     features, `chore/` for tooling, `docs/` for documentation.
   - Slug: two or three hyphenated words pulled from the changeset title or
     the most descriptive file path (e.g. `feat/tools-command`).
   - Keep it under ~40 chars.
2. Check the branch doesn't already exist:

   ```bash
   git rev-parse --verify "refs/heads/<branch>" 2>/dev/null
   ```

   If it does, append `-2`, `-3`, … until you find a free name.

3. Create and switch:

   ```bash
   git checkout -b <branch>
   ```

---

## Phase 4: Commit

1. Stage the change set explicitly. Prefer named files over `git add -A` or
   `git add .` to avoid accidentally committing `.env`, credentials, or
   unrelated files you noticed in Phase 0.

   ```bash
   git add <specific files…>
   ```

   Always include any `.changeset/*.md` you created.

2. Draft the commit message:
   - Subject: Conventional-Commits style, under ~72 chars
     (`feat: add tools command with enable/disable support`).
   - Body: 1–3 short paragraphs or bullets. Focus on the _why_. Reference
     the bug report, ticket, or PR number if known.
   - End with the standard Co-Authored-By trailer.

3. Commit using a HEREDOC so the shell doesn't mangle newlines:

   ```bash
   git commit -m "$(cat <<'EOF'
   <subject>

   <body>

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```

4. If the pre-commit hook fails, fix the underlying issue, re-stage, and
   create a **new** commit. Never `--amend` away a hook failure (the commit
   didn't happen, so --amend would rewrite the previous one).

5. Never pass `--no-verify` or `--no-gpg-sign` unless the user explicitly
   asks — doing so silently skips the repo's quality gates.

---

## Phase 5: Push and open the PR

1. Push with upstream tracking:

   ```bash
   git push -u origin <branch>
   ```

2. Build the PR body. Template:

   ```markdown
   ## Summary

   - <1–3 bullets describing the change and why>

   ## Test plan

   - [ ] <specific checks the reviewer / user can run locally>

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```

   The Summary should be tight — a reviewer should be able to understand the
   change without reading the diff. The Test plan should list concrete
   commands (e.g. `npm test`) rather than vague "verify it works" bullets.

3. Open the PR:

   ```bash
   gh pr create --title "<title>" --body "$(cat <<'EOF'
   <body>
   EOF
   )"
   ```

   Title rules:
   - Under 70 chars.
   - Conventional-Commits style, mirroring the commit subject (they can be
     identical).
   - Use the argument if provided; otherwise derive from the changeset title
     or the commit subject.

4. Capture the PR URL from `gh pr create`'s stdout and print it in the
   end-of-turn summary.

---

## Phase 6: Report

One sentence on what shipped, plus the PR URL. Don't re-summarise the diff —
the PR body already does. If anything was skipped or changed from the
defaults (e.g. bump type defaulted to patch because ambiguous, branch name
had a suffix appended because of collision, pre-commit hook required a
retry), mention it in a single parenthetical line so the user can course-
correct if needed.
