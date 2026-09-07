# Deployment & Installation

Two first-class deployment modes. Neither is a "someday" mode — both need to
work at OSS launch, because the pitch (small team demo *and* big-corp
air-gapped self-host) depends on both.

## 1. Cloud-hybrid (current default, keep as the fast-start path)

Vercel (app + `api/*` functions) + Cloudflare Realtime (TURN) + hosted
Supabase + PartyKit's own cloud. This is what the repo does today. After this
plan: capture defaults to `MockProvider` unless the org opts into
`OpenAIProvider`/`AnthropicProvider` in `viewpoint.config.ts`. Good for demos,
evaluation, and small teams who are fine with cloud dependencies.

Setup remains roughly what it is today, updated for the master config:
`vercel env pull` (or manual `.env`), copy `viewpoint.config.example.ts` →
`viewpoint.config.ts`, fill in provider choices, `vercel deploy`.

## 2. Self-hosted / air-gapped (new — adopts `local-capture-plan.md` almost as-is)

The full docker-compose stack from `local-capture-plan.md` §"Installation,"
with one change throughout: every service reads `viewpoint.config.ts` + `.env`
(the master config from `01-architecture-and-master-config.md`) instead of
ad-hoc environment variables, so the install flow actually matches what you
described — an org clones the repo, edits one local file, deploys.

Services (as specified in `local-capture-plan.md`, referenced not
re-derived): `app` (nginx serving the Vite build), `partykit` (self-hosted
node-mode server, or point at their own Cloudflare-hosted PartyKit — document
both), `capture-service` (new Python/FastAPI or Node/Fastify service),
`whisper` (`faster-whisper-server`), `ollama`, `postgres` (self-hosted
Supabase image or plain `postgres:16` — Realtime is optional in fully-local
mode), `n8n` (optional, `--profile n8n`), `nginx-proxy` (TLS termination, self-
signed by default).

### `install.sh` — updated responsibilities

1. Detect OS, abort cleanly on native Windows with WSL guidance (unchanged
   from `local-capture-plan.md`).
2. Install Docker + Compose if missing.
3. Clone/download the release tarball.
4. **Interactive prompts, writing BOTH `.env` (secrets only) and
   `viewpoint.config.ts` (the master config)** — this is the actual
   corp-facing "adapt to our infra" flow:
   - Which PLM? (Onshape / Teamcenter / none-manual-upload) → writes
     `plm.provider` + prompts for the relevant `*Env` names' values into `.env`.
   - Which capture backend? (mock / local-whisper+ollama / OpenAI / Anthropic)
     → writes `capture.provider` + pulls the chosen Ollama model if `local`.
   - Cloud or self-hosted DB? → writes `db.provider` + connection env.
   - Which notification sinks to enable? → writes `notifications[]`.
   - Public hostname, GPU profile y/n.
5. `docker compose --profile <cpu|gpu> up -d`.
6. `ollama pull <model>` inside the Ollama container (if `capture.provider = 'local'`).
7. Apply the Postgres migration (`docs/supabase-schema.sql`).
8. Poll `GET /api/health` (from `05-observability-and-metrics.md`) until all
   *enabled* connectors report `ok`, then print the final URLs — don't declare
   success just because the containers started; prove the config actually
   resolves.

### Bare-metal alternative

Unchanged from `local-capture-plan.md`: `bare-metal-install.sh` for orgs that
won't run Docker (Ollama's official installer, Python venv for
`capture-service`, systemd units). Document but recommend docker-compose as
the default path.

## 3. Environment tiers

| Tier | Config | Purpose |
|---|---|---|
| Local dev | `viewpoint.config.ts` all `mock`/default providers, no external accounts | `npm run dev` works immediately after `npm install`, matches the "local dev works with zero accounts" principle in `00-overview.md`. |
| Staging | Real sandbox credentials (Onshape sandbox app, Teamcenter test env, Cloudflare test TURN app) | Where the nightly live-adapter CI job and manual QA run. |
| Production | Org's real infra | Cloud-hybrid or self-hosted per §1/§2. |

## 4. Versioning & upgrades

- Tag releases (`v0.1.0` onward — see `07-oss-hygiene-and-licensing.md` for
  `CHANGELOG.md`).
- Self-hosted upgrade path: `docker compose pull` + a documented migration
  script for any Postgres schema changes between versions (the schema is
  already tracked in `docs/supabase-schema.sql`; add a `docs/migrations/`
  directory once the first post-v1 schema change happens, not preemptively).
- Cloud-hybrid upgrade path: standard Vercel redeploy; no special handling
  needed beyond the normal CI gates.
