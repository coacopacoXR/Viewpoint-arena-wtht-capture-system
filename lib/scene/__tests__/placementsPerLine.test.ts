// Positions, per line — batch BV.
//
// `asset.placements` used to be the review's ONE slot, shared by every line, so a variant
// that moved a model overwrote where the main line had left it and whichever room
// re-seeded from the database last won. These tests pin the three promises the fix makes:
//
//   1. a variant's positions go to its own slot and leave the main line's alone;
//   2. the main line's positions go where every review has always kept them, and leave
//      every variant's slot alone;
//   3. a variant with no slot of its own opens on the main line's positions, because
//      "starts where the main line is" is what starting a variant means.
//
// The adopting half — a variant's positions becoming the main line's — is in
// deploy/__tests__/adoptLinePlacements.test.ts, because it is a line of SQL in
// `adopt_review_line` and not a line of anything here.

import { describe, it, expect, beforeEach } from 'vitest';
import { placementsForLine, type StoredPlacement } from '../placement';
import { keepReviewPlacements } from '../keepPlacements';
import { useActiveReviewStore } from '../../activeReviewStore';
import { useStore } from '../../../store';
import { consumeLocalEdit, forgetLocalEdit } from '../../reviewLocalEdit';
import type { ReviewDraft } from '../../reviewSetupStore';
import type { ReviewLine } from '../../reviews/lines';

const MAIN_SLOT: StoredPlacement = {
  line: 'bicycle', revision: 'A', offset: [1, 0, 0], rotation: [0, 0, 0], scale: 1,
};
const VARIANT_SLOT: StoredPlacement = {
  line: 'bicycle', revision: 'A', offset: [4, 0, -2], rotation: [0, 1.5, 0], scale: 1.25,
};

const VARIANT: ReviewLine = {
  id: 'line-a', reviewId: 'rev-1', kind: 'variant', name: 'Frame forward', letter: 'A',
  parentSessionId: null, status: 'active', createdBy: null, createdByName: 'Paco',
  createdAt: '2026-09-25T09:00:00.000Z', closedAt: null,
};
const MAIN: ReviewLine = { ...VARIANT, id: 'line-main', kind: 'main', name: 'Main line', letter: null };

function baseDraft(asset: ReviewDraft['asset'] = { modelType: 'headphones', references: [] }): ReviewDraft {
  return {
    reviewId: 'rev-1',
    title: 'Bike',
    description: '',
    asset,
    viewpoints: [],
    pins: [],
    agenda: [],
    requirements: [],
    team: [],
    labels: {},
    listed: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('placementsForLine — which slot a line opens on', () => {
  it('gives the main line the review’s own field, for a null and for an absent line', () => {
    expect(placementsForLine({ placements: [MAIN_SLOT] }, null)).toEqual([MAIN_SLOT]);
    expect(placementsForLine({ placements: [MAIN_SLOT] }, undefined)).toEqual([MAIN_SLOT]);
    expect(placementsForLine({ placements: [MAIN_SLOT] }, '   ')).toEqual([MAIN_SLOT]);
  });

  it('gives a variant with no slot of its own the main line’s positions', () => {
    // "A variant starts where the main line is." Not nothing, and not the scene's
    // beside-each-other default: the positions the main line actually left its models at.
    expect(placementsForLine({ placements: [MAIN_SLOT] }, 'line-a')).toEqual([MAIN_SLOT]);
    expect(placementsForLine({ placements: [MAIN_SLOT], linePlacements: {} }, 'line-a')).toEqual([MAIN_SLOT]);
  });

  it('gives a variant that HAS diverged its own, whatever the main line says', () => {
    const asset = { placements: [MAIN_SLOT], linePlacements: { 'line-a': [VARIANT_SLOT] } };
    expect(placementsForLine(asset, 'line-a')).toEqual([VARIANT_SLOT]);
    expect(placementsForLine(asset, 'line-b')).toEqual([MAIN_SLOT]);
    expect(placementsForLine(asset, null)).toEqual([MAIN_SLOT]);
  });

  it('honours an empty slot as the divergence it is, rather than as no slot', () => {
    // A variant whose models were all moved back to where they arrived has diverged: it
    // wants nothing moved. Reading that as "no slot" would put the main line's positions
    // back on it and undo the reset.
    expect(placementsForLine({ placements: [MAIN_SLOT], linePlacements: { 'line-a': [] } }, 'line-a')).toEqual([]);
  });

  it('answers nothing for a review with no asset, which is a review with no positions', () => {
    expect(placementsForLine(undefined, 'line-a')).toBeUndefined();
    expect(placementsForLine(null, null)).toBeUndefined();
  });
});

describe('activeReviewStore — setScenePlacements writes the line’s own slot', () => {
  beforeEach(() => {
    useActiveReviewStore.setState({ config: null, jumpTarget: null });
    useStore.setState({ comments: [], activeLine: null });
    forgetLocalEdit();
  });

  it('keeps a variant’s positions out of the main line’s', () => {
    useActiveReviewStore.getState().setConfig(
      baseDraft({ modelType: 'headphones', references: [], placements: [MAIN_SLOT] }),
    );
    forgetLocalEdit();

    const next = useActiveReviewStore.getState().setScenePlacements([VARIANT_SLOT], VARIANT.id);

    expect(next?.asset.placements).toEqual([MAIN_SLOT]);
    expect(next?.asset.linePlacements?.[VARIANT.id]).toEqual([VARIANT_SLOT]);
    expect(useActiveReviewStore.getState().config?.asset.placements).toEqual([MAIN_SLOT]);
    // Still an edit, and still marked as one: this is what RoomPage's subscriber saves.
    expect(consumeLocalEdit()).toBe(true);
  });

  it('keeps the main line’s positions out of every variant’s slot', () => {
    useActiveReviewStore.getState().setConfig(
      baseDraft({ modelType: 'headphones', references: [], linePlacements: { [VARIANT.id]: [VARIANT_SLOT] } }),
    );
    forgetLocalEdit();

    const next = useActiveReviewStore.getState().setScenePlacements([MAIN_SLOT], null);

    expect(next?.asset.placements).toEqual([MAIN_SLOT]);
    expect(next?.asset.linePlacements).toEqual({ [VARIANT.id]: [VARIANT_SLOT] });
  });

  it('writes nothing for a variant that has not diverged from the main line', () => {
    // It has no slot, and it is standing where the main line stands, so there is nothing
    // to remember — and writing an empty-ish copy would mark the review edited, broadcast
    // it and write the row for a change nobody can see.
    useActiveReviewStore.getState().setConfig(
      baseDraft({ modelType: 'headphones', references: [], placements: [MAIN_SLOT] }),
    );
    forgetLocalEdit();

    expect(useActiveReviewStore.getState().setScenePlacements([MAIN_SLOT], VARIANT.id)).toBeNull();
    expect(consumeLocalEdit()).toBe(false);
    expect(useActiveReviewStore.getState().config?.asset.linePlacements).toBeUndefined();
  });

  it('creates a variant’s slot on the first drag that does diverge', () => {
    useActiveReviewStore.getState().setConfig(
      baseDraft({ modelType: 'headphones', references: [], placements: [MAIN_SLOT] }),
    );
    forgetLocalEdit();

    const next = useActiveReviewStore.getState().setScenePlacements([VARIANT_SLOT], VARIANT.id);
    expect(next?.asset.linePlacements).toEqual({ [VARIANT.id]: [VARIANT_SLOT] });
    // And a second line's slot does not disturb the first one's. Written with a third
    // position: a line that has not diverged writes nothing at all, which is the promise
    // the test above this one pins.
    const second = useActiveReviewStore
      .getState()
      .setScenePlacements([{ ...MAIN_SLOT, offset: [9, 0, 0] }], 'line-b');
    expect(second?.asset.linePlacements).toEqual({
      [VARIANT.id]: [VARIANT_SLOT],
      'line-b': [{ ...MAIN_SLOT, offset: [9, 0, 0] }],
    });
    // The main line's own positions were written by neither.
    expect(second?.asset.placements).toEqual([MAIN_SLOT]);
  });
});

describe('keepReviewPlacements — the active line decides the slot', () => {
  beforeEach(() => {
    useStore.setState({ scene: { models: [], builtIn: null }, activeLine: null });
  });

  it('routes a variant’s drag to its own id, and every main-line drag to null', () => {
    const seen: Array<string | null | undefined> = [];
    const real = useActiveReviewStore.getState().setScenePlacements;
    useActiveReviewStore.setState({
      setScenePlacements: (_placements, lineId) => {
        seen.push(lineId);
        return null;
      },
    });
    try {
      // No line at all: an ad-hoc room, an install with no database, the setup page.
      keepReviewPlacements(() => true);
      // The main line resolved to its own row — which is still the review's own slot,
      // because `asset.placements` has no line id in it and must not gain one.
      useStore.setState({ activeLine: MAIN });
      keepReviewPlacements(() => true);
      useStore.setState({ activeLine: VARIANT });
      keepReviewPlacements(() => true);
    } finally {
      useActiveReviewStore.setState({ setScenePlacements: real });
    }

    expect(seen).toEqual([null, null, VARIANT.id]);
  });
});
