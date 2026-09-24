Batch BH3: with two people in a design review's room, a saved edit is later
overwritten by an older copy. Found live by Claude after BH2.

Be economical. Do NOT run `docker` and do NOT run any `git` write command.
Do not edit `docs/`.

## What BH2 fixed, and what is left
BH2 fixed the re-seeding loop in `pages/RoomPage.tsx`; with ONE person, Save
this view now reaches the database (verified: `viewpoints` length 1).

Still broken, reproduced live with two signed-in browsers:
1. Olivia (owner) clicks New design review → room with Edit on → Save this
   view → Done. (With her alone, the row has 1 viewpoint at this point.)
2. Pete signs in and opens the same room (via the lobby's Join), is admitted.
3. Olivia presses Edit, opens People, adds Pete as editor, presses Done.
4. Pete reloads and re-enters; Olivia navigates back into the room (through
   the lobby Join as well).
Result: `review_curations.viewpoints` for that row is **0**, `updated_at` is
LATER than Olivia's save; Olivia's own screen still shows the view (from her
in-memory/local copy). So some client — Pete's, or Olivia's on re-entry —
wrote an older copy of the review over the saved one.

## The fix to make (design decided — do not redesign)
Persist on **edits**, not on **store changes**. Today a subscriber saves
whenever `useActiveReviewStore.config` changes, and the config also changes
when a `REVIEW_CONFIG` broadcast arrives from someone else, when a room seeds
from the lobby draft, and when the row is (re)loaded. Any of those can save a
stale copy.
- Every editing action that changes the review (the functions in
  `components/review/draftActions.ts` / `useActiveReviewActions.ts` used by
  Save this view, viewpoints, pins, agenda, requirements, labels, and any
  other room write) marks the review dirty for THIS client (`markLocalEdit()`),
  and only a dirty client saves, then clears the flag. Receiving a broadcast,
  seeding, or loading the row never saves.
- Saves send the whole review as today, but only after the user's own edit, so
  the copy saved is the one the user just changed. Two editors editing at the
  same time is already prevented (one editor at a time, BH), so last-writer
  wins is acceptable; say so in a comment.
- On entry, the row from the database is the truth. Drop any handover draft
  from localStorage (`vp_review_draft`) once the room has read the row for that
  review id, so a later visit cannot seed from it.
- Keep BH2's flush-on-Done.

## Tests (must fail on the current code first — say you saw it)
- Two clients in jsdom sharing a fake room channel and a fake Supabase: client
  A edits (save), client B receives the broadcast and re-renders / re-enters —
  assert B never calls the upsert, and the stored row keeps A's edit.
- Re-entering a room whose lobby draft is stale in localStorage does not write
  the stale draft.
- Every editing action marks dirty and saves once after the debounce.

## What must not regress
BH/BH2 behaviour: Save this view persists for one person, Done flushes,
agenda/pins/requirements/labels persist, edit banner, People tab, Import
permissions by role. No `any`, no `eslint-disable`, no `@ts-ignore`, no new
`as unknown as`.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
- Which client wrote the stale copy in the reproduction, and why.
- That the new tests failed before the fix.
