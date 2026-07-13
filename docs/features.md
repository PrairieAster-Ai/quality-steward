# Feature reference

Every capability of the quality-steward agent and the skills it composes: modes, commands, flags,
metrics, gates, and outputs. For the *strategy* behind the metrics see [metrics.md](metrics.md);
for architecture and the autonomy contract see [technical.md](technical.md); for step-by-step
adoption see [usage.md](usage.md).

The steward composes **six skills**. `code-review` is built into Claude Code; the other five,
plus the shared `wiki-publish` substrate, are bundled in this repo.

| Skill | Role | Section |
|---|---|---|
| code-health | metrics engine + CodeHealth roll-up + dashboard | [↓](#code-health) |
| code-review *(built in)* | correctness / bug review on a diff | [↓](#code-review-built-in) |
| security-audit | differential SAST · secrets · SCA with LLM verification | [↓](#security-audit) |
| code-quality | lint · type-check · coverage · sprint planning | [↓](#code-quality) |
| code-readability | TSDoc standard + generated API docs | [↓](#code-readability) |
| github | wiki + projects plumbing | [↓](#github) |
| wiki-publish | shared marker-stamping + wiki push substrate | [↓](#wiki-publish) |

---

## The agent

The steward itself is an orchestration agent with one goal — **monitor → suggest → document** —
and a fixed safety model. Full detail in [technical.md](technical.md); the capabilities in brief:

- **Three run modes**, detected from context: **per-PR** (differential review → inline PR
  comments), **weekly sweep** (commits since the last sweep → issues + auto-fix PR + doc refresh),
  and **on-demand** (`workflow_dispatch`, `mode=steward` or the zero-side-effect `mode=verify`).
- **The three-tier autonomy contract**: (1) auto-apply provably behavior-preserving changes on a
  `steward/auto-fix-*` branch + PR (green-gate green *and* empty non-comment diff); (2) with the
  *fix policy* on, open a **draft** PR for a skill-validated non-trivial fix (never merged); (3)
  *suggest* everything else. **Never pushes to the default branch.**
- **Optional quality gate**: with a *quality-gate policy* set, publishes a `quality-steward/gate`
  **GitHub Check Run** (score delta / new HIGH finding / coverage drop / new circular import) that
  branch protection can require — the switch from advisor to enforcer.
- **Suggestion policy**: severity floor + per-run cap + aging, so findings don't flood.
- **Trust boundary**: treats all diff/PR/issue content as untrusted *data*, never instructions;
  injection attempts become a `security:prompt-injection` finding. Writes are confined to the
  `steward/*` branch.
- **Durable memory** on the auto-created `steward-state` branch (the `last-sweep-sha` marker, the
  metric trend, and self-metrics), restored before and persisted after each run.
- **Dismissal loop**: closing a steward issue as not-planned or labeling it `steward:wontfix`
  records the finding's fingerprint (`rule + file:symbol`) so it's never re-raised.
- **Self-effectiveness metrics** (`.claude/steward/steward-metrics.mjs`): tracks fixes merged and
  findings open vs. resolved as its own trend.
- **Large-repo chunking**: partitions a wide sweep by directory/batch, highest-signal first, and
  resumes across runs to avoid `error_max_turns`.
- **Idempotent**: dedupes against open `steward/*` PRs and matching issues.
- **Configurable knobs** (in `PROJECT_CONFIG`): metric command, green-gate, auto-fixable surface,
  doc-publish flow, and the quality-gate / suggestion / fix policies.

---

## code-health

The metrics engine. Measures structural health, trends every metric to a TSV, rolls them into one
weighted **CodeHealth** grade (A–F), and stamps a published dashboard. It measures and aggregates;
it does not annotate docs, write tests, or run the full security toolchain — it reads those signals
where they live and rolls them in.

### Modes

| Mode | What it does | Command |
|---|---|---|
| **instrument** | First-time setup: write `code-health.config.json`, add devDeps + `npm run` aliases, seed the history TSVs, create/stamp the dashboard page | setup + one `run-all.mjs` run |
| **read** | Take a fresh reading — all producers, then the roll-up | `node skills/code-health/scripts/run-all.mjs` (`--no-write` to print without appending history) |
| **refresh** | Regenerate the dashboard by filling the `<!--ch:*-->` markers | `run-all.mjs --stamp <wiki>/Code-Health-Dashboard.md <wiki>/Home.md` |

Each metric also has a standalone producer script (`maintainability-report.mjs`,
`complexity-report.mjs`, `hotspot-report.mjs`, `coupling-report.mjs`,
`change-coupling-report.mjs`, `duplication-report.mjs`, `security-report.mjs`,
`coverage-report.mjs`), plus the roll-up (`codehealth-report.mjs`), the gate checks
(`check-circular-deps.mjs`, `check-doc-coverage.mjs`), the checklist (`quality-checklist.mjs`),
and the stamper (`stamp-codehealth.mjs`). `run-all.mjs` runs the producers (failures tolerated,
falling back to defaults), then the roll-up last, then optionally stamps.

### Every metric it measures

| Metric | Measures | How | Thresholds / bands | Feeds |
|---|---|---|---|---|
| **Maintainability Index** | per-file maintainability | TS compiler API: `MI = MAX(0, (171 − 5.2·ln(V) − 0.23·CC − 16.2·ln(SLOC))·100/171)` | 🟢 ≥20 · 🟡 10–19 · 🔴 <10 | Maintainability, Resilience |
| **Cyclomatic complexity** | independent paths / testability | TS AST, decision points + 1 (trivial `cc=1` fns excluded) | 1–10 simple · 11–15 moderate · 16–20 complex · 20+ refactor; `over15` counted | roll-up display (`cc_mean`, `cc_max`, `fn_over15`) |
| **Cognitive complexity** | readability / nesting penalty | ESLint `sonarjs/cognitive-complexity` (gate only, not scripted) | ≤ 15 | gate |
| **Halstead volume** | program size from operator/operand counts | `V = N·log₂(n)` from the TS token stream | — | feeds MI |
| **Coupling / instability** | fan-out, folder instability | `dependency-cruiser --metrics`: `I = Ce/(Ce+Ca)` | modules with Ce>10 flagged; healthy = I rises foundation→leaves | Structure (fan-out fact) |
| **Circular imports** | import cycles | `madge` `.circular()` | gate: **0** cycles | Structure (`100 − 25·cycles`) |
| **Change coupling** | files repeatedly co-edited | `git log` co-change pairs over `window`; degree = co-changes / min(revisions); cross-layer = differing top-level path | `maxFiles 25, minRev 5, minCo 4, minDegree 0.4`; cross-layer is the smell | Structure (`− 5·cross_layer_pairs`) |
| **Hotspots (churn × complexity)** | complex code changed often | `git log --name-only` revisions × TS-AST cyclomatic; score = revisions × cc | count = top-right quadrant (both above median) | dashboard facts |
| **Duplication** | copy-paste clones | `jscpd` token-level, `--min-lines dupMinLines` | target **< 2%** (`dupMinLines` default 8) | dashboard fact `dup` |
| **Doc coverage** | exported decls with adjacent `/** */` | static scan of `docDirs` | anchors 100%→100, 50%→0; `--gate` fails on any gap | **Documentation** (20%) |
| **Test coverage** | statement + branch coverage | `vitest run --coverage` per workspace | trend only (`code-quality` is authoritative) | trend |
| **Dependency advisories (SCA)** | npm advisory counts by severity | `npm audit --json` | score `100 − 25·crit − 10·high − 1·mod − 0.25·low` | **Security** (10%) |
| **`any` count** | explicit `any` annotations | `grep :\s*any\b` in `dirs`, tests/comments excluded | anchors 0→100, 30→0 | Type & size (½) |
| **Large files (>500 LOC)** | oversized files | line count per file | anchor (over500/files)·100, 0→100, 10→0 | Type & size (½) |

### The CodeHealth roll-up

Six weighted dimensions, each normalized `norm(v, good, bad) = clamp((v−bad)/(good−bad)·100)`,
then summed; grade bands **A ≥ 90 · B 80–89 · C 70–79 · D 60–69 · F < 60**.

| Dimension | Weight | Anchors / formula |
|---|--:|---|
| Documentation | 20% | doc coverage %: 100%→100, 50%→0 |
| Maintainability | 25% | health proportion = (green + ½·yellow)/files: 100%→100, 70%→0 |
| Structure | 20% | `100 − 25·cycles − 5·cross_layer_pairs` |
| Resilience (worst file) | 10% | lowest single-file MI: 25→100, 5→0 |
| Type & size safety | 15% | avg of [`any` 0→100/30→0] and [%files>500LOC 0→100/10→0] |
| Security (deps) | 10% | `100 − 25·critical − 10·high − 1·moderate − 0.25·low` |

Maintainability (the healthy *share* — the body of the distribution) and Resilience (the *worst*
file — the tail) are kept separate because a single mean captures neither. See
[why a proportion, not a mean](metrics.md#why-a-proportion-not-a-mean).

### Gates it can enforce

| Gate | Script / rule | Fails when |
|---|---|---|
| Circular imports = 0 | `check-circular-deps.mjs` (madge) | any cycle exists |
| Doc-coverage floor | `check-doc-coverage.mjs --gate` | any undocumented export |
| Cognitive complexity ≤ 15 | ESLint `sonarjs/cognitive-complexity` | a function exceeds 15 |
| Cyclomatic complexity | ESLint `complexity` rule | a function exceeds the cap |
| Coverage floor | vitest `thresholds` | coverage drops below the floor |

### The quality-coverage checklist

`quality-checklist.mjs` probes the repo — CI workflows, `package.json` scripts, ESLint/vitest
config, pre-commit hooks, the code-health history, the installed skills, and (with `--wiki`) the
published pages — and classifies every capability **✅ enabled / ⚠️ partial / ❌ gap / ➖ n/a**
across groups (build & test gates, security, code-health metrics, enforcement gates,
documentation, steward automation). Its whole purpose is catching a capability that's *available
but never turned on* — e.g. a metric measured but never made a CI gate. It writes
`quality-checklist.json` and stamps the `<!--ql:*-->` markers on a **Quality-Coverage** dashboard.

### Outputs

Per-metric trend TSVs + `codehealth-history.tsv` under `historyDir` (default `code-health/`);
`codehealth-stamp.json` (dashboard facts); `hotspot-table.md`; `quality-checklist.json`; and the
**Code-Health-Dashboard** wiki page (hand-authored prose with `<!--ch:*-->` markers filled by the
stamper). The TSVs are generated artifacts — gitignored on the default branch; the **durable
trend lives on the `steward-state` branch**.

### Config (`code-health.config.json`)

| Key | Default | Purpose |
|---|---|---|
| `dirs` | `["src"]` | source dirs analyzed |
| `docDirs` | falls back to `dirs` | dirs for doc-coverage |
| `coverageWorkspaces` | `["."]` | workspaces run through vitest |
| `tsconfig` | `null` | tsconfig for madge/depcruise accuracy |
| `historyDir` | `"code-health"` | output dir for TSVs + stamp JSON |
| `window` | `"365 days ago"` | git-history window for hotspots / change-coupling |
| `blobBase` | derived from `origin` | GitHub blob base for file links |
| `changeCoupling` | `{maxFiles:25, minRev:5, minCo:4, minDegree:0.4}` | change-coupling thresholds |
| `thresholds` | `{miGreen:20, miYellow:10, dupMinLines:8}` | MI bands + jscpd min-lines |

Install (repo devDeps): `typescript`, `dependency-cruiser`, `madge`; `eslint`, `jscpd`, and
`vitest --coverage` are invoked via the repo toolchain / `npx`.

### Additional producers

| Script | Purpose |
|---|---|
| `agnostic-report.mjs` | **Language-agnostic** size/complexity backend via `scc` (LOC, complexity, comment ratio, per-language) for non-TypeScript repos — the partial-CodeHealth fallback (see [language support](language-support.md)). Degrades gracefully if `scc` isn't installed. |
| `portfolio-report.mjs` | **Multi-repo rollup** — reads each repo's `codehealth-stamp.json` and emits a worst-first table (Repo · Grade · Score · Top hotspot · Doc% · Security) + `portfolio-stamp.json` for an org/portfolio dashboard. |
| trend sparkline | `codehealth-report.mjs` emits a `trend` fact (a Mermaid `xychart-beta` of score-over-time, Unicode-sparkline fallback) stamped into the new `ch:trend` dashboard marker. |

---

## code-review *(built in)*

Claude Code's built-in `/code-review` — a **differential** review of the current diff for
correctness bugs plus reuse / simplification / efficiency cleanups, at a selectable effort level
(low/medium surface fewer, high-confidence findings; high→max broaden coverage). The steward runs
it on the mode's diff (the PR diff per-PR; the sweep range weekly) and routes confirmed
correctness findings to suggestions. It ships with Claude Code, so it is not bundled here.

---

## security-audit

A differential, high-signal security audit of the branch's pending changes: deterministic
scanners, then a dual-chain LLM verification, with per-repo false-positive memories and
OWASP/CWE/ASVS/ATT&CK tagging. Coexists with Anthropic's bundled `/security-review`.

### Modes / flags

| Invocation | Does |
|---|---|
| `/security-audit` | audit pending changes vs `origin/HEAD` |
| `/security-audit <base-ref>` | audit vs a specific base (`main`, `release/v2`, …) |
| `/security-audit --fix` | also propose sandbox-validated patches for HIGH-confidence findings (≥ 0.9) |
| `/security-audit --tools-only` | run only the deterministic SAST/SCA pre-pass, skip LLM verification (CI mode; per-tool SARIF) |
| `/security-audit --deep` | add whole-codebase complexity hotspots, full git-history secret scan, and full (non-diff) SCA |
| `/security-audit --post-pr <N>` | run the audit and post results as a PR comment on PR #N |
| `--use-mcp` | route the Semgrep call through the Semgrep MCP server (falls back to subprocess) |

Deterministic CLI subcommands (`skills/security-audit/scripts/security_audit.py`): `scan`, `ci`,
`comment --pr <N>`, `validate-rule` (3-stage rule filter), `promote-memories` (promote pending FP
memories with safety filters), `rule-stats` (surface low-signal rules by FP rate).

### Scanners

| Tool | Covers | When |
|---|---|---|
| **semgrep** (`--config=p/default`) | multi-language SAST + OWASP/CWE mapping | always |
| **gitleaks** | secrets in the diff range | always |
| **osv-scanner** | SCA across dependency manifests | always |
| **lizard** | complexity hotspots on changed files | always |
| **trivy** (`trivy config`) | IaC / container misconfig | Dockerfile / `.tf` / k8s / helm touched |
| **socket** | supply-chain / typosquat | dep manifests change |
| **bandit** / **pip-audit** | Python SAST / SCA | `.py` / Python deps |
| **govulncheck** / **gosec** | Go SCA+reachability / Go SAST | `.go` files |
| **eslint-plugin-security** | JS/TS security lint | JS/TS diff |
| **trufflehog** (`--only-verified`) | verified secrets across full history | `--deep` only |

(It deliberately **avoids** `safety`, standalone `tfsec`, `kics`, bare `npm audit`, and other
login-gated or noisy tools.)

### How findings are classified

- **Dual-chain LLM verification** per finding, run in parallel: Chain A (FP-detector) may
  auto-dismiss only at `fp_confidence ≥ 0.85`; Chain B (TP-explainer) never auto-dismisses and
  produces the exploit chain + fix. The design biases toward *not* missing real vulnerabilities.
- **Severity** HIGH / MEDIUM / LOW; **confidence** 0.0–1.0 with a floor at **0.7**, publish gate
  at **0.8**, `--fix` candidacy at **0.9**.
- **Tagging** — every finding carries a CWE id, an OWASP Top 10:2025 tag, and a MITRE ATT&CK
  technique. **ASVS-by-touched-chapter**: the diff is scanned to detect which ASVS 5.0 chapters it
  touches, and only those requirements load into the prompt (rather than all 286).
- **Per-repo false-positive memories** (`.claude/security-memories.md`) are loaded from the PR
  **base** ref (not head — so a malicious PR can't suppress its own finding); new memories are
  *proposed*, never auto-written.
- **25 hard exclusions** (never reported regardless of confidence) — DoS/rate-limiting, ReDoS,
  path-only SSRF, XSS in auto-escaping frameworks, client-side authz, test/doc files, etc.;
  per-repo overrides via `.claude/security-config.yaml`.

### Outputs

A single markdown report (scope · pre-pass counts · auto-dismissed counts · per-finding
Severity/Confidence/CWE·OWASP·ATT&CK, Source→Sink, exploit scenario, fix sketch, detecting tool).
`--post-pr` prepends a `<!-- security-audit:sha=<full> -->` dedup marker and runs in a throwaway
`git worktree` at the PR HEAD. `--tools-only` writes per-tool SARIF for CI upload.

---

## code-quality

The hands-on "plan and do the cleanup" side — lint/type-check/coverage runs plus improvement
sprint planning. It does **not** compute the CodeHealth score (that's `code-health`); it consumes
the same signals to plan and execute the work.

### Modes

| Command | Does |
|---|---|
| `/code-quality assess` | full assessment (Phase 1 checks) → baseline report |
| `/code-quality metrics` | current metrics vs targets |
| `/code-quality hotspots` | highest-priority areas via the Impact/Effort matrix |
| `/code-quality sprint` | plan a focused improvement sprint |

Workflow: Assessment → Hotspot identification (P0–P4 Impact/Effort) → Sprint planning (Quick-Win
4–8h / Standard 16–24h / Deep-Dive 40h+; the 5-sprint model Critical Blockers → Quick Wins →
Architecture → Testing → Polish) → Validation.

### Checks & targets

| Check | Command | Target |
|---|---|---|
| Lint | `npm run lint` | 0 errors / 0 warnings |
| Type safety | `npm run type-check` | 0 TS errors |
| Test coverage | `npx vitest run --coverage` | 80%+ lines |
| Duplication | `npx jscpd src` | < 2% |
| `any` count | grep `: any` | < 50 |
| Large files | line counts | none > 500 LOC (non-data) |
| Complexity | `eslint --rule 'complexity: [warn, 15]'` | no function > 15 |

Deterministic CLI (`skills/code-quality/scripts/code_quality.py`, `assess`): threshold flags
(`--min-coverage-percent`, `--max-any-count`, `--max-duplication-percent`, `--large-file-threshold`,
…) and `--fail-on-thresholds` to exit non-zero on any FAIL; emits `summary.json` + `summary.md`
and top-5 hotspots.

---

## code-readability

Enforces a TSDoc-native comment standard that serves four readers at once — human, IDE, doc
generator, AI — then turns those comments into cross-linked GitHub-Wiki documentation.

### Modes (default scope = branch-changed files; pass a dir or `all`)

| Mode | Does | Edits code? |
|---|---|---|
| `assess [path]` *(default)* | doc-coverage + readability scorecard; ranks the worst files | no |
| `annotate <path>` | adds/upgrades TSDoc + structure — the **only** editing mode; comments-only invariant (green gate + empty non-comment diff) | yes (comments only) |
| `generate [scope]` | extract → Markdown into `/tmp/cr-docs/` for review | no |
| `publish [scope]` | runs `generate`, then SSH-pushes pages to the wiki | no (wiki) |
| `team [scaffold\|stamp]` | maintains the Getting-Started + Skill-Inventory pages; `scaffold` writes starter pages, `stamp` (default) refreshes the fact-blocks idempotently | no (wiki) |

### Doc-coverage scorecard

Resolves scope to `.ts`/`.tsx` (excludes tests/generated), enumerates exported symbols, and scores
against targets: TSDoc summary ≥ 90% · prop `/** */` ≥ 90% · `@example` on 100% of API-surface
symbols · module-header comment on 100% of non-trivial modules · "why" comments (qualitative). A
symbol counts as documented when an immediately-preceding `/** */` block exists. Hotspots rank by
`(exported symbols) × (1 − coverage)`.

### Generators

`extract-docs.mjs` (react-docgen-typescript → component/prop JSON) · `gen-schema-page.mjs`
(Drizzle schema → reference page + Mermaid ER diagram) · `gen-team-pages.mjs` (scaffold/stamp the
`cr:` fact regions from `package.json` + `.env.example`) · `linkify-wiki.mjs` (wrap backtick
tokens that resolve to tracked files in blob links) · `wiki-slug.mjs` (canonical anchor slugs).

### The comment standard

**TSDoc, never PropTypes** (the prop interface is the contract). Four comment kinds: module
header (why-not-what), TSDoc `/** */` summary, per-member docs, inline "why" notes. Tags:
`@param @returns @example @remarks @see @throws @defaultValue @deprecated` — skipping ceremony that
restates types. The component summary sits above the component (not its `Props` interface). The
**AI-context test**: could a competent model use the symbol correctly from the comment alone? Also
covers HTML (semantic/ARIA), CSS/Sass (KSS/SassDoc), and vanilla JS (JSDoc).

### Markers / config

`cr:` fact blocks — `prereqs`, `scripts`, `env` (Getting-Started), `stack` (Skill-Inventory);
generated pages lead with `<!-- generated by /code-readability — edits will be overwritten -->`.
Env knobs: `CR_TSCONFIG`, `CR_SCHEMA`, `CR_PKG`, `CR_ENV_EXAMPLE`, `CR_REPO_ROOT`.

---

## github

Manages GitHub Wiki pages and Project boards, handling each feature's non-obvious auth.

| Command | Does |
|---|---|
| `/github wiki list \| edit <page> \| create <page>` | clone/list/edit/create wiki pages |
| `/github projects list \| view <number>` | list / view Project boards |

**Auth quirks it documents:** wiki **push requires SSH** (fine-grained PATs and HTTPS get 403 —
use the `git@github.com:` URL); the wiki branch is `master`, not `main`, with no PR flow;
issues/PRs/releases use the `gh` CLI OAuth token; **GitHub Projects need the `project` OAuth
scope** (`gh auth refresh -s read:project,project`).

---

## wiki-publish

The shared **publishing substrate** beneath code-readability and code-health. It owns *how*
generated facts reach the wiki — not the content — so neither producer reimplements it.

- **Marker convention:** only facts are regenerated, inside generic `<!--PREFIX:NAME-->…<!--/PREFIX:NAME-->`
  regions; hand-authored prose around them stays curated. Each producer owns a prefix — `ch:`
  (code-health), `cr:` (code-readability). A new producer just picks a prefix and emits a facts JSON.
- **`stamp.mjs <facts.json> <prefix> <file.md>…`** — generic, idempotent marker stamper; handles
  multi-line block values and is `$`-safe.
- **`wiki-repo.mjs <url|clone|guard|push>`** — the git plumbing: derive the wiki SSH URL, clone,
  **guard** (refuse to clobber any page lacking the generated marker), and commit/push (SSH-only,
  with a clear auth error if the key is missing).
- **Publish protocol:** `url → clone → producers write pages + emit facts → guard → stamp →
  (linkify) → push`.
