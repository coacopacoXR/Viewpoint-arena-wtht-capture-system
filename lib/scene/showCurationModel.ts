// Putting a curated review's model on screen.
//
// Two places have to do it and they must do it the SAME way: lib/activeReviewStore,
// which applies a review config the room server relayed, and pages/ReviewSetupPage,
// which applies the draft the curator is editing with no room involved at all. A
// pin names the mesh it was placed on, so if one path built the scene differently
// from the other, pins made while curating would resolve to nothing once the
// review was open. Hence one function, and both call it.

import { useStore } from '../../store';
import { parseModelFile } from '../../utils/modelLoader';
import { modelFileMime } from '../../utils/modelFormats';
import { curationScene, legacyCurationModel } from './curationScene';
import { sceneModelPrefix } from './roomScene';
import { sceneModelEntry } from './sceneEntries';

/** The part of a curation's asset that decides what to show. */
export interface CurationAssetModel {
  modelType?: string;
  modelHash?: string;
  importedFileName?: string;
  importedFileBase64?: string;
}

/**
 * Show a curation's imported model, as the one-model scene it is.
 *
 * Answers false when the asset is not an imported model, which is the caller's
 * cue to fall back to a preset. `logAs` names the caller in the one warning this
 * can produce, so a log line says which of the two paths hit it.
 */
export function showCurationModel(asset: CurationAssetModel | undefined, logAs: string): boolean {
  if (!asset || asset.modelType !== 'imported') return false;
  const { setRoomScene, upsertSceneModel } = useStore.getState();

  if (asset.modelHash && asset.importedFileName) {
    // Stored by hash: say what to show and let lib/scene/useSceneModelLoader
    // fetch it from /api/models and parse it. The response is content-addressed
    // and immutable, so a browser that has this revision already pays a cache
    // lookup rather than a download — and a late joiner in a room goes down
    // exactly the same path, which is the point of having one.
    setRoomScene(curationScene(asset.modelHash, asset.importedFileName));
    return true;
  }

  if (asset.importedFileBase64 && asset.importedFileName) {
    // LEGACY: a draft that has not been migrated yet (lib/migrateCurationAsset
    // runs on the load path, and a failed upload leaves the bytes in place so the
    // review still opens with its model). There is no hash to fetch, so this
    // parses the bytes itself and hands the store both halves — the scene entry
    // and the geometry for it.
    const fileName = asset.importedFileName;
    const model = legacyCurationModel(fileName);
    const file = new File(
      [Uint8Array.from(atob(asset.importedFileBase64), (c) => c.charCodeAt(0))],
      fileName,
      { type: modelFileMime(fileName) },
    );
    parseModelFile(file, { treePrefix: sceneModelPrefix(model.hash) })
      .then((parsed) => {
        setRoomScene({ models: [model], builtIn: null });
        upsertSceneModel(sceneModelEntry(model, parsed));
      })
      .catch((err) => console.error(`[${logAs}] failed to parse imported model:`, err));
    return true;
  }

  // Neither a hash nor bytes: a curation recorded as 'imported' whose file is not
  // in this payload. Leave whatever model was already there so the scene is not
  // empty, and warn so the issue is visible.
  console.warn(
    `[${logAs}] curation uses an imported model but this payload has neither its hash nor its file — keeping the current model`,
  );
  return true;
}
