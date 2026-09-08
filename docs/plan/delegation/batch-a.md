You are executing three tickets from docs/plan/08-task-breakdown.md in this repo
(Viewpoint Arena, a Vite + React + TypeScript SPA). Read the relevant plan docs
before acting: docs/plan/07-oss-hygiene-and-licensing.md and
docs/plan/08-task-breakdown.md.

Execute ALL THREE of these tickets. Do NOT do any other ticket.

## T0.2 — Repo hygiene housekeeping
Add `Videos Post linkedin/` to `.gitignore` so `git status` no longer shows it
as untracked. Do not delete the directory.

## T0.3 — OSS baseline files
Create these files, all consistent with an **Apache-2.0** license decision
(see 07-oss-hygiene-and-licensing.md §3):
- `LICENSE` — the full, verbatim, unmodified Apache License 2.0 text.
  Copyright holder line: "Copyright 2026 Viewpoint Arena contributors".
- `CONTRIBUTING.md` — how to set up the dev environment (derive the real
  commands from package.json, do not invent scripts that don't exist), branch
  and PR conventions, how to run checks, and the Apache-2.0 / DCO-style
  inbound=outbound contribution statement.
- `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1, verbatim, with the
  enforcement contact left as a clearly-marked TODO placeholder rather than a
  guessed email address.
- `SECURITY.md` — supported versions, private vulnerability reporting via
  GitHub Security Advisories, and a response-time expectation.
- `CHANGELOG.md` — Keep a Changelog format, with an `## [Unreleased]` section
  only. Do not invent past releases.
- `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`,
  `.github/ISSUE_TEMPLATE/config.yml` — GitHub issue forms (YAML), not markdown.
- `.github/PULL_REQUEST_TEMPLATE.md`.
Also set `"license": "Apache-2.0"` in `package.json`.

## T1.3 — Typecheck script
Add a `"typecheck": "tsc --noEmit"` script to `package.json`. Then RUN
`npm run typecheck` and make it pass on the current code. If it reports errors,
fix them properly — correct the types, do not use `@ts-ignore`, `any`, or
loosen tsconfig strictness to silence them. If a genuine fix requires a
behavioural change you are not confident about, leave it and report it instead
of guessing.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, or `git reset`.
  Leave all changes in the working tree; a reviewer will inspect and commit them.
- Do NOT touch files unrelated to these three tickets.
- Do NOT modify anything under `docs/`.
- Prefer real, verbatim license/CoC texts. If you cannot fetch the canonical
  text, say so explicitly rather than paraphrasing it.

## Final output
End your run with a short report:
1. Files created/modified, one line each.
2. The exact `npm run typecheck` result (pass, or the remaining errors).
3. Anything you deliberately did NOT do, and why.
