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

- **Label fields: drag to reorder, and suggest what has been used (batch AL)**.
  The order of the fields decides the order of the tracker's grouping
  controls and could only be set by creation order; `reorderFields` existed,
  was wired to the database, and nothing called it. Now a grip drags a row.
  Caught in review: Qwen made the whole row `draggable`, which means dragging
  to select text inside the field-name input picks the row up instead — in
  the one panel whose purpose is typing those names. Only the grip arms the
  drag now, with a test that fails if a row is draggable before it is held.
  The second half: a free-text label input offers the values other reviews
  already used, via a plain `<datalist>`, so "Phase 2", "phase 2" and "Phase
  Two" stop becoming three groups for one thing. Suggestions only — a new
  value is still just typed. Verified live: dragging by the grip reorders and
  the order survives a reload, typing in the name input still types, and a
  value used on one review is offered on another.

- **The audit log (batch AM)**, closing plan 11 §N. Three events, all grants:
  who admitted whom, who declined whom, who changed a link's join policy.
  Nothing about the meeting itself — this is a record of grants, not
  surveillance. The room server writes them, because it is the thing that
  actually decides admissions; the admin screen's new Activity section reads
  them back as sentences ("Paco admitted Maria · room 7E685187"), and says
  plainly that it is not a tamper-proof ledger and that names are
  self-asserted.
  - **A fire-and-forget write is a silent failure by design**, so it was
    verified against the database rather than the test suite — which is how
    both of its bugs surfaced. First: the POST went to
    `${REST_URL}/rest/v1/audit_events`, but PostgREST serves its tables at the
    ROOT; `/rest/v1/` is only the prefix nginx-proxy rewrites away for the
    browser. 404, swallowed. The test had encoded the same wrong URL.
  - **Second, and the more interesting one: room code does not run in the
    partykit container's Node process.** It runs inside workerd, which does
    not inherit the container environment, so `process.env.ANON_KEY` was empty
    however carefully `docker-compose.yml` was wired — the container had both
    variables and the room server still logged "ANON_KEY not set". PartyKit's
    way in is `partykit dev --var KEY=value`, so the container now starts
    through `deploy/partykit-entrypoint.sh`, which passes only the variables
    that are set, and the server reads `room.env` with `process.env` as a
    fallback. The Dockerfile guardrail test follows the flags into the script.
  - The admin screen's review list is capped and scrolled: with 46 reviews on
    this install, Label fields, Access and Activity were so far below the fold
    they read as missing.
  Verified live: admitting, declining and switching a link to "anyone with the
  link" each land a row, and the Activity section shows all three. The audit
  rows and the test passphrase were removed afterwards.

- **The capture gate broke whole-meeting captures, and the user found it.**
  "/api/capture/local returned 500", intermittently. Not in capture-service's
  log at all — it never saw the request. nginx checks the PARENT request's
  declared body size against the SUBREQUEST location's
  `client_max_body_size`, and `proxy_pass_request_body off` does not exempt
  it, so the 1 MiB default applied to `/_access_check`: 413 on the subrequest,
  which nginx reports to the browser as 500. Live-transcript chunks are
  ~200 KB and kept working; only longer meetings failed, which is why it read
  as intermittent. The curl test that passed the night before sent a tiny
  body — the lesson is that a size-dependent guard needs a real-sized probe.
  Fixed with `client_max_body_size 0` on a subrequest whose body is never
  forwarded, verified by posting the 1.2 MB review recording end to end (200,
  real cards), and pinned in `deploy/__tests__/nginxCaptureTemplate.test.ts`.
- **The Labels tab was a dead end.** With no fields defined it said "add
  grouping fields in the tracker settings" and gave no way to do it — the
  user hit exactly that. It now explains what a label field is for and opens
  the same shared editor the tracker and the admin screen use; when fields
  exist there is an "Add or edit label fields" link. Possible because batch AK
  had already lifted that panel out of TrackerPage into a component.

- **A restart of the room server used to end everyone's meeting.** Found by
  asking what happens on the upgrade path, not by a report: the admitted set
  is in memory, so after `docker compose restart partykit` the first person to
  reconnect became host and everyone else was bounced into the waiting room —
  with the host being asked to admit colleagues who had never left. Admissions
  are now written to the room's own storage (the compose file already mounts
  the volume) and restored in `onStart`, which runs before the first
  connection, so no knock is judged against an empty set. Capped at the 200
  most recent, fire-and-forget on write, and a runtime with no storage behaves
  exactly as before. The join policy is deliberately NOT restored: it returns
  to "ask", which is the safe direction. Verified by restarting the container
  mid-meeting: before, the guest was thrown out; after, both stay in.
- **Recording with the front-door password on was never tested together**
  until now — the same shape of assumption as the 413. It works: both
  browsers unlock, the cookie rides along to the capture endpoints, and the
  live transcript and cards behave exactly as on an open install.

- **A knock during a boardroom session reached nobody.** The join-request
  prompt was inside Interface's `!isBoardroomMode` branch, so while the host
  was presenting, the person at the door waited until the host happened to
  leave the boardroom — no notice, no sound, nothing. It renders in both modes
  now, above the boardroom overlay's z-[150]. Verified live: the host is shown
  the request without leaving the boardroom, and admitting from there works.
- **The phone path through the gate was checked too**, since the knock gate
  landed after the last phone test: an iPhone-sized client gets the waiting
  room (no overflow), the host is asked by name, and admitting drops the phone
  into the mobile room view.

- **"Agents off" now means off in the boardroom too (batch AN)** — the user
  asked for it after seeing the four demo tiles there. `hideAgents` was
  honoured by the 3D scene and the dialogue engine but not by the boardroom,
  which read `state.agents` directly. The shell now derives one
  `visibleAgents` and hands it to every layout; the layouts never check the
  flag themselves. Three details that matter: the full list is still used for
  looking an id up (an insight card keeps its colour while the tiles are
  hidden), a pinned or speaking id pointing at a hidden agent is ignored for
  rendering but NOT cleared from the store (so turning agents back on restores
  exactly what was there), and the webcam grid's column count is clamped to 1
  — an empty list gave `repeat(0, 1fr)` and a division by zero. Mutation-
  tested (removing the filter fails two of the new tests) and verified live:
  the boardroom shows only the real participant, and the AGENTS ON toggle
  brings the tiles straight back.

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

### The queue for the next session

The user tested this build and wrote up what they want changed: the camera
and the follow model, a layout pass over the room's furniture, and a return
to the question of identity. It is all in
[`12-camera-room-ui-and-identity.md`](./12-camera-room-ui-and-identity.md),
including the three decisions that block it, and **none of it has been
started** — that was the instruction.

Worth knowing before reading it: the identity item reverses the "no accounts"
decision recorded above, and that is discussed rather than glossed over.

### Follow-ups

- **Capture spending is bounded per IP, not per deployment.** Correcting what
  the previous entry claimed: `/api/capture/` IS rate-limited in the
  self-hosted stack — `deploy/nginx/proxy.conf` has had
  `limit_req_zone ... rate=30r/m` with `burst=20` all along, which the
  8-second live-transcript chunk rate (7.5 req/min) sits well inside. What is
  actually missing: the same limit on **Vercel**, where there is no nginx in
  front, and any ceiling on total spend — 30 requests a minute from each of
  many addresses, or from one unlocked insider, is still a lot of GPU. A
  password is a door and a per-IP limit is a throttle; neither is a budget.
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

## Session 2026-09-23 (night): plan 12, parts A and B, plus the carried-over backlog

The user went to sleep with the instruction to execute as much of the queue in
`12-camera-room-ui-and-identity.md` as possible, driving Qwen. Seven commits
from Qwen batches plus small ones done directly. Every batch was reviewed
against the plan, mutation-checked where it added tests, and the room changes
were checked in real browsers against the local Docker install (two desktop
browsers, and a phone-sized one), not only in jsdom.

### Done
- `e3514d7`: **CI actions to v7** (checkout, setup-node, setup-python), which
  run on node24. Major-release notes checked for inputs this workflow uses.
- `3a735f7`: **batch AQ**, plan items A3 and A4. Split view opens on the first
  other person, never on an agent while agents are off. Top-down view and heatmap
  removed with their state. Review fixed a demo-model part turned solid by the
  heatmap removal, and a split pane that kept saying "no one else is here"
  after someone joined.
- `6187662` + `609eacf`: **batch AT**. The Vercel config gap is closed:
  `VIEWPOINT_CONFIG` holds the config as JSON; `npm run config:json` prints it
  from an existing file; `/api/health` reports the source. Also a capture-service
  CORS allowlist, `CAPTURE_ALLOWED_ORIGINS`. Review found two real bugs:
  - the JSON error forwarded V8's parser message, which quotes the input;
  - CORS was registered inside auth, so with a shared secret every browser
    preflight got 401.

  `609eacf` fixes two tests that the bare `loadConfig()` call broke. I had run
  only the config and api folders before committing; **run the full suite before
  every commit**.
- `d81579d`: **batch AO**, plan items A1 and A2 (on qwen3.8-max).
  - Free view orbits the model again. The pivot moves to the model's depth along
    the line of sight when a driven camera hands control back.
  - A drag while following is a nudge: the camera is yours, then it eases back
    after `FOLLOW_RESUME_DELAY_MS` (2 s, `lib/followTiming.ts`, tune by feel). A
    pill says so.
  - The leader sees who follows ("Leading · 1 following") and drops to free view
    when the last follower leaves.
  - Three detach bugs are fixed: a follower could end everyone's follow, and a
    leader pressing Free View told nobody.
  - Also fixed: the phone's auto-follow undid Explore whenever someone joined.
  - **Verified live** with two browsers (lead, follow, nudge, snap-back,
    release) and a phone (Explore survives a join).
- `a43a5bf`: **batch AR**, plan item B (Option B, chosen by the user
  mid-session). Short call bar at the bottom, pointing and room controls in one
  bar at the top, full-height side panel, and a Manage button always there for
  the host. Screenshots at 1280×800 and 1600×900 found four problems, all fixed:
  - the Pointer menu was under the headphones hint;
  - `bg-white/97` is not generated by Tailwind 3, so two popovers were
    see-through;
  - the boardroom lost its only way into the manager view;
  - the review card still shifted 356px left onto the model tree.
- `03adc3c`: **batch AU**, type debt. Lint warnings 99 → 36 (86 → 23 `any`). No
  wire format change. One accepted `as unknown as` in `InsightDetailModal`
  (reason in the commit). The 12 `exhaustive-deps` warnings are left
  deliberately.
- `97d46dc`: README split view and leader mode describe people, not agents.
- README also now says where a real **spending ceiling** for cloud capture has
  to live. The app's server code has no database access to count across
  serverless instances, so the ceiling is the provider's budget on the key,
  plus a Vercel firewall rate limit. That closes the "spend ceiling" item as
  documentation, not code.

### Live install
`~/viewpoint-arena` in WSL now tracks this repo directly (`origin` is the
Windows path), so updating it is a fetch plus a fast-forward, then
`docker compose build app partykit api && docker compose up -d app partykit api`.
It runs `03adc3c`. The Playwright scripts used for the live checks
(`follow-live.mjs`, `layout-live.mjs`, `phone-live.mjs`) are in `.qwen-tasks/`
(git-ignored). Reuse them.

### Worth knowing
- The boardroom detach and agent-POV resume went from 3 s to 2 s, because they
  now share the one constant with the arena nudge.
- Qwen on `qwen3.8-max` (AO, AR) produced unusually good reports, including
  bugs outside its brief. The plus model was fine for AQ, AT and AU.

### Still waiting on the user
- **C: identity** (a name you keep / real accounts / borrow SSO). Nothing started.
- **The 2 s snap-back feel.** Built and working; only use will tell if 2 s is right.
- Pushing. The 8 commits from this session are not pushed.

## Session 2026-09-24: tree highlight, CAD formats, identity

The user tried the night's build ("feels pretty good") and asked for three
things. All three are done, reviewed, verified live and committed.

- `6f566aa` **Tree highlight (batch AV).** Pointing at a part now selects that
  part in the tree, not the root.
  - Cause: the built-in models stamped every mesh with the root id.
  - Their trees are now built from the GLB, like imports, and the eye toggles
    work on them for the first time.
  - Review found three more problems:
    - the selection glow was faded out every frame by the pointer pass (one
      shared pass now, `lib/builtInModelGlow.ts`);
    - the root object's id did not match the tree's root;
    - the tree showed raw export names while the pop-up showed clean ones.
  - Exporter wrapper groups are collapsed (`collapseSingleChildGroups`).
- `5044df2` **Formats (batch AW).**
  - STEP, IGES and BREP via occt-import-js, which is OpenCascade compiled to
    WebAssembly. It runs in a worker, lazily, as a 7.6 MB separate asset; the
    main bundle grew 7.5 kB. The licence (LGPL-2.1) is recorded in
    `THIRD_PARTY.md`.
  - 3MF, PLY, DAE, 3DS, VRML and AMF via three.js's own loaders.
  - Native CAD formats get an "export as STEP" message.
  - Importing real files in the running app found two older bugs:
    - imports were centred with an unscaled offset, so a millimetre CAD model
      landed off screen;
    - compressed GLBs had no meshopt decoder.
- **Identity (plan 13), `aa2d47b`, `9abb01c`, `8e8c4f4`.** The user decided that
  each company chooses: none, accounts or SSO.
  - Built on GoTrue in a compose profile, so the default install is unchanged.
  - The sign-in page, guests, "Your reviews", and room names verified by the
    server from the JWT.
  - Each batch was run on the live install switched to accounts, then switched
    back.
  - Live testing found:
    - the brute-force limit on `/auth/v1/token` never applied (the map was
      keyed on `$uri`, which the rewrite had already changed);
    - account creation had no name field.
  - Confirmed live: no token in any of 83 WebSocket frames a guest received.

**Testing notes.** Test the sign-in flow at the install's configured origin
(`https://192.168.1.134`), not `localhost`: the Supabase URL is the LAN
address, and from `localhost` the calls go cross-origin. The scripts are in
`.qwen-tasks/`. `signin-live.mjs`, `myreviews-live.mjs` and `cad-live.mjs` are
new; `wslax2/3/5.sh` in the scratchpad switched identity on and off. Running
the `.mjs` scripts puts them in eslint's scan, so keep them lint-clean.

**Left:**
- identity's "later" row (admin role in place of the passphrase, a user list,
  SAML registration, password-reset email);
- an up-axis flip button for imports;
- a validation surface on the review-setup upload.

## Session 2026-09-24/25: plan 14 — rooms, models, admin, AI, curation in the room

The user asked for:
- persistent design reviews with model revisions, and tracker continuity;
- imports that add rather than replace, synced for everyone, with a host
  permission;
- an admin console;
- AI providers chosen per job from the screen;
- hand-made cards;
- curation merged into the room (sketch approved: four roles, an Edit switch).

All of it is built, reviewed, verified live on the WSL install (accounts mode),
and committed:
- **Storage and admin:** `f8404a6` BA+BD (model storage by hash, admin People),
  `d6b5699` BE (admin Design reviews and Models).
- **Scene and AI:** `98092f4` BB+BF (multi-model scene with revisions and
  Compare; AI router with an encrypted settings store).
- **Reviews and cards:** `282da20` BC (roles, stored revisions, tracker
  continuity), `36e6fb8` BH/BH2/BH3 (curation in the room; the Curate page is
  deleted), `478d468` BG (+ Card, archive filter, every model file, deadline
  resolution, PLM launch).

**Found live that tests had missed:**
- review_members and owner_id were writable with the public anon key, which
  meant privilege escalation. Closed, then attacked five ways.
- The admin models endpoint judged the admin check by `res.writableEnded`.
- New revisions went to the last line added.
- In-room edits were never saved, and later a second person's stale copy
  overwrote saved ones. Saving is now per local edit.
- The owner saw "Import locked" when not the meeting host.
- The auth token limit (above) and deadline words glued to model dates.

**Qwen incidents:**
- The monthly quota ran out mid-BH. The user upgraded, and the resumed run kept
  the partial work and fixed five defects in it.
- BG hit the per-run tool-call cap. The watcher only looked for a report, so it
  went unnoticed for about 7 hours. **Always wait on the qwen process exit**,
  not on log text.
- Split big batches: five sections is too many for one run.

**Test data:** removed each time. The user's own account (`coacopaco@gmail.com`,
admin) is the only one. The install is left in accounts mode, as the user asked.

**Open:**
- The disappearing Import button: resolved; the user retested after the
  import rework and it works.
- ~~Model transforms persist in room storage, not in the review row.~~ Done: BI saves placement.
- ~~Adding a pin inside the room has no UI yet.~~ Done: BI.
- ~~The main bundle is 1.2 MB, so lazy-load ReviewEditPanel.~~ Done: BI.

### Resuming from a cold session

Read this file top to bottom first — it is the only place the findings,
overrides and reasoning live. Then:

```bash
git log --oneline -8          # ~110 commits on planning/oss-enterprise-readiness
git status --short            # should be clean
```

**Establish the baseline yourself before changing anything.** Every claim below
was verified locally, never in CI:

```bash
npm ci
npm run lint                  # 0 errors, 36 warnings (tracked debt)
npm run typecheck
npm run test                  # 1344 passing, 9 skipped on Windows
npm run check:env             # KNOWN map is EMPTY and must stay empty
npm run build
npm run test:e2e

cd capture-service            # 456 pytest tests
python -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt
./.venv/bin/python -m pytest
```

On Windows use `.venv/Scripts/python.exe`. `capture-service/.venv` is
git-ignored, so a fresh clone must recreate it.

**To delegate more tickets**, read `delegation/README.md` — it has the command,
the model guidance, and the rules every spec repeats. The specs already used
are beside it. Qwen worked throughout 2026-09-23, including qwen3.8-max for two
batches.

**If a batch is interrupted mid-run** (this happened once, batch O), do not
discard the work reflexively. Check whether the tree still typechecks and what
is missing against the ticket's acceptance criteria — batch O was ~90% complete
and needed one duplicated const removed plus the one test the run never reached.

**Highest-value work remaining**, roughly in order:
1. **Identity**: done (plan 13). What is left is its "later" row.
2. **Push** the branch (the install guide clones it from GitHub) once the user
   has looked at this session's work.
3. **T0.1**: decided (cube at release).
4. TURN relay across networks (needs a Linux host with a public address), no
   speaker diarization, and the last 23 `any` / 12 `exhaustive-deps` warnings.

**Do not trust a green test run as evidence on its own.** The review method that
actually found problems is written up in `delegation/README.md`.

## Session 2026-09-25: empty rooms, Manager look, plan 15 (sessions and variants)

- `c72070a` + `062b98c` BI: rooms start empty, and the headphones and bike are
  samples on request. Adds pins in the room, placement saved on the review, and
  the edit panel loaded on demand.
- `1cdb681` BJ: the Manager view uses the app's own look (white, black tabs,
  green only for meaning).
- `d131d1b` plan 15, approved: the user's word is **Variant**, and adopting brings
  over both the cards and the model.
- `b9bdf1a` BK: lines of sessions per design review, the Sessions map (room top
  bar and tracker), "Carried over" cards (the same tracker rows, folded by
  default), and "Main line · S1" in the tracker. Tested live. The 4 older
  meetings on the install have no design review, so the backfill correctly
  gives them no line.
- BL: Explore a variant from here, Adopt into main line, Drop variant.
  - One endpoint, `api/reviews/lines.ts`, checks `editReview`. Adopting and
    dropping are each one database function, run by the service role only.
  - The browser may only insert the main line, and may never update a line.
  - Tested live with two accounts: the variant opens its own room, and its
    meeting is recorded as A1. Adopting moved the card to the main line, which
    still says it came from Variant A. Dropping closed the open card with the
    reason and wrote status history. The map shows the green rejoin and the grey
    dashed drop. A non-member gets 403, no token gets 401, and the anon role
    cannot update, insert a variant, or run the functions.
  - Found live, fixed by me:
    - The client parsed the endpoint's camelCase line as a snake_case row, so
      Explore made the variant and never opened it.
    - Opening a variant from the map remounts the room with a review config
      already in the store, so the room never set `activeReviewId`, and the
      variant's meetings were saved with no review and no line. It is now set
      as soon as the row is found.
  - The "both lines changed the model" question has only unit tests. The live
    test had no models.
  - Suite timeouts are raised (`testTimeout` 20s, `asyncUtilTimeout` 5s). Under
    full load, lazy-chunk and install.sh tests were failing at random.
- Test data: the reviews made by deleted accounts keep a NULL owner, so the
  cleanup must delete by review id, not by owner.
