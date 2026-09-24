Plan 14, batch BB: several models in one scene, revisions, and who may
change models.

Read `docs/plan/14-rooms-models-admin-ai.md` ("The model we are moving to":
"Model and revisions", "Other models in the scene", "Sync", "Who may change
models"). Batch BA (committed) made model files content-addressed:
`POST /api/models` → `{ hash }`, `GET /api/models/<hash>`,
`lib/modelsClient.ts` (`uploadModelFile`, `fetchModelFile` with a cache), and
`MODEL_CHANGE { modelType, hash?, fileName?, size? }` whose reference the room
server persists in room storage. This batch is the BB row. Do NOT build
rooms-as-a-table or tracker changes (BC), and do not touch `/admin`, `api/admin`,
`api/settings`, `api/capture` or `lib/ai` — another batch is editing those now.

Be economical: read the files named. Do NOT run `docker` and do NOT run any
`git` write command. Do not edit anything under `docs/`. Claude tests live.

## 1. The scene holds a list
Replace "the one imported model" with a **scene list**, shared by the room:

```ts
SceneModel = {
  id: string;            // stable id for this entry (uuid)
  hash: string;          // content hash (BA)
  fileName: string;
  line: string;          // which product this is; revisions share a line
  revision: string;      // 'A', 'B', ... within the line
  visible: boolean;
  offset: [number, number, number];  // placement in the room, scene units
}
RoomScene = { models: SceneModel[]; builtIn: 'synth'|'headphones'|'bicycle'|null }
```
- `party/room.server.ts`: the `MODEL_CHANGE` reference becomes `SCENE_STATE`
  (the whole `RoomScene`), persisted and replayed exactly as BA does for the
  single reference. Clients send `SCENE_UPDATE` operations (add, setVisible,
  remove, setOffset, setBuiltIn); the server applies them to its copy and
  relays the new `SCENE_STATE`, so there is one truth and no client ever
  overwrites another's change with a stale list. Keep accepting an old
  `MODEL_CHANGE` from an old client by translating it to "replace the scene
  with this one model" (and keep the refusal of base64).
- Store (`store.ts`): today one `importedMeshes` + one `importedSceneTree`.
  Hold one entry per scene model (its parsed group, its tree, base scale and
  position), keyed by `SceneModel.id`. Built-in models behave as today.
- `components/Scene/ImportedModel.tsx` renders every visible scene model,
  each placed with `placeImportedGroup` (keep it) plus its `offset`.
- The model tree (`components/UI/SceneTree.tsx`) shows one top-level group
  per scene model ("Bracket · Rev B") with an eye toggle that sends
  `setVisible`. Ids inside each model's tree must not collide between models:
  prefix per model (see `buildSceneTree`'s `prefix` argument).
- Picking, laser highlight, tree selection and pins must keep working with
  several models (the laser walks up to `userData.nodeId`/`modelId`; make sure
  those are unique across models).

## 2. What importing does
In the import flow (`SceneTree.tsx`), after a file is chosen and uploaded,
ask one question inline (not a browser dialog):
- **"New revision of <current line>"** — adds it to the same line with the
  next revision letter, makes it visible and HIDES the previous revision of
  that line. Offered only when a line already exists.
- **"Add next to it"** — a new line (named after the file), placed beside
  what is there: offset along X by the width of the existing models'
  combined bounding box plus 20 % of it. Previous models stay visible.
- **"Replace everything"** — today's behaviour, for a fresh start.
With nothing in the scene yet, it simply adds.

## 3. Compare revisions
When a line has two or more revisions, the tree shows a small **Compare**
control on that line: pick two revisions → both visible, placed side by side
(the older at its offset, the newer shifted by its width + 20 %), each with a
floating label "Rev A" / "Rev B" above it (use the existing drei `Html` label
style from `ViewpointCanvas`). Leaving Compare restores the previous
visibility and offsets. It is a scene operation like the others, so everyone
in the room sees the same comparison.

## 4. Who may change models
- A room setting `modelEditors: 'host' | 'everyone' | string[]` (userIds),
  default `'host'`, held by the room server with the scene, persisted, and
  replayed in `SCENE_STATE`.
- The server REFUSES a `SCENE_UPDATE` (and a legacy `MODEL_CHANGE`) from a
  connection that is not allowed, and tells that connection why
  (`SCENE_REFUSED { reason }`); nothing is relayed. The host is whoever
  `computeHost()` says.
- Only the host can change `modelEditors` (`SET_MODEL_EDITORS`).
- UI: the host gets a small "Who can change models: Host only / Everyone /
  Choose people…" control in the model tree header; people who may not
  change models see the import button disabled with the reason in its
  tooltip, and the eye toggles still work for them LOCALLY only (hiding a
  model on your own screen is not a scene change — make that distinction in
  code: local visibility overrides vs. shared visibility).

## What must not regress
- Built-in models; a curated review opening with its model (the review's
  `asset.modelHash` becomes a one-model scene on load).
- Everything BA verified: import uploads once, late joiners fetch by hash,
  a room server restart keeps the scene.
- CAD import (worker path), all formats.
- `scripts/check-public-env.mjs` `KNOWN` stays empty.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no new `as unknown as`.

## Tests
- Room server: add / setVisible / remove / setOffset applied and relayed as
  one `SCENE_STATE`; persisted and replayed after a simulated restart;
  refused for a non-editor with `SCENE_REFUSED` and nothing relayed; host
  can change `modelEditors`, others cannot; legacy `MODEL_CHANGE` translated.
- Pure helpers (put them in `lib/scene/`): next revision letter (A→B, Z→AA);
  placement offset for "next to"; compare layout; the reducer that applies
  a `SCENE_UPDATE` to a `RoomScene`.
- Tree: two models → two top-level groups, no id collisions; local hide
  does not send a scene update.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
- Files changed / added; the final message types.
- Anything you deliberately did NOT do, and why.
