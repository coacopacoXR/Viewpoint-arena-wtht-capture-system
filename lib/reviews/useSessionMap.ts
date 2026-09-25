// What the session map draws, fetched.
//
// docs/plan/15-sessions-and-variants.md batch BK. components/review/SessionMap.tsx
// reads the database nothing at all — it is given lines, sessions, revisions and
// cards and draws them — so that the same component can sit over the room's canvas
// and inside the tracker's design-review view, and so a test can hand it fixture
// data and assert on the drawing. This is the half that fetches.
//
// Four reads, made together, and all four already answer "nothing" rather than
// throwing: a review on an install whose database has not been re-applied since
// this batch gets an empty map and an empty message, not an error boundary. The map
// is opened on purpose by somebody pressing a button, so it reads when it is asked
// to and not on every room render.

import { useCallback, useEffect, useState } from 'react';
import {
  listLines,
  listReviewCardRefs,
  listReviewSessions,
  resetLineCache,
  type LineSession,
  type SessionCardRef,
} from './linesRepo';
import { listModelRevisions, type ModelRevision } from './revisionsRepo';
import type { ReviewLine } from './lines';

export interface SessionMapData {
  lines: ReviewLine[];
  sessions: LineSession[];
  revisions: ModelRevision[];
  cards: SessionCardRef[];
  loading: boolean;
  /** Read again. Drops the line cache first, so a variant created since appears. */
  refresh: () => void;
}

const EMPTY: Omit<SessionMapData, 'loading' | 'refresh'> = {
  lines: [],
  sessions: [],
  revisions: [],
  cards: [],
};

export function useSessionMap(reviewId: string | null | undefined): SessionMapData {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  // Bumped by refresh() so the effect below re-runs for the same review id.
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => {
    // The module cache exists so one page load does not ask for the same rows
    // three times; a refresh is the one moment the caller is saying "ask again".
    resetLineCache();
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!reviewId) {
      setData(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [lines, sessions, revisions, cards] = await Promise.all([
        listLines(reviewId),
        listReviewSessions(reviewId),
        listModelRevisions(reviewId),
        listReviewCardRefs(reviewId),
      ]);
      if (cancelled) return;
      setData({ lines, sessions, revisions, cards });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reviewId, nonce]);

  return { ...data, loading, refresh };
}
