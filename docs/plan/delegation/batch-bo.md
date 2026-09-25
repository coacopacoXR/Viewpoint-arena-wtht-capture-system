Batch BO: the new lobby (approved by the user).

The user: "The lobby sucks, you can perhaps implement the variants view in a more
graphical way and you can skip the stuff about outlining the features ... I want
that it is possible from outside to see what the design review looks inside."
They approved the sketch in `docs/plan/sketches/lobby.html` — READ IT FIRST and
build that layout, in the app's own light style (the room's: white panels,
gray-200 borders, black primary, mono 10px uppercase labels; copy classes from
`components/UI/room/TopBar.tsx` and `components/review/SessionMap.tsx`, do not
invent a new palette). The sketch's data is made up; use real data.

Batch BN (just done) made every lobby-started room a design review, added
`lib/reviews/deleteClient.ts` + `api/reviews/delete.ts` (delete review / delete
session, owner and admin only), and a Lobby link in the room. Use them.

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/` except
`docs/supabase-schema.sql`.

## 1. Layout (`pages/LobbyPage.tsx`, split into `components/lobby/*`)
- Top bar: logo, "Tracker" link, "Admin" link (only for admins — the same check
  the admin page uses), and a name chip that opens a small menu with the avatar
  colour picker, the optional role, and Sign out. In mode none (no accounts) the
  chip menu also holds the name field; if no name is set yet, show the name field
  inline above the actions so nobody can enter a room nameless (today's rule).
- Actions row: "+ New design review" (primary), "Room code or link" + Join (accept
  a bare id or a full `/room/<id>` or `/room/<id>?line=<lineId>` link and enter
  it), and filter chips: Mine / Shared with me / All / Archived — mapped onto the
  lists the lobby already loads (my reviews via review_members/owner, listed
  curations, archived ids). Keep the "New session" behaviour available only if
  it still differs from New design review after BN; if it is now the same thing
  minus edit mode, drop the button.
- REMOVE: the left column (feature list, "LIVE TRACKER" stats, recent sessions
  list). Tracker is one link in the top bar.
- Review grid (cards, `auto-fill minmax(250px,1fr)`): snapshot thumbnail (16:9;
  a neutral placeholder with the model name when there is none), title, a meta
  line ("Rev C · last session 24 Sep · owner/editor/participant"), a MINI
  session map (new `components/review/MiniSessionMap.tsx`: plain SVG, main line
  black, variants coloured like SessionMap, adopted = green dot rejoining,
  dropped = grey dashed, current = filled dot; "No sessions yet" when empty),
  and open card counts by type (RISK red, ACTION blue, RATIONALE amber squares).
  A "LIVE · n IN ROOM" badge when `trackCurationPresence`/presence already tells
  the lobby someone is in the room; skip the badge if no existing API gives it
  cheaply — say so in the report.
- Clicking a card selects it and fills the PREVIEW panel on the right (sticky;
  below the grid on narrow screens): title, avatars + "3 people · 4 sessions ·
  1 variant", the snapshot with a "Turn in 3D" button (section 3), the full
  `SessionMap` (reuse the component; if it needs a compact mode add a prop), a
  list of sessions (label, date, attendee names, card count) each with a delete
  ✕ for owner/admin using BN's endpoint and an INLINE confirm (never
  window.confirm), the latest session's minutes (reuse BM's `summaryLines`
  rendering), and buttons: Open room (primary), Tracker (filtered to this
  review if the tracker supports it), Delete review (owner/admin, inline
  confirm). Replace the lobby's existing `confirm()` delete with this.
- Arriving with a room link (`joinRoomId` state today): preselect that review in
  the preview, with Join as the primary button — the invited-preview flow must
  keep working.
- Data: load summaries for the visible reviews in as few queries as practical
  (sessions by `review_id in (...)`, open items grouped by review/type, lines by
  review). No per-card waterfalls. Put the loading in `lib/lobby/useLobbyData.ts`
  with tests.

## 2. Snapshots
- Schema: `alter table review_curations add column if not exists thumbnail text`
  (a small JPEG data URL, <= ~60 KB). Idempotent.
- Capture from the room's 3D canvas: a helper that renders a frame and reads the
  canvas (`gl.render(scene, camera)` then `gl.domElement.toDataURL('image/jpeg',
  0.7)` downscaled to max 480×270 via an offscreen canvas — the R3F canvas does
  not preserve its drawing buffer, so read it right after a render). Capture:
  when the recording browser ends a meeting (BM's path) and, debounced (~3 s),
  after a model is imported/placed or its placement saved, by a person who may
  edit the review. Write it to the review row (the update policy allows it).
  Never capture when the room has no model. Never block anything on it.
- The lobby list/summary queries select `thumbnail`.

## 3. "Turn in 3D" (lazy)
In the preview, "Turn in 3D" replaces the snapshot with a live viewer:
`components/lobby/ReviewModelViewer.tsx`, loaded with `React.lazy` so three.js is
NOT in the lobby's initial bundle. It shows the review's current scene — the
revisions the room would start from (reuse `lib/reviews/linesRepo` /
`sceneFromRevisions` / `lib/scene/showCurationModel` logic, whatever gives the
room its starting models) — loading files from `/api/models/<hash>` through the
SAME loaders the room uses (find them via `lib/modelsClient.ts`,
`lib/scene/roomScene.ts`; do not write a second loader), framed to fit, with
OrbitControls, no editing. A spinner with "Loading the model…" while it loads,
and a plain message if it fails. Leaving the review (selecting another) unmounts
and disposes it.

## What must not regress
Sign-in/identity gate, mode none, archive, invited-preview, creating a review,
the room itself. No `any`, no `eslint-disable`, no `@ts-ignore`, no new
`as unknown as`. `scripts/check-public-env.mjs` `KNOWN` stays empty. Check the
build output that three.js is not pulled into the lobby's entry chunk by this
batch (the room already lazy-loads what it can; say what you found).

## Tests
Filters; join accepts id and link forms; card shows counts and mini map from
fixture data; preview shows sessions and minutes; delete buttons only for
owner/admin and use inline confirm; thumbnail helper downsizes and returns a JPEG
data URL (mock canvas); the viewer is lazy (import happens only after "Turn in
3D"); schema adds `thumbnail` idempotently.

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
