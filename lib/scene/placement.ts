// Where a model goes when it joins a scene that already has something in it.
//
// The plan asks for two arrangements, and both are the same idea: put the new
// thing BESIDE what is there, far enough away that neither overlaps the other,
// and leave everything else where it was.
//
//   * importing a different model adds it "next to" the current one;
//   * comparing two revisions puts the older at its own offset and shifts the
//     newer out by the older's width plus the same gap.
//
// The gap is a fraction of the width rather than a fixed distance because an
// imported model is normalised to about two scene units across (centerModel in
// utils/modelLoader.ts scales the longest dimension to 2) but the user's scale
// slider can make it ten times that, and a fixed gap that looked right for a
// bracket would have put a scaled-up assembly on top of its neighbour.
//
// Pure and three-free on purpose: the caller measures the geometry and passes
// widths in, which is what makes these testable without a WebGL context.

import type { SceneModel } from './roomScene';

/** How much of the existing models' combined width to leave as a gap. */
export const PLACEMENT_GAP_FRACTION = 0.2;

/**
 * A model's footprint along X: where it sits, and how wide it is.
 *
 * `offset` is the SceneModel's, and `width` is the model's extent in scene
 * units AFTER the base normalisation and the user's scale slider. An imported
 * model is centred on its own origin in X and Z by centerModel, so its extent
 * is symmetric about offset[0] — which is the only assumption the arithmetic
 * below makes.
 */
export interface SceneExtent {
  offset: [number, number, number];
  width: number;
}

/** A scene model's width in scene units, from the geometry the caller measured. */
export function sceneWidth(localWidth: number, baseScale: number, scale: number): number {
  return localWidth * baseScale * scale;
}

/** The left and right edge of everything in `extents`, or null when there is nothing. */
export function combinedXExtent(extents: SceneExtent[]): { min: number; max: number } | null {
  if (extents.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const extent of extents) {
    const half = extent.width / 2;
    min = Math.min(min, extent.offset[0] - half);
    max = Math.max(max, extent.offset[0] + half);
  }
  return { min, max };
}

/**
 * Where a model of `width` goes so it sits beside everything already there.
 *
 * Its left edge lands one gap beyond the right edge of the combined bounding
 * box, and the gap is PLACEMENT_GAP_FRACTION of that box's width — so a scene
 * holding one two-unit model puts the next one's centre at 2.4, and a scene
 * holding a wide assembly leaves proportionally more air. Nothing else moves,
 * which is what makes "add next to it" different from "replace everything": the
 * models already under discussion stay exactly where the room put them.
 *
 * An empty scene gets the origin, because there is nothing to be beside.
 */
export function nextToOffset(
  existing: SceneExtent[],
  width: number,
  gapFraction: number = PLACEMENT_GAP_FRACTION,
): [number, number, number] {
  const extent = combinedXExtent(existing);
  if (!extent) return [0, 0, 0];
  const gap = (extent.max - extent.min) * gapFraction;
  return [extent.max + gap + width / 2, 0, 0];
}

/**
 * Side-by-side placement for Compare: the older revision stays where the room
 * had it, the newer one moves out beside it.
 *
 * Moving the NEWER one and not the older is deliberate. The older revision is
 * the one the room has been discussing — the viewpoints, pins and comments all
 * point at where it is — so a comparison that slid it sideways would have left
 * every pin floating in empty space next to the model it was placed on.
 *
 * Both models keep their Y and Z: revisions of one product differ in detail,
 * not in size, and lifting one off the floor to make room would have read as a
 * mistake rather than a comparison.
 */
export function compareOffsets(
  older: SceneExtent,
  newer: SceneExtent,
  gapFraction: number = PLACEMENT_GAP_FRACTION,
): { older: [number, number, number]; newer: [number, number, number] } {
  const gap = older.width * gapFraction;
  const newerX = older.offset[0] + older.width / 2 + gap + newer.width / 2;
  return {
    older: [older.offset[0], older.offset[1], older.offset[2]],
    newer: [newerX, newer.offset[1], newer.offset[2]],
  };
}

/** The footprints of every model in a scene, measured by the caller. */
export function sceneExtents(
  models: SceneModel[],
  widthOf: (model: SceneModel) => number,
): SceneExtent[] {
  return models.map((model) => ({ offset: model.offset, width: widthOf(model) }));
}
