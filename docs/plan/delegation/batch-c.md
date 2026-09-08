You are executing tickets T1.2 and T1.4 from docs/plan/08-task-breakdown.md in
this repo (Viewpoint Arena, a Vite + React + TypeScript SPA). Read
docs/plan/04-testing-and-ci.md and the T1.2/T1.4 entries in
docs/plan/08-task-breakdown.md before acting.

Execute BOTH tickets. Do NOT do any other ticket.

## T1.2 — Unit/component test framework
- Add `vitest.config.ts`, and a `test` script to `package.json`.
- devDependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`,
  `jsdom`. Install them for real with npm.
- Environment `jsdom`, with a setup file registering `@testing-library/jest-dom`.
- Write ONE smoke test: a trivial render test for one existing component, to
  prove the harness works.
- **Choose the component carefully.** Pick a small, presentational, leaf
  component with few or no dependencies on Three.js, @react-three/fiber,
  WebRTC, PartySocket, or Supabase — those need heavy mocking and are the
  wrong thing to fight on a smoke test. Browse `components/UI/` for a
  genuinely simple candidate. Do NOT add module mocks for the whole 3D stack
  just to render something.
- **Acceptance**: `npm run test` runs and passes (and exits — make sure it is
  in run mode, not watch mode, so CI does not hang).

## T1.4 — E2E framework
- Add `playwright.config.ts` and a `test:e2e` script; devDependency
  `@playwright/test`.
- ONE smoke test: the app loads at `/` and renders something identifying.
- Configure `webServer` in playwright.config.ts to build and run
  `vite preview` automatically, so the suite is self-contained.
- Use only chromium for now to keep CI fast.
- **Acceptance**: `npm run test:e2e` runs and passes against `vite preview`.
- If the Playwright browser binaries are not installed, run
  `npx playwright install chromium` (and `--with-deps` only if on Linux).

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, or `git reset`.
  Leave all changes in the working tree; a reviewer will inspect and commit them.
- Do NOT modify anything under `docs/`.
- Do NOT weaken the existing `eslint.config.js`, `.prettierrc`, or
  `tsconfig.json`. If your new test files trip lint, fix the test files.
- Do NOT touch application source beyond what is strictly needed to make the
  two harnesses run. No drive-by refactors. If a component is untestable
  without a source change, report it instead of changing it.
- `types/three-augment.ts` must keep its `.ts` extension — do not "fix" it to
  `.d.ts`, that breaks typecheck.
- After you are done, run ALL of: `npm run lint`, `npm run typecheck`,
  `npm run test`, `npm run test:e2e`. All four must pass.

## Final output
End your run with a short report:
1. Files created/modified, one line each.
2. Which component you chose for the smoke test and why.
3. The exact results of all four commands above.
4. Anything you deliberately did NOT do, and why.
