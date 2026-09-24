Plan 14, batch BC: the design review as the lasting unit — members and
roles, stored revisions, meetings, and tracker continuity.

Read `docs/plan/14-rooms-models-admin-ai.md` in full first, especially "The
model we are moving to", "How things are organised" and "Preparing a review
inside its room" (the ROLES table there is decided; the Edit-review UI is the
NEXT batch, BH — do not build it). User-facing name: **Design review** (the
lasting thing); "room" only for the live 3D space.

Already built: BA (models stored by SHA-256, `lib/modelsClient.ts`), BB (the
scene is a list of models with `line` and `revision`, `SCENE_STATE` from the
room server, compare, `modelEditors`), BD (admin console, `requireAdmin`),
BF (AI settings), identity (plan 13: `vp_user.accountId`,
`review_participants`, `lib/reviewParticipantsRepo.ts`).

Be economical: read the files named. Do NOT run `docker` and do NOT run any
`git` write command. Do not edit `docs/` except `docs/supabase-schema.sql`.
Claude tests live.

## 1. Schema (`docs/supabase-schema.sql`, idempotent, existing style)
- `review_curations` IS the design review (keep the table name; every link
  uses its id). Add `owner_id uuid null`, `archived boolean not null default
  false`.
- `review_members (review_id text, user_id uuid, role text check in
  ('owner','editor','participant'), added_at, added_by, primary key
  (review_id, user_id))`. Guests are never members.
- `model_revisions (id uuid pk, review_id text, line text, revision text,
  hash text, file_name text, size bigint, notes text default '', uploaded_by
  uuid null, uploaded_by_name text, created_at, unique (review_id, line,
  revision))`.
- `tracker_sessions` (= a meeting): add `review_id text null`,
  `revision_ids uuid[] default '{}'` (what was on screen).
- `tracker_items` (= a card): add `review_id text null`, `raised_on_revision
  uuid null`, `part_node_id text null`, `part_name text null`,
  `created_by_name text null`, `source text not null default 'ai' check in
  ('ai','manual')`.
- RLS: keep today's open policies on the existing tables (a `mode: 'none'`
  install writes them with the anon key). New tables: anon + authenticated
  may read `model_revisions` and `review_members` of any review (needed to
  render), write only as described in 2. State plainly in a SQL comment that
  role enforcement is in the app and the room server, and that locking the
  database itself down per role is a later hardening step.

## 2. Roles, in one place
- `lib/reviews/roles.ts`: `Role = 'owner'|'editor'|'participant'|'guest'`,
  and `can(role, action)` for exactly the actions in the plan's table:
  `meet`, `addCard`, `editCard`, `runMeeting`, `editReview`,
  `setModelEditors`, `managePeople`, `deleteReview`. Unit-test the full table.
- `resolveRole({ identityMode, accountId, isGuest, members, ownerId,
  isAdmin, isMeetingHost })`: accounts/sso → owner if owner_id or admin, else
  the member role, else participant if signed in, guest if guest;
  `mode: 'none'` → the meeting host is `editor`, everyone else
  `participant`, the admin-passphrase holder `owner`.
- Creating a design review while signed in sets `owner_id` and inserts the
  owner row. Existing reviews with no owner: the first admin to open them can
  claim ownership in BH; for now `resolveRole` treats an ownerless review's
  admins as owners.
- The room server gets the role too: when a signed-in person's presence is
  verified (plan 13 AZ), look up their role for the room (a small fetch to
  PostgREST with the anon key reading `review_members` / `review_curations`
  — cache per room for 60 s) and use `can(role, 'setModelEditors')` /
  `editReview` for BB's scene permissions instead of host-only when identity
  is on. Keep BB's behaviour exactly in mode none.

## 3. Revisions are stored, not only on screen
When BB's scene gains a model through "New revision" or "Add next to it",
also insert a `model_revisions` row (line, next revision letter, hash, file
name, size, who). Opening a design review builds its scene from its revisions
(the latest revision of each line visible) instead of only `asset.modelHash`
— keep `asset.modelHash` working for reviews that have no revisions yet.

## 4. Meetings and cards carry the review and revision
- Where a meeting is saved to the tracker (`lib/trackerBridge.ts`), write
  `review_id`, `revision_ids` (the visible revisions), and for each card
  `review_id`, `raised_on_revision` (the revision of the line the card's part
  belongs to, else the first visible), `part_node_id`/`part_name` when the
  card came from a pointed-at part, `source`, `created_by_name`.
- Ad-hoc sessions (a room id with no curation row) keep working with
  `review_id` null.

## 5. The tracker shows continuity (`pages/TrackerPage.tsx`)
- Filter by design review; a review's page-like view: its revisions (Rev A,
  B, C with dates), its meetings, and its cards.
- Each card shows "Raised on Rev A" and, while open, "still open on Rev C"
  when a later revision exists on its line. Closed cards show when/in which
  revision they were closed if that is known from `tracker_status_history`.
- Keep every existing tracker feature working.

## 6. Words on screen
Where the UI says "curation", "review room", "room" for the lasting thing
(lobby lists, tracker, admin Reviews section), say "Design review". Leave
"room" where it means the live 3D space ("Open room", "Leave room"). Do not
restructure the lobby — BH changes "Curate a design review".

## What must not regress
- `mode: 'none'` works exactly as today (no accounts, anon writes).
- Existing design reviews, their links, their models (`asset.modelHash`) and
  existing tracker data all still load.
- BB scene sync and permissions in mode none.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no new `as unknown as`.
- `scripts/check-public-env.mjs` `KNOWN` stays empty.

## Tests
- roles table (every role × action); resolveRole for each mode.
- revisions: next letter per line; insert on add; scene built from revisions;
  fallback to `asset.modelHash`.
- trackerBridge writes the new fields; null review for ad-hoc sessions.
- TrackerPage: "Raised on Rev A · still open on Rev C" rendering; filter by
  review.
- room server: role-based scene permission with identity on (mock the
  PostgREST lookup), unchanged in mode none.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
- Files changed / added; the exact SQL added.
- Anything you deliberately did NOT do, and why.
