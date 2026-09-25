Batch BT: click parts in 3D, undo/redo, and models that keep their look.

The user (after BR, which added Whole model | Part): "it is not possible to click
on the 3d models parts directly, you need to click them on the tree. Another
thingy is that there is not ctrl+z, pretty important, and it is not great at
keeping the textures, perhaps the lights could be adjusted."

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/`.

## 1. Click a part in the 3D view (Part mode)
BR's gizmo (`components/Scene/ReviewModelGizmo.tsx`) and strip
(`components/review/EditingStrip.tsx`) follow `selectedNodeId(objectStates)`,
which only the Model Tree sets. In Edit mode with the strip on **Part**, a click
(pointer down + up without a drag of more than ~4 px — so orbiting the camera
never selects) on an imported model's mesh selects that part: the SAME node id
the tree would select for that mesh (the tree shows the scene-graph nodes;
pick the clicked mesh's node, or its nearest ancestor that the tree lists), via
the same store action the tree uses, so the tree scrolls to/highlights it too.
Clicking empty space clears the selection. Clicks on the gizmo's own handles
must not reselect (drei TransformControls consumes them — verify). In Whole
model mode a click on a model selects that model (as the tree's model row
does). Outside Edit mode clicks behave exactly as today (laser/pointer).

## 2. Undo / redo (Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y; Cmd on macOS)
- A local history of THIS person's scene edits in this room: model and part
  move/rotate/scale (a whole drag is ONE step — record on drag end, not per
  frame), Reset part / Reset all parts, show/hide of a model or revision, adding
  a model ("Add next to it"), removing one. Each step stores what is needed to
  put the scene back (the before/after `SceneModel` record(s) — whole records
  are simplest and small).
- Undo applies the "before" through the normal path (SCENE_UPDATE, the same
  permission checks), redo the "after". If the room refuses (permission changed)
  or the model no longer exists (someone else removed it), drop that step and
  show the existing refusal/notice — never throw.
- Only your own edits are undone; someone else's later change to the same model
  is not reverted silently: if the model's current record differs from the
  step's "after" (someone changed it since), undo still applies "before" — say
  so in the step's toast: "Undone — Olga had moved it since." (use the scene's
  last-changed-by if it exists; if not, just "Undone.").
- History: max 50 steps, cleared when leaving the room; a new edit clears the
  redo stack. Keyboard shortcuts are ignored while focus is in a text field
  (input, textarea, contenteditable) so typing in a card or a slide title still
  undoes text as the browser does.
- Visible: small Undo / Redo icon buttons at the start of the amber strip
  (disabled when nothing to undo/redo), `title` "Undo (Ctrl+Z)" / "Redo
  (Ctrl+Shift+Z)". Batch BS just made that strip fit — keep its compact rules
  (these two are icon-only always).

## 3. Models keep their look
Found by reading the code:
- `components/Scene/ImportedModel.tsx` (~line 119) sets `emissive` to black and
  `emissiveIntensity` 0 whenever a mesh is NOT selected, overwriting the
  material's own emissive colour/intensity/map. Store each material's original
  emissive, emissiveIntensity (and emissiveMap if touched) once in
  `material.userData`, and restore those instead of black when a highlight
  ends. Check other highlight/hover/laser paths for the same pattern (search for
  `emissive` in components/Scene and lib) and fix them the same way. If any
  path replaces materials outright for highlighting, make it restore the
  original material object.
- `components/Scene/ViewpointCanvas.tsx` uses `THREE.ACESFilmicToneMapping`,
  which desaturates and bleaches bright colours; three is 0.181 — switch to
  `THREE.NeutralToneMapping` (made for product/e-commerce colour fidelity),
  exposure 1.
- `components/Scene/World.tsx`: `ambientLight 0.7` + one point light + a
  blurred studio environment is flat. Use: the studio `Environment` as the main
  light (environmentIntensity ~0.9, blur lower e.g. 0.4 so reflections keep
  some definition), ambient ~0.25, a soft directional key light from above-front
  with shadows kept as today, and a weak fill from the opposite side. Keep
  `ContactShadows` / grid as they are. Keep the same look on the lobby's "Turn
  in 3D" viewer (`components/lobby/ReviewModelViewer.tsx`) — extract the light
  rig into one shared component both use.
- Loaders other than glTF (OBJ, STL, FBX, the CAD paths in `lib/`): make sure
  colour textures are `SRGBColorSpace` (glTF already is) and that a model with
  NO material gets a neutral `MeshStandardMaterial` (roughness ~0.6, metalness
  ~0.1, light grey) rather than a flat/unlit default.
- Do NOT change model scale/placement, the snapshot framing (BP), or selection
  colours beyond restoring originals.

## What must not regress
BR part moves and their saving, the laser/pointer highlight, pins, snapshots,
"Turn in 3D", mobile/XR rendering. No `any`, no `eslint-disable`, no
`@ts-ignore`, no new `as unknown as`.

## Tests
Click-vs-drag threshold and node resolution (pure function); Part mode click
selects, empty click clears, outside Edit unchanged; undo/redo stack (one step
per drag, cap 50, redo cleared by a new edit, refused step dropped, shortcuts
ignored in inputs); highlight restore keeps the original emissive; tone mapping
constant; shared light rig used by both canvases.

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
