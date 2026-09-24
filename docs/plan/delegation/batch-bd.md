Plan 14, batch BD: the admin console's foundation, and its People section.

Read `docs/plan/14-rooms-models-admin-ai.md` ("One admin console") and
`docs/plan/13-identity.md` first. This batch is the BD row ONLY: who is an
admin, privileged server access, and managing accounts. Do NOT build the
Rooms, Models or AI sections (BE, BF), and do NOT touch model storage
(`api/models`, `lib/storage/`, `party/room.server.ts` model code) — another
batch is editing those right now; leave any change you see there alone.

Be economical: read the files named. Do NOT run `docker` and do NOT run any
`git` write command. Do not edit anything under `docs/`. Claude tests it live.

## Today (verified)
- `/admin` (`pages/AdminPage.tsx`, 346 lines): Reviews, Label fields,
  Access, Activity sections, behind `lib/access/useAdminGate.ts` — the admin
  PASSPHRASE (`ADMIN_PASSPHRASE_HASH`, `api/admin-unlock.ts`,
  `api/_lib/accessControl.ts` signs an HMAC cookie).
- Identity (plan 13): `identity.mode` none | accounts | sso. GoTrue (service
  `auth`, `http://auth:9999` inside the stack) signs HS256 JWTs with
  `JWT_SECRET`. The api container receives the whole `.env`
  (`env_file: .env`), so it has `JWT_SECRET`.
- `party/verifyJwt.ts` already verifies a GoTrue access token (alg, aud,
  sub, exp, constant-time). Server code in `api/` should REUSE it — move it
  to `lib/auth/verifyJwt.ts` (shared, no DOM) and re-export from the old path
  so the room server keeps compiling, or import it from api directly; your
  call, say which.

## 1. Who is an admin
- `mode: 'none'`: the passphrase, exactly as today. Nothing changes.
- `mode: 'accounts' | 'sso'`: an admin is a signed-in account whose token
  carries `app_metadata.role === 'admin'` (GoTrue puts `app_metadata` in the
  access token). The passphrase is not used in these modes.
- **The first admin:** when an install has no admin account yet, a signed-in
  person opening `/admin` sees "No one administers this install yet. Make
  me the administrator" — one click, allowed ONLY while zero admins exist
  (checked server-side at the moment of the request, not cached). After that
  the button never appears again. Say in the UI that whoever does this first
  becomes the administrator.
- Server helper `api/_lib/adminAuth.ts`: `requireAdmin(req)` → in `none`
  mode, the existing passphrase cookie check; otherwise verify the Bearer
  token (`Authorization` header) and require the admin role. 401 no/invalid
  token, 403 not admin. Every new admin endpoint uses it.

## 2. Privileged access to GoTrue
- `api/_lib/serviceRole.ts`: mints a short-lived (5 min) HS256 JWT
  `{ role: 'service_role', iss: 'supabase', iat, exp }` with `JWT_SECRET`,
  cached until 30 s before expiry. SERVER ONLY — it must never be imported by
  client code (add the file to whatever check prevents that, or add a test
  that greps `dist/` for its marker after build — see how earlier batches
  proved a secret was absent from the bundle).
- GoTrue admin base URL from config: `identity.adminUrl` (optional, default
  `http://auth:9999`), mirroring `identity.probeUrl`.

## 3. People endpoints (`api/admin/users.ts` and friends)
All behind `requireAdmin`, 404 in `mode: 'none'`:
- `GET /api/admin/users` → list (id, email, name, role, created_at,
  last_sign_in_at, disabled) via GoTrue `GET /admin/users`.
- `POST /api/admin/users` `{ email, password, name, admin? }` → create,
  confirmed (`email_confirm: true`), `user_metadata.full_name`, role.
- `PATCH /api/admin/users/:id` `{ admin?, disabled?, name? }` — disabled uses
  GoTrue's `ban_duration` ('876000h' to disable, 'none' to enable).
- `DELETE /api/admin/users/:id`.
- `POST /api/admin/claim` — the first-admin claim (see 1).
- Guards, server-side: an admin cannot remove their own admin role, disable
  or delete themselves; the LAST admin cannot be demoted, disabled or
  deleted. Return 409 with a plain message.
- Errors from GoTrue go to the server log; the response carries a short
  code and a plain sentence (see the security header of
  `api/capture/extract.ts` for the house rule: no upstream bodies).
- Register the routes the way the other api handlers are routed in
  `server/api-server.ts` / Vercel (dynamic segment for `:id` — check how the
  shim handles it, e.g. a `[id].ts` file or a query parameter).

## 4. The screen
- `/admin` becomes a page with a left section list: **People** (new),
  **Reviews** (today's), **Labels**, **Access**, **Activity**. Keep each
  existing section's content exactly as it is; just host it in the new
  frame. Leave room in the list for Rooms / Models / AI (not built — do not
  add placeholders that do nothing).
- People (only in accounts/sso): a table — name, email, role, last sign-in,
  status — with row actions: Make admin / Remove admin, Disable / Enable,
  Delete (with an in-page confirm, never `window.confirm`). "Add person":
  name, email, temporary password (with a repeat field), admin checkbox. Show
  guard errors in plain words.
- In `mode: 'none'` the People item is absent and `/admin` behaves as today.
- The client sends the user's access token (from the Supabase session) as
  `Authorization: Bearer` to the admin endpoints.

## What must not regress
- `mode: 'none'`: `/admin` and the passphrase exactly as today (test).
- The room server still verifies tokens (if you move verifyJwt, its tests
  move/keep passing).
- `JWT_SECRET` and any service-role token never reach the browser bundle.
- `scripts/check-public-env.mjs` `KNOWN` stays empty.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no `as unknown as`.

## Tests
- `requireAdmin`: none-mode passphrase path; no token 401; valid non-admin
  403; admin passes; expired/forged 401.
- Service-role minting: claims, expiry, caching.
- Users endpoints with GoTrue mocked: list/create/patch/delete shapes;
  every guard (self, last admin) returns 409 and calls nothing; claim works
  only with zero admins (and re-checks at request time).
- AdminPage: none mode unchanged; accounts mode shows People; the claim
  banner only when the list reports no admins.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
- Files changed / added; where verifyJwt ended up.
- How the routes with `:id` are wired.
- Anything you deliberately did NOT do, and why.
