# Execution Log

Append-only record of delegated ticket execution. Updated after every batch so
a session that ends mid-run can be resumed without re-deriving state.

**Setup**: Qwen Code CLI v0.23 (`qwen3.7-plus`, ModelStudio token plan, 1M ctx)
executes tickets headless (`qwen -y -o text < spec`). Claude writes the specs,
reviews the diff, and commits. Qwen is forbidden from all `git` write commands,
so every change lands in the working tree for review first. Specs live in
`.qwen-tasks/`, run logs beside them as `*.log` (both git-ignored).

**Branch**: `planning/oss-enterprise-readiness`. Nothing is pushed to
`origin`/`main` without the user reviewing.

**Batch order** (serialized, not parallel â€” every Phase 1 ticket edits
`package.json`, so concurrent agents would collide there):
- A â€” T0.2 gitignore, T0.3 OSS baseline files, T1.3 typecheck script
- B â€” T1.1 lint & format (the plan's designated validation ticket)
- C â€” T1.2 vitest, T1.4 playwright
- D â€” T1.5 CI pipeline (depends on Aâ€“C)
- T0.1 asset swap â€” deliberately held back from batch A; needs a
  permissively-licensed replacement model downloaded, a poor fit for an
  unattended agent. To be sequenced separately.

---

## Session 2026-09-07

### Done
- `2a478e7` — committed `docs/plan/`, `docs/paper/`, `docs/README.md` as a
  clean baseline so delegated diffs are reviewable.
- `36f6011` — added this execution log.
- Verified the Qwen headless path works end to end (13s round trip).
- Wrote specs `.qwen-tasks/batch-a.md` and `.qwen-tasks/batch-b.md`.
- **Batch A — `3736451`. T0.2, T0.3, T1.3 done, reviewed, committed.**
  Reviewed rather than trusted: independently reproduced the typecheck
  failure (10 errors without the `types/three-augment.ts` bridge, 0 with
  it), so the fix is real and not a silencing hack. Tried a cleaner
  tsconfig `paths` root-cause fix first — it is worse (11 errors) and was
  reverted. Discovered the bridge file's `.ts` extension is load-bearing
  (as `.d.ts` it becomes an ambient declaration, not an augmentation, and
  the 10 errors return); documented in the file so nobody "tidies" it.
  Confirmed Qwen's `.gitignore` edit did not clobber the `.qwen-tasks/`
  entry added here.

- **Batch B — `0cf91c6`. T1.1 done, reviewed, committed.**
  Qwen fixed violations in source rather than suppressing them: deleted two
  dead unexported components in `Interface.tsx` (`FingerPointerPill`,
  `HoverPointerPill`, both superseded by the `Inline*` variants actually
  rendered) and two dead helpers in `DialogueEngine.tsx`, plus unused
  imports across 22 files. Net 66+/163-. Verified with a real
  `npm run build` that nothing live was removed.
  **One override:** Qwen set `no-explicit-any` to `"off"` (172 violations).
  Changed here to `"warn"` with a `types.ts` exemption — 80 of the 172 are
  R3F JSX intrinsics where `any` is unavoidable, but the other 92 are real
  type debt, and a repo being prepped for external audit should surface it,
  not silence it. Final: lint 0 errors / 104 warnings, exit 0.

- **Batch C — `a617ca5`. T1.2 + T1.4 done, reviewed, committed.**
  Vitest (jsdom) + Playwright (chromium, self-contained `vite preview`
  webServer). Smoke component chosen well: `DeicticFeaturesExplainer`
  depends only on lucide-react and clsx, so the harness is proven without
  mocking the 3D/WebRTC stack. Both tests make real assertions, not bare
  renders. `test` is `vitest run` (not watch), so CI cannot hang.
  Verified independently: lint 0 / typecheck 0 / test 1-1 / e2e 1-1.
  No override needed — nothing to correct in this batch.

- **Batch D — `b333fee`. T1.5 done, reviewed, committed.**
  `ci.yml` (8 jobs: typecheck, lint, test, build, e2e, check-env, audit,
  gitleaks), nightly stub, `scripts/check-public-env.mjs`, CONTRIBUTING
  script table. Both workflow YAMLs parse; 8 jobs confirmed.
  **One significant override.** The env guard as delivered scanned only env
  files — which are git-ignored and therefore absent in CI. It printed
  "no env files found - nothing to do" and exited 0, so the security control
  was vacuous precisely where it runs. It also missed the real vulnerability,
  which is in committed source: `lib/teamcenterIntegration.ts:136` reads
  `VITE_TC_PASSWORD` and `lib/useWebRTC.ts:14` reads `VITE_TURN_CREDENTIAL`,
  both inlined into the client bundle by Vite. Rewritten to scan source (103
  files) with a ratcheting baseline: the two known issues are reported but not
  build-breaking (Phase 3 fixes them), anything new fails, a disappeared
  baseline entry fails as stale, and a zero-file scan fails rather than
  passing vacuously. All four behaviours were tested explicitly.
  Also deleted a stray `NUL` file Qwen created via a `> NUL` redirect.

**Phase 0 and Phase 1 are complete except T0.1.** Repo state: `npm run lint`
(0 errors / 104 tracked warnings), `typecheck`, `test`, `test:e2e`,
`check:env`, and `build` all pass.

- **Batch E — `80596c3`. T2.1 + T2.2 done, reviewed, committed.**
  `lib/config/schema.ts` (zod discriminated unions over all six connector
  groups, all providers the plan lists) and `lib/config/loadConfig.ts`
  (server-only, fail-fast, names the missing var and connector), plus
  `viewpoint.config.example.ts`; `viewpoint.config.ts` is git-ignored.
  Tests were **mutation-tested**: deleting the VITE_ guard from the schema
  fails exactly one test, so the suite genuinely bites rather than passing
  vacuously.
  **One override, and it was my spec's error, not Qwen's.** I told Qwen to
  reject `VITE_` in every `*Env` field. But `01-architecture` §3 documents a
  deliberate exception: `db.urlEnv` and `db.anonKeyEnv` keep the prefix
  because the browser must read them (Supabase anon key is client-safe by
  design, access control lives in Row Level Security). As delivered, the
  plan's own canonical example config would have failed its own schema, and
  `viewpoint.config.example.ts` said `SUPABASE_URL` while the running app
  reads `VITE_SUPABASE_URL` (`lib/supabase.ts:3-4`) — that divergence would
  have broken Supabase the moment Phase 3 wired config to app. Fixed with a
  separate `publicEnvVarName` type scoped to those two fields only, and three
  new tests pinning the asymmetry in both directions.
  Also narrowed `check-public-env.mjs` to skip test paths, since negative-test
  fixtures legitimately contain secret-shaped names and no test file is ever
  bundled into the client. Verified the guard still catches a planted
  `VITE_STRIPE_SECRET` in `lib/`.

- **Batch F — `0cc8dc1`. T2.3 + T2.4 done, reviewed, committed. Phase 2 complete.**
  `lib/config/redact.ts` is a genuine allowlist — it builds the public object
  field by field and never spreads, so a secret-bearing field added to the
  schema later cannot leak by default. Plus `api/public-config.ts`,
  `lib/config/publicConfig.ts` (fetch + cache), regenerated `.env.example`,
  README env section.
  **One security fix during review.** The endpoint's 500 handler returned
  `(err as Error).message`. `loadConfig` fails with text naming the missing
  variable and connector — right for server logs, wrong for an
  unauthenticated public endpoint whose entire purpose is to emit no `*Env`
  names. A misconfigured deploy would have handed its internal env var names
  to any caller. Now logs server-side and returns only
  `{ error: 'config_not_available' }`, with a regression test.
  Both security boundaries **mutation-tested**: replacing the allowlist
  redactor with a spread fails 4 tests; reintroducing the error-message leak
  fails the new regression test. 33 tests total.

### In progress
- **Batch G** — T3.1 PLM adapter interface + Onshape wrapper + shared
  contract-test suite + MockPLMAdapter. Running.

### Not started
- **T0.1 (asset swap)** — the only unfinished Phase 0 ticket.
- T3.2 (Teamcenter security fix), T3.3 (notifications), T3.4 (TURN),
  T3.5 (model import), T3.6 (capture interface). Phase 4 onward.

### Follow-ups noticed, not yet done
- **T0.1 needs a decision.** Needs a permissively-licensed replacement `.glb`
  chosen and downloaded, then wired into `utils/modelLoader.ts`. Default per
  NEXT-STEPS is replace-and-relicense unless the user confirms redistribution
  rights to the Sennheiser/Santa Cruz models.
- **`CODE_OF_CONDUCT.md` line 66** still has
  `[TODO: INSERT ENFORCEMENT CONTACT EMAIL]`. **User decision**, blocks going
  public.
- **IMPORTANT for T3.2 and T3.4:** when those tickets remove
  `VITE_TC_PASSWORD` (`lib/teamcenterIntegration.ts:136`) and
  `VITE_TURN_CREDENTIAL` (`lib/useWebRTC.ts:14`) from source, the
  corresponding entries MUST be removed from the `KNOWN` map in
  `scripts/check-public-env.mjs` in the same commit — the guard fails on a
  stale baseline by design, so the ratchet only tightens. Earlier batch specs
  said "do not touch KNOWN"; that instruction must be inverted for those two
  tickets specifically.
- **Type-debt ratchet:** 92 `no-explicit-any` warnings across 31 files.
- **12 `react-hooks/exhaustive-deps` warnings.** Four are the ref-in-cleanup
  pattern (`lib/useWebRTC.ts:276-280`, `lib/usePartyPresence.ts:331`), a safe
  mechanical fix; the rest risk re-render loops.
- **The server-only guard in `loadConfig.ts` is untested** and does not
  prevent the module being *bundled* if imported client-side, only from
  running. Revisit in Phase 3.
- Only one smoke test in each of the unit and e2e harnesses.
- `utils/modelLoader.ts` carries one `@ts-expect-error`.
- **gitleaks-action** may need a licence key for org-owned repos. Verify on
  the first real CI run.
- **Note for future sessions:** write this file with explicit
  `encoding='utf-8'`; Windows Python defaults to cp1252 and corrupted it once.

### Resuming
Read this file, then `git status` and `git log --oneline -5`. If a batch's
changes are in the tree but uncommitted, review them against the ticket's
acceptance criteria in `08-task-breakdown.md` before committing. Check
`.qwen-tasks/*.log` for what the agent reported.
