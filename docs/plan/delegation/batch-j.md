You are executing ticket T3.5 from docs/plan/08-task-breakdown.md.
Read first:
- `docs/plan/02-connector-adapters.md`
- the T3.5 entry in `docs/plan/08-task-breakdown.md`

T3.1-T3.4 are DONE and committed. Follow their established pattern exactly —
read these before writing anything:
- `lib/connectors/plm/{types,onshape,teamcenter,mock}.ts` and
  `lib/connectors/plm/plm.contract.test.ts`
- `lib/connectors/turn/{types,cloudflare,mock,selfHostedCoturn}.ts`
89 tests currently pass. Do not break any of them.

## T3.5 — Model import adapter
- New `lib/connectors/modelImport/types.ts` — the `ModelImportAdapter`
  interface per `02-connector-adapters.md`.
- New `lib/connectors/modelImport/onshape.ts` — wraps the EXISTING
  `api/onshape/translate*.ts` logic behind the interface. Read those files
  first. This is a reorganization: preserve request shapes and behaviour, do
  not redesign the translation flow.
- New `lib/connectors/modelImport/genericUpload.ts` — formalizes the existing
  generic GLTF/GLB loading path in `utils/modelLoader.ts` as a first-class
  "no PLM" mode, so an org with no PLM at all can still upload a model file.
  Reuse `utils/modelLoader.ts`; do not duplicate its parsing logic.
- New `lib/connectors/modelImport/mock.ts` — a mock implementation for CI.
- New shared contract suite `lib/connectors/modelImport/modelImport.contract.test.ts`,
  parameterised by an adapter factory, same shape as the PLM and TURN suites.

## Important
- `utils/modelLoader.ts` contains a `@ts-expect-error` and imports
  `types/three-augment.ts`. Do NOT remove either, and do NOT rename
  `types/three-augment.ts` or change its `.ts` extension — typecheck breaks if
  you do (this has been verified).
- Do NOT migrate existing callers to the new adapter yet. This ticket adds the
  layer only. A later batch wires the app to it.
- The contract suite must assert real behaviour, not just that methods exist:
  return shapes, error behaviour on an unsupported file type, and that no
  method accepts or returns a credential.
- The Onshape adapter will have no live credentials in CI. Give it direct unit
  tests with a stubbed `fetch` (see `lib/connectors/plm/onshapeAdapter.test.ts`
  for the established pattern) so its real request-building is actually
  executed, not merely mocked away behind the contract suite.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
- Do NOT modify anything under `docs/`.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, `.prettierrc`, or `scripts/check-public-env.mjs`.
- The `KNOWN` map in `scripts/check-public-env.mjs` is now EMPTY and must stay
  empty. If your work would add a secret-shaped `VITE_*` name, you have made a
  mistake — fix the code instead.
- NEVER write a real credential anywhere.
- No `> NUL` redirects.
- At the end run ALL of: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`. All five must pass.

## Final output
1. Files created/modified, one line each.
2. The `ModelImportAdapter` interface, as a compact signature list.
3. How you reused `utils/modelLoader.ts` rather than duplicating it.
4. How many tests you added and what each asserts.
5. The exact results of all five commands.
6. Anything you deliberately did NOT do, and why.
