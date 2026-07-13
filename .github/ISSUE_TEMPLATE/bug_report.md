---
name: Bug report
about: Something the steward or a skill did wrong
title: "fix: "
labels: bug
---

<!--
Before filing: if this is a security vulnerability, do NOT open a public issue.
Report it privately via a GitHub Security Advisory (Security tab). See SECURITY.md.
-->

## What happened

A clear description of the bug.

## Steps to reproduce

1.
2.
3.

## Expected behavior

What you expected the steward / skill to do.

## Actual behavior

What it actually did. Include the relevant output.

## Environment

- Claude Code version:
- Runner / trigger: <!-- e.g. GitHub Actions (pull_request / schedule / workflow_dispatch), or local `claude --agent` -->
- Which skill or mode: <!-- e.g. code-health read, security-audit, per-PR review, weekly sweep -->
- Project stack: <!-- language(s), package manager, Node version, monorepo? -->
- `SKILLS_REF` pinned SHA: <!-- from your workflow, if applicable -->

## Workflow logs

<!--
Paste the relevant GitHub Actions job log (or local agent output). Redact secrets and
any private source. The steward's final report line (detected mode · deltas · PR/issue links)
is especially useful.
-->

```
paste logs here
```

## Anything else

Screenshots, related issues, or context that helps.
