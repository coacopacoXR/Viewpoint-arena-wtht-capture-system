# Task Breakdown — Execution Tickets

Ordered by phase; work within a phase can parallelize across agents, phases
should complete roughly in order since later phases depend on earlier ones
(e.g. Phase 3 adapter refactors depend on Phase 2's config loader existing).

Each ticket: **Why / Files / Interface (where relevant) / Acceptance criteria
/ Required tests / Depends on**. "Done" means CI is green on all of the above
— see `00-overview.md` §4.

---

## Phase 0 — Repo safety (blocks the public push, not the coding work)

### T0.1 — Asset & content provenance
- **Why**: `07-oss-hygiene-and-licensing.md` §1 — three `.glb` files named
  after real commercial products may not be redistributable.
- **Action**: default to replace-and-relicense (safer when rights are
  unconfirmed) — swap in a permissively-licensed sample model, update
  `utils/modelLoader.ts` references and any component that hardcodes the
  filename, move branded originals to a git-ignored `assets/samples/`. Only
  keep the branded assets in the public repo if the user has explicitly
  confirmed redistribution rights before this ticket runs.
- **Depends on**: nothing. Do this first, in parallel with everything else.

### T0.2 — Repo hygiene housekeeping
- **Files**: `.gitignore` (add `Videos Post linkedin/`).
- **Acceptance**: `git status` shows the directory as ignored, not untracked.
- **Depends on**: nothing.

### T0.3 — OSS baseline files
- **Files (new)**: `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `CHANGELOG.md`, `.github/ISSUE_TEMPLATE/*`,
  `.github/PULL_REQUEST_TEMPLATE.md`.
- **Acceptance**: all present, `package.json` has `"license": "Apache-2.0"`
  per the decision in `07-oss-hygiene-and-licensing.md` §3.
- **Depends on**: nothing.

---

## Phase 1 — Tooling foundation

### T1.1 — Lint & format
- **Files**: `.eslintrc.cjs` (or flat `eslint.config.js`), `.prettierrc`,
  `package.json` (`lint`, `format` scripts, new devDependencies:
  `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier`,
  `eslint-config-prettier`).
- **Acceptance**: `npm run lint` passes on current code (fix any violations
  it surfaces as part of this ticket, don't just add `// eslint-disable`).
- **Depends on**: nothing.

### T1.2 — Unit/component test framework
- **Files**: `vitest.config.ts`, `package.json` (`test` script,
  devDependencies: `vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`, `jsdom`). First smoke test: a trivial render
  test for one existing component to prove the harness works.
- **Acceptance**: `npm run test` runs and passes.
- **Depends on**: nothing.

### T1.3 — Typecheck script
- **Files**: `package.json` (`typecheck` script: `tsc --noEmit`).
- **Acceptance**: `npm run typecheck` passes on current code.
- **Depends on**: nothing.

### T1.4 — E2E framework
- **Files**: `playwright.config.ts`, `package.json` (`test:e2e` script,
  devDependency `@playwright/test`). One smoke test: app loads at `/`.
- **Acceptance**: `npm run test:e2e` runs and passes against `vite preview`.
- **Depends on**: nothing.

### T1.5 — CI pipeline
- **Files**: `.github/workflows/ci.yml` per `04-testing-and-ci.md` §6,
  `.github/workflows/nightly-live-adapters.yml` (stub, real jobs added as
  Phase 3 adapters land), `scripts/check-public-env.mjs` per
  `03-security-and-secrets.md` §4, gitleaks + `npm audit` steps.
- **Acceptance**: CI green on a PR containing only T1.1–T1.4's changes.
- **Depends on**: T1.1, T1.2, T1.3, T1.4.

---

## Phase 2 — Master config & secret architecture

### T2.1 — Config schema
- **Files (new)**: `lib/config/schema.ts` — zod schema covering `plm`,
  `capture`, `turn`, `db`, `notifications[]`, `modelImport` per the shape in
  `01-architecture-and-master-config.md` §3. Export `defineConfig()`.
- **Required tests**: unit tests for schema validation (valid config passes,
  missing required fields per provider type fail with clear errors).
- **Depends on**: T1.2 (test framework).

### T2.2 — Config loader
- **Files (new)**: `lib/config/loadConfig.ts` — server-only, reads
  `viewpoint.config.ts`, validates every enabled connector's `*Env` names
  resolve to non-empty `process.env` values, throws with a specific message
  naming the missing var otherwise. `viewpoint.config.example.ts` at repo
  root, `viewpoint.config.ts` added to `.gitignore`.
- **Required tests**: unit tests covering the fail-fast path (missing env →
  throws with expected message) and the happy path.
- **Depends on**: T2.1.

### T2.3 — Public config endpoint
- **Files (new)**: `api/public-config.ts`, `lib/config/publicConfig.ts`
  (client-side fetch-and-cache wrapper).
- **Acceptance**: endpoint returns only non-secret fields (no `*Env` names,
  no resolved values) — verify by asserting the response JSON has no keys
  matching `/Env$/` or containing anything from `process.env`.
- **Required tests**: unit test asserting the redaction.
- **Depends on**: T2.2.

### T2.4 — `.env.example` regeneration
- **Files**: `.env.example` rewritten to match the schema in T2.1, README env
  section updated to point at the master config instead of describing raw env
  vars as the primary interface.
- **Depends on**: T2.1.

---

## Phase 3 — Connector adapter refactors

### T3.1 — PLM adapter: Onshape (reorganize, low risk)
- **Files**: new `lib/connectors/plm/types.ts` (interface per
  `02-connector-adapters.md` §1), `lib/connectors/plm/onshape.ts` (wraps
  existing `api/onshape/*` logic behind the interface — reorganization, not a
  rewrite).
- **Required tests**: `PLMAdapter` contract test suite (new, shared —
  `lib/connectors/plm/plm.contract.test.ts`), run against the Onshape
  implementation in the nightly live-adapter job (needs sandbox creds), and
  against a `MockPLMAdapter` in regular CI.
- **Depends on**: T2.2.

### T3.2 — PLM adapter: Teamcenter (security fix — priority)
- **Why**: fixes the plaintext-password/bundle-leak issue in
  `03-security-and-secrets.md` §1.
- **Files (new)**: `api/teamcenter/login.ts`, `api/teamcenter/tasks.ts`,
  `api/teamcenter/change-notices.ts` (server-side, mirror
  `api/_lib/onshape.ts`'s session pattern). `lib/connectors/plm/teamcenter.ts`
  (browser-safe client calling these endpoints, no credentials in its args).
- **Files removed**: `lib/teamcenterIntegration.ts` (logic relocated, not
  deleted-and-lost — port the request-building logic from
  `tcCreateTask`/`tcCreateChangeNotice` into the new `api/teamcenter/*`
  handlers).
- **Acceptance**: no `VITE_TC_*` or `localStorage` reference to a password
  remains anywhere in `lib/` or `components/`. `scripts/check-public-env.mjs`
  (T1.5) passes.
- **Required tests**: `PLMAdapter` contract suite passes for this
  implementation (nightly, sandbox creds); unit test asserting the new
  endpoints never echo the password back in a response or error message.
- **Depends on**: T2.2, T3.1 (interface must exist first).

### T3.3 — Notification adapters
- **Files (new)**: `lib/connectors/notify/types.ts`,
  `lib/connectors/notify/teams.ts`, `api/notify/teams.ts` (server-side webhook
  post, relocated from `lib/teamsIntegration.ts`'s card-building logic),
  `lib/connectors/notify/teamcenter.ts` (uses T3.2's endpoints).
- **Files removed**: `lib/teamsIntegration.ts` (logic relocated as above).
- **Files unchanged, documented exception**: `lib/sharepointIntegration.ts`
  stays client-side (MSAL user-delegated auth) — add a code comment and a note
  in `docs/adapters/notify.md` explaining why, so a future contributor doesn't
  "fix" it into the server-side pattern incorrectly.
- **Required tests**: `NotificationSinkAdapter` contract suite; unit test that
  the webhook URL never appears in any browser-reachable response.
- **Depends on**: T2.2, T3.2 (Teamcenter endpoints).

### T3.4 — TURN adapter
- **Files (new)**: `lib/connectors/turn/types.ts`,
  `lib/connectors/turn/cloudflare.ts` (light refactor of
  `api/turn-credentials.ts` to read `tokenIdEnv`/`apiTokenEnv` names from
  config), stub `lib/connectors/turn/selfHostedCoturn.ts` (implemented fully
  in Phase 5 alongside the docker-compose work).
- **Required tests**: `TurnAdapter` contract suite (mock + nightly-live for
  Cloudflare).
- **Depends on**: T2.2.

### T3.5 — Model import adapter
- **Files (new)**: `lib/connectors/modelImport/types.ts`,
  `lib/connectors/modelImport/onshape.ts` (wraps existing
  `api/onshape/translate*.ts`), `lib/connectors/modelImport/genericUpload.ts`
  (formalizes the existing generic-GLTF-loading path in
  `utils/modelLoader.ts` as a first-class no-PLM mode).
- **Required tests**: `ModelImportAdapter` contract suite.
- **Depends on**: T3.1.

### T3.6 — Capture provider interface + `MockProvider` extraction
- **Why**: enables everything in Phase 4 without touching `DialogueEngine.tsx`
  blind.
- **Step 1 (required before Step 2)**: characterization tests for
  `DialogueEngine.tsx`'s current output, per `04-testing-and-ci.md` §5.
- **Step 2**: `lib/connectors/capture/types.ts` (interface per
  `02-connector-adapters.md` §2), `lib/connectors/capture/mock.ts` (current
  `DialogueEngine.tsx` logic extracted behind the interface, **no behavior
  change** — characterization tests from Step 1 must still pass unchanged).
- **Required tests**: characterization tests (Step 1) green after Step 2;
  `CaptureProvider` contract suite passing for `MockProvider`.
- **Depends on**: T2.2, T1.2.

---

## Phase 4 — Real local AI capture

Mirrors `local-capture-plan.md`'s component list and phased estimate almost
directly; the only structural change from that doc is that every piece reads
config from `viewpoint.config.ts`/`.env` (Phase 2 of this breakdown) instead
of a `localStorage` Settings panel, and each new provider must pass the
`CaptureProvider`/`TranscriptionProvider` contract suite from T3.6.

Recommended order, per `local-capture-plan.md`'s own "Strong suggestion for
the first iteration": ship the **batch/post-meeting** path before live
streaming — it's ~1 week, requires no audio-streaming choreography, and
delivers most of the perceived value first.

### T4.1 — `capture-service` skeleton (batch mode)
- **Files (new)**: `capture-service/` (FastAPI or Fastify, per
  `local-capture-plan.md` §"Components" — pick FastAPI unless the team wants
  one language across the stack). Accepts a full meeting audio upload,
  no streaming yet.
- **Depends on**: T3.6.

### T4.2 — Whisper batch transcription
- **Files**: `capture-service` whisper integration (batch, not streaming),
  per `local-capture-plan.md` §"faster-whisper server."
- **Depends on**: T4.1.

### T4.3 — LLM extraction (single-pass, full transcript)
- **Files**: `capture-service` Ollama client, prompt engineering, structured
  output parsing into `InsightCard[]`, per `local-capture-plan.md`
  §"LLM extraction pipeline."
- **Required tests**: contract suite for `CaptureProvider` extended to cover
  `LocalCaptureProvider` (nightly, requires a running Ollama — document how to
  run this suite locally for contributors without CI GPU access).
- **Depends on**: T4.2.

### T4.4 — `LocalCaptureProvider` (frontend)
- **Files**: `lib/connectors/capture/local.ts` — talks to `capture-service`,
  posts the recorded meeting audio at session end, renders returned insights
  as a "post-meeting summary" in the Manager workspace (per
  `local-capture-plan.md`'s MVP suggestion — no live transcript UI yet).
- **Depends on**: T4.3.

### T4.5 — `OpenAIProvider` / `AnthropicProvider`
- **Files**: `lib/connectors/capture/openai.ts`,
  `lib/connectors/capture/anthropic.ts` — proxied through a Vercel function
  (never call these directly from the browser with an API key, per
  `02-connector-adapters.md` §2).
- **Depends on**: T3.6.

### T4.6 — `OllamaDirectProvider`
- **Files**: `lib/connectors/capture/ollamaDirect.ts` — LAN-only browser→Ollama.
- **Depends on**: T3.6.

### T4.7 — Live streaming upgrade (post-MVP)
- Audio streaming choreography, live partial transcripts, PartyKit
  `CAPTURE_AUDIO`/`INSIGHT_CARD` message relay, per
  `local-capture-plan.md`'s full "Data flow during a meeting" section. Explicitly
  sequenced *after* T4.1–T4.6 land and prove out the pipeline in batch mode.
- **Depends on**: T4.4.

### T4.8 — n8n integration (optional)
- `--use-n8n` mode in `capture-service`, per `local-capture-plan.md` §4.
- **Depends on**: T4.3.

---

## Phase 5 — Deployment

### T5.1 — `docker-compose.yml` + `install.sh`
- Per `06-deployment-and-installation.md` §2, writing both `.env` and
  `viewpoint.config.ts` interactively.
- **Depends on**: T2.2, T4.1 (capture-service must exist to containerize it).

### T5.2 — `/api/health`
- Per `05-observability-and-metrics.md` §1, `healthCheck()` added to each
  adapter interface.
- **Depends on**: T3.1–T3.6 (needs the adapter interfaces to exist).

### T5.3 — PLM launch-context deep link
- `resolveLaunchContext()` implemented for Onshape and Teamcenter, per
  `02-connector-adapters.md` §1 — the actual "fire it up from PLM" flow.
- **Depends on**: T3.1, T3.2.

---

## Phase 6 — Docs & polish

### T6.1 — README rewrite (per `07-oss-hygiene-and-licensing.md` §5)
### T6.2 — Self-hosting guide (hardware sizing table from `local-capture-plan.md` §"Ollama")
### T6.3 — `docs/adapters/*.md` — one per category, the contract-testing how-to referenced throughout Phase 3
### T6.4 — First tagged release + `CHANGELOG.md` entry

- **Depends on**: everything above for the given claims to be true when published.
