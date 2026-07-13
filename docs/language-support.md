# Language support

An honest answer to "will the steward work on my repo?" The short version: **review and security
are multi-language; the metrics and documentation are TypeScript/React-first, with a
language-agnostic fallback for a partial health score.** The detail matters, so here it is.

## Why support is uneven

The steward composes several skills, and they don't all analyze code the same way:

- The **review** skills operate on a *diff* using the model plus language-agnostic scanners, so they
  work broadly across languages.
- The **metric** and **documentation** skills read structure through **TypeScript-native tooling** —
  the TS compiler API, `react-docgen`, `madge`, `dependency-cruiser`, `vitest`, `drizzle`. That
  precision is exactly why they're tied to the TypeScript ecosystem.

So a TypeScript/React repo gets everything; a Python, Go, or Rust repo gets full review and security
plus a partial, language-agnostic health score.

## Capability × language tier

| Capability | Skill | TypeScript / React | Other languages |
|---|---|---|---|
| Differential correctness review | code-review *(built in)* | **Full** | **Full** — model-driven, language-agnostic |
| Security audit (SAST · secrets · SCA · IaC) | security-audit | **Full** | **Full** for covered languages (below); multi-language SAST via semgrep everywhere |
| Structural metrics (MI, complexity, coupling, hotspots, duplication, circular imports) | code-health | **Full** | **Partial** — via the `scc`-based agnostic backend (below) |
| CodeHealth roll-up score + trend | code-health | **Full** (6 weighted dimensions) | **Partial** — LOC/complexity/size dimensions only |
| Doc-coverage scorecard + generated API docs | code-readability | **Full** (TSDoc, react-docgen, Drizzle ER) | **Not yet** — TSDoc/TS-surface specific |
| Lint · type-check · coverage · sprint planning | code-quality | **Full** | **Not yet** — assumes the TS/npm toolchain |
| Dashboard, onboarding, wiki publishing | code-health / code-readability / wiki-publish | **Full** | **Partial** — publishes whatever metrics the agnostic backend produced |

"Full" = the capability runs against your code as designed. "Partial" = a reduced,
language-agnostic subset. "Not yet" = TypeScript-only today.

## What security-audit covers

`security-audit` is genuinely multi-language. Its deterministic pre-pass selects tools by what's in
the diff (full list in [`skills/security-audit/references/tools.md`](../skills/security-audit/references/tools.md)):

| Language / surface | Tools |
|---|---|
| **Any language (SAST)** | semgrep (multi-language rules + OWASP/CWE mapping) — always runs |
| **Secrets (any repo)** | gitleaks; trufflehog in `--deep` mode |
| **Dependencies (any manifest)** | osv-scanner; socket for supply-chain/typosquat |
| **JavaScript / TypeScript** | eslint-plugin-security |
| **Python** | bandit (SAST), pip-audit (SCA) |
| **Go** | govulncheck (SCA + reachability), gosec (SAST) |
| **IaC / containers** | trivy (Terraform, Dockerfile, k8s, helm) |

So even on a language without a dedicated scanner, semgrep's multi-language rules, secret scanning,
and dependency SCA still apply. The gaps above are in *metrics and docs*, not security.

## The language-agnostic health fallback

When configured, `code-health` can run an **`scc`-based backend**
(`skills/code-health/scripts/agnostic-report.mjs`) instead of the TypeScript producers. `scc`
(a fast line counter with complexity estimates) covers essentially every language, so a non-TS repo
can still get:

- **LOC** and **file counts** per language,
- an **estimated complexity** signal,
- **large-file / size** facts,

rolled into a **partial CodeHealth** grade. What it does **not** produce on a non-TS repo: the
Maintainability Index (needs the TS compiler API), Halstead volume, precise cyclomatic/cognitive
complexity, coupling/instability, circular-import detection, change-coupling, `jscpd` duplication
tied to the TS token stream, doc-coverage, and the `any`-count dimension. The grade you get is
honest but coarser — a size-and-complexity read, not the full six-dimension roll-up.

> The agnostic backend is being added in parallel with this doc. Until it lands, non-TS repos get
> review + security only, with no health score.

## What each repo gets today

**TypeScript / React repo** — everything: full six-dimension CodeHealth score and trend, hotspots,
coupling, duplication, circular-import gate, generated TSDoc API docs and Drizzle schema pages, the
lint/type-check/coverage quality loop, the dashboard, and onboarding pages. This is the tier the
skills were built for.

**Python / Go / Rust (and other) repo** — you get:

- **Full** differential `code-review` on every PR and the weekly sweep.
- **Full** `security-audit`: semgrep multi-language SAST, secret scanning, and dependency SCA
  everywhere, plus the language-specific tools above for Python and Go.
- **Partial** CodeHealth via the `scc` backend (LOC, complexity estimate, file/size counts) once
  it's configured — a coarse grade with a trend, not the full roll-up.

You do **not** get, on a non-TS repo today: the Maintainability-Index-based grade, TSDoc-generated
API documentation, or the TS/npm-specific `code-quality` loop. Extending the metric and doc skills to
other language ecosystems is a natural place to contribute — see
[CONTRIBUTING.md](../CONTRIBUTING.md).
