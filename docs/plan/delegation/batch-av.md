The model tree highlights the wrong node when you point at a part.

The user, after testing: "in the pointer, the highlighting in the component
tree ... highlights only the highest level in the tree and not the one
highlighted, although it knows what it is highlighting because the little
pop-up works well."

Be economical: read the files named, not the whole repo. Do NOT run
`docker`, and do NOT run any `git` write command (`commit`, `add`, `push`,
`checkout`, `reset`, `stash`). Do not edit anything under `docs/`.

## Diagnosis (verified by Claude — read the code to confirm, then fix)

1. `components/Scene/UserLaser.tsx` ~378-395: the raycast walks up from the
   hit mesh to the first ancestor with `userData.modelId` and calls
   `selectNode(foundId)` (~442). The floating label uses
   `obj.userData.partName`, which is per mesh — that is why the pop-up is
   right.
2. `components/Scene/Headphones.tsx` ~37 and `components/Scene/Bicycle.tsx`
   ~45 stamp EVERY mesh with the same `modelId` (`'headphones_assembly'`,
   `'bicycle_assembly'`). So `foundId` is always the root, and the tree
   highlights the root.
3. Worse, the trees shown for those two models are hand-written
   (`HEADPHONES_SCENE_TREE`, `BICYCLE_SCENE_TREE` in `store.ts` ~54, ~124)
   with invented ids (`left_driver`, `headband_pad`, …) that do not
   correspond to any mesh in the GLB. So there is nothing correct to select,
   and the tree's eye (visibility) toggles probably do nothing on those
   models either — check `toggleNodeVisibility` against what Headphones.tsx
   renders and report.
4. Imported models (`utils/modelLoader.ts` `buildSceneTree` ~96) already do it
   right: every object gets its own `modelId` = its tree node id, and the tree
   is built from the real scene graph.

## The fix (do not redesign)

1. **Build the built-in models' trees from their GLB**, the same way imported
   models are built. Reuse `buildSceneTree` from `utils/modelLoader.ts`
   (export it, or a small wrapper) with an id prefix per model so ids stay
   unique and stable across clients (e.g. `headphones_0`, `headphones_1`, … in
   traversal order — traversal order of the same GLB is deterministic, which is
   what makes the ids agree between browsers). The root node keeps the
   existing root id (`headphones_assembly` / `bicycle_assembly`) so anything
   keyed on it keeps working. Node names use the same cleaned names as the
   pop-up (`cleanPartName`), so tree and pop-up agree.
2. **Two ids per mesh, two jobs.** Keep `userData.modelId` = the ROOT id on
   built-in meshes, because the highlight code in Headphones/Bicycle and the
   network laser target (`broadcastLaserMove(..., foundId, meshName, ...)`)
   are keyed on it — do not change that wire behaviour. Add
   `userData.nodeId` = the mesh's own tree node id on EVERY model object
   (built-in and imported; for imported ones `nodeId === modelId`).
3. **The laser selects the node, not the root.** In UserLaser, while walking
   up, remember the first `userData.nodeId` seen (nearest to the hit mesh).
   Call `selectNode` with:
   - that nearest `nodeId` when `laserHighlightGranularity === 'part'`;
   - the root id (`foundId`) when it is `'model'`.
   Keep `foundId`, `foundMeshName`, `foundPartName` and the broadcast exactly
   as they are.
4. **Install the real tree when the GLB loads.** The store currently starts
   with the hand-written tree (`objectStates: initObjectStates(HEADPHONES_SCENE_TREE)`,
   `setActiveModelType` ~634, `getCurrentSceneTree` ~847). Add one store
   action, e.g. `setBuiltInSceneTree(type, tree)`, that replaces the tree for
   that built-in type (and its `objectStates` and `pois`, the same way
   `setActiveModelType` derives them) and call it from Headphones/Bicycle
   once the GLB is stamped. Keep the hand-written constants only as the
   placeholder until the GLB loads, or remove them if nothing else needs
   them — grep and say which. Mind `lib/componentIndex` and the capture
   extraction prompt, which read the current tree for grounding: they must
   read the real one (check `getCurrentSceneTree`).
5. **The tree shows what is selected.** In `components/UI/SceneTree.tsx`, when
   a node becomes selected from the 3D view, expand its ancestors and
   `scrollIntoView({ block: 'nearest' })` its row, so a selection inside a
   collapsed group is visible. Only on selection change, not every render.
6. **Visibility and selection glow on built-ins.** With real node ids,
   make the tree's eye toggle hide the corresponding meshes of the built-in
   models (ImportedModel.tsx ~50 shows how imported models do it via
   `objectStates`), if they do not already.
7. The synth model (`Product.tsx`, `SYNTH_SCENE_TREE`) is procedural and
   already maps ids to parts via `ModelPart`; leave it alone unless it has the
   same bug — check, and report.

## What must not regress
- Remote laser highlight (other people's pointer colours on the model), in
  both granularities.
- The floating part-name pop-up.
- Imported models: picking, tree, visibility — unchanged.
- Review pins / comments that store a node id: grep `nodeId` in
  `lib/activeReviewStore.ts`, `SpatialComments`, `CommentsPanel` and check
  what id they store for the built-in models. If saved reviews reference the
  old invented ids, say so in the report (they were never real parts).
- `scripts/check-public-env.mjs`'s `KNOWN` map stays empty.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no `as unknown as`. If a
  test fails, fix the code, not the assertion — unless the test pinned the
  hand-written tree, in which case say which and update it.

## Tests to add
- `buildSceneTree` with a prefix gives stable ids for the same object
  hierarchy built twice, and every mesh carries `userData.nodeId` matching a
  tree node.
- The laser's selection choice as a pure function (extract it, e.g.
  `pickSelectionId(hitObject, granularity)` in `lib/`): part → nearest nodeId;
  model → root modelId; skipRaycast ancestor → null.
- SceneTree: selecting a nested node from the store expands its ancestors.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
- Files changed / added.
- Whether the eye toggles worked on built-in models before (and now).
- Where old invented ids were referenced, and what you did about it.
- Anything you deliberately did NOT do, and why.
