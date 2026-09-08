You are executing ticket T3.6 from docs/plan/08-task-breakdown.md. It has TWO
STEPS and step 1 MUST be complete and passing before you start step 2.
Read first:
- `docs/plan/04-testing-and-ci.md` §5 (characterization testing) — this defines
  step 1 and is the whole point of the ticket
- `docs/plan/02-connector-adapters.md` §2 (the CaptureProvider interface)
- the T3.6 entry in `docs/plan/08-task-breakdown.md`

T3.1-T3.5 are DONE. 99 tests pass. Follow the established adapter pattern:
`lib/connectors/{plm,turn,notify,modelImport}/`, each with a `types.ts`, a
mock, and a shared contract suite parameterised by an adapter factory.

The subject is `components/System/DialogueEngine.tsx` (~1100 lines). It
generates the simulated review conversation. There is no "correct" output —
these tests exist ONLY to prove the refactor changes nothing.

## STEP 1 — Characterization tests (do this first, in full)
Write `components/System/__tests__/dialogueEngine.characterization.test.ts`
that pins the CURRENT output of the dialogue generation.

The hard part, which you must solve before anything else: the file calls
`Math.random()` and `Date.now()` in about 17 places, so its output is not
reproducible. Make it deterministic:
- Stub `Math.random` with a seeded pseudo-random generator (a small
  deterministic PRNG defined in the test) and stub `Date.now` to a fixed
  timestamp, using vitest's `vi.stubGlobal` / `vi.spyOn`. Restore both
  afterwards.
- The generation logic (`generateDetails`, `findNodeName`, and the dialogue
  builders) is currently module-private — only the React component is
  exported. Export the PURE generation functions so they can be tested
  directly. Do NOT restructure them, do NOT change their logic, do NOT change
  their signatures. Adding `export` is the only permitted edit in step 1.
- Feed a FIXED table of inputs: several (agent, part-being-inspected, agenda
  context) combinations per `04-testing-and-ci.md` §5, covering at least the
  different insight types the engine can produce.
- Assert the exact output with inline snapshots (`toMatchInlineSnapshot`), so
  the expected values are visible in the file and reviewable in a diff. Do not
  use external snapshot files.

Run the tests. They must pass. Report how many input combinations you pinned.

## STEP 2 — Extract the provider (only after step 1 passes)
- New `lib/connectors/capture/types.ts` — the `CaptureProvider` interface per
  `02-connector-adapters.md` §2.
- New `lib/connectors/capture/mock.ts` — the dialogue-generation logic from
  `DialogueEngine.tsx` moved behind that interface. **This is a move, not a
  rewrite. No behaviour change of any kind.**
- `DialogueEngine.tsx` then calls the provider instead of holding the logic
  itself. Its on-screen behaviour must be identical.
- New shared contract suite `lib/connectors/capture/capture.contract.test.ts`,
  parameterised by a provider factory, run against `MockProvider`.

## The acceptance criterion that matters most
The step 1 characterization tests must still pass **completely unchanged**
after step 2. You may update their import paths if the functions moved, and
nothing else. If a snapshot value changes, you have altered behaviour — fix
your refactor, do NOT update the snapshot to match. If you genuinely cannot
avoid a behaviour change, STOP and report it instead of editing the snapshot.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
- Do NOT modify anything under `docs/`.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, `.prettierrc`, or `scripts/check-public-env.mjs`.
- The `KNOWN` map in `scripts/check-public-env.mjs` is EMPTY and must stay so.
- Do NOT wire the app to read `viewpoint.config.ts` for provider selection —
  a later batch does that.
- `types/three-augment.ts` keeps its `.ts` extension.
- No `> NUL` redirects. Never write a real credential.
- At the end run ALL of: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`. All five must pass.

## Final output
1. Files created/modified, one line each.
2. How you made the output deterministic, and how many input combinations you
   pinned in step 1.
3. Explicit confirmation that the step 1 snapshots are byte-identical after
   step 2, and that you changed only import paths in that file.
4. The `CaptureProvider` interface, as a compact signature list.
5. The exact results of all five commands.
6. Anything you deliberately did NOT do, and why.
