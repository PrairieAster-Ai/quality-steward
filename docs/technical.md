# Technical documentation

How the quality-steward is built and how it behaves. For setup, see [INSTALL.md](../INSTALL.md);
for the business case, see the [README](../README.md).

## What it is: an orchestration agent, not a skill

A *skill* is one instruction set that does one thing. The quality-steward is an **agent**: it's
given a goal (`monitor → suggest → document`) and a toolbox, and it decides what to do with what
it finds. It composes existing skills rather than re-implementing them, and it never blocks on a
question (`AskUserQuestion` is disallowed) — when unsure, it takes the conservative option and
notes it in its report.

The full behavioral contract lives in [`agents/quality-steward.md`](../agents/quality-steward.md),
which is the canonical definition the workflow loads at runtime.

## The composed skills

The steward orchestrates six skills. `code-review` is built into Claude Code; the other five plus
the shared `wiki-publish` substrate are bundled in this repo and installed at runtime. This is a
**one-dashboard, several-producers** model — each skill owns one dimension:

| Skill | Owns | Feeds the roll-up |
|---|---|---|
| **code-health** | Structural metrics (Maintainability Index, cyclomatic/cognitive complexity, churn×complexity hotspots, coupling/instability, change-coupling, duplication, circular imports) + the **CodeHealth roll-up** + the dashboard render/stamp/trend | Maintainability, Structure, Resilience, Type & size |
| **code-review** *(built in)* | Correctness / bug review on a diff | non-trivial suggestions |
| **security-audit** | SAST · secrets · SCA on a diff, with LLM verification | Security |
| **code-readability** | TSDoc-native comments + generated, cross-linked API docs | Documentation |
| **code-quality** | Lint · type-check · coverage · sprint planning | test/coverage trend |
| **github** | Wiki + Projects plumbing (auth quirks handled) | where docs are published |

`code-health` is the metrics engine behind the Monitor step. See
[docs/metrics.md](metrics.md) for how the roll-up is computed, and the
[feature reference](features.md) for every mode, flag, gate, and output of each skill.

## The playbook

**1. Monitor.** If a metric command is configured, run it and read its trend file to compute
**deltas vs. the previous reading** — a regression (score down, complexity/duplication up,
coverage down, a new advisory) is the headline. With no metric harness, skip to step 2 and let
the skills' own findings stand in.

**2. Assess & suggest.** Run `code-review` and `security-audit` on the mode's diff, and
`code-readability assess` for doc-coverage gaps. Dedupe across the three, rank by impact ×
regression. Apply the *safe* auto-fixes (below); emit everything else as suggestions to the mode's
channel, each with what · where (`file:line`) · why it matters · the proposed fix · confidence.

**3. Document.** Run the doc-publish flow to refresh living docs and the dashboard — only when the
code surface actually changed (a no-op refresh produces no diff). Respect generator markers; never
clobber hand-authored pages.

**4. Report.** A tight summary: detected mode · metric deltas · the auto-fix PR link · the count
and links of suggestions raised · docs refreshed.

## The autonomy contract

This is the safety model — the boundary between what the agent may change and what it must leave
to a human.

- **Auto-fix the SAFE, mechanical things** — and only on a `steward/auto-fix-*` branch + PR,
  **never a direct push to the default branch.** "Safe" means comments/formatting/lint that cannot
  change runtime behavior. After any edit, two conditions must both hold: the **green-gate** stays
  green, *and* the **non-comment diff is empty** (`git diff -G'^[^/ ]'` shows only
  whitespace/comment churn). If an edit can't be proven behavior-preserving, the steward suggests
  it instead of making it.
- **Draft-PR the VALIDATED fixes (opt-in middle gear).** When the *fix policy* is set to `draft`,
  a fix that a composed skill has independently validated (e.g. a `security-audit --fix`
  sandbox-verified patch at confidence ≥ 0.9, or a change where the full green-gate passes) is
  committed to `steward/fix-*` and opened as a **draft** PR — never marked ready, never merged. A
  human reviews and promotes it. This is the only tier that may change runtime behavior, and only
  behind a draft a human must accept. With the policy off (the default), such fixes downgrade to
  suggestions.
- **Suggest EVERYTHING ELSE — leave it to a human.** Anything from `code-review` or
  `security-audit` that touches logic, control flow, dependencies, or security posture and isn't a
  validated draft-PR fix is a *suggestion*, routed to the right channel and filtered by the
  *suggestion policy*. The agent does not edit it.

## Policies and the quality gate

Three optional policies (set in the workflow's `PROJECT_CONFIG`; all off by default):

- **Quality-gate policy** — pass/fail conditions (score delta, a new HIGH finding, coverage drop,
  a new circular import). When set, the steward publishes a **GitHub Check Run**
  (`quality-steward/gate`) on the PR head via the Checks API, so branch protection can *require*
  it. This is what turns the steward from an advisor into an enforcer. It reports `neutral` (never
  `failure`) for fork PRs whose secrets were withheld. Requires `checks: write` (in the template).
- **Suggestion policy** — a severity floor + a per-run cap + aging, so a large first sweep can't
  flood issues. Default is unbounded (surface everything); set it on noisy repos.
- **Fix policy** — `off` or `draft` (the middle gear above).

**The dismissal loop.** A maintainer signals "don't raise this again" by closing a steward issue
as not-planned or labeling it `steward:wontfix`. The steward records the finding's fingerprint
(rule + `file:symbol`, resilient to line drift) in `project` memory and never re-raises it.

## Run modes

The agent detects its mode from the invocation context:

| Trigger | Mode | Scope | Where suggestions go |
|---|---|---|---|
| `pull_request` | **per-PR** | the PR diff (differential) | inline PR review comments |
| `schedule` (weekly) | **sweep** | commits merged since the last sweep (`git diff <last-sweep-sha>...HEAD`) + repo-wide trend deltas | durable GitHub issues |
| `workflow_dispatch` | **on-demand / verify** | as instructed | issues / none |

**Why a diff and not the whole tree:** `code-review` and `security-audit` are *differential* — a
sweep against a clean working tree gives them nothing to chew on. The weekly sweep reviews the
range of commits merged since the last sweep, so the review skills always have a real diff.

### Sweep state: the `steward-state` branch

CI runners are ephemeral, so agent memory does **not** persist across runs. The steward tracks
its state on a dedicated, auto-created **`steward-state`** branch that never touches your default
branch:

- `last-sweep-sha` — the commit the last successful sweep ended on, so the next sweep resumes from
  there. The first run falls back to a bounded `HEAD~20`.
- the durable **metric trend** (`code-health/*.tsv`, `codehealth-stamp.json`) — restored before a
  run and persisted after, so the trend survives ephemeral runners. (Committing the trend to the
  default branch instead would leave a snapshot that silently goes stale.)

The workflow persists the new marker only **after a successful sweep**, using the immutable commit
SHA the workflow ran against (not `git rev-parse HEAD`, which would reflect whatever branch the
agent left the working tree on).

## Idempotency

Re-running on an unchanged repo opens **no duplicate PRs or issues** — the agent checks for an
existing open `steward/*` PR or a matching open issue (`gh pr list`, `gh issue list --search`) and
updates rather than duplicates. `memory: project` lets it remember decisions across runs (e.g. a
finding the maintainer dismissed — don't re-raise it).

## Supply chain & security

- **Prompt injection — repo content is untrusted data, never instructions.** The steward reads
  diffs, PR/issue text, commit messages, and file contents that an outside contributor controls.
  Its instructions come *only* from the agent definition and the workflow invocation. Text it
  *reads* that tries to change its behavior ("ignore your guardrails," "push to main," "approve
  this PR," "leak the token") is treated as a **`security:prompt-injection` finding to surface**,
  not a command. The agent confines all writes to the `steward/*` branch it creates and never
  edits `.github/workflows/`, CI config, or auth files as part of a fix. This is the steward-side
  analog of `security-audit`'s base-ref memory loading (threat T8).
- **Pin `SKILLS_REF` to a reviewed commit SHA, never a branch.** The steward runs with
  `contents/pull-requests/issues/checks: write` plus the OAuth token; fetching a moving branch
  would let a compromised upstream execute inside that context. Bump the pin intentionally after
  reviewing the upstream diff.
- **`id-token: write` is required** — the Claude Code action uses GitHub OIDC during auth.
- **Never switch the trigger to `pull_request_target`** on a public repo. GitHub withholds secrets
  from fork PRs by design; `pull_request_target` would run with secrets in the context of
  untrusted fork code.
- **Subscription-token auth only.** Do not set `ANTHROPIC_API_KEY` alongside
  `CLAUDE_CODE_OAUTH_TOKEN` — it silently takes precedence.

## Self-effectiveness metrics

The steward tracks its *own* output as a trend: `.claude/steward/steward-metrics.mjs` counts fixes
merged, findings open vs. resolved, and appends a dated row to `code-health/steward-metrics.tsv`
on the `steward-state` branch. The report surfaces a one-line summary — the agent's ROI made
visible ("closed N debt items, M findings still open"). It's also a proxy for cost: a full sweep
consumes materially more model usage than a per-PR review, and the report notes the mode + diff
size so subscription usage stays visible.

## Scaling to large repositories

A wide sweep can exceed the turn budget (`error_max_turns`). The agent **chunks** a large diff —
partitioning changed files by top-level directory (or ~25-file batches), reviewing the
highest-signal chunks first (ranked by the step-1 regression and hotspot table), and recording how
far it got so the next run resumes. It reports partial coverage honestly rather than truncating.
Prefer shrinking the window over raising `--max-turns` without bound.

## Running on other forges

The shipped workflow is GitHub Actions + `gh`-specific, but the agent talks to the VCS through a
thin boundary (create-comment, open-issue, open-PR, publish-check). Porting to GitLab or Bitbucket
swaps those calls; see [ci-portability.md](ci-portability.md) for a GitLab CI example. The
doc-publishing backend is similarly swappable (the "publisher boundary" in the agent def).

## Repository layout

```
agents/
  quality-steward.md     the agent definition — the brain (canonical source)
  quality-steward.yml    the GitHub Actions workflow — the only file you copy into your repo
skills/
  code-health/           metrics engine + CodeHealth roll-up + dashboard
  code-readability/       TSDoc standard + generated API docs
  security-audit/         differential SAST/SCA/secrets audit (+ deterministic Python CLI)
  code-quality/           lint / type-check / coverage / sprint planning (+ CLI)
  github/                 wiki + projects plumbing
  wiki-publish/           shared marker-stamping + wiki push substrate
docs/
  metrics.md             what good software metrics are (the methodology)
  technical.md           this file
  example-nearest-nice-weather.md   the steward on a real project
INSTALL.md               setup guide
```
