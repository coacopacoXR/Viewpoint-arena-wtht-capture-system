Batch BX: variants that work flawlessly.

The user, after BV: "it is not possible to open variants from the lobby, it is
not possible to create a variant from another variant, variants can only be
merged with the main line, not with another variant, and also when they are
dropped they still show up. I need that the variant thingy works flawlessly."

After this batch, Claude runs an end-to-end browser test of EVERY flow listed in
"Acceptance" below on the live install. Build against that list.

Read first: `docs/plan/15-sessions-and-variants.md`, `lib/reviews/lines.ts`,
`lib/reviews/linesRepo.ts`, `lib/reviews/linesClient.ts`, `api/reviews/lines.ts`,
`docs/supabase-schema.sql` (review_lines, adopt_review_line, drop_review_line),
`components/review/SessionMap.tsx`, `components/review/VariantActions.tsx`,
`components/review/StartVariant.tsx`, `components/UI/room/LineChip.tsx`,
`components/lobby/ReviewPreview.tsx`, `pages/LobbyPage.tsx` (`enterRoom`),
`pages/RoomPage.tsx` (entry guard, line resolution), `lib/scene/keepPlacements.ts`,
`lib/scene/showCurationModel.ts`.

Be economical with tool calls, but this batch must be complete. Do NOT run
`docker` and do NOT run any `git` write command. Do not edit `docs/` except
`docs/supabase-schema.sql`. On screen: "Variant", "Main line", "Explore a
variant", "Merge into…", "Drop variant". Never "branch", "fork", "commit". (The
user used "merged"; "Merge into…" is now the button's word. Keep "adopted" as the
line STATUS word in the database.)

## 1. Opening a line always works (bug)
`components/lobby/ReviewPreview.tsx`'s Lines list uses a plain `<Link>` to
`/room/<id>?line=<lineId>`. `pages/RoomPage.tsx`'s entry guard sends anyone who
arrives without `location.state.fromLobby` and without
`sessionStorage.vp_enteredRoom === roomId` back to the lobby — so Open bounces.
The session map's "Open variant" inside the lobby has the same problem.
- One helper, `openLine(navigate, reviewId, lineId | null, opts?)` in
  `lib/reviews/openLine.ts`: sets `sessionStorage.vp_enteredRoom = reviewId`,
  navigates to `roomPath(reviewId, lineId)` with `state: { fromLobby: true }`.
  The lobby's own `enterRoom` must also accept a lineId (it does — reuse it:
  the lobby passes `onOpenLine` down; outside the lobby use the helper, which
  must also set the stored identity the way `enterRoom` does if it is missing,
  or route through the lobby with `joinRoomId` + `joinLineId` state and the
  lobby enters the line after the name is known).
- Every "open a line" in the app uses it: lobby Lines list, SessionMap's line
  panel (room, lobby, tracker), LineChip menu, StartVariant after creating,
  tracker links, "Main line →".
- Switching line from inside a room (room → variant, variant → main, variant →
  variant) must fully switch: the PartyKit room, the scene (seed/seeded rule),
  activeLine, activeReviewId, carried-over cards, the name tag and chip, and the
  editing flag cleared (BQ2/BU fixes). Test room→variant→other variant→main in
  one page without reload.

## 2. A variant from any line, including another variant
- Schema (idempotent): `alter table review_lines add column if not exists
  parent_line_id uuid null references review_lines(id)`. Backfill: a variant's
  parent_line_id = the line of its parent_session if it has one, else the main
  line of its review.
- "Explore a variant" is offered on EVERY active line: the room's Variant
  button explores from the line the room is on; the session map's line panel
  and session panel from that line/session; the lobby's "+ Variant" from the
  main line, and each active line row in the Lines list gets "+ Variant".
- `api/reviews/lines.ts` explore: accepts `parentLineId` (required unless
  `parentSessionId` is given, in which case it is that session's line), verifies
  the parent line belongs to the review and is ACTIVE, `parent_session_id` = the
  given session, or the parent line's latest session, or null when it has none.
- The new variant STARTS FROM ITS PARENT LINE'S CURRENT STATE: its scene is
  the parent line's (the parent's placements slot — main `placements` or
  `linePlacements[parent]` — and the parent's revisions via
  `originRevisionIds`), and its carried-over cards are the parent line's open
  cards. `originRevisionIds` / the BQ2 seed / `keepPlacements` read slots by
  walking up `parent_line_id` until a line that has one (a variant of a variant
  with no changes shows what its parent shows).
- Letters stay review-wide (A, B, C…). Labels say where it came from:
  "Variant B · Lighter frame · from Variant A".

## 3. Merge into any active line
- "Merge into…" on an active variant (room chip menu, session map line panel,
  lobby Lines list row) opens a small chooser listing the OTHER active lines
  (main line first) — excluding the variant itself and its own descendants
  (lines whose parent chain contains it). Default selected: its parent line.
- Server: `adopt_review_line(p_variant uuid, p_target uuid, p_revision_ids
  uuid[])` (replace the 2-arg function; keep a 2-arg wrapper that targets the
  main line so nothing old breaks; same service-role-only grants). In one
  transaction: cards `line_id` → target (origin kept, adopted_at set);
  placements: the variant's slot → the target's slot (`placements` if target is
  main, else `linePlacements[target]`); the variant: status 'adopted',
  `closed_at`, new column `merged_into_line_id` (idempotent add) = target.
  Refuse if target is not active, not in the same review, is the variant, or is
  a descendant.
- The model question ("Keep Rev C from Variant A or Rev B2 from Variant B?")
  compares the TARGET line and the variant, not always the main line. The words
  name the target ("the main line" or "Variant A").
- Session map: the merge edge goes from the variant into the TARGET line (green
  stop on the target), not always into the main line. Tracker: "Raised in
  Variant B · merged into Variant A 26 Sep".
- Merging a variant whose own variants are still active: allowed; its active
  children now hang off its merge target (update their `parent_line_id` to the
  target in the same transaction) — say so in the chooser ("Variant C, started
  from it, will continue from Variant A").

## 4. Dropped variants go away (but are kept)
- Dropped lines are HIDDEN by default everywhere: session map (room, tracker,
  lobby), lobby Lines list, card mini map, LineChip menu, Merge chooser, tracker
  line filter. A small "Show dropped (2)" toggle on the session map and the
  Lines list reveals them greyed/dashed for the record (state per view, not
  saved). Merged ("adopted") lines stay drawn as merged (they are part of the
  history) but are not openable and not in the chip menu or chooser.
- Dropping a variant that has active children: refuse with "Variant C starts
  from this variant. Drop or merge it first." (simplest correct rule).
- Opening a dropped variant's URL directly shows the room read-only-ish: a
  banner "This variant was dropped: <reason>" with a link to the main line;
  no editing, no recording (the server refuses scene changes on a dropped
  line's room — check `review_lines.status` via the review facts the room
  server already reads; cache it like the roster).

## 5. Wording and discoverability
- Room top bar Variant button → a small menu: "Explore a variant from here",
  "Merge into…" (only in a variant), "Drop variant" (only in a variant), "Go
  to…" (other active lines). The chip keeps showing where you are.

## Acceptance (Claude will test exactly this, live, with the bike model)
1. Lobby → new review "V test" → import bike → Done → Lobby. Preview Lines:
   "Main line [Open] [+ Variant]".
2. Lobby "+ Variant" "A-steel" → lands in Variant A with the bike. Move the frame
   (Part mode) → Done → Lobby.
3. Lobby Lines: Variant A [Open] → lands in Variant A (NOT bounced to the
   lobby), frame moved.
4. In Variant A: Variant → Explore "B-light" → lands in Variant B, frame moved
   (inherited from A). Move a wheel in B.
5. Chip → Go to Variant A → frame moved, wheel NOT moved. Chip → Main line →
   bike untouched.
6. In Variant B: Merge into… → chooser lists Main line and Variant A (default
   Variant A) → merge into Variant A → Variant A now has the moved wheel; the
   map shows B merging into A.
7. Explore "C-carbon" from Variant A, then Drop C with a reason → C disappears
   from the map, the Lines list, the chip menu; "Show dropped (1)" reveals it.
8. Merge Variant A into Main line → main line shows frame + wheel moved; map
   shows A → main.
9. Try to drop a variant with an active child → refused with the sentence.
10. A participant (second account, not owner/editor) sees lines and can open
    them but has no Explore/Merge/Drop.

## What must not regress
Everything BK–BW, one-record rule, sessions and carried-over cards, undo/redo,
part overrides, snapshots, mode none, permissions. No `any`, no `eslint-disable`,
no `@ts-ignore`, no new `as unknown as`.

## Tests
openLine sets the guard and state; explore from a variant (with and without
sessions) records parent_line_id and seeds from the parent's slot; slot lookup
walks the parent chain; merge into another variant moves cards and placements
and reparents active children, refuses descendants/closed targets; the 2-arg
adopt wrapper still merges into main; dropped lines hidden by default and shown
with the toggle; dropping with active children refused; dropped room refuses
scene changes; schema adds the two columns idempotently.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
Files changed; exact SQL; anything deliberately not done.
