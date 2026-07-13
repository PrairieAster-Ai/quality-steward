# Installing the quality-steward

This is the hands-on setup guide. For what the steward *does* and why, see the
[README](README.md); for how it works internally, see [docs/technical.md](docs/technical.md).

## Prerequisites

- A GitHub repository with **GitHub Actions** enabled.
- A **Claude subscription** (Max or Pro). CI authenticates with a subscription token, so there's
  **no separate API key and no API billing**.

## 1. Copy the workflow into your repo

The workflow is the **only file you commit**. It pulls the agent definition and the bundled
skills from this repo at runtime, pinned to a reviewed commit — so there's nothing to keep in
sync.

```bash
mkdir -p .github/workflows
curl -fsSL https://raw.githubusercontent.com/PrairieAster-Ai/quality-steward/main/agents/quality-steward.yml \
  -o .github/workflows/quality-steward.yml
```

## 2. Configure it for your project

Open `.github/workflows/quality-steward.yml` and edit:

- **`PROJECT_CONFIG`** (under *Build the run instruction*) — your project's knobs (see
  [Configuration](#configuration) below).
- The **stack setup steps** — the template assumes Node/npm (`setup-node` + `npm ci`). Swap in
  your toolchain (pnpm/yarn, cargo, go, poetry…).
- **`SKILLS_REF`** — pinned to a released commit of this repo by default. Bump it to a newer
  reviewed commit when you want to take upstream updates. Pin to a **commit SHA**, never a moving
  branch (see [Supply chain](docs/technical.md#supply-chain--security)).

## 3. Authenticate CI with your Claude subscription

```bash
claude setup-token   # prints a one-year OAuth token — copy it
```

Add it as an **Actions secret** named exactly **`CLAUDE_CODE_OAUTH_TOKEN`** (repo-level, or
org-level with this repo in the access list).

> ⚠ **Do not** also add an `ANTHROPIC_API_KEY` secret. It takes precedence and silently overrides
> the subscription token (billing to the API instead). Regenerate the OAuth token yearly.

## 4. Verify before you rely on it

The workflow ships a **zero-side-effect `verify` mode** — it authenticates and returns without
touching your repo:

```bash
gh workflow run quality-steward.yml -f mode=verify
gh run watch "$(gh run list --workflow=quality-steward.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

- ✅ green → token valid, secret scoped to this repo, action wired.
- ❌ `Could not fetch an OIDC token` → the job is missing `id-token: write` (it's in the template;
  confirm you copied the whole file).
- ❌ auth error → secret missing / not granted to this repo / token expired.

Then run one full pass and watch it before trusting the unattended triggers:

```bash
gh workflow run quality-steward.yml -f mode=steward
```

## 5. (Optional) Run it locally too

Drop the agent definition into `.claude/agents/` and invoke it interactively:

```bash
curl -fsSL https://raw.githubusercontent.com/PrairieAster-Ai/quality-steward/main/agents/quality-steward.md \
  -o .claude/agents/quality-steward.md
```

Restart Claude Code (the agent registry loads at startup), then run it via `/agents` or
`claude --agent quality-steward`.

## Configuration

Set these in the workflow's `PROJECT_CONFIG` env block. Anything you leave unset is skipped
gracefully.

| Knob | What it is | Example |
|---|---|---|
| **Metric command** | produces metrics + a trend file | the `code-health` roll-up: `node skills/code-health/scripts/run-all.mjs` |
| **Green-gate** | what must stay green after an auto-fix | `npm run lint && npm run type-check && npm test` |
| **Auto-fixable surface** | the mechanical, behavior-preserving fixes the steward may auto-apply | lint `--fix`, formatter, `/code-readability annotate` |
| **Doc-publish flow** | how living docs get refreshed | `/code-readability publish` / your stamp scripts |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Could not fetch an OIDC token` | The job needs `id-token: write` (workflow-level). It's in the template. |
| Auth fails despite the secret | Ensure no `ANTHROPIC_API_KEY` secret exists (it wins); confirm the token isn't expired. |
| Steward run blocks on `npm`/`gh`/`git` | Swap `--permission-mode acceptEdits` for `--dangerously-skip-permissions` in `claude_args` (safe on an ephemeral runner; the agent's guardrails forbid pushing to the default branch). Try `acceptEdits` first. |
| Run fails with `error_max_turns` | The sweep is doing too much for the turn budget. Raise `--max-turns` and/or shrink the first-sweep window. PR-mode runs are far lighter. |
| Per-PR review doesn't run on a **public** repo's outside PRs | Expected — GitHub withholds secrets from fork PRs. Keep the trigger as `pull_request`; **never** switch to `pull_request_target` (it would expose your token to untrusted fork code). |
| Duplicate PRs/issues across runs | The agent dedupes against open `steward/*` PRs and matching issues; ensure `memory: project` is set so it remembers across runs. |
