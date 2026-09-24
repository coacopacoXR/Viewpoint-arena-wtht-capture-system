# Plan — identity as a deployment choice

Written 2026-09-24. **Status: AX, AY, AZ built, reviewed, verified live and committed the same day** (`aa2d47b`, `9abb01c`, `8e8c4f4`). Left: the "later" row.

The user settled plan 12 §C:

> "I guess it is up to the company how it is gonna be used, either no identity
> at all, SSO or normal accounts. So all those options gotta be available."

So identity becomes a **connector like the others**: one block in
`viewpoint.config.ts`, chosen per deployment, and the default is what ships
today. That also answers the "complement, don't replace" test: a company that
already has SSO keeps its identities there, and this app borrows them.

## The three modes

| `identity.mode` | Who gets in | Names come from | "My reviews" |
|---|---|---|---|
| `none` (default) | today's rules: optional front-door password, knock to join | typed in the lobby, self-asserted | no |
| `accounts` | people with an account on this deployment (email + password) | the account | yes |
| `sso` | people the company's identity provider lets in | the identity provider | yes |

`accounts` and `sso` can be combined (`methods: ['password', 'azure']`, e.g.
staff via SSO plus a few external suppliers with local accounts), and both
take `allowGuests: boolean`: when true, a person without an account can still
knock on a room and be admitted by the host as a named guest. That keeps a
review with an outside supplier possible in a locked-down deployment.

## The decision: Supabase Auth (GoTrue), not our own

The self-hosted stack already mirrors Supabase (Postgres, PostgREST at
`/rest/v1/`, Realtime, one `JWT_SECRET` signing everything), and a Vercel
deployment uses a Supabase project, which has Auth built in. So:

- **Self-hosted:** add the `supabase/gotrue` container (pinned, currently
  v2.197.0) behind nginx at `/auth/v1/`, signing with the same `JWT_SECRET`.
  It only starts when identity is not `none` (a compose profile), so a default
  install is unchanged.
- **Vercel / Supabase cloud:** turn on the providers in the Supabase dashboard;
  nothing to run.
- **Why not write our own:** password storage, reset flows, OIDC and SAML are
  exactly the code that should not be home-grown in a project other companies
  will audit. GoTrue gives email/password, Microsoft Entra ID (`azure`),
  Google, Keycloak (generic enough for most OIDC set-ups) and SAML 2.0
  (Okta, ADFS, Entra, Google Workspace), all maintained upstream.
- **What it buys downstream:** the browser's Supabase client carries the
  signed-in user's JWT, so Row Level Security can say "you can see reviews you
  took part in" with `auth.uid()`, and the room server can verify the same JWT
  with `JWT_SECRET`, so a signed-in name cannot be spoofed in a room.

## How the existing access pieces fit

- **Front-door password:** only meaningful in `none`. In `accounts`/`sso`
  signing in IS the front door; the installer does not ask for it.
- **Knock to join:** stays in every mode. Identity says who you are; the host
  still decides who enters a given room.
- **Admin passphrase:** stays for now. Later: an `admin` role on the account
  (GoTrue `app_metadata`) replaces it when identity is on.
- **Self-asserted names:** only in `none`, and for guests (marked as guests).

## Batches

| Batch | Work | Size |
|---|---|---|
| AX | Config schema `identity` block + validation; GoTrue in compose (profile), nginx `/auth/v1/`, installer question; `/api/public-config` exposes mode and methods (no secrets). **Verified live**: sign up, sign in, JWT accepted by PostgREST. | medium |
| AY | Sign-in page (password and one button per SSO method), session handling, the gate when a mode requires it, account name replaces the typed name, guests marked. | medium |
| AZ | "My reviews": `review_participants` table + RLS, recorded when a signed-in person joins a room; a list in the lobby. Room server verifies the JWT on join. | medium |
| later | Admin role instead of the passphrase; user list in `/admin`; SAML provider registration helper. | — |

Each batch lands with the stack running for real (see the lesson in
EXECUTION-LOG: infra that compiles is not infra that works).
