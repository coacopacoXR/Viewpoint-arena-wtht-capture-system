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
import { curationScene, curationSceneModel, legacyCurationModel } from './curationScene';
import { sceneModelPrefix } from './roomScene';
import { sceneModelEntry } from './sceneEntries';
import { applyStoredPlacements, type StoredPlacement } from './placement';
import { listModelRevisions, sceneFromRevisions } from '../reviews/revisionsRepo';

/** The part of a curation's asset that decides what to show. */
export interface CurationAssetModel {
  modelType?: string;
  modelHash?: string;
  importedFileName?: string;
  importedFileBase64?: string;
  /**
   * Where the review left each of its models, per revision.
   *
   * Batch BI. The room's Move / Rotate / Scale used to live only in the room
   * server's storage, so a review reopened outside that room — later, from the
   * lobby, on an install whose server had hibernated — put every model back where
   * it had arrived. Optional, and absent on every review written before then,
   * which means "nobody moved anything".
   */
  placements?: readonly StoredPlacement[] | null;
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
    setRoomScene(applyStoredPlacements(
      curationScene(asset.modelHash, asset.importedFileName),
      asset.placements,
    ));
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
        setRoomScene(applyStoredPlacements({ models: [model], builtIn: null }, asset.placements));
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

// ─── The whole review, not just the model its curation names ────────────────

/**
 * Reviews this browser has already rebuilt a scene for.
 *
 * A guard on OPENING rather than on correctness. setConfig runs on every
 * realtime echo and every poll of the curation row, and rebuilding the scene
 * from history each time would pull the models somebody had just hidden or moved
 * back to how the database says they were. Once per open is what "opening a
 * design review" means; after that the scene belongs to the room server (in a
 * room) and to the person using it (everywhere).
 *
 * Cleared by forgetReviewScene when the review is left, so opening it again in
 * the same page session opens it properly rather than showing the single model
 * its curation row names.
 */
const rebuilt = new Set<string>();

/**
 * Forget that a review's scene was rebuilt, because the review is being left.
 *
 * Called from lib/activeReviewStore when its config is cleared and from the review
 * setup page on unmount. Without it, a curator who walks out of a review and back
 * in without reloading would get the curation's single model the second time and
 * the whole history the first — two different answers to the same question, which
 * is exactly the kind of inconsistency this batch exists to remove.
 */
export function forgetReviewScene(reviewId: string | null | undefined): void {
  if (reviewId) rebuilt.delete(reviewId);
}

/**
 * Show a design review's models: its whole stored history if it has one, and its
 * curation's single model if it does not.
 *
 * The synchronous half is `showCurationModel`, unchanged, so the product is on
 * screen immediately and a review with no revisions behaves EXACTLY as it did
 * before model_revisions existed. The revision read happens after, and replaces
 * that scene only when there is a history to replace it with — and only while
 * nobody has touched the scene in the meantime, which is what stops a slow query
 * from undoing an import the curator made while it was running.
 *
 * In a room this is the opening move and not the final word: the room server owns
 * the scene and relays SCENE_STATE once this connection is admitted, which
 * replaces whatever is here. That is batch BB's rule and it does not change —
 * the room is the live space, and what is on screen in it is the server's.
 *
 * @returns false when the asset is not an imported model, which is the caller's
 *          cue to fall back to a preset, exactly as showCurationModel answers.
 */
export async function showReviewScene(
  reviewId: string | null | undefined,
  asset: CurationAssetModel | undefined,
  logAs: string,
): Promise<boolean> {
  const shown = showCurationModel(asset, logAs);
  if (!shown) return false;
  if (!reviewId || rebuilt.has(reviewId)) return true;
  rebuilt.add(reviewId);

  const before = useStore.getState().scene;
  const revisions = await listModelRevisions(reviewId);
  if (revisions.length === 0) return true;

  const state = useStore.getState();
  // Somebody changed the scene while the read was in flight — an import, a
  // Compare, a room server relay. Their change is the newer fact.
  if (state.scene !== before) return true;

  // The curation's own model goes in even when history has never heard of it,
  // which is every review created before the table existed: it is the product the
  // viewpoints and pins were placed on, and dropping it would have left them
  // floating in empty space next to whatever was uploaded afterwards.
  const unrecorded =
    asset?.modelHash && asset.importedFileName
      ? curationSceneModel(asset.modelHash, asset.importedFileName)
      : null;
  // History decides WHICH models are in the scene and which of them is visible;
  // the review's own placements then decide where each one stands. The stored
  // placement wins over the beside-each-other default sceneFromRevisions computes,
  // because that default is a guess about a room nobody has been in since, and the
  // placement is where somebody actually left it (batch BI).
  state.setRoomScene(applyStoredPlacements(
    sceneFromRevisions(revisions, unrecorded),
    asset?.placements,
  ));
  return true;
}
