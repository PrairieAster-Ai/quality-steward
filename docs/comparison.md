# How quality-steward compares

An honest positioning of the steward against the tools it overlaps. The goal here is to tell you
where it genuinely fits and where another tool is the better choice — not to win a feature grid.

> **Currency:** this reflects the landscape as of **early 2026**. Vendor products in this space are
> moving fast — pricing, autonomy features, and "agent" releases change quarter to quarter. Treat
> the specifics below as a starting map and **verify vendor details before relying on them**.

## Where quality-steward sits

Three markets touch code quality, and each covers a different slice:

- **Code-health incumbents** (CodeScene, SonarQube, Qlty) give you a *score* and a *gate*, but they
  report — a human still does the work, and they don't write your docs.
- **The AI PR-review wave** (CodeRabbit, Qodo, Greptile, Ellipsis, DeepSource, Graphite, Baz,
  cubic) gives you *per-PR review* and increasingly *autonomous fixes*, but most have **no durable
  health score** and no living documentation.
- **Security and dependency bots** (Snyk, Semgrep, Copilot Autofix, Renovate, Dependabot) go deep on
  *one* axis — vulnerabilities or dependency freshness — and nothing else.

quality-steward sits at the **intersection**: a transparent code-health score with a trend, plus
*safety-gated* autonomous fix-PRs, plus living docs — running CI-native on your existing GitHub
Actions and billed against a Claude subscription rather than per seat. No single competitor spans
that whole triad. That intersection is the whole pitch; the trade-off is that specialists go deeper
on each individual axis (see *Where it's behind*).

## The landscape at a glance

Axes: **Delivery** (how it runs) · **Pricing** (how it's billed) · **Fix-PRs** (does it open
autonomous fix pull requests, and how aggressively) · **Score+trend** (a rolled-up health number
tracked over time) · **Docs** (does it maintain project documentation) · **Engine** (AI-driven vs
deterministic analysis).

| Tool | Category | Delivery | Pricing | Autonomous fix-PRs | Score + trend | Maintains docs | Engine |
|---|---|---|---|---|---|---|---|
| **quality-steward** | this project | CI-native GH Action (per-PR + weekly) | Claude subscription (not per-seat) | **Safe/mechanical only**, own branch, never default | **Open 0–100 CodeHealth from named metrics, trended** | **Yes — API docs, dashboard, onboarding** | AI + deterministic scripts |
| CodeScene | code-health | SaaS + CI | Per-author | Limited (ACE, IDE only) | Yes — 1–10 Code Health (proprietary) | No | Deterministic + behavioral |
| SonarQube | code-health | Self-host / SaaS + CI | Per-LOC / edition | Yes — 2026 remediation agent | Quality Gate pass/fail + ratings | No | Deterministic (+ AI assurance) |
| Qlty | code-health | CLI / CI + SaaS | Per-seat (free CLI) | Auto-formatting only | Yes — A–F maintainability (proprietary) | No | Deterministic (70+ linters) |
| CodeRabbit | AI review | PR bot / IDE | Per-seat | Suggestions + some auto-fixes | No | No | AI + 40+ linters |
| Qodo | AI review | PR bot / IDE | Per-seat | Suggestions + tests | No | Partial (tests, PR docs) | AI |
| Greptile | AI review | PR bot | Per-seat | Suggestions (low-noise focus) | No | No | AI (codebase graph) |
| Ellipsis | AI review | PR bot | Per-seat | **Yes — substantive fix-PRs** | No | No | AI |
| DeepSource | AI review + health | CI / PR | Per-seat | **Yes — agentic Autofix PRs** | Yes — multi-dimension Report Card | No | Deterministic + AI agents |
| Graphite | AI review | PR stack + bot | Per-seat | Suggestions | No (Insights = eng-analytics) | No | AI (low-noise focus) |
| Baz | AI review | PR bot | Per-seat | **Yes — autonomous fixes** | No | No | AI |
| cubic | AI review | PR bot | Per-seat | **Yes — autonomous fixes** | No | No | AI |
| Snyk | security | CI / IDE / SaaS | Per-seat / contract | **Yes — Agent Fix, curated DB** | Vuln posture (not code-health) | No | Deterministic DB + AI fix |
| Semgrep | security | CI / IDE | Per-seat (free OSS) | Assistant-generated fixes | Findings trend (not code-health) | No | Deterministic rules + AI assistant |
| Copilot Autofix | security | GH-native (CodeQL) | Per-seat (GHAS) | **Yes — suggested fixes** | Alert trend (not code-health) | No | CodeQL + AI |
| Renovate | dependency | CI bot | Free / OSS | **Yes — dependency-update PRs** | No | No | Deterministic |
| Dependabot | dependency | GH-native bot | Free | **Yes — dependency-update PRs** | No | No | Deterministic |

(Cells are compressed for the grid; the prose below is where the nuance lives.)

## Where quality-steward is differentiated

- **A transparent, open score.** CodeHealth is a 0–100 grade computed from **named, documented
  metrics** with published thresholds (see [metrics.md](metrics.md)) — you can audit exactly why a
  grade moved. CodeScene's 1–10 and Qlty's A–F are proprietary and opaque; the AI-review tools have
  **no score at all**. A number you can't explain isn't a governance tool.
- **A conservative autonomy contract as a feature, not a limitation.** The steward auto-fixes only
  provably behavior-preserving changes, on its own branch, gated on a green build *and* an empty
  non-comment diff — and *suggests* everything that touches logic or security. Much of the market is
  racing the other way, auto-opening substantive fix-PRs. That depth is real, but it also puts more
  on the reviewer to catch a wrong fix. The steward's asymmetry — eager on the harmless, hands-off on
  the consequential — is what makes it safe to leave running unattended.
- **Composition on one cadence.** Review, security, metrics, and docs run as *one* per-PR and weekly
  pass, rather than assembling and paying for three or four separate tools.
- **Not per-seat.** It bills against an existing Claude subscription and runs on the CI you already
  have. The commercial field is overwhelmingly per-developer SaaS.
- **It maintains documentation.** API references, a health dashboard, and onboarding pages are kept
  current as a byproduct of the run. Almost nothing else in these three categories does this at all.

## Where it's behind

Stated plainly, because a positioning doc that only lists strengths is useless:

- **Autonomous-fix depth.** SonarQube's remediation agent, DeepSource's agents, cubic, Baz,
  Ellipsis, Snyk Agent Fix, and Copilot Autofix all fix *substantive* logic or security issues. The
  steward deliberately won't — it suggests them. If you want an agent to write the real fix, they go
  further.
- **Security maturity.** Snyk, Semgrep, Aikido, and CodeQL bring curated vulnerability databases,
  reachability analysis, large libraries of fix templates, and compliance reporting. The steward's
  `security-audit` is a strong differential pass, not a security *platform*.
- **Behavioral / organizational analysis.** CodeScene's knowledge maps, bus-factor, and
  socio-technical change-coupling are a category the steward doesn't attempt (it measures file-level
  change-coupling only).
- **Linter and language breadth.** Qlty (70+), CodeRabbit (40+), and Trunk (50+) wrap far more
  linters across far more languages. The steward's metric skills are TypeScript/React-first (see
  [language-support.md](language-support.md)).
- **Engineering analytics / DORA.** Graphite Insights and Code Climate Velocity report delivery
  metrics; the steward reports code health, not team throughput.
- **IDE-loop and inline commit-suggestion UX.** Most AI-review tools shift left into the editor and
  offer one-click "commit this suggestion." The steward is CI/PR-time only.
- **Multi-forge and enterprise trust.** The shipped workflow is GitHub-only today (a GitLab port is
  sketched in [ci-portability.md](ci-portability.md)), and there's no SSO/SCIM/SOC2/audit-log story
  yet. Dependency **auto-update** PRs are also out of scope — the steward *reads* advisories but
  doesn't open bumps the way Renovate and Dependabot do.

## Nearest twins

Three tools come closest, each along a different axis:

- **DeepSource — closest overall.** It's the only other tool pairing a health score-and-trend (its
  multi-dimension Report Card) with agentic fix-PRs. It differs on all three of the steward's
  differentiators: it's per-seat SaaS, its autonomy is more aggressive (it opens substantive Autofix
  PRs), and it doesn't maintain docs. The steward wins on score *transparency*, on living docs, on
  the safety contract, and on not being per-seat; DeepSource wins on fix depth and language breadth.
- **CodeScene — closest on the score identity.** CodeScene shares the "a metric fact-checks the AI's
  fix" philosophy and is the other tool whose whole identity is a code-health number. It differs in
  that its score is a proprietary behavioral index, its ACE fixes live only in the IDE (no PRs), it's
  priced per author, and it writes no docs. It goes deeper on behavioral/organizational analysis; the
  steward's score is the open, auditable one.
- **SonarQube — closest on verified-fix + gate.** Sonar's 2026 remediation agent, AI Code Assurance,
  and Quality Gate are the nearest thing to the steward's "verify then gate" loop. It differs in that
  the Quality Gate is pass/fail rather than a rolled-up trend, it's a heavier per-LOC platform, and it
  doesn't maintain docs. Sonar fixes more; the steward trends more and documents.
