Batch BV: variants you can find again, positions saved per line, clean snapshots.

The user: "the variants do not get saved". Reproduced live (review with the bike,
Variant "Frame forward" started before any meeting, the frame moved inside the
variant, back to the lobby):
- The variant's changes ARE kept by its own room (re-opening its
  `/room/<id>?line=<lineId>` URL shows the moved frame; the main line is
  untouched).
- But nothing lets the user get back to it: the lobby preview says "0 sessions ·
  1 variant", its session map says "No sessions recorded in this design review
  yet." and there is no way to open the variant. The room's Sessions map is the
  same. A variant with no meetings is invisible → "not saved".
- The lobby snapshot was captured INSIDE the variant room with the move gizmo's
  arrows in the picture, and it replaced the review's thumbnail.
- Latent (read in code): `lib/scene/keepPlacements.ts` writes model/part
  placements into the review's ONE `asset.placements`, shared by every line; a
  variant's moves overwrite the main line's saved positions, and whichever room
  re-seeds from the database (BQ2: a room whose server lost its storage) gets the
  last writer's positions.

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/` except
`docs/supabase-schema.sql`.

## 1. Lines are visible and openable without meetings
- `components/review/SessionMap.tsx` (room, tracker, lobby preview): draw every
  line of the review even when it has no sessions: the main line as a short
  line with a hollow "start" stop labelled "Start"; a variant with no sessions
  as its coloured branch leaving from its parent session (or from the main
  line's start when `parent_session_id` is null) ending in a hollow stop
  labelled with its letter ("A"). Adopted/dropped styling as today. Replace
  "No sessions recorded in this design review yet." with the drawing whenever
  the review has at least one line; keep the sentence only when it has none.
- Clicking a variant's line or its stops opens a small panel for that LINE
  (not only for sessions): "Variant A · Frame forward", status, started
  "from S2 · 24 Sep" or "from the start", number of sessions, and **Open
  variant** (navigates to `roomPath(reviewId, line.id)`), plus the existing
  Adopt / Drop actions for those allowed. The main line's panel has **Open main
  line**.
- Lobby preview (`components/lobby/ReviewPreview.tsx`): under the map, a
  "Lines" list — "Main line · 3 sessions [Open]", "Variant A · Frame forward ·
  active · 0 sessions [Open]", adopted/dropped ones greyed without Open. The
  mini map on the card (`MiniSessionMap`) also draws session-less variants as
  a short coloured stub.
- The room's LineChip dropdown (the "You are on Variant A" chip, and on the main
  line a small "Lines" menu next to Sessions if one does not exist): lists every
  active line with a link, so moving between main line and variants never
  needs the lobby.

## 2. Positions saved per line
- `asset.placements` stays for the MAIN line (every existing review keeps
  working). Add `asset.linePlacements?: Record<lineId, StoredPlacement[]>` for
  variants. `keepReviewPlacements` writes to the active line's slot
  (`useStore.getState().activeLine`: null or main → `placements`, variant →
  `linePlacements[line.id]`). `applyStoredPlacements` / the BQ2 seed path read
  the slot of the line being seeded; a variant with no slot of its own starts
  from the main line's `placements` (which is what "starts where the main line
  is" means), then diverges.
- Adopting a variant (api/reviews/lines.ts adopt): its placements become the
  main line's — copy `linePlacements[variantId]` into `placements` in the same
  server call that marks it adopted (the review row is updated with the service
  role there; keep it one transaction if the row write can go into
  `adopt_review_line`, otherwise the api writes it right after and says so).
  Dropping leaves them as the record.
- Tests: variant moves do not change `placements`; main line moves do not
  change `linePlacements`; a variant with no slot seeds from main; adopt copies.

## 3. Snapshots
- The thumbnail capture (BO/BP `captureRoomThumbnail`, `ThumbnailCapture`)
  must never include editing helpers: hide TransformControls/gizmo, selection
  outlines, pins' edit handles, laser dots during the capture render (render
  with a layer mask or temporarily set those objects `visible = false` and
  restore in a `finally`).
- Capture and write the review thumbnail only from the MAIN line's room (or
  after an adoption). A variant does not replace the review's picture.

## What must not regress
Everything BK–BU, variants' own rooms and seeding, the one-record rule,
undo/redo, part overrides, lobby preview and "Turn in 3D". No `any`, no
`eslint-disable`, no `@ts-ignore`, no new `as unknown as`.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
Files changed; exact SQL (if any); anything deliberately not done.
