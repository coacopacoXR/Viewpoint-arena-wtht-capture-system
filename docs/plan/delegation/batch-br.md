Batch BR: move, turn and size individual parts of a model.

The user: "more control over the 3d models that are there would be nice. Like
moving individual components and perhaps scaling and stuff."

Today (batch BH): in Edit mode the amber strip (`components/review/EditingStrip.tsx`)
has Move / Rotate / Scale, applied by `components/Scene/ReviewModelGizmo.tsx`
(drei TransformControls) to a WHOLE model; the transform lives on the scene
record (`lib/scene/roomScene.ts` `SceneModel.offset/rotation/scale`), is synced
with SCENE_UPDATE through the room server (`party/room.server.ts`, permission
rules in the shared `scenePermissions`) and saved (BI: placement saved on the
review). Nothing can move a single part.

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/` except
`docs/supabase-schema.sql`.

## 1. Choosing what the gizmo moves
In Edit mode the strip gets a two-way switch next to Move/Rotate/Scale:
**Whole model** | **Part**. Whole model = today. Part = the gizmo attaches to
the part that is selected — selected by clicking it in the 3D view or in the
Model Tree (the existing selection the laser / tree already set; reuse it, do
not add a third selection). If nothing is selected in Part mode, the strip says
"Click a part to move it." A part = a node of the imported model's scene graph
(the ids the Model Tree already shows, i.e. the ids `componentReference` and
the pointing timeline use). Selecting the model's root in Part mode behaves like
Whole model.

## 2. Storing a part's transform
- `SceneModel` gets an OPTIONAL `parts?: Record<string, PartTransform>` keyed by
  node id, `PartTransform = { position?: [n,n,n]; rotation?: [n,n,n]; scale?:
  [n,n,n] }` in the node's LOCAL (parent) space, as an override of the node's
  original transform. Absent = the file's own transform (old scenes, old clients
  keep working exactly as today). Non-uniform scale is allowed for parts.
- Applying: when a model's object is built/loaded, apply each override to the
  node with that id; keep the node's ORIGINAL local transform (store it once in
  `userData`) so "Reset part" can restore it and so overrides are always
  relative to the original, never cumulative.
- Sync and permission: part changes travel in the same SCENE_UPDATE as model
  transforms and pass the same permission check (`scenePermissions` — only
  people who may change models); the room server validates the shape (finite
  numbers, at most 500 part entries per model, ids are strings ≤ 200 chars) and
  rejects anything else. Saved with the scene exactly where the model transform
  is saved (BI), so a reload and the next session show the moved parts.
- Revisions: a new revision of a model starts with NO part overrides (it is a
  different file); "Add next to it" copies nothing.

## 3. Controls
- In Part mode with a part selected, the strip shows the part's name and
  "Reset part" (removes its override) and, on the model, "Reset all parts".
- Scale in Part mode: TransformControls scale mode (per axis); hold Shift for
  uniform is not needed — keep drei's default behaviour.
- Snapping: none in this batch.
- Undo: not in this batch; Reset is the way back. Say so in the strip's
  tooltip ("Reset part puts it back where the file had it").
- The laser highlight, part picking, cards' `componentReference` and the Model
  Tree must still resolve the moved part (they use node ids — verify after the
  move that the highlight outlines the moved mesh in its new place).

## What must not regress
Whole-model Move/Rotate/Scale, placement saving, the one-record rule, BK–BQ
behaviour, part highlighting, the lobby snapshot and "Turn in 3D" viewer (the
viewer should apply part overrides too, since it shows the review's scene — if
that is not trivial, say so). No `any`, no `eslint-disable`, no `@ts-ignore`, no
new `as unknown as`.

## Tests
Override applied relative to the original and reset restores it; the server
rejects malformed part entries and callers without model permission; a scene
without `parts` loads unchanged; a new revision has no overrides; the strip's
Whole model / Part switch and "Click a part to move it" state.

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
