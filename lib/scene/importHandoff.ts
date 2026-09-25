// One model file, handed to the component that knows how to put it in the scene.
//
// components/UI/SceneTree.tsx owns the whole import pipeline: validate the file,
// share it to /api/models, parse it, then place it beside / over / after what is
// already in the room and write its model_revisions row. Batch BG gave that
// pipeline a second caller — the PLM launch's Onshape document browser
// (components/review/PlmLaunch.tsx), which gets a File back from Onshape and is an
// overlay in the room's Edit panel while SceneTree is a panel in the room's left
// column.
//
// They are not parent and child, and the pipeline is not something to copy: a
// second one would be a second place to get "that file is already in the scene",
// the beside/replace/revision choice and the revision row wrong. So the file
// travels the way a laser target does (lib/laserTargetRef.ts) — module state, no
// React. SceneTree claims the slot for as long as it is mounted; the browser leaves
// the file in it.

type SceneImportTaker = (file: File) => void;

let taker: SceneImportTaker | null = null;

/**
 * Claim the handoff for as long as the caller is mounted.
 *
 * One taker rather than a list: exactly one scene panel is on screen at a time,
 * and two of them taking the same file would import the same model twice. The
 * unregister clears the slot only if it is still the one this caller claimed, so a
 * panel unmounting AFTER its replacement mounted — the arena's tree handing over
 * to the boardroom's — cannot leave the room with nobody to give a file to.
 */
export function claimSceneImports(claim: SceneImportTaker): () => void {
  taker = claim;
  return () => {
    if (taker === claim) taker = null;
  };
}

/**
 * Hand a file to the room's scene, and say whether anything took it.
 *
 * False means no scene panel is mounted — a mobile room, or one still loading —
 * and the caller owes the person a sentence rather than dropping a model they
 * waited for Onshape to translate.
 */
export function handSceneImportFile(file: File): boolean {
  if (taker === null) return false;
  taker(file);
  return true;
}
