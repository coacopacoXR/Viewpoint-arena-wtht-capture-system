You are executing ticket T3.2 from docs/plan/08-task-breakdown.md. This is the
PRIORITY SECURITY FIX of the whole plan. Read first:
- `docs/plan/03-security-and-secrets.md`, especially §1
- `docs/plan/02-connector-adapters.md` §1
- the T3.2 entry in `docs/plan/08-task-breakdown.md`

T3.1 is DONE and committed: `lib/connectors/plm/types.ts` (PLMAdapter),
`onshape.ts`, `mock.ts`, and the shared `plm.contract.test.ts` suite exist,
with 49 tests passing. READ THEM FIRST — especially how `api/_lib/onshape.ts`
and `api/onshape/*` do server-side sessions with HttpOnly cookies. That is the
pattern the plan explicitly names as correct, and this ticket copies it.

## The vulnerability you are fixing
`lib/teamcenterIntegration.ts` runs in the BROWSER and reads
`VITE_TC_PASSWORD`. Vite inlines every `VITE_`-prefixed variable into the
shipped client bundle, so today the Teamcenter password is delivered to every
visitor of the app. A password is also kept in `localStorage`. Both must be
gone when you are finished.

## T3.2 — Teamcenter PLM adapter (server-side)
- New server-side Vercel functions, mirroring `api/_lib/onshape.ts`'s session
  pattern: `api/teamcenter/login.ts`, `api/teamcenter/tasks.ts`,
  `api/teamcenter/change-notices.ts`.
  Credentials come from `process.env` (server-side names WITHOUT the VITE_
  prefix, e.g. `TC_USERNAME` / `TC_PASSWORD`) — never from the request body,
  never from the client.
- New `lib/connectors/plm/teamcenter.ts` — a browser-safe client implementing
  `PLMAdapter`, calling those endpoints. **No method may accept a credential
  as an argument.**
- PORT the request-building logic out of `lib/teamcenterIntegration.ts`
  (`tcCreateTask`, `tcCreateChangeNotice`) into the new handlers. This is a
  relocation: preserve the request shapes and behaviour. Do not invent a new
  Teamcenter API contract.
- Then DELETE `lib/teamcenterIntegration.ts` and update every importer to use
  the new adapter. Find them with a search; do not guess.

## Acceptance criteria — verify each explicitly and report how
1. No `VITE_TC_*` reference remains anywhere in `lib/` or `components/`.
2. No password is written to or read from `localStorage` anywhere.
3. `npm run check:env` passes.
4. **Because the `VITE_TC_PASSWORD` violation is now fixed, you MUST remove
   its entry from the `KNOWN` map in `scripts/check-public-env.mjs`.** That
   guard deliberately FAILS on a stale baseline, so leaving it will break the
   build. Remove ONLY the `VITE_TC_PASSWORD` entry. Leave
   `VITE_TURN_CREDENTIAL` — a later ticket owns it. This is the one and only
   permitted edit to that file.

## Required tests
- The `PLMAdapter` contract suite must pass for the new Teamcenter adapter
  (against a mocked transport — there are no live credentials in CI).
- A unit test asserting the new endpoints NEVER echo the password back, in a
  success response, an error response, or a thrown error message. Test the
  failure paths explicitly — a wrong-password login attempt must not include
  the password in what it returns.
- A test asserting no adapter method signature accepts a credential.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
- Do NOT modify anything under `docs/`.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, or `.prettierrc`.
- Do NOT touch `lib/useWebRTC.ts` — T3.4 owns it.
- `types/three-augment.ts` must keep its `.ts` extension.
- NEVER write a real credential anywhere, including tests and examples.
- No `> NUL` redirects.
- At the end run ALL of: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`. All five must pass.

## Final output
1. Files created / modified / DELETED, one line each.
2. Every importer of the old `lib/teamcenterIntegration.ts` and what you did
   to it.
3. The exact command output proving acceptance criteria 1 and 2 (show the
   searches you ran and that they return nothing).
4. How many tests you added and what each asserts.
5. The exact results of all five commands.
6. Anything you deliberately did NOT do, and why.
