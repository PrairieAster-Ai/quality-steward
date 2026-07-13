# CI portability

The shipped steward runs on **GitHub Actions** and talks to GitHub through `gh` and `git`. That's
the only workflow we test and support. This doc explains what is GitHub-specific, where the
abstraction boundary is for porting to another forge, and provides a **community-grade GitLab CI
example**.

## What's GitHub-specific

The steward's *logic* — detect the mode, run the review and metric skills on a diff, auto-fix the
safe things on a branch, suggest the rest — is forge-agnostic. What's GitHub-specific is the thin
layer where it **reads the trigger** and **emits results**:

| Concern | GitHub implementation | Where it lives |
|---|---|---|
| Trigger → mode | `on: pull_request` / `schedule` / `workflow_dispatch` | `agents/quality-steward.yml` |
| Which diff to review | PR number + base ref, or the `steward-state` sweep range | the workflow's env + `range` step |
| Post an inline review comment | `gh pr comment` / `gh pr review` | agent Bash |
| Open an issue for a risky finding | `gh issue create` (dedup via `gh issue list --search`) | agent Bash |
| Open the auto-fix PR | `gh pr create` on a `steward/auto-fix-*` branch | agent Bash |
| Auth | `CLAUDE_CODE_OAUTH_TOKEN` secret + OIDC `id-token: write` | the workflow |
| Durable state | `steward-state` branch pushed with the built-in `GITHUB_TOKEN` | the workflow |

Everything above the agent prompt is forge-neutral; the agent prompt itself
([`agents/quality-steward.md`](../agents/quality-steward.md)) already treats "publish the docs" and
"emit a suggestion" as swappable steps (see its *Publisher boundary* and *Suggestion channels*
knobs).

## The abstraction boundary for another forge

To port the steward to GitLab, Bitbucket, or Azure DevOps, you swap exactly three mechanics and
leave the analysis untouched:

1. **Trigger → mode.** Map the forge's pipeline triggers onto the three modes: a merge/pull-request
   pipeline → per-PR, a scheduled pipeline → weekly sweep, a manual/dispatch run → on-demand.
2. **Suggestion channel.** Replace the `gh` calls with the forge's review-comment and issue APIs:
   - GitLab → MR **notes** / **discussions** and project **issues** via the REST API.
   - Bitbucket → PR **comments** and repo **issues**.
   - Azure DevOps → PR **threads** and **work items**.
3. **State + auth.** Point the durable `steward-state` branch push at a token the forge accepts, and
   provide `CLAUDE_CODE_OAUTH_TOKEN` as a CI variable.

The metric, review, security, and doc skills don't change — they operate on a git diff and the
working tree, which every forge provides identically.

## GitLab CI example (community-grade)

A working port lives at
[`agents/quality-steward.gitlab-ci.yml`](../agents/quality-steward.gitlab-ci.yml). It is a
**community-grade example — less battle-tested than the GitHub workflow.** Verify it on your project
before relying on it.

It mirrors the GitHub workflow: it clones this repo at a pinned `SKILLS_REF` SHA, installs the six
skills into `.claude/skills/` and the agent into `.claude/agents/`, then runs the agent headless via
the Claude Code CLI. It uses GitLab's predefined variables — `CI_MERGE_REQUEST_IID`,
`CI_MERGE_REQUEST_TARGET_BRANCH_NAME`, `CI_PROJECT_DIR`, `CI_PROJECT_ID`, `CI_COMMIT_SHA`,
`CI_API_V4_URL` — and reads `CLAUDE_CODE_OAUTH_TOKEN` from a masked CI variable.

The shape of the per-MR job:

```yaml
steward:mr:
  extends: .steward_base           # clones quality-steward @ SKILLS_REF, installs skills + agent
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  script:
    - |
      claude -p "…Run as the quality-steward in PER-PR mode. Review the diff of merge request
      !${CI_MERGE_REQUEST_IID} (origin/${CI_MERGE_REQUEST_TARGET_BRANCH_NAME}...HEAD).
      Post MR notes for risky findings via the GitLab REST API; open an auto-fix branch + MR ONLY
      for safe, behavior-preserving mechanical fixes. Never push to the default branch." \
      --agent quality-steward \
      --permission-mode acceptEdits \
      --max-turns 80 \
      --allowedTools Bash,Read,Write,Edit,Grep,Glob,Skill
```

### Where `gh` is replaced

The one real difference from the GitHub workflow is the suggestion channel. Instead of `gh`, the
agent's Bash calls the GitLab REST API (using a Project/Group access token and `CI_API_V4_URL`):

| GitHub (`gh`) | GitLab REST equivalent |
|---|---|
| `gh pr comment` / `gh pr review` (inline) | `POST /projects/:id/merge_requests/:iid/notes` (or `/discussions` for inline) |
| `gh issue create` | `POST /projects/:id/issues` |
| `gh pr create` (auto-fix branch) | `POST /projects/:id/merge_requests` after pushing `steward/auto-fix-*` |
| `gh issue list --search` (dedup) | `GET /projects/:id/issues?search=…` |

The sweep-state mechanics are otherwise identical: the same `steward-state` branch holds
`last-sweep-sha`, resolved before the run and persisted (from `CI_COMMIT_SHA`, not
`git rev-parse HEAD`) only after a successful sweep.

### Caveats for the GitLab port

- **Less tested.** The GitHub workflow is the supported path; the GitLab file is a reference.
- **Token scope.** The default `CI_JOB_TOKEN` is often too narrow to post notes and open issues —
  provision a Project or Group access token (`GITLAB_STEWARD_TOKEN` in the example).
- **No OIDC-equivalent needed.** The GitLab CLI auth is the OAuth token alone; there's no
  `id-token: write` analogue to configure.
- **Fork MRs.** As on GitHub, keep secrets away from untrusted fork pipelines — GitLab's protected
  variables and protected-branch settings are the equivalent guardrail to *not* using
  `pull_request_target`.

For the security rationale behind pinning `SKILLS_REF` and subscription-token auth — which applies
identically on any forge — see [technical.md](technical.md#supply-chain--security).
