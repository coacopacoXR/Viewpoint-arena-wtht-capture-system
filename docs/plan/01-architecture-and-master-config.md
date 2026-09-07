# Architecture & the Master Config File

## 1. Current architecture (as of `planning/oss-enterprise-readiness`)

```
Browser (Vite SPA)
  ├─ React Three Fiber scene, Zustand store (store.ts, 835 lines)
  ├─ DialogueEngine.tsx — simulated conversation (1106 lines, no AI provider wired)
  ├─ WebRTC (lib/WebRTCContext.tsx) ──uses──> TURN creds from api/turn-credentials.ts
  ├─ PartySocket client (lib/usePartyPresence.ts) ──ws──> PartyKit room (party/room.server.ts)
  ├─ Supabase client (lib/supabase.ts) ──> hosted Postgres (tracker_*, review_curations)
  ├─ Onshape flows ──> api/onshape/* (Vercel fns, HttpOnly-cookie OAuth — good pattern)
  └─ Teamcenter / Teams / SharePoint clients (lib/*Integration.ts) ──> called DIRECTLY
     from the browser, credentials from VITE_* env or localStorage — the pattern
     to fix (see 03-security-and-secrets.md)

Vercel serverless functions (api/)
  └─ Only real server-side surface today: Onshape OAuth + GLTF translate, TURN
     credential exchange. Both correctly keep secrets server-side.

PartyKit (party/room.server.ts)
  └─ Realtime relay + room state. No ML/inference workload (by design).
```

Everything is single-tenant, single-deployment: one Onshape OAuth app, one
Supabase project, one Cloudflare TURN app. That's fine — see Non-goals in
`00-overview.md`.

## 2. Target architecture

Same shape, plus two structural additions:

1. A **master config file** (`viewpoint.config.ts`) that declares which
   adapter implementation is active per connector category, and non-secret
   settings for each (base URLs, model names, feature flags). Committed as
   `viewpoint.config.example.ts`; the real file is git-ignored, one per
   deployment, edited by the org's IT team.
2. A **connector adapter layer** (`lib/connectors/<category>/`) — every
   external system integration implements a documented interface. Onshape and
   Cloudflare TURN already follow this shape informally; Teamcenter/Teams do
   not yet (they call the third party directly from browser code). Full
   contracts are in `02-connector-adapters.md`.

```
Browser (Vite SPA)
  ├─ imports lib/config/publicConfig.ts (NON-secret subset only, fetched from
  │  GET /api/public-config at runtime — never baked into the JS bundle, so one
  │  built artifact/Docker image can be pointed at different configs)
  └─ all adapter calls that need a secret go through api/<category>/* instead
     of calling the third party directly

Vercel functions / capture-service (self-hosted)      viewpoint.config.ts + .env
  ├─ lib/config/loadConfig.ts  ─────────────reads─────────┘  (server-only, fail-fast
  │     on missing env for any *enabled* connector)
  ├─ lib/connectors/plm/{onshape,teamcenter,types}.ts
  ├─ lib/connectors/capture/{mock,local,openai,anthropic,ollamaDirect,types}.ts
  ├─ lib/connectors/turn/{cloudflare,selfHostedCoturn,types}.ts
  ├─ lib/connectors/notify/{teams,sharepoint,teamcenter,jira,email,types}.ts
  └─ lib/connectors/modelImport/{onshape,genericGltf,types}.ts
```

## 3. Why config *and* env, not one or the other

- **`viewpoint.config.ts`**: structural, non-secret, safe to eyeball in a code
  review or bug report. Answers "which PLM are we using and what's its base
  URL" — never "what's the password."
- **`.env` / secret manager**: only raw secret *values*. The config file
  references them by **name**, never by value:

  ```ts
  // viewpoint.config.example.ts
  import { defineConfig } from './lib/config/schema';

  export default defineConfig({
    plm: {
      provider: 'onshape',
      baseUrl: 'https://cad.onshape.com',
      clientIdEnv: 'ONSHAPE_CLIENT_ID',
      clientSecretEnv: 'ONSHAPE_CLIENT_SECRET',
    },
    capture: {
      provider: 'mock',            // 'mock' | 'local' | 'openai' | 'anthropic' | 'ollamaDirect'
    },
    turn: {
      provider: 'cloudflare',
      tokenIdEnv: 'CF_TURN_TOKEN_ID',
      apiTokenEnv: 'CF_TURN_API_TOKEN',
    },
    db: {
      provider: 'supabase',
      urlEnv: 'VITE_SUPABASE_URL',      // exception: this one IS public by design —
      anonKeyEnv: 'VITE_SUPABASE_ANON_KEY', // Supabase anon key + RLS is meant to be client-safe
    },
    notifications: [
      { provider: 'teams', webhookUrlEnv: 'TEAMS_WEBHOOK_URL' },
    ],
    modelImport: { provider: 'onshape' },
  });
  ```

- **Loader behavior** (`lib/config/loadConfig.ts`, server-only, throws — never
  silently falls back): for every connector marked enabled, verify every
  `*Env` name it references resolves to a non-empty `process.env` value at
  startup. Missing → crash with a clear message (`"plm.clientSecretEnv
  'ONSHAPE_CLIENT_SECRET' is not set"`), not a runtime 500 later during a
  user's session.
- Logging must never print resolved secret values — only which connectors are
  configured (`{ plm: 'onshape (configured)', capture: 'mock' }`).

## 4. Client/server split for config

The frontend must never import `viewpoint.config.ts` directly (it can contain
`*Env` **names**, which are harmless, but importing the whole file risks
someone later adding a raw value to it and shipping it in the bundle). Instead:

- `GET /api/public-config` (new Vercel function) — server loads the full
  config, strips every `*Env`/secret-bearing field, returns only what the UI
  needs to render (which providers are active, their display names, feature
  flags, non-secret base URLs for anything the browser calls directly, like
  Onshape's public API host).
- `lib/config/publicConfig.ts` — a thin client-side fetch-and-cache wrapper
  around that endpoint, used anywhere the UI currently reads `import.meta.env`
  or `localStorage` for integration settings.

This also solves the self-hosted Docker case: the same built `app` image works
against any org's config because config is resolved at runtime by the server,
not at Vite build time.

## 5. Directory changes this implies

```
viewpoint.config.example.ts    NEW — committed template
viewpoint.config.ts            NEW — git-ignored, per-deployment (add to .gitignore)
lib/config/
  schema.ts                    NEW — zod schema + defineConfig()
  loadConfig.ts                NEW — server-side loader, fail-fast validation
  publicConfig.ts              NEW — client-side fetch wrapper
api/public-config.ts           NEW — serves redacted config to the browser
api/teamcenter/*.ts            NEW — server-side Teamcenter calls (see 03, 08)
api/notify/*.ts                NEW — server-side notification sends (see 03, 08)
lib/connectors/<category>/     NEW — adapter interfaces + implementations (see 02)
lib/teamcenterIntegration.ts   REMOVED — logic moves into api/teamcenter/* + lib/connectors/plm/teamcenter.ts
lib/teamsIntegration.ts        REMOVED — logic moves into api/notify/* + lib/connectors/notify/teams.ts
```

`api/_lib/onshape.ts`'s HttpOnly-cookie pattern and `api/turn-credentials.ts`'s
env-driven short-lived-token pattern are the two reference implementations
already in the repo — new adapters should read like these, not like the
current Teamcenter client.

## 6. Reconciling with the self-hosted capture stack

`local-capture-plan.md`'s `capture-service` (Python/Node, in the docker-compose
stack) is a separate long-running process, not a Vercel function. It reads the
**same** `viewpoint.config.ts` + `.env` at container startup (mount both as
volumes into the container; if `capture-service` is Python, either port
`loadConfig.ts`'s validation logic or have the Node `app` container validate
config once at boot and fail the whole `docker compose up` if invalid, so a
Python service doesn't need its own copy of the validation logic — see
`06-deployment-and-installation.md` for the exact compose wiring).
