Batch BN: a way back to the lobby, Edit that always has a review to edit, and
deleting design reviews and sessions.

The user: "There is no back to the lobby button." "I want that it is possible to
delete either design reviews or sessions." "The first time you edit the room
there are problems to save views ... it says 'This room has no design review to
edit yet'."

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/` except
`docs/supabase-schema.sql`. Do NOT touch `pages/LobbyPage.tsx` except where
section 3 says (the lobby is being redesigned in the next batch).

## 1. Back to the lobby
`components/UI/room/TopBar.tsx` / the room header in `components/UI/Interface.tsx`
(the "VIEWPOINT ARENA" logo block at the top left): make the logo block a link
back to the lobby (`/`) and add a small visible "Lobby" control next to it (an
arrow-left icon from lucide + the word, same mono 10px uppercase style as the
top-bar buttons). Leaving the room this way must leave the meeting cleanly, the
way closing the tab would (presence/WebRTC tear down on unmount — check that the
room's unmount path already does that; do not end the meeting for everybody). A
host leaving does NOT end or record the meeting. `MobileRoomView.tsx` gets the
same control in its own header.

## 2. Edit always has a review to edit (the bug)
Reproduced: a room opened with the lobby's "New session" button has no
`review_curations` row. An admin (and, in mode none, the host) still gets the
Edit button (`can(role, 'editReview')`), and `components/review/ReviewEditPanel.tsx`
then shows "This room has no design review to edit yet." — views and pins cannot
be saved. A participant in the same room gets "Import locked" because nobody owns
it.

Fix: when a person who may edit presses Edit (or the room opens with `?edit=1`)
and the room has no review, create it for this room id first — the same thing
`pages/RoomPage.tsx` already does for a PLM launch (`createReview(roomId)`, which
also claims the owner on an accounts install), then seed the active review from
the result (the `seed` path in RoomPage) and open the edit panel. While the row
is being created the panel shows "Setting up this design review…" instead of the
no-review sentence; only if creation fails does it say plainly what failed
("Could not create the design review for this room. Check the connection and try
again.") with a Retry button. Also: the lobby's "New session" (`handleNewSession`
in `pages/LobbyPage.tsx`) creates the review row before entering, exactly like
`handleNewDesignReview` but without `?edit=1` — every room started from the
lobby is a design review from now on, so its creator owns it and can import.
Test: pressing Edit in a room with no row creates it and shows the tabs; New
session creates a row.

## 3. Delete a design review, delete a session
One server endpoint, `api/reviews/delete.ts` (service role, role check done the
way `api/reviews/lines.ts` does it — read it and reuse its caller/role helpers
rather than copying them; extract to a shared module under `api/reviews/_lib/`
if needed):
- `{ action: 'review', reviewId }` — allowed for the review's owner and for
  admins (`isAdmin` in the verified token); in mode none, the meeting host
  claim as lines.ts treats it. Deletes, in one database function
  (`delete_review(p_review text)`, `security definer`, executable by
  service_role only — same revoke/grant pattern as `adopt_review_line`):
  tracker_status_history of its items, tracker_items, tracker_sessions,
  review_lines, review_members, model_revisions rows, and the
  review_curations row. Stored model FILES are content-addressed and may be
  shared by other reviews: do not delete files.
- `{ action: 'session', reviewId, sessionId }` — owner and admins (same rule).
  Deletes that session's items (and their status history) and the session row,
  in one function `delete_review_session(p_session uuid)`. Refuse with a plain
  409 when a variant starts from it (`review_lines.parent_session_id`):
  "Variant A starts from this session. Delete or drop the variant's sessions
  first." Session numbers are NOT reused or renumbered (seq stays as it is).
- Lock the old path: drop the `"public delete curations"` policy in
  `docs/supabase-schema.sql` (idempotently; keep select/insert/update as they
  are) and revoke DELETE on review_curations from anon/authenticated after the
  table-wide grant, the way review_lines' update/delete revoke is placed. Make
  `lib/curationsRepo.deleteCuration` call the new endpoint (a small client in
  `lib/reviews/deleteClient.ts`, same JSON/content-type care as
  `lib/reviews/linesClient.ts`), so the lobby's existing delete button keeps
  working through it — that is the only LobbyPage-adjacent change.

UI:
- `components/review/SessionMap.tsx` session panel: a "Delete session" button
  (for those allowed; pass `mayDelete` like `mayEditLines`), with an inline
  confirm in the panel ("Delete S2 and its 3 cards? This cannot be undone." →
  Delete / Cancel). NEVER `window.confirm` (the lobby's existing one may stay).
  On success the map reloads.
- The room's review menu or edit panel: a "Delete design review" action for the
  owner/admin with the same inline confirm naming the review; on success go to
  the lobby.

## What must not regress
BK/BL/BM behaviour, carried-over cards, the one-record-per-meeting rule, mode
none, BH3 save-on-edit, permissions. No `any`, no `eslint-disable`, no
`@ts-ignore`, no new `as unknown as`. `scripts/check-public-env.mjs` `KNOWN`
stays empty.

## Tests
Lobby control present and routes to `/`; Edit in a row-less room creates it;
New session creates a row; endpoint refuses participants/editors/guests for
both actions and allows owner and admin; session delete refused when a variant
starts from it; schema test: the two functions exist with service-role-only
execute, and the public delete policy on review_curations is gone and DELETE is
revoked.

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
