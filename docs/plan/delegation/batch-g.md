You are executing ticket T3.1 from docs/plan/08-task-breakdown.md.
Read first — these are the specification:
- `docs/plan/02-connector-adapters.md`, especially §1 (the PLMAdapter interface)
- the T3.1 entry in `docs/plan/08-task-breakdown.md`

Phase 2 is DONE and committed. `lib/config/schema.ts`, `loadConfig.ts`,
`redact.ts`, `publicConfig.ts` exist with 33 passing tests. Read them first.
Existing Onshape server logic lives in `api/onshape/*` and `api/_lib/onshape.ts`
— read those before writing the adapter.

Execute T3.1 ONLY. Do not start T3.2 (Teamcenter) — that is the next batch.

## T3.1 — PLM adapter: Onshape
- New `lib/connectors/plm/types.ts` — the `PLMAdapter` interface exactly per
  `02-connector-adapters.md` §1. If that doc leaves something ambiguous,
  follow it as literally as you can and say what you had to decide.
- New `lib/connectors/plm/onshape.ts` — wraps the EXISTING `api/onshape/*`
  logic behind that interface.
  **This is a reorganization, not a rewrite.** Do not redesign the Onshape
  request/session handling. Do not change its OAuth flow — the HttpOnly-cookie
  pattern in `api/onshape/*` is explicitly called out in the plan as the GOOD
  pattern to copy elsewhere. Preserve behaviour exactly.
- New `lib/connectors/plm/mock.ts` — a `MockPLMAdapter` implementing the same
  interface, for use in regular CI where there are no sandbox credentials.
- New `lib/connectors/plm/plm.contract.test.ts` — a SHARED contract test
  suite: a function that takes an adapter factory and asserts the interface
  contract, so any implementation can be run through it. In this ticket, run
  it against `MockPLMAdapter`. Structure it so T3.2's Teamcenter adapter and a
  nightly live-credential Onshape run can be plugged in later without
  rewriting the suite.
- The contract suite must assert real behaviour, not just that methods exist:
  return shapes, error behaviour on a missing document, and that no adapter
  method accepts or returns a raw credential.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
- Do NOT modify anything under `docs/`.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, `.prettierrc`, or `scripts/check-public-env.mjs`.
- Do NOT add anything to the KNOWN baseline in `scripts/check-public-env.mjs`.
- Do NOT modify `lib/teamcenterIntegration.ts` or `lib/useWebRTC.ts` — later
  tickets own those.
- Do NOT change the behaviour of any existing Onshape endpoint. Existing
  callers must keep working; this ticket adds a layer, it does not migrate
  callers to it.
- `types/three-augment.ts` must keep its `.ts` extension.
- No `> NUL` redirects.
- NEVER write a real credential anywhere.
- At the end run ALL of: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`. All five must pass.

## Final output
1. Files created/modified, one line each.
2. The `PLMAdapter` interface you implemented, as a compact signature list.
3. Any ambiguity in `02-connector-adapters.md` §1 you had to resolve, and how.
4. How many tests you added and what each asserts.
5. The exact results of all five commands.
6. Anything you deliberately did NOT do, and why.
