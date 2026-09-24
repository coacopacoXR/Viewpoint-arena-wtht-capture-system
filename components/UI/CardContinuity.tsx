// The continuity line a card carries: "Raised on Rev A · still open on Rev C".
//
// docs/plan/14-rooms-models-admin-ai.md batch BC. The sentence itself is decided
// in lib/trackerContinuity.ts, which is pure; this is only the part that gets the
// data to the place the card is drawn.
//
// It is a context rather than a prop because a card is drawn from four places —
// the board's sortable card, the drag overlay that follows the pointer, the list
// row and the drawer — and threading a revision history and a table of close
// timestamps down through the dnd-kit column machinery would mean changing the
// signature of six components that have no other use for either. The provider
// renders no element of its own, so the board's flex layout is untouched.
//
// A card with nothing to say renders nothing at all: no empty paragraph, no
// placeholder row. That is what keeps an install whose database predates
// model_revisions — where no card has a revision — looking exactly as it did.

import React, { createContext, useContext } from 'react';
import type { TrackerItem } from '../../lib/supabase';
import type { ModelRevision } from '../../lib/reviews/revisionsRepo';
import { cardContinuity } from '../../lib/trackerContinuity';

export interface CardContinuityData {
  /** The stored revisions of each design review on screen, by review id. */
  revisionsByReview: Record<string, ModelRevision[]>;
  /** When each closed card was closed, by item id, from tracker_status_history. */
  closedAtByItem: Record<string, string>;
}

const NO_DATA: CardContinuityData = { revisionsByReview: {}, closedAtByItem: {} };

const CardContinuityContext = createContext<CardContinuityData>(NO_DATA);

export const CardContinuityProvider: React.FC<{
  value: CardContinuityData;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <CardContinuityContext.Provider value={value}>{children}</CardContinuityContext.Provider>
);

const CardContinuityLine: React.FC<{ item: TrackerItem; className?: string }> = ({ item, className }) => {
  const { revisionsByReview, closedAtByItem } = useContext(CardContinuityContext);
  const reviewId = item.review_id ?? null;
  const line = cardContinuity(
    {
      status: item.status,
      raisedOnRevision: item.raised_on_revision ?? null,
      closedAt: closedAtByItem[item.id] ?? null,
    },
    reviewId ? (revisionsByReview[reviewId] ?? []) : [],
  );
  if (!line) return null;
  return <p className={className ?? 'font-mono text-[10px] text-gray-500 leading-snug'}>{line}</p>;
};

export default CardContinuityLine;
