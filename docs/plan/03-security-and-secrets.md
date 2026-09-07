# Security & Secrets

## 1. Findings from the pre-plan repo survey (2026-09-04)

| Finding | Severity | Fix |
|---|---|---|
| `lib/teamcenterIntegration.ts` stores the Teamcenter **password in plaintext** in `localStorage` (`vp_tc_config`), and/or reads it from `VITE_TC_PASSWORD` | **High** — plaintext credential persisted in browser storage; XSS or shared-machine access exfiltrates it. `VITE_`-prefixed vars are also bundled into the shipped JS at build time, so setting it as a build-time env var ships the password in the app itself. | Move Teamcenter calls server-side (`api/teamcenter/*`), matching the Onshape pattern. See `02-connector-adapters.md` §1. Task breakdown T3.2. |
| `lib/teamsIntegration.ts` reads the Teams webhook URL from `VITE_TEAMS_WEBHOOK_URL` or `localStorage` and posts to it directly from the browser | **Medium** — a webhook URL is a bearer credential (anyone who has it can post to the channel); exposing it client-side means any user of the app can extract and reuse it outside the app. | Move server-side (`api/notify/teams.ts`). Task breakdown T3.3. |
| No `LICENSE`, no `license` field in `package.json` | **Blocking for OSS** | See `07-oss-hygiene-and-licensing.md`. |
| Two `.glb` binary assets of a named commercial product (`sennheiser_momentum_4_headphones.glb`) checked into the repo | **Potentially blocking — legal, not technical** | See `07-oss-hygiene-and-licensing.md` §"asset provenance" — needs your explicit confirmation before any public push. |
| No dependency vulnerability scanning, no secret-scanning, no CI at all | **Medium — process gap** | Phase 1 of task breakdown. |

Positives worth keeping as the pattern to copy: `api/_lib/onshape.ts` (HttpOnly
cookies, server-only client secret, clean 401 handling) and
`api/turn-credentials.ts` (short-TTL server-side token exchange, no secret
literals). `.env.local` was never committed and `.gitignore` correctly covers
`*.local`.

## 2. The Vite `VITE_*` footgun — document this explicitly

Any environment variable prefixed `VITE_` is inlined into the built JavaScript
and shipped to every browser that loads the app. This is by design (Vite's
docs call it out) but is easy to miss — it's exactly how the Teamcenter
password issue above can happen. Rule for this repo, enforced by a
`04-testing-and-ci.md` CI check (grep for `VITE_` env names that look secret —
`*_SECRET`, `*_PASSWORD`, `*_TOKEN` excluding the two explicitly-approved
exceptions):

- `VITE_SUPABASE_ANON_KEY` — **approved exception**. Supabase anon keys are
  meant to be public; access control is enforced by Postgres Row Level
  Security, not by hiding the key.
- Every other secret-shaped value must go through a non-`VITE_`-prefixed env
  var, read only in `api/*` functions or `capture-service`.

## 3. Master-config secret handling (recap from `01-architecture-and-master-config.md`)

- Config file stores env var **names**, never values.
- `loadConfig.ts` fails fast at server startup if an enabled connector's
  referenced env var is unset — no silent fallback, no runtime surprise mid-session.
- Logging: never print a resolved secret value. Log `{ connector: 'plm', provider: 'onshape', configured: true }`, never the token/password itself.

## 4. CI security gates (Phase 1 of task breakdown)

- **Secret scanning**: `gitleaks` as a required CI check on every PR, plus a
  one-time full-history scan (`gitleaks detect --source . --log-opts="--all"`)
  run once before the repo goes public, even though the initial survey found
  nothing tracked — a full-history scan is cheap insurance and should be the
  actual gate, not the survey's spot-check.
- **Dependency vulnerabilities**: `npm audit --production` in CI (fail on
  high/critical), plus Dependabot or Renovate configured for automated PRs on
  the rest.
- **The `VITE_*` secret-shape check** from §2, as a small custom script
  (`scripts/check-public-env.mjs`) run in CI, not a manual review step.

## 5. Threat model for self-hosted deployments

Once this ships as a docker-compose stack an org runs on their own network
(`06-deployment-and-installation.md`), the app's security boundary changes:
TLS termination, network segmentation, and host hardening become the org's
IT's responsibility, not the app's. The plan's job is to make that boundary
explicit, not to assume it:

- `install.sh` defaults to self-signed TLS via the bundled `nginx-proxy` and
  clearly warns this is not production-grade; document the Let's-Encrypt path
  for orgs with a real domain, per `local-capture-plan.md`.
- `capture-service`'s auth to PartyKit is a shared secret in the compose
  `.env` (per `local-capture-plan.md`'s "Open questions" — resolved here:
  yes, shared secret for v1, JWT is a v2 nice-to-have, not a blocker).
- Document (README, self-hosting guide) that audio/transcript data never
  leaves the docker-compose network when `capture.provider = 'local'` — this
  is the actual privacy claim orgs will need to validate before procurement
  approves it, so it must be accurate and specific, not marketing language.

## 6. `SECURITY.md` (new file, Phase 0 of task breakdown)

Standard OSS vulnerability disclosure doc: how to report privately (email or
GitHub private security advisory, your choice), expected response time,
supported versions. Required before any public repo with real users —
otherwise a reporter's only option is a public issue, which is how
vulnerabilities get exploited before they're fixed.
