Batch BQ2: a room whose live server has no scene yet starts from the review's
stored models; the room's top bar fits.

Found live after BQ (uncommitted in the working tree — build on it): a review
with two imported models (headphones + bicycle, both in `model_revisions`),
then "Variant" → the variant room (`/room/<id>?line=<variantId>`, PartyKit room
`<id>~A`) shows "No model yet", also after a full page reload.

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/` except
`docs/supabase-schema.sql`.

## 1. Why the variant room is empty (verified by reading the code)
a. `party/room.server.ts` sends SCENE_STATE on connect "even when it is empty",
   and the client (`lib/usePartyPresence.ts`, SCENE_STATE handler) replaces its
   scene wholesale with it. A room whose server has never held a scene — every
   new variant room, and any main room whose server storage is gone — therefore
   wipes whatever the client built from the database. Nothing ever puts the
   review's stored models onto such a server. (The main room only works today
   because its server kept the scene from the imports.)
b. `lib/scene/showCurationModel.ts` `showReviewScene` returns false at once when
   the curation asset is not `modelType: 'imported'` — but a review created
   empty and filled by in-room imports has its models ONLY in `model_revisions`
   (asset modelType is not 'imported'), so its history is never read.
c. `showReviewScene`'s once-per-open `rebuilt` set is keyed by review id, so
   after the main room built its scene, the same page opening a variant of that
   review skips building.

## 2. The fix
- Server: keep whether the room's scene has EVER been set (persisted with the
  scene in room storage; true once any SCENE_UPDATE/MODEL_CHANGE/seed was
  accepted, and true for storage written by older builds that has any models).
  Include `seeded: boolean` in the SCENE_STATE payload. Accept a new client
  message `SCENE_SEED { scene }` ONLY while `seeded` is false and only from a
  connection allowed to change models (same `scenePermissions` check as
  SCENE_UPDATE; the same shape validation); the first accepted seed sets
  `seeded = true` and is relayed as SCENE_STATE; later seeds are ignored
  (answer nothing, or SCENE_REFUSED with a new reason `already_seeded` — the
  client treats that as normal).
- Client: on a SCENE_STATE with `seeded: false`, a client that may change models
  builds the scene from the database for THIS line (`showReviewScene` path,
  which already narrows to the line's origin via `originRevisionIds` and
  applies stored placements) and sends it as SCENE_SEED. It must not rely on the
  store's current scene (it was just emptied): compute the scene, then send it.
  A client that may not change models just waits for the seeded SCENE_STATE.
- `showReviewScene`: when the asset is not an imported model, still read
  `model_revisions`; if there are revisions, build the scene from them (same as
  today's imported path); only when there are none, return false (the caller's
  preset fallback). Key `rebuilt` by `reviewId + line id` (main = no suffix) and
  clear it the same way.
- A variant with no parent session: the scene it starts from is the main line's
  current scene as the DATABASE knows it (latest visible revisions + stored
  placements) — which is what `originRevisionIds` returning null + the whole
  history already gives. Verify with a test.
- Mode none, rooms with no review (none after BN, but old ones), and presets
  (Synth assembly etc. — `activeModelType` presets, no revisions): unchanged. A
  preset review's variant room: the seed must carry the preset too if the scene
  record can express it; if presets are not part of the scene record, say so in
  the report and leave it.

## 3. The top bar fits
Live at 1600×900, the room's top bar (`components/UI/room/TopBar.tsx`, placed in
`components/UI/Interface.tsx`) is absolutely centred and, with EDIT, SESSIONS,
VARIANT, HIGHLIGHT, MODEL|PART, POINTER, PEOPLE, SHARE, PRIVACY, BOARDROOM plus
the variant chip and MAIN LINE, it overlaps the left "VIEWPOINT ARENA / Lobby"
block and runs under the right side panel. And the review's name
(`ReviewNameTag`, BQ) sits inside the `h1` after the Lobby link, where the bar
covers it.
- Layout: the header row is a flex row: left block (logo, Lobby link; under it
  the review NAME replaces the meaningless "DESIGN REVIEW SIM // 56.4S" line),
  then the bar, which starts after the left block and ends before the side
  panel (use the same right offset the canvas uses for the panel,
  `canvasRightClass`), never overlapping either.
- When the bar does not fit, buttons drop their text labels and keep icon +
  `title` tooltip (a container query or a measured `compact` state — no
  horizontal scrollbar, no wrapping to a second row). Order of dropping: the
  least-used first (Privacy, Boardroom, Share, Pointer, Highlight) — Edit,
  Sessions, Variant keep labels longest.
- The variant chip ("You are on Variant A") and the "Main line" link merge into
  one control: the chip, with "Main line →" inside its dropdown (it already has
  one) rather than as a separate button.

## What must not regress
Everything BK–BQ, the one-record rule, permissions (a participant can never
seed), late joiners get the same scene, mode none. No `any`, no
`eslint-disable`, no `@ts-ignore`, no new `as unknown as`.

## Tests
Server: `seeded` false on a fresh room, true after the first update or seed;
seed accepted once, refused afterwards and from a caller without model
permission; storage from an older build with models counts as seeded.
Client: a SCENE_STATE with `seeded:false` makes a permitted client compute the
scene from revisions for its line and send SCENE_SEED; an unpermitted one does
not. `showReviewScene` with a non-imported asset and revisions builds the scene;
`rebuilt` is per line. Top bar: compact state drops labels in the stated order.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
Files changed; anything deliberately not done.
