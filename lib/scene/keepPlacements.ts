// Remembering where the models stand with the REVIEW as well as with the room.
//
// Batch BI's answer, lifted out of components/Scene/ReviewModelGizmo.tsx because
// batch BR gave it a second caller: the amber strip's "Reset part" and "Reset all
// parts" change a placement too, and a reset that reached only the room would have
// been undone by the next time the review was opened — the review would still be
// carrying the override the person had just removed.
//
// The room server persists the scene with its own storage, and room storage is the
// room's: a review is opened again long after that room is gone, from the lobby, on
// an install whose server hibernated. So every change to where a model or one of its
// parts stands gets a second copy written into the review's own `asset.placements`,
// which rides the REVIEW_CONFIG the room already broadcasts and the row the review
// already saves. See lib/scene/placement.ts for why that field and not a column.

import { useStore } from '../../store';
import { useActiveReviewStore } from '../activeReviewStore';
import type { ReviewDraft } from '../reviewSetupStore';
import { placementsFromScene } from './placement';

/**
 * Write the scene's placements — models and their moved parts — into the review.
 *
 * Broadcasts the draft that came back, and only that one: what goes out is what this
 * screen is now showing, which is the pairing the strip's "Save this view" keeps for
 * the same reason. Null back from the store means there was nothing to remember — no
 * review open, or every model and every part ended where it started — and then
 * nothing is sent and no row is marked edited.
 *
 * Called once per DRAG and not per frame, by the callers: onObjectChange fires on
 * every pointer move and each of these is a whole review broadcast to everybody in
 * the room and a row written a second later.
 */
export function keepReviewPlacements(broadcastReviewConfig: (config: ReviewDraft) => boolean): void {
  const next = useActiveReviewStore.getState().setScenePlacements(
    placementsFromScene(useStore.getState().scene.models),
  );
  if (next) broadcastReviewConfig(next);
}
