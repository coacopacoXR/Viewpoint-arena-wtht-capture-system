Identity, part 3 of 3: "the reviews I have been part of", and names the room
server can trust.

Read `docs/plan/13-identity.md` (short). Parts 1 and 2 are committed:
GoTrue at `/auth/v1/` signing with the stack's `JWT_SECRET`; `IdentityGate`,
`SignInPage`, `lib/auth/useAuth.ts` (session owner; writes `vp_user` with
`name`, `color`, `guest`, `accountId`); presence carries `guest?: boolean`.
With `identity.mode: 'none'` NOTHING in this batch may change behaviour.

Be economical: read the files named. Do NOT run `docker`, and do NOT run any
`git` write command (`commit`, `add`, `push`, `checkout`, `reset`, `stash`).
Do not edit anything under `docs/` EXCEPT `docs/supabase-schema.sql`, which is
the schema file the stack applies (see 1). Claude tests all of this live.

## 1. The table (`docs/supabase-schema.sql`)
It is mounted into the db's first-boot init AND re-applied by `install.sh`
(~line 1894) on every run, so it must be **idempotent** — follow the existing
style in that file (`create table if not exists`, `drop policy if exists`
then `create policy`).

```sql
review_participants (
  review_id  text        not null,   -- the room id (= review id for curated reviews)
  user_id    uuid        not null default auth.uid(),
  role       text        not null default 'participant',  -- 'host' | 'participant'
  first_joined_at timestamptz not null default now(),
  last_joined_at  timestamptz not null default now(),
  primary key (review_id, user_id)
)
```
RLS on, with policies for the `authenticated` role only:
- select: `user_id = auth.uid()` (you see your own rows, nobody else's);
- insert: `user_id = auth.uid()`;
- update: `user_id = auth.uid()` (to bump `last_joined_at` / role).
No anon policies: a deployment on `mode: 'none'` never writes here, and the
anon key must not be able to read who took part in what. `auth.uid()` exists
in the supabase/postgres image; check the file does not assume anything the
`none` stack lacks (the auth schema exists there too — say how you checked).

## 2. Recording it (`lib/reviewParticipantsRepo.ts`)
- `recordJoin(reviewId, role)`: an upsert on (review_id, user_id) that sets
  `last_joined_at = now()` and keeps `first_joined_at`; role only upgrades to
  `'host'`, never downgrades. Uses the one Supabase client (`lib/supabase.ts`),
  which carries the signed-in user's token automatically.
- Called once per room entry from `pages/RoomPage.tsx`, ONLY when signed in
  (`vp_user.accountId` set, not a guest) and only after the person is actually
  admitted (not while knocking — find the join state in `usePartyPresence` /
  `lib/joinState.ts`). Role `'host'` when this client is the session host.
- Failures are logged and swallowed; a room must never break because this
  write failed.
- `listMyReviews(limit = 20)`: my rows, newest `last_joined_at` first, joined
  with `review_curations` for the title where a curation exists (a plain
  second query by id is fine — do not add a foreign key: ad-hoc sessions have
  no curation row).

## 3. Showing it (`pages/LobbyPage.tsx`)
When signed in (not guest), a **"Your reviews"** list above today's "Saved
reviews", same visual style: title (or "Session <short id>" when there is no
curation), your role ("Hosted" / "Joined"), and when you were last there
("today", "3 days ago"); each row opens the room (same `enterRoom` path) and,
for curated ones, has the same Edit action the saved-reviews rows have.
Empty state: "Reviews you take part in will appear here." Hidden entirely in
`mode: 'none'` and for guests.

## 4. The room server trusts signed names (`party/room.server.ts`)
Today the name in `PRESENCE` is whatever the client says. When identity is on,
the server should know who is signed in:
- Client: when signed in, `broadcastPresence` (and the knock path that builds
  PRESENCE inline — `lib/usePartyPresence.ts`, same place the `guest` flag was
  added) also sends `accessToken` (from `supabase.auth.getSession()`, cached
  in the hook and refreshed on `onAuthStateChange`). Never log it.
- Server: new env `IDENTITY_MODE` ('none' default) and `JWT_SECRET`, passed
  to the partykit container exactly the way `ANON_KEY` already is (read
  `deploy/partykit-entrypoint.sh` and the partykit service in
  `docker-compose.yml`; the entrypoint only passes variables that are set).
- When `IDENTITY_MODE !== 'none'`: verify the token (HS256 with `JWT_SECRET`,
  using Web Crypto `crypto.subtle` — the PartyKit runtime has it; check `exp`,
  `aud === 'authenticated'`). Valid → overwrite the relayed payload's `name`
  with the token's `user_metadata.full_name ?? email-before-@`, set
  `guest: false`, and add `accountId = sub`. Missing or invalid → force
  `guest: true` and drop any `accountId`. **Strip `accessToken` from the
  payload before storing or relaying it — it must never reach another
  client.** Cache the verification per connection so it is not redone at
  10 fps (re-verify only when the token string changes).
- When `IDENTITY_MODE === 'none'`: ignore and strip `accessToken`, change
  nothing else.
- Put the verification in a small pure module (`party/verifyJwt.ts`) with
  unit tests: valid token; wrong secret; expired; wrong audience; malformed.
  Build test tokens with node's `crypto.createHmac` in the test.
- The admitted-set / knock logic keys on userId today — keep it that way.

## What must not regress
- `mode: 'none'`: no writes to review_participants, no "Your reviews", room
  server behaviour identical (a test with `IDENTITY_MODE` unset).
- A guest's presence still shows "(guest)"; a signed-in person's never does.
- The access token never appears in any relayed message, ROSTER, JOIN_REQUESTS,
  or the room's persisted storage (test this explicitly).
- `scripts/check-public-env.mjs`'s `KNOWN` map stays empty. `JWT_SECRET` is
  server-only — it must never be read in client code.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no `as unknown as`.

## Tests
- `party/__tests__/verifyJwt.test.ts` as above.
- Room server: with IDENTITY_MODE=accounts, a PRESENCE with a valid token is
  relayed with the token's name, `guest: false`, and NO `accessToken`; with a
  forged token → `guest: true`; with IDENTITY_MODE unset → payload unchanged
  apart from the stripped token. Look at the existing room-server tests for
  how they drive `onMessage` and capture relays.
- `reviewParticipantsRepo`: upsert shape; role never downgrades; errors
  swallowed.
- Lobby: "Your reviews" renders for a signed-in user with rows / empty
  state, and not at all in mode none.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
docker compose config -q && echo compose-ok
```

## Report
- Files changed / added.
- The exact SQL added.
- How the token reaches the server and every place it is stripped.
- Anything you deliberately did NOT do, and why.
