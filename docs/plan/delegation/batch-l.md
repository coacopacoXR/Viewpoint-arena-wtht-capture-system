You are executing ticket T3.7 from docs/plan/08-task-breakdown.md. Read that
ticket first — it was added specifically for this work and states the
acceptance criteria and the fail-safe requirement.

This is the RISKIEST batch so far: unlike T3.1-T3.6, which added new code
alongside the app, this changes code the app actually runs. Be conservative.

## Context
- `api/public-config.ts` serves the non-secret config; `lib/config/publicConfig.ts`
  is a client-side fetch-and-cache wrapper. NOTHING currently calls it.
- `components/UI/IntegrationsPanel.tsx` hardcodes `TeamcenterPLMAdapter`.
- Adapters exist for plm (onshape, teamcenter, mock), notify (teams, teamcenter,
  mock), turn, modelImport (onshape, genericUpload, mock), capture (mock).
- 164 tests pass. Do not break any.

## T3.7 — Wire the app to the config
1. New `lib/config/ConfigContext.tsx`: a React context + provider that calls
   `fetchPublicConfig()` once at startup and exposes the active provider for
   each connector category, plus a loading and an error state.
2. Mount it near the app root so any component can read it.
3. Change `components/UI/IntegrationsPanel.tsx` (and any other component that
   statically picks a connector) to choose based on the config instead of a
   hardcoded import.

## The fail-safe is the most important requirement
If `/api/public-config` is unreachable — local dev with no `viewpoint.config.ts`,
or a misconfigured deploy — the UI MUST fall back to its CURRENT behaviour and
keep rendering the integrations it renders today. A missing or failed config
must NEVER blank the integrations UI or throw. Treat "config unavailable" as
"behave exactly as before this ticket", not as "no providers configured".
Write a test for precisely this: config fetch rejects, UI still renders the
integrations.

## Required tests
- Config context: provides the fetched providers; caches (one fetch for
  multiple consumers); exposes an error state without throwing.
- Fail-safe: fetch rejects -> integrations UI still renders (the test above).
- Selection: with `plm.provider: 'teamcenter'` the Teamcenter integration is
  offered; with `'onshape'` it is not. Assert the actual rendered output, not
  internal state.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
- Do NOT modify anything under `docs/`.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, `.prettierrc`, or `scripts/check-public-env.mjs`.
- The `KNOWN` map in `scripts/check-public-env.mjs` is EMPTY and must stay so.
- Do NOT change any adapter's behaviour. This ticket only changes SELECTION.
- Do NOT redesign IntegrationsPanel's layout or styling. Minimal diff: change
  which adapter is used and whether a section renders, nothing else.
- `types/three-augment.ts` keeps its `.ts` extension.
- Never write a real credential. No `> NUL` redirects.
- At the end run ALL of: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`, and `npm run test:e2e`. All six must
  pass — e2e matters here because this touches app startup.

## Final output
1. Files created/modified, one line each.
2. Exactly how the fail-safe works, and the test that proves it.
3. Every component whose rendering now depends on config, and what it does
   when config is unavailable.
4. How many tests you added and what each asserts.
5. The exact results of all six commands.
6. Anything you deliberately did NOT do, and why.
