---
description: Changeset + branch + commit + push + PR, then wait for AI reviews and auto-run /pr-fixup
---

# Ship it

Take the current uncommitted changes on `main` (or on a branch already derived
from `main` for this task) and turn them into an open PR, **then wait for the
AI reviewers and automatically run `/pr-fixup` on their feedback**. End-to-end:
make sure there's a changeset, cut a branch, commit, push, open the PR (Phases
0–5); then poll for the real AI reviews and chain into `/pr-fixup` (Phases 6–7);
finally report (Phase 8). This is a user-triggered action — invoking this
command IS the explicit authorisation required by the repo's "never commit,
push, or open PRs without asking" rule, so you can proceed without further
confirmation once you've sanity-checked what's about to be shipped.

**The wait-for-reviews + auto-fixup stage runs by default.** It commits, pushes,
and posts reply comments on the PR without a separate prompt — that is the
intended behavior. Pass `--no-fixup` to skip it and get the classic
"open the PR and stop" flow. Note that the auto-fixup step depends on the
personal `/pr-fixup` command being installed; if it isn't, ship-it still opens
the PR and waits for reviews but skips fixup with a note (see Phase 7).

**Arguments:** `$ARGUMENTS`

Optional, space-separated, in any order:

- A branch name (must not contain spaces; e.g. `feat/tools-command`). If
  absent, derive one — see Phase 3.
- A bump type: `patch`, `minor`, or `major`. If absent, infer — see Phase 1.
- A quoted PR title (wrap in double quotes if it contains spaces). If absent,
  derive from the commit/changeset — see Phase 5.
- `--no-fixup` — skip the post-open "wait for AI reviews + auto-run `/pr-fixup`"
  stage (Phases 6–7) and behave like classic ship-it: open the PR and stop. By
  default (no flag) ship-it DOES wait for the real reviews and auto-fixup.

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

1. Capture the moment just before pushing — the review poller in Phase 6 uses
   it to ignore any stale reviews from earlier pushes (matters on re-runs):

   ```bash
   START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"   # remember this value for Phase 6
   ```

   Then push with upstream tracking:

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

4. Capture the PR **URL and number** from `gh pr create`'s stdout (or
   `gh pr view --json number,url`). You need the number for Phase 6 and the URL
   for the final report.

---

## Phase 6: Wait for the AI reviews

**If `--no-fixup` was passed, skip this phase and Phase 7 — go straight to
Phase 8** (classic "open the PR and stop" behavior).

This repo has three AI reviewers wired up. Each one posts an **immediate
summary/help comment that is NOT the review**, then its real review a few
minutes later. You must wait for the _real_ review, not the placeholder:

| Reviewer | Bot login | Immediate comment (ignore) | Real review (wait for) |
|----------|-----------|----------------------------|------------------------|
| Gemini Code Assist | `gemini-code-assist[bot]` | issue comment: "## Summary of Changes … I'll post my feedback shortly" | review: "## Code Review …" |
| Codacy | `codacy-production[bot]` | issue comment: "## Up to standards …" | review: "### Pull Request Overview …" |
| GitHub Copilot | `copilot-pull-request-reviewer[bot]` | (none) | review: "## Pull request overview …" |

**The reliable signal:** a reviewer's real review is a submitted entry in the
Pull-Request *reviews* API (`pulls/{n}/reviews`). The immediate summary/help
comments only ever land as *issue* comments (`issues/{n}/comments`) — they never
appear in the reviews API. So "all reviews are in" = every expected bot login
appears in `pulls/{n}/reviews` with a `submitted_at` at/after the push from
Phase 5. (Historically all three land within ~6 minutes of opening.)

Launch a background poller and **do not block the foreground** — the harness
re-invokes you when it exits (one completion notification). Substitute the PR
number from Phase 5 and the `START` timestamp you captured before pushing, then
run this with `run_in_background: true`:

```bash
OWNER="codacy"; REPO="codacy-cloud-cli"
PR="__PR_NUMBER__"            # from Phase 5
START="__START_ISO8601_UTC__" # from Phase 5, e.g. 2026-06-24T12:30:00Z
MAX_WAIT=900   # 15-minute hard cap
POLL=90        # seconds between polls (never below ~30s — GitHub rate limits)
# AI reviewers configured on this repo. Their *real* reviews land in the reviews
# API; their immediate "summary/help" comments do not. Edit this list if the
# repo's reviewer set changes.
EXPECTED=("gemini-code-assist[bot]" "copilot-pull-request-reviewer[bot]" "codacy-production[bot]")

deadline=$(( $(date +%s) + MAX_WAIT ))
while :; do
  # Distinct bot logins that have SUBMITTED a review at/after the push.
  arrived="$(gh api "repos/$OWNER/$REPO/pulls/$PR/reviews" --paginate \
    --jq '.[] | select(.submitted_at != null and .submitted_at >= "'"$START"'") | .user.login' \
    2>/dev/null | sort -u)"
  missing=()
  for bot in "${EXPECTED[@]}"; do
    grep -qxF "$bot" <<<"$arrived" || missing+=("$bot")
  done
  if [ "${#missing[@]}" -eq 0 ]; then
    echo "READY arrived=[$(paste -sd, - <<<"$arrived")]"
    exit 0
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "TIMEOUT after ${MAX_WAIT}s arrived=[$(paste -sd, - <<<"$arrived")] missing=[$(IFS=,; echo "${missing[*]}")]"
    exit 0
  fi
  sleep "$POLL"
done
```

When the poller exits you are re-invoked with its final stdout line. Read it:

- `READY arrived=[…]` → all three real reviews are in. Proceed to Phase 7.
- `TIMEOUT … missing=[…]` → not everyone posted within 15 min. **Proceed to
  Phase 7 anyway** against the reviews that did arrive, and carry the `missing`
  list into the Phase 8 report so the user knows to re-run later.

Why a background poller and not a Haiku subagent: the "real review vs. summary
comment" distinction is fully deterministic (presence in the reviews API), so no
model judgment is needed during the wait — a background shell loop costs zero
tokens and the harness wakes you the instant it finishes. A transient `gh api`
failure just yields an empty poll; the loop retries on the next tick.

---

## Phase 7: Auto-run /pr-fixup (if available)

(Reached only when `--no-fixup` was NOT passed.)

**Dependency check first.** `/pr-fixup` is a *personal* command — it normally
lives in `~/.claude/commands/pr-fixup.md` and is **not** vendored into this repo.
ship-it is committed and shared, so don't assume it's present. Check both the
project and user locations:

```bash
{ test -f .claude/commands/pr-fixup.md || test -f ~/.claude/commands/pr-fixup.md; } \
  && echo "pr-fixup: available" || echo "pr-fixup: MISSING"
```

- **MISSING** → skip the rest of this phase. The PR is open and the reviews are
  in; there's just no fixup command to run here. Carry this into the Phase 8
  report: state that auto-fixup was skipped because `/pr-fixup` isn't installed
  in this environment, and that the user should run their own fixup (or vendor
  `pr-fixup` into the repo) to continue. Do not try to hand-roll the triage.
- **Available** → continue with the steps below.

1. Invoke the `/pr-fixup` command (via the Skill tool, skill `pr-fixup`) for the
   PR you just opened. It triages every review comment, replies with decisions,
   pulls in Codacy analysis, and applies the fixes worth making.
2. When `/pr-fixup` has applied its fixes, **commit and push them** — never
   leave them uncommitted (this is the standing `/pr-fixup` expectation). Use a
   `fix:` / `chore:` commit that references the review round, then `git push`.
   Include a fresh changeset only if the fixes change package code in a way the
   existing changeset doesn't already cover.
3. Do **one** pass only. Do NOT loop back to Phase 6 to wait for re-reviews of
   the pushed fixes — that risks an endless ship→review→fix cycle. Report and
   stop; the user can re-run `/ship-it` or `/pr-fixup` if they want another round.

---

## Phase 8: Report

Lead with one sentence on what shipped, plus the PR URL. Don't re-summarise the
diff — the PR body already does. Then, unless `--no-fixup` was passed, add a
short recap of the review round:

- Which reviewers' real reviews arrived (and, if the poller timed out, which
  were still `missing` — call this out so the user can re-run later).
- What `/pr-fixup` did: comments addressed vs. dismissed, any Codacy issues
  fixed/ignored, and whether fixup changes were committed and pushed — or, if
  `/pr-fixup` wasn't installed in this environment, that auto-fixup was skipped
  for that reason and the user should run their own.

If anything was skipped or changed from the defaults (e.g. bump type defaulted
to patch because ambiguous, branch name had a suffix appended because of
collision, pre-commit hook required a retry, reviews timed out), mention it in a
single parenthetical line so the user can course-correct if needed.
