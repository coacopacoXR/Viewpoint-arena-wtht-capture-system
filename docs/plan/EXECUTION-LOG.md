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

## Session 2026-09-21

Qwen quota had reset; delegation resumed. A stray `cla` typed at the top of
`docs/local-capture-plan.md` was reverted (uncommitted, accidental).

- **`affb257` — found during batch P review: loadConfig's default path never
  worked.** The default `'./viewpoint.config.ts'` is a relative specifier in a
  dynamic import, so it resolves against `lib/config/loadConfig.ts` and looks
  in `lib/config/`, where the file never is. `/api/public-config`,
  `/api/turn-credentials` and `/api/capture/extract` all relied on it, so
  **none of them ever read the master config** — they fell back to defaults
  (and public-config always 500'd, so the T3.7 wiring was always in fail-safe
  mode). Batch O had noticed and worked around it in `api/health.ts` only.
  Every test mocked `loadConfig`, which is why 531 green tests never saw it.
  Fixed at the source (`defaultConfigPath()` resolves against `process.cwd()`)
  with the first test that does a real import; restoring the old default
  fails it.
- **Batch P — `b5138ba`. T4.4 LocalCaptureProvider.** Recording hook mixing
  local + remote audio, `LocalCaptureProvider`, Vercel proxy
  `api/capture/local.ts`, nginx `location = /api/capture/local` as an envsubst
  template filtered to `CAPTURE_*` (secret substituted at container start, not
  in an image layer), Post-meeting summary section in ManagerPanel shown only
  for `capture: 'local'`. 132 tests. Independently mutation-tested: removing
  the provider gate fails 5 tests; loosening the browser client's error-code
  filter fails 2; Qwen's own check on the proxy's scrubbing fails 3. `dist/`
  contains neither the secret nor the header name. No override needed beyond
  simplifying its loadConfig workaround onto the fix above.
  **Not verified:** nginx never parsed the template (no Docker here), and no
  real recording has gone browser -> capture-service end to end.

- **Batch Q — `573f347`. T5.3 PLM deep link.** `/launch?plmSource=...`
  validates ids, strips any credential query param (no token is ever accepted
  in a URL, overriding the plan's `token=<short-lived>` sketch: URLs leak via
  history, logs and Referer), resolves only through the configured adapter,
  and opens a NEW review with a random id. `roomHint` is a label, never a room
  id: a room derived from a document id would be guessable. Onshape imports
  the linked element directly and sign-in returns to `/launch`; Teamcenter
  records a reference and says geometry import is not available yet.
  **Security fixes found while writing the spec:** an open redirect in the
  Onshape OAuth callback (`startsWith('/')` accepted `//evil.com`), and
  unencoded ids in `lib/onshape.ts`. Mutation-tested: reverting
  `safeReturnPath` fails 8 tests; using `roomHint` as the id fails 2.
  **One review fix:** the setup-page draft store is persisted, so a previous
  review's draft is on screen for a moment and the launch reference was
  written into it, then discarded when the fresh draft replaced it. Launch
  handling now waits for the draft whose id matches. Untested by a render
  test (the page cannot mount in jsdom: supabase import, WebGL canvas).
  **Known consequence:** signing in to Onshape mid-launch returns to
  `/launch` and mints a second review id; the first is abandoned.

- **FIRST REAL CI RUN (branch pushed with the user's approval).** Took four
  runs to go green; every failure was real and invisible locally:
  - `d3a6973` — tests needed a developer's `.env.local` (`lib/supabase.ts`
    throws at import without a URL; vitest now sets placeholders). The
    Linux-only installer test rejected `VITE_PARTYKIT_HOST`, a public
    hostname; now explicitly approved. gitleaks: 8 hits, all deliberately
    secret-shaped fake fixtures in the health tests, ignored by FINGERPRINT
    in `.gitleaksignore` (note: a history rewrite for T0.1 changes the commit
    hash and invalidates these fingerprints; regenerate them then). npm audit:
    27 findings; non-breaking fixes, js-yaml 4.3.2, @vercel/node 13, and an
    `overrides` pin of undici 6.28.1 under partykit's miniflare (verified
    partykit dev still starts and a WebSocket connects). Blocking audit now
    covers runtime deps only; dev tooling audited non-blocking (remaining
    highs are inside @vercel/node, imported for types only).
  - **Also `d3a6973`: the self-hosted partykit container could never start.**
    Its CMD passed `--host` and `--no-open`, which `partykit dev` rejects
    ("unknown option"). It binds 0.0.0.0 by default. A new test checks every
    CMD flag against the installed CLI's `--help`.
  - `eadae7c` — **any build without `VITE_SUPABASE_URL` was a blank white
    page**, including the default self-hosted install. Now falls back to an
    unresolvable `.invalid` host so queries fail as ordinary errors and the
    app loads. Caught by the e2e smoke test.
  - `5c144b2` — a timing race in batch Q's OnshapeBrowser test (synchronous
    query for an async-loaded list); failed only on the slower runner.
  Final run on `5c144b2`: all 9 jobs green, e2e included.

- **"Make it work well" pass (user asked 2026-09-21; wants to install via Docker
  and test it themselves).** Driven by running the real app, not by tests:
  - `785a031` — **api/* runs outside Vercel.** `server/vercelShim.ts` gives the
    handlers Vercel's req/res helpers; `npm run dev` now serves /api/* (it used
    to return index.html for every API call). **Supabase unconfigured no longer
    stalls**: a local 501 fetch avoids postgrest-js's ~8 s retry backoff.
    **No runtime CDNs**: Tailwind built in (was the Play CDN, unstyled offline),
    fonts bundled; screenshots pixel-identical before/after.
  - `8dd05b3` — **`api` service in docker-compose**; nginx proxies /api/* to it
    instead of answering 501. The self-hosted stack had NO working /api at all.
  - `d6f209d` — `.gitattributes` forces LF (a Windows checkout would have put
    CRLF in install.sh and the Dockerfiles).
  - **First real end-to-end capture** (spoken WAV -> Whisper -> Ollama):
    `b95bd9d` due dates were wrong (model guessed the year, then the day);
    fixed with today's date + a 14-day calendar in the prompt, 3/3 correct.
    `a8a899c` **browser recordings were 0 bytes** whenever the host was not in
    the call's audio (mixer had no input): the recorder now opens its own mic;
    and Ollama is sent the exact JSON Schema (the model had flattened fields
    and the strict parser refused the whole meeting). `2a026ab` the mock
    simulation kept inventing cards next to real ones; now runs only when
    capture is 'mock'. `3fdd644` default model qwen2.5:7b (head-to-head vs
    deepseek-r1:7b on the same recording: 3/3 complete vs never an assignee
    or date, ~20 s vs ~44 s). Final browser run: "3 insights added".
  - `0db1d08` — **coturn implemented** (TURN REST credentials, real STUN probe
    for /api/health); it was a stub that threw.
  - `b64960d` — front proxy rate-limits /api/capture/ (30/min/client) and no
    longer cuts long captures at 300 s.
  - **Found, not code:** the Supabase project in the user's `.env.local`
    (`ckdtbqtuqvurkzcderms.supabase.co`) **no longer exists** (NXDOMAIN), so
    saved reviews/tracker cannot work anywhere that uses it.
  - CI green on everything through `3fdd644`.

### Resolved: Qwen token plan quota

The weekly quota exhausted during batch O reset on 2026-09-14; batches P and
Q ran on `qwen3.8-max`. History of the block, for context:

`qwen3.8-max` was used for batches L-O and consumed the remaining quota
quickly; the cheaper default `qwen3.7-plus` handled batches A-K. If the loop
resumes on the same plan, prefer `qwen3.7-plus` for mechanical work and
reserve `qwen3.8-max` for genuinely hard tickets.

Options for the user: wait for the reset, add a different API key
(`qwen --openai-api-key` / `--openai-base-url`, or `~/.qwen/settings.json`),
or have Claude implement directly at higher credit cost.

### In progress
- Nothing running.

## Session 2026-09-22: the Docker install, run for real

The user had installed Docker Desktop and asked to continue with Qwen. The
machine had no WSL at all (Docker could not start); the user installed it and
Claude added Ubuntu 24.04 and turned on Docker Desktop's WSL integration, so
everything below ran exactly the way docs/INSTALL.md tells a user to: a clone
in the WSL home, `./install.sh`, a browser on Windows.

Qwen drafted three tickets (batch R: database layer, S: bundled TURN and
installer defaults, T: layout). Each was then run live, and most of what made
it work was found that way, not by the tests:

- `a25c253` **database layer**: supabase/postgres + PostgREST + Realtime behind
  nginx. Live fixes: nginx does not strip the location prefix when proxy_pass
  uses a variable (every /rest/v1/ call reached PostgREST as "/"); upstream
  roles.sql aborted the whole init on a role this stack does not have; the
  image leaves POSTGRES_USER empty so _realtime needed an explicit owner.
  Qwen could not read `.qwen-tasks/ref-supabase/` (git-ignored) and improvised
  the init wiring; replaced from the upstream reference.
  Also: partykit on node:24-slim (workerd is glibc-only; on alpine nothing
  listened and every room socket got 502), install.sh stored 100644.
- `6d6b4eb` **default install needs no account**: bundled coturn is the TURN
  default. Qwen passed denied-peer-ip as one comma list, which coturn rejects
  and then drops the whole deny list; its `-n` also made coturn ignore the
  config file. Now a generated config file, verified with turnutils_uclient:
  public peers allowed, 10/8, 172.16/12, 192.168/16, 127/8 and
  169.254.169.254 refused. `turn.probeHost` / `db.probeUrl` so /api/health
  probes by service name. Default hostname localhost; health poll exits 4 when
  the stack never answers (it exited 0); Whisper cache owned by the service
  user; Whisper on CPU (no cuBLAS/cuDNN in the image).
- `1b18f77` **capture end to end in Docker**: "3 insights added" in 48 s
  (browser -> nginx -> Whisper CPU -> qwen2.5:7b GPU). partysocket picks ws://
  for localhost/LAN hosts, so an https page now forces wss. nginx-proxy
  resolves app/partykit per request (an installer re-run recreated app and the
  site answered 502). Re-running install.sh no longer rotates
  POSTGRES_PASSWORD (it locked rest/realtime out) or N8N_ENCRYPTION_KEY.
  Extraction timeout 120 -> 600 s: the 6 GB laptop GPU also drives the
  desktop and held only 25/29 layers.
- `2c0d1ca` **UI**: the Active Review card opened under the insights sidebar
  (Open Manager view unclickable); the "Enter XR" pill was @react-three/xr's
  emulator, injected on hostname localhost, now dev-only.
- `d924290`..`9e5b1b2` **docs/INSTALL.md**, walked end to end from a wiped
  machine state (volumes and images removed, fresh clone): install exit 0,
  all ten services healthy, then every step of section 6 in a browser as
  written (saved review survives reload, share link + guest join +
  participants, boardroom call with video, recording -> "3 insights added",
  END SESSION -> tracker, health all ok) and section 7 (stop/start/down/up
  keep the data). The walk found: `72cf059` leaving the setup page inside the
  800 ms autosave window dropped the edit; `3808043` the setup page rendered
  the previous review's persisted draft while loading. install.sh now writes
  COMPOSE_FILE/COMPOSE_PROFILES to .env so plain `docker compose ...` covers
  the right services, and streams build output live.

**Verified live:** two-browser WebRTC call connects (host->host candidates,
bundled TURN offered). **Not verified:** a call forced through the TURN relay;
under Docker Desktop relay-to-relay fails with or without TURN_EXTERNAL_IP
(hairpin through Docker Desktop's UDP forwarding). Written into INSTALL.md
known limits; needs a Linux host with a public IP to test properly.

### Repo state
Phases 0-5 complete except T0.1, T4.7, T4.8. 881 JS tests (5 skipped on
Windows: they execute install.sh; all 110 deploy/config tests pass in a Linux
node:24 container), 425 pytest, lint 0 errors / 101 warnings. Branch has 13
commits since the last push; **not pushed** (INSTALL.md tells users to clone
this branch from GitHub, so it must be pushed before anyone follows it).

### Not started
- **T0.1 (asset swap)**: decided 2026-09-17, cube at public release.
- T4.7 (live streaming), T4.8 (n8n, optional), rest of Phase 6.

## Session 2026-09-22/23 (continued): features on top of the working install

The user tested the Docker install and drove a long list of changes. Each one
was drafted by Qwen from a written spec in `.qwen-tasks/`, then run live in
the Docker install (usually two browsers) before committing. What the live
runs caught, batch by batch, is the point of this entry:

- **Live transcript (T4.7 first slice)** `4ef95b8`. 8 s slices to Whisper via
  a new /api/capture/transcribe. Live: the host could not see the transcript
  while recording (manager workspace hides the panel) -> compact box.
- **Record button in the transcript panel** `8f6bbe4`: one RecordingProvider
  for the room, so two views cannot mean two recorders.
- **Sharing** `c2da7af`: publicUrl in the config, localhost warning, and the
  installer offering the LAN address. Live: WSL's `ip route` gives the
  distro's 172.x address, powershell.exe ate the answer to the next question
  (</dev/null), and the installer kept a certificate for the old hostname.
- **Agents off by default** `aa4bd38`; the tracker was recording four demo
  agents as attendees of every meeting.
- **Requirements on the review** `88b1702`. Live: review_curations has a
  column per field — a new field without one is silently dropped on save, so
  the sample set "did nothing".
- **People** `cd045d5`, then **removed entirely** `257768a` on user feedback.
  Live: `?? []` inside zustand selectors looped React (#185) and took down
  the lobby.
- **Per-speaker transcript** `fc71ad9`: every client transcribes its own mic;
  the room server stamps the speaker. Live: cards never left the machine that
  recorded them, and recording while muted quietly opened a second mic.
- **Arena audio** `80c6f49`: the call runs for the whole room, mic/speaker
  controls, same-room mode, muted on arrival.
- **Label fields** `8337375`: the user defines the fields; seeding removed in
  `257768a` after "the labels should be set by the user, not pre filled".
- **Commit a pin as a comment** `4f0b6a8`. Live: setActiveModelType cleared
  comments, chat and cards unconditionally, and the room re-applies the model
  on every REVIEW_CONFIG sync — so every participant lost meeting content
  whenever the review changed. Pre-existing; found by this feature failing.
- **Pointing timeline** `d74e4dc` and **grounded extraction** `b997d05`:
  segments of who pointed at what, a chip on the transcript line, and the
  component tree + segments + speaker-labelled hint in the prompt, with the
  parsers dropping any componentReference that is not in the supplied list.
  Verified by posting a recording straight to capture-service with a two-part
  tree: the risk card came back on 'left_cushion', the others with none.

- **Front-door password and admin passphrase (batch AH)**. Two optional
  shared secrets, both empty by default, so an existing install behaves
  exactly as before. `./install.sh` asks for them and writes salted SHA-256
  hashes to `.env`; `/api/access` and `/api/admin-unlock` verify them and set
  an HMAC cookie keyed with the stored hash. Live findings, all three
  invisible to the test suite:
  - **Docker Compose ate the hash separator.** The format was
    `<salt>$<hash>`; Compose interpolates `$` in `.env` values, so the
    container saw a truncated hash and refused every correct password. The
    separator is now a colon in both the Node helper and the installer, with
    legacy `$` values still parsed.
  - **The gate and the app each had their own copy of the state.** Two
    components calling the same hook meant two `useState`s: entering the
    right password unlocked the gate screen's copy and the wrapper never
    heard, so the user stayed staring at the gate. The state moved into the
    module and is read with `useSyncExternalStore`.
  - **A module-level store needs resetting between tests.** The wrapper tests
    inherited the previous test's answer (and its "already fetched" flag), so
    they asserted against stale state; `resetAccessGateForTests()` now runs in
    both describes' `beforeEach`.
  Verified live: with no password the app opens and `/api/access` reports
  `required:false`; with one, the gate appears, a wrong password is refused, a
  right one opens the app and survives a reload, and a second browser is still
  gated. The admin passphrase answers `required/unlocked` correctly, rejects a
  bogus cookie, and 401s a wrong passphrase.

- **Knock to join (batch AI)**. Under the default policy a new arrival waits
  and the host sees "Maria wants to join — Admit / Decline"; the invite popup
  also offers *Anyone with the link*. The gate is server-side, because the
  browser hiding a screen would be theatre: `onConnect` used to hand over the
  roster, the model, the review config and every comment before anyone had
  said who they were. That bundle moved into `sendRoomState`, sent when a
  connection is admitted. Four things the live run caught, none of which any
  test suite would have:
  - **The gate deadlocked every room, the host's included.** PRESENCE is what
    identifies a connection to the server, and it was only ever sent from the
    3D scene's frame loop — which no longer mounts until the gate says
    'admitted'. No PRESENCE, no admission, no scene, no PRESENCE. The knock
    now lives in `usePartyPresence` itself and repeats every 3 s while it
    waits. Pinned by `lib/__tests__/joinKnock.test.tsx`, and the pin was
    mutation-tested: removing the knock fails two of its cases.
  - **The host could not reload their own room.** A reconnecting user is
    already in `admitted`, so the server said nothing — while the client's
    join state starts again at 'joining' on the new socket, leaving it on
    "Connecting…" for ever. Admission is now delivered per connection
    (`deliverAdmission`, once each), not per new participant.
  - **The meeting was still streaming to the people at the door.**
    `room.broadcast` reaches every open socket, so a parked visitor was
    receiving other participants' PRESENCE — and by the same route would have
    received the live transcript, the comments and the pointing segments of a
    meeting nobody had admitted them to. Found by reading the guest's
    websocket frames, not by looking at the UI. All 25 relays now go through
    `relay()`, which excludes any connection that is not admitted; JOIN_POLICY
    is the one deliberate exception.
  - **A test fixture had never actually admitted its "guest"** — it sent a
    bare PRESENCE, which under 'ask' only parks someone, and the assertions
    passed anyway because broadcasts reached everybody. Fixed with an
    `admitViaHost` helper; the fixture bug and the leak were the same bug seen
    from two sides.
  Two safeguards keep it from being rigid: a room with nobody in it admits its
  next knock (so a host who walks away does not strand a waiter — verified
  live by closing the host's browser), and an admission survives a reconnect.

- **Per-review visibility (batch AJ)**. A review is listed in the lobby or
  link-only; the switch sits with the title and description on the curate
  page, because it is a property of the review. `listed boolean not null
  default true`, so every existing review stays exactly as it was, and
  `loadCuration`/`getCurationSummary` deliberately do NOT filter — the link is
  how a link-only review is reached. Caught in review: filtering on a column
  an older database does not have fails the whole query, so an install that
  had not re-applied the schema would have opened to an empty Saved Reviews
  list; `listRecentCurations` now retries without the filter on PostgREST's
  42703, with a test for it. Verified live after applying the column: a new
  review is listed, switching it to link-only removes it from the lobby, and
  its own link still opens it.
- **"AGENTS ON" no longer overlaps the playback controls.** The centred dock
  is ~1030px wide, so at 1280px its left edge lands 11px inside the toggle
  cluster. Below 1360px the cluster sits above the dock, 11px clear each side;
  measured at four window sizes rather than eyeballed.

- **The admin screen (batch AK)**, plan 11 §N — `/admin`, behind the admin
  passphrase from batch AH. Three sections: every review on the install
  (toggle listed/link-only, delete behind an inline two-click confirm, not a
  `window.confirm` that blocks the page), the label-fields editor lifted out
  of `pages/TrackerPage.tsx` into a shared component, and a read-only Access
  section. Two deliberate refusals: no password rotation (it means rewriting
  `.env` and restarting the api container, and a button that pretends to do
  that is worse than none — the screen says so), and no audit log yet (it
  needs its own table and a write path from the room server).
  - **`required: false` means CLOSED here, the opposite of the front door.**
    No admin passphrase configured is not "everyone is an admin" for a screen
    that deletes other people's reviews; `/admin` says the passphrase is not
    set and offers nothing else. The gate also fails LOCKED when the endpoint
    is unreachable, where the front door fails open.
  - **Caught in review: naming a column is enough to fail.** Batch AJ's 42703
    retry only dropped the `listed` FILTER, but PostgREST rejects the whole
    request for an unknown column in the SELECT list too — and this batch had
    added `listed` to all three select lists. On an install that had not
    re-applied the schema, the lobby, the admin list AND the "preview the
    review you were linked to" path would all have come back empty. Each read
    now falls back to its own pre-`listed` column list. My own spec was wrong
    here: it told Qwen no retry was needed in `listAllCurations`.
  - While in there, the three copies of the row→summary mapping became one
    typed `rowToSummary`, which took the lint warnings from 101 to 99.
  Verified live: with no passphrase `/admin` refuses; with one it asks,
  refuses a wrong passphrase, opens the three sections, shows each review's
  visibility, needs two clicks to delete, flips visibility, and locks again —
  and the tracker's label-fields settings still open after the extraction.

- **The front-door password now guards the GPU, not just the UI.** In the
  self-hosted stack `/api/capture/local` and `/api/capture/transcribe` never
  touch the `api` container: nginx streams them straight to capture-service
  and adds `CAPTURE_SHARED_SECRET` itself. That secret keeps capture-service
  unreachable from outside the compose network, but nginx added it for every
  caller — so anyone who could open the origin could make the server
  transcribe audio and run the LLM even with a password set. Both locations
  now go through nginx `auth_request` to a new `GET /api/access-check`, which
  answers 204 or 401 and nothing else (auth_request judges by status; the
  body is ignored, and the subrequest drops the body so a 200 MiB recording
  is not forwarded to it). With no password configured it answers 204 to
  everything, so an open install is unchanged. Verified live in all three
  states: open → 204 and the capture endpoints answer; password set and no
  cookie → 401 on both; password set with the cookie → 204 and through. The
  per-speaker live transcript still passes afterwards, which is the hot path
  the subrequest was added to.

- **The same check now covers the cloud path and the Vercel path.** A POST to
  `/api/capture/extract` bills the deployment's own OpenAI or Anthropic key
  and went through the `api` container rather than nginx, so the nginx rule
  did not touch it; `captureProxyHandler` (the Vercel half of local +
  transcribe) had the same gap. Both now call one shared
  `requestIsUnlocked(req)`, which is also what `/api/access-check` answers
  with, so there is a single definition of "past the front door". The HEAD
  probe on extract is deliberately left open: it reports only whether a key
  exists, and server-side health checks call it with no browser cookie.
  Mutation-tested (replacing the guard with `if (false)` fails two tests) and
  verified live: open → 400 from validation; password and no cookie → 401 and
  nothing billed; password with the cookie → through.

### Decisions the user made in this stretch
- Organising structure (tracker grouping) is **user-defined fields**, edited
  in the app, seeded with nothing.
- **No per-review people list**; people management belongs to an admin
  screen later.
- **No user accounts at all.** Access = optional front-door password +
  admin passphrase + unguessable links + knock-to-join + per-review
  visibility (`docs/plan/11-accounts-and-admin.md`). Both secrets default to
  empty, so an existing install behaves exactly as before.
- Programmable agents: roadmap, nothing decided.
- Requirements: no sample set, no generated codes, free-text category.

### Follow-ups
- **Rate limiting on the capture endpoints is still missing.** They are now
  behind the front-door password on every path, but a deployment that chose to
  stay open (the default) can still be asked to transcribe on a loop by anyone
  who can reach it, and an unlocked user can do the same. The password is a
  door, not a budget.
- **Vercel limits vs capture:** Functions accept 100 MB bodies, capture-service
  allows 200 MB, and the proxy waits up to 15 minutes. A long meeting on
  Vercel will hit the platform limit first. Self-hosted nginx has no such cap.
- **`viewpoint.config.ts` on Vercel:** it is git-ignored, and the config is
  imported by a runtime-computed path the bundler cannot trace. A Vercel
  deploy from git will not have it, so those endpoints fall back to defaults.
  Now that `loadConfig` actually works, this is the next thing between the
  config file and a Vercel deployment.
- **TURN relay path unverified** (see the 2026-09-22 session). Direct calls
  are verified.
- **A shell with .env exported overrides it**: compose interpolation prefers
  the environment, so `set -a; . ./.env` before a re-run left capture-service
  and coturn on the old secrets. Test-harness trap, not a user path.
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
git log --oneline -8          # ~45 commits on planning/oss-enterprise-readiness
git status --short            # should be clean
```

**Establish the baseline yourself before changing anything.** Every claim below
was verified locally, never in CI:

```bash
npm ci
npm run lint                  # 0 errors, ~100 warnings (expected, tracked debt)
npm run typecheck
npm run test                  # 826 passing, 2 skipped on Windows
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
1. **T0.1** — decided (cube at release). Code of Conduct email set 2026-09-21.
2. **CI** — done, green. Housekeeping: actions/checkout@v4 and setup-node@v4
   run on the deprecated Node 20 runtime (warning only); bump to current.
3. **A real end-to-end capture run** under docker compose (T4.4 is untested
   outside jsdom), and the Vercel config-file question above.
4. Phase 6 docs, then the type-debt ratchet (101 lint warnings).

**Do not trust a green test run as evidence on its own.** The review method that
actually found problems is written up in `delegation/README.md`.
