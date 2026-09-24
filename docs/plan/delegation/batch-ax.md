Identity, part 1 of 3: the configuration and the sign-in service.

Read `docs/plan/13-identity.md` first (it is short) — it is the design, and it
was decided by the user and Claude. This batch builds the "AX" row of its
table. Do not start AY or AZ (no sign-in page, no "my reviews").

Do NOT run any `git` write command (`commit`, `add`, `push`, `checkout`,
`reset`, `stash`). Do not edit anything under `docs/` except as stated. You
MAY run `docker compose config` to validate the compose file, but do NOT run
`docker compose up/build/down` — Claude runs the stack for real afterwards on
a live install and will test exactly the things listed under "Live checks".

## 1. The config block (`lib/config/schema.ts`)
Add `identity` to the master schema, OPTIONAL, defaulting to `{ mode: 'none' }`
so every existing config stays valid:

```ts
identity:
  | { mode: 'none' }
  | { mode: 'accounts' | 'sso';
      methods: Array<'password' | 'azure' | 'google' | 'keycloak' | 'saml'>; // min 1
      allowGuests: boolean;            // default false
      // per SSO method, the NAMES of env vars holding client id/secret
      azure?:    { clientIdEnv, secretEnv, tenantUrl? }
      google?:   { clientIdEnv, secretEnv }
      keycloak?: { clientIdEnv, secretEnv, realmUrl }
    }
```
Rules (with tests in `lib/config/__tests__/schema.test.ts`):
- `mode: 'accounts'` must include `'password'` in `methods`.
- `mode: 'sso'` must include at least one of azure/google/keycloak/saml.
- Every SSO method listed must have its sub-block (except `saml`, which is
  registered later through the admin API and needs no env here).
- `*Env` fields follow the existing `envVarName` rule (no `VITE_`), so
  `checkEnvVars` enforces that the secrets are set.
- Update `viewpoint.config.example.ts` with the block (mode `none`) and a
  commented `sso` example.

## 2. What the browser may know (`lib/config/redact.ts`, `/api/public-config`)
Expose `identity: { mode, methods, allowGuests }` — no env names, no ids, no
secrets. `redact.ts` is an allowlist built field by field; keep it that way
and extend its tests, including one proving a client id env NAME does not
appear in the public object.

## 3. The service (`docker-compose.yml`)
- New service `auth`: image `supabase/gotrue:${GOTRUE_IMAGE_TAG:-v2.197.0}`,
  in a compose **profile** `identity`, on the backend network, depending on
  `db` being healthy. The installer enables the profile only when identity is
  not `none` (see 5), so a default install runs exactly what it runs today.
- Environment (the variable names are GoTrue's; check each against the
  upstream `supabase/auth` example.env / README for v2.197 and fix any that
  are wrong — say in the report which you checked):
  `GOTRUE_API_HOST=0.0.0.0`, `GOTRUE_API_PORT=9999`, `API_EXTERNAL_URL`
  (the public https URL + `/auth/v1`), `GOTRUE_DB_DRIVER=postgres`,
  `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@db:5432/postgres`,
  `GOTRUE_SITE_URL` (the public URL), `GOTRUE_URI_ALLOW_LIST` (same),
  `GOTRUE_JWT_SECRET=${JWT_SECRET}`, `GOTRUE_JWT_EXP=3600`,
  `GOTRUE_JWT_AUD=authenticated`, `GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated`,
  `GOTRUE_JWT_ADMIN_ROLES=service_role`, `GOTRUE_DISABLE_SIGNUP` (from .env;
  see 5), `GOTRUE_EXTERNAL_EMAIL_ENABLED`, `GOTRUE_MAILER_AUTOCONFIRM=true`
  (no mail server in the stack; say so in INSTALL notes via the report), and
  the `GOTRUE_EXTERNAL_{AZURE,GOOGLE,KEYCLOAK}_{ENABLED,CLIENT_ID,SECRET,
  REDIRECT_URI,URL}` family, all read from .env with empty defaults, redirect
  URI = public URL + `/auth/v1/callback`. SAML: `GOTRUE_SAML_ENABLED` and
  `GOTRUE_SAML_PRIVATE_KEY` from .env (empty default = off).
- A healthcheck on `http://localhost:9999/health`.

## 4. The database role — including EXISTING installs
`deploy/db/roles.sql` deliberately skips `supabase_auth_admin` (read its
header). GoTrue logs in as that role, and `roles.sql` only runs on a FRESH
data volume — so an existing install would never get the password. Handle
both:
- Fresh volume: add `ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';`
  to `roles.sql` (the image does create that role; say how you confirmed it).
- Existing volume: a one-shot `auth-init` service in the same `identity`
  profile (image: the same `supabase/postgres` image, or `postgres` client
  image) that runs, as `supabase_admin` with `POSTGRES_PASSWORD`, an
  idempotent script: set the `supabase_auth_admin` password, and make sure the
  `auth` schema exists and is owned by `supabase_auth_admin` (GoTrue runs its
  own migrations inside it). `auth` depends on `auth-init` completing
  successfully (`condition: service_completed_successfully`).
- Put the SQL in `deploy/db/auth-init.sql` with a header explaining why it
  exists.

## 5. nginx and the installer
- `deploy/nginx/proxy.conf`: `location /auth/v1/` → `http://auth:9999/`,
  written EXACTLY like the `/rest/v1/` block (resolver + variable + explicit
  `rewrite ^/auth/v1/(.*)$ /$1 break;`), so nginx still starts when the
  profile is off; a request then gets 502. Rate-limit it with the existing
  `limit_req` pattern (sign-in endpoints are brute-force targets): add a zone
  for `/auth/v1/token` at 10r/m burst 10.
- `install.sh`: one new question after the access questions:
  "How do people sign in? 1) No accounts (as today) 2) Accounts on this
  install (email + password) 3) Company single sign-on". For 3, ask which
  provider (Microsoft Entra ID / Google / Keycloak / SAML later) and its
  client id and secret (secret with `ask_secret`), and the tenant/realm URL
  where needed. For 2 and 3 ask "Can people without an account join as
  guests when the host admits them?" (yes/no) and, for 2, "Can anyone create
  an account, or only people you add?" → `GOTRUE_DISABLE_SIGNUP`.
  Write the answers to `.env` and to the `identity` block of the generated
  `viewpoint.config.ts` (see how the installer already writes that file), set
  `COMPOSE_PROFILES` to include `identity` when needed (check how the
  installer already sets profiles), and skip the front-door-password question
  when identity is on (signing in is the door — say so in the prompt text).
  Follow the installer's existing style exactly, and extend its tests if it
  has them (`lib/config/__tests__/installerOutput.test.ts`, `deploy/__tests__/`).
- `.env.example`: the new variables, commented, grouped under "Identity".

## 6. Health
`/api/health` gets an `identity` connector entry: `none` → "no external
dependency"; otherwise probe `http://auth:9999/health` (an optional
`identity.probeUrl` in the config, like `db.probeUrl`, because the public URL
is not reachable from inside the api container). Mirror how `db` does it in
`lib/health/`.

## Live checks Claude will run afterwards (make them pass)
1. On an EXISTING install with identity switched to `accounts`: `auth-init`
   completes, `auth` is healthy, `/api/health` shows identity ok.
2. `curl -X POST https://localhost/auth/v1/signup` with the anon key and an
   email/password creates a user; `.../token?grant_type=password` returns an
   access token; PostgREST accepts that token (`/rest/v1/` with
   `Authorization: Bearer <token>` does not 401).
3. With identity `none`, `docker compose ps` shows no `auth` container and
   nothing else changed.

## What must not regress
- Every existing config still validates (identity optional).
- Default install: same services, same behaviour.
- `scripts/check-public-env.mjs`'s `KNOWN` map stays empty; no `VITE_` secret.
- No `any`, no `eslint-disable`, no `@ts-ignore`. Fix code, not assertions.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run check:env
docker compose config -q && echo compose-ok
docker compose --profile identity config -q && echo compose-identity-ok
bash -n install.sh && echo install-syntax-ok
```

## Report
- Files changed / added.
- Each GoTrue env var name: confirmed against upstream, or not.
- How you confirmed the image creates `supabase_auth_admin`.
- Anything you deliberately did NOT do, and why.
