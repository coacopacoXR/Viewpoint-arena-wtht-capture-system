You are executing ticket T1.1 from docs/plan/08-task-breakdown.md in this repo
(Viewpoint Arena, a Vite + React + TypeScript SPA). Read
docs/plan/04-testing-and-ci.md and the T1.1 entry in
docs/plan/08-task-breakdown.md before acting.

## T1.1 — Lint & format
- Add ESLint (flat config, `eslint.config.js`) and Prettier.
- devDependencies: `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`,
  `prettier`, `eslint-config-prettier`. Install them for real with npm.
- Add `.prettierrc` and `.prettierignore`.
- Add `lint` and `format` scripts to `package.json`.
- Configure a sensible, NOT maximally-strict ruleset for an existing codebase:
  typescript-eslint recommended (not strict-type-checked), react-hooks
  recommended, eslint-config-prettier last so formatting rules don't conflict.
- Ignore build output, `node_modules`, and generated files.

## Acceptance criteria — this is the hard part, do it properly
`npm run lint` must exit 0 on the current code.

To get there you must FIX the violations in the source, not silence them.
Specifically:
- Do NOT add blanket `// eslint-disable` / `eslint-disable-next-line` comments
  to make errors go away.
- Do NOT add rules to the `ignores` list just to skip files that have errors.
- Do NOT downgrade a rule to "off" or "warn" purely because the existing code
  violates it — UNLESS the rule is genuinely a poor fit for this codebase, in
  which case say so explicitly in your report with the reasoning.
- Real fixes are: removing genuinely unused variables/imports, adding missing
  react-hooks dependency-array entries where that is behaviourally correct,
  correcting actual type errors.
- If a react-hooks/exhaustive-deps fix would change runtime behaviour in a way
  you are not confident about, leave the code alone and report it as a
  follow-up rather than guessing. It is better to report 3 unresolved items
  honestly than to paper over 30.

Run `npm run lint` yourself and iterate until it passes or you have exhausted
the safe fixes. Also run `npm run typecheck` at the end to confirm you did not
break types.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, or `git reset`.
  Leave all changes in the working tree; a reviewer will inspect and commit them.
- Do NOT modify anything under `docs/`.
- Do NOT refactor or restyle code beyond what lint compliance requires. No
  drive-by improvements.

## Final output
End your run with a short report:
1. Config files added, and the ruleset choices you made.
2. The exact final `npm run lint` and `npm run typecheck` results.
3. A numbered list of every rule you turned off/downgraded and why.
4. A numbered list of every violation you deliberately left unfixed, with the
   file:line and why it needs a human decision.
