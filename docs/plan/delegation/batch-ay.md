Identity, part 2 of 3: signing in, in the browser.

Read `docs/plan/13-identity.md` first (short). Part 1 is committed: the
`identity` config block, the GoTrue service at `/auth/v1/`, and
`/api/public-config` exposing `identity: { mode, methods, allowGuests }`
(`mode` is `'none' | 'accounts' | 'sso'`; `methods` from
`'password' | 'azure' | 'google' | 'keycloak' | 'saml'`). This batch is the
"AY" row. Do NOT build "my reviews" or server-side token checks (that is AZ).

Be economical: read the files named. Do NOT run `docker`, and do NOT run any
`git` write command (`commit`, `add`, `push`, `checkout`, `reset`, `stash`).
Do not edit anything under `docs/`. Claude tests it live afterwards against a
running GoTrue.

## Where things are
- `App.tsx`: `ConfigProvider` → `AccessGate` (the optional front-door
  password, `components/…/AccessGate*` — find it) → routes (`/`, `/room/:id`,
  `/review/:id/setup`, `/tracker`, `/admin`, `/launch`).
- `lib/config/ConfigContext.tsx`: how the browser reads public config
  (`useConfig()` or similar — read it).
- `lib/supabase.ts`: the one Supabase client. On the self-hosted stack its URL
  is the site origin, so `supabase.auth.*` calls land on `/auth/v1/…`, which
  nginx proxies to GoTrue. Keep the "not configured" fallback working.
- `lib/identity.ts`: today's identity is `{ name, color, role?, team? }` in
  `localStorage['vp_user']`, typed in the lobby. MANY components read
  `vp_user` directly (grep `vp_user`). Do not rewrite them: keep `vp_user` as
  the one place the display name lives, and have sign-in WRITE it.
- `pages/LobbyPage.tsx`: the name/colour/role form, "Start new session",
  "Curate a design review", join by code, saved reviews.

## Behaviour, per mode (decided — do not redesign)

**`mode: 'none'`** — exactly today. No sign-in UI anywhere. This is the
default and must not change by a single pixel; a test must pin it.

**`mode: 'accounts' | 'sso'`**, not signed in:
- Every route except `/room/:id` (and only when `allowGuests`) shows a
  **sign-in page** (`pages/SignInPage.tsx`) instead of the page asked for,
  and returns to the page asked for after signing in (keep the path and
  `location.state`, e.g. the `joinRoomId` a room link carries).
- The sign-in page shows, depending on `methods`:
  - `'password'`: email + password form → `supabase.auth.signInWithPassword`.
    A "Create an account" switch → `supabase.auth.signUp` — shown only when
    GoTrue allows sign-up: fetch `GET /auth/v1/settings` (public, needs the
    anon key as `apikey` header) and read `disable_signup`. The self-hosted
    GoTrue auto-confirms, so sign-up signs you straight in; if the response
    has no session (a provider that requires email confirmation, e.g. hosted
    Supabase), say "Check your email to confirm your account."
  - one button per SSO method: "Continue with Microsoft" (`azure`),
    "Continue with Google", "Continue with Keycloak" (label it with the
    organisation's words later; plain for now) →
    `supabase.auth.signInWithOAuth({ provider, options: { redirectTo:
    window.location.origin + <the page asked for> } })`. For `azure` pass
    `scopes: 'email'`. `saml` is listed in config but has no button until
    part 3 registers a provider — render nothing for it, and say so in a
    code comment.
  - Errors in plain words: wrong password → "That email and password don't
    match." Rate-limited (HTTP 429 from nginx) → "Too many attempts. Wait a
    minute and try again." Anything else → the message without internals.
- **Guests** (`allowGuests: true`): a room link (`/room/:id`, or the lobby
  reached with `state.joinRoomId`) additionally offers "Join as a guest" →
  the existing name/colour form, then the existing knock flow. Guests can
  ONLY enter that room: starting a session, curating, the tracker and admin
  still require sign-in. Store `guest: true` in `vp_user` and show guest
  names with a "(guest)" suffix wherever a participant's name is rendered
  from presence — at least the participants panel, the knock prompt
  (`JoinRequests`), and the room's name tags; grep for where `name` from
  `remoteParticipantList` is rendered and cover the main ones. The suffix
  comes from a `guest` flag carried in presence (`ParticipantPresence`
  gets `guest?: boolean`, filled in `broadcastPresence` from `vp_user`, the
  same way the follow fields were added), not from the name string.

**`mode: 'accounts' | 'sso'`**, signed in:
- On sign-in (and on every `onAuthStateChange` with a session), write
  `vp_user.name` from the account: `user_metadata.full_name ??
  user_metadata.name ?? <email before the @>`; keep the user's existing
  `color` (or pick one); `guest` false. Add `accountId` (the user id) to
  `vp_user` for part 3.
- The lobby: no name field (the name comes from the account); a compact
  "Signed in as <name> · Sign out" line where the name form was; colour and
  role pickers stay. Everything else works as today.
- Sign out → `supabase.auth.signOut()`, clear `accountId`/name from
  `vp_user`, back to the sign-in page.

## Structure
- `lib/auth/useAuth.ts`: one hook that owns the session (`getSession` on
  mount + `onAuthStateChange`, unsubscribe on unmount), exposes
  `{ status: 'loading' | 'signedOut' | 'signedIn' | 'guest', user, signOut }`,
  and does the `vp_user` sync. Pure helpers it uses (display name from a user
  object; which buttons for which methods; whether a path is guest-allowed)
  go in `lib/auth/authRules.ts` and are unit-tested.
- `components/auth/IdentityGate.tsx`, placed in `App.tsx` INSIDE
  `AccessGate`, wrapping the routes. With `mode: 'none'` it renders its
  children and nothing else, without calling Supabase at all.
- While the public config or the session is still loading, render the same
  neutral loading state the app already uses (look at AccessGate), not the
  sign-in page — no flash of the sign-in form for a signed-in user.

## Look
Match the lobby's existing visual language exactly (it is the dark
"VIEWPOINT ARENA" split screen: left brand column, right form column — reuse
its layout and classes; read LobbyPage for them). The sign-in page is that
same frame with the form on the right. No new colours or fonts.

## What must not regress
- `mode: 'none'` identical to today (test: IdentityGate renders children and
  never calls `supabase.auth`).
- The front-door password gate (`AccessGate`) still works and still comes
  first.
- Room join / knock flow, the phone room view, `/launch` deep links.
- `scripts/check-public-env.mjs`'s `KNOWN` map stays empty.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no `as unknown as`.

## Tests
- `authRules`: display-name fallback chain; buttons per methods (saml → no
  button); guest-allowed paths (`/room/x` yes when allowGuests, `/tracker`
  never, `/` only with a `joinRoomId`).
- `IdentityGate` with a mocked config + mocked `supabase.auth`: none →
  children, no auth calls; accounts + signed out → sign-in page; accounts +
  signed in → children; loading → no sign-in form.
- `SignInPage`: password submit calls `signInWithPassword` with the fields;
  a 400 shows the plain message; a 429 shows the wait message; the sign-up
  switch is hidden when settings say `disable_signup: true`.
- Presence: `guest` goes out in `broadcastPresence` and a guest's name is
  shown with "(guest)" in the participants panel.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
- Files changed / added.
- Every place a "(guest)" suffix is rendered, and any you knowingly skipped.
- Anything you deliberately did NOT do, and why.
