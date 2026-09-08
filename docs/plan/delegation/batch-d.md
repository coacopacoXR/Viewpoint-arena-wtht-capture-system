You are executing ticket T1.5 from docs/plan/08-task-breakdown.md, plus one
small follow-up. Read these first, they are the specification:
- `docs/plan/04-testing-and-ci.md`, especially §6 (the CI pipeline shape)
- `docs/plan/03-security-and-secrets.md`, especially §4 (the public-env check)
- the T1.5 entry in `docs/plan/08-task-breakdown.md`

Tickets T1.1-T1.4 are already done and committed: `npm run lint`, `typecheck`,
`test`, and `test:e2e` all exist and pass. Build on them, do not redo them.

## T1.5 — CI pipeline
Create:
1. `.github/workflows/ci.yml` — following 04-testing-and-ci.md §6. Runs on
   pull_request and on push to the main/planning branches. Node 24 LTS, npm
   cache enabled, `npm ci`. Jobs for: lint, typecheck, unit test, build, e2e
   (with `npx playwright install --with-deps chromium`), the public-env check
   below, `npm audit`, and gitleaks secret scanning.
2. `.github/workflows/nightly-live-adapters.yml` — a STUB on a nightly cron
   with a clearly-commented placeholder job. Real adapter jobs land in Phase 3.
   It must be valid YAML that GitHub will accept, and must not fail nightly —
   have the placeholder job succeed trivially.
3. `scripts/check-public-env.mjs` — per 03-security-and-secrets.md §4. This
   guards the real vulnerability documented in the plan: Vite inlines every
   `VITE_`-prefixed variable into the shipped client bundle, so a secret named
   `VITE_TC_PASSWORD` would be published to every visitor. The script must fail
   the build when a `VITE_`-prefixed name looks secret-bearing (password,
   secret, token, key, credential, etc.), with an allowlist for names that are
   legitimately public. Give it a clear failure message explaining why.
   Wire it into CI and add a `check:env` script in package.json.

### CI gating rules — important
- Gate on lint ERRORS only. The repo currently has 104 intentional lint
  WARNINGS (92 `no-explicit-any` + 12 `react-hooks/exhaustive-deps`), which are
  tracked debt. `eslint .` already exits 0. Do NOT add `--max-warnings 0` or
  any flag that turns warnings into failures — it would break CI immediately.
- `npm audit`: do not fail the build on low/moderate. Use
  `--audit-level=high` so it flags what matters without blocking on
  transitive noise.

## Follow-up — CONTRIBUTING.md
Its script table currently lists only `dev`, `build`, `preview`, `typecheck`.
Add rows for `lint`, `format`, `test`, `test:e2e`, and `check:env`, and update
the "before requesting review" line to name the checks CI actually runs. Do
not rewrite the rest of the file.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, or `git reset`.
  Leave all changes in the working tree; a reviewer will inspect and commit them.
- Do NOT modify anything under `docs/`.
- Do NOT weaken `eslint.config.js`, `.prettierrc`, `tsconfig.json`,
  `vitest.config.ts`, or `playwright.config.ts`.
- `types/three-augment.ts` must keep its `.ts` extension.
- You cannot run GitHub Actions locally. Instead, verify what you can:
  validate every workflow YAML parses, and actually RUN
  `node scripts/check-public-env.mjs` to prove it works — test it both against
  the current repo (must pass) and against a deliberately bad input like
  `VITE_TC_PASSWORD=hunter2` (must fail). Report both results.
- Re-run `npm run lint` and `npm run typecheck` at the end; both must pass.

## Final output
End your run with a short report:
1. Files created/modified, one line each.
2. The CI job matrix: each job and what it runs.
3. Proof the env check works: the exact output of the passing and failing runs.
4. Anything you deliberately did NOT do, and why.
