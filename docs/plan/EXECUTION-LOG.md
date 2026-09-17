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

- **Batch G — `e5b4c2c`. T3.1 done.** PLMAdapter interface, Onshape adapter,
  MockPLMAdapter, shared contract suite. **Two gaps closed on review:** the
  Onshape adapter had NO executed coverage (contract suite runs only against
  the mock; live needs sandbox creds), so ~200 lines shipped unverified —
  added `onshapeAdapter.test.ts` stubbing fetch. And the adapter duplicates
  Onshape's element-type map from `api/onshape/elements.ts` (deliberate, to
  keep the serverless runtime out of its import graph) — both copies are now
  exported and pinned equal by `onshapeTypeDrift.test.ts`.
- **Batch H — `c3a402a`. T3.2 done. THE HEADLINE SECURITY FIX.**
  Teamcenter auth moved server-side; `lib/teamcenterIntegration.ts` deleted.
  Proven by building the bundle at HEAD~1 (contains `VITE_TC_`) and at the fix
  (does not). **Two corrections:** the read-side methods called
  `api/teamcenter/{documents,elements,export}`, which do not exist — the
  contract suite was green only because it mocks the transport; they now raise
  an explicit not-implemented error instead of a misleading 404/"not found".
  And grepping the built bundle exposed a hole in the guard itself:
  `VITE_TEAMS_WEBHOOK_URL` shipped unflagged because `SECRET_PATTERNS` had no
  `WEBHOOK` entry, though a webhook URL is a bearer credential.
- **Batch I — `30458db`. T3.3 + T3.4 done. Phase 3 security work complete.**
  Teams webhook moved server-side (`api/notify/teams.ts`),
  `lib/teamsIntegration.ts` deleted; SharePoint stays client-side by design
  (MSAL user-delegated auth) documented in-file and in `docs/adapters/notify.md`.
  TurnAdapter + Cloudflare adapter reading env NAMES from config;
  `lib/useWebRTC.ts` no longer reads `VITE_TURN_*` (ICE gathering untouched —
  credential sourcing only).
  **One restoration:** commit `1db12fa` had deliberately added a
  non-Cloudflare TURN override via `VITE_TURN_*`. T3.4 correctly deleted those
  but left no replacement, silently losing the capability.
  `api/turn-credentials.ts` now honours server-side `TURN_URL` /
  `TURN_USERNAME` / `TURN_CREDENTIAL`.

**MILESTONE: no credential of any kind ships to the browser.** The `KNOWN`
baseline in `check-public-env.mjs` is now EMPTY. The built bundle contains only
`VITE_MSAL_CLIENT_ID`, `VITE_MSAL_TENANT_ID`, `VITE_SP_LIST_ID`,
`VITE_SP_SITE_ID` — public identifiers, not secrets. That was the central
security goal of the plan.

Repo state: 89 tests; lint 0 errors / 100 warnings; typecheck, check:env, e2e
and build all green.

- **Batch J — `9c4c6ee`. T3.5 model import.** genericUpload formalizes the
  no-PLM path and reuses `validateModelFile` rather than duplicating it.
- **Batch K — `553ee35`. T3.6 capture extraction. Phase 3 complete.**
  DialogueEngine drops 1100 -> 247 lines. **Process gap caught:** the
  characterization snapshots were recorded AFTER the move, not before, so on
  their own they prove determinism rather than preservation. Equivalence was
  established independently two ways: a line comparison (446 of 456 lines
  verbatim) and running pre- and post-refactor `generateDetails` over 81
  input combinations with identical seeded randomness — all byte-identical.
- **`b8e4c0b` — T3.7 ADDED TO THE PLAN.** The plan schedules building the
  adapters and the config layer but never connecting them, so
  `viewpoint.config.ts` would have stayed inert and Phase 5's installer would
  have written a file nothing reads.
- **Batch L — `f89dc66`. T3.7 wiring.** ConfigContext fetches
  `/api/public-config` at startup; IntegrationsPanel and ReviewSetupPage now
  select from config. Fail-safe verified by mutation: making "config
  unavailable" hide integrations fails exactly the 3 fail-safe tests. Also
  fixed a latent cache bug this ticket made load-bearing — a body that failed
  to parse left the rejected promise cached forever, so retries could never
  succeed. That is precisely the SPA-fallback case where a retry is wanted.
- **Batch M — `1a32fb6`. T4.5 + T4.6 cloud and LAN capture providers.**
  **One override:** Qwen rejected markdown-fenced model replies and flagged it
  for review. Correct for OpenAI/Ollama (JSON mode makes fences unreachable)
  but wrong for Anthropic, which has no JSON mode and fences by habit — the
  strict rule would have failed well-formed Anthropic output in normal use.
  Now unwrapped; JSON.parse still validates everything inside, and an unclosed
  fence is still rejected. Tests encoding the old behaviour were updated.
- **Batch N — `55a2c47`. T4.1-T4.3 capture-service (Python).** 419 pytest
  tests, verified genuinely runnable (pytest is not installed globally; Qwen
  built `capture-service/.venv`, which is gitignored). Best artefact:
  `tests/test_typescript_parity.py` reads the TS source and fails if the
  Python port drifts — prompt byte-for-byte, key sets, enums, limits.
  Mutation-tested. Two parsers in two languages drifting is the bug nobody
  notices until a card comes out malformed in production.
- **Batch O — `15c7a13`. T5.1 + T5.2 deployment. QUOTA RAN OUT MID-BATCH.**
  docker-compose (8 services), install.sh, `/api/health`. capture-service
  publishes no host port and sits behind an install-time shared secret.
  Finished by hand: removed a duplicated const the cut-off left behind, and
  wrote the ticket's REQUIRED installer test, which the interrupted run never
  got to. Verified by hand first that `install.sh --defaults --configure-only`
  produces a config `configSchema.parse` accepts.

## BLOCKED: Qwen token plan quota exhausted

The ModelStudio token-plan weekly quota was exhausted during batch O.
**It resets 2026-09-14 19:53 UTC.** Until then `qwen` returns
`insufficient_quota` (429) and no delegated batch can run.

`qwen3.8-max` was used for batches L-O and consumed the remaining quota
quickly; the cheaper default `qwen3.7-plus` handled batches A-K. If the loop
resumes on the same plan, prefer `qwen3.7-plus` for mechanical work and
reserve `qwen3.8-max` for genuinely hard tickets.

Options for the user: wait for the reset, add a different API key
(`qwen --openai-api-key` / `--openai-base-url`, or `~/.qwen/settings.json`),
or have Claude implement directly at higher credit cost.

### In progress
- Nothing running.

### Repo state
Phases 0-5 substantially complete except T0.1, T4.4, T4.7, T4.8, T5.3 and
Phase 6. 531 JS tests (2 skipped on Windows), 421 pytest tests. lint 0 errors,
typecheck, check:env, build and e2e all green — ALL RUN LOCALLY. No CI run has
ever executed.

### Not started
- **T0.1 (asset swap)** — last Phase 0 ticket. User decided 2026-09-17: keep
  the branded models for now; at public release replace them with a cube and
  strip the originals from history. See `NEXT-STEPS.md` §1.
- T4.4 (LocalCaptureProvider frontend), T4.7 (live streaming), T4.8 (n8n),
  T5.3 (PLM deep link), Phase 6 (docs and polish).

### Follow-ups
- **`CODE_OF_CONDUCT.md` line 66** still has
  `[TODO: INSERT ENFORCEMENT CONTACT EMAIL]`. **User decision**, blocks going
  public.
- **No CI run has ever happened.** Every check was local. The first real
  Actions run is where the gitleaks licence question gets answered, and where
  the two Windows-skipped installer tests actually execute.
- **The WebRTC change is unverified against a live call** (`30458db`). Given
  two ICE-related reverts in recent history, worth a manual two-browser test.
- **capture-service has no CORS policy yet** and relies on the compose
  network plus a shared secret. Fine for the self-hosted stack; revisit if the
  browser is ever pointed at it directly.
- **No speaker diarization** — one honest `speaker-1` label rather than
  invented turns that would appear as fact in `InsightCard.agentId`.
- **The JS test suite has grown to 531.** Some of batch M's 246 additions are
  more thorough than strictly needed. Not a problem yet; worth watching.
- Type debt: 100 lint warnings.
- **Note for future sessions:** write this file with explicit
  `encoding='utf-8'`. Also: the Bash tool's heredoc eats backslashes, so
  regexes and escape sequences must be built with `chr(92)` in Python or
  written via the Write/Edit tools instead.

### Resuming from a cold session

Read this file top to bottom first — it is the only place the findings,
overrides and reasoning live. Then:

```bash
git log --oneline -8          # 26 commits on planning/oss-enterprise-readiness
git status --short            # should be clean
```

**Establish the baseline yourself before changing anything.** Every claim below
was verified locally, never in CI:

```bash
npm ci
npm run lint                  # 0 errors, ~100 warnings (expected, tracked debt)
npm run typecheck
npm run test                  # 531 passing, 2 skipped on Windows
npm run check:env             # KNOWN map is EMPTY and must stay empty
npm run build
npm run test:e2e

cd capture-service            # 421 pytest tests
python -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt
./.venv/bin/python -m pytest
```

On Windows use `.venv/Scripts/python.exe`. `capture-service/.venv` is
git-ignored, so a fresh clone must recreate it.

**To delegate more tickets**, read `delegation/README.md` — it has the command,
the model guidance, and the rules every spec repeats. The 15 specs already used
are beside it. Qwen's weekly quota was exhausted on 2026-09-08 and resets
**2026-09-14 19:53 UTC**; until then `qwen` returns 429.

**If a batch is interrupted mid-run** (this happened once, batch O), do not
discard the work reflexively. Check whether the tree still typechecks and what
is missing against the ticket's acceptance criteria — batch O was ~90% complete
and needed one duplicated const removed plus the one test the run never reached.

**Highest-value work remaining**, roughly in order:
1. **T0.1** — the last Phase 0 ticket, and the only thing blocking a public
   push. Needs the user's answer on model redistribution rights.
2. **Run CI for real.** Nothing has ever run in GitHub Actions. Expect the
   gitleaks licence question and the two Windows-skipped installer tests to
   surface there first.
3. **T4.4** — LocalCaptureProvider on the frontend, which connects the built
   capture-service to the UI. The service and the interface both exist; nothing
   joins them.
4. **T5.3**, Phase 6 docs, then the type-debt ratchet (100 lint warnings).

**Do not trust a green test run as evidence on its own.** The review method that
actually found problems is written up in `delegation/README.md`.
