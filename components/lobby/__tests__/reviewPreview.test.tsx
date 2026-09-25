// The preview panel: seeing inside a design review without entering it.
//
// docs/plan/15-sessions-and-variants.md batch BO. Three things are pinned here.
//
// 1. WHAT IT SHOWS — every meeting with its label, its date, who was in it and how many
//    cards it raised, and the minutes of the last one drawn the way the room's own
//    session panel draws them.
// 2. WHO IS OFFERED THE DELETES — the owner and this install's administrators, per
//    lib/reviews/roles.ts `deleteReview`, and NOT the review's editors. Both ask INLINE:
//    window.confirm cannot be styled to the panel that offered it, cannot be tested, and
//    freezes the page behind it while it waits.
// 3. THAT THE 3D VIEWER IS LAZY — three.js is hundreds of kilobytes and the lobby is a
//    list. The chunk is fetched when the "Turn in 3D" button is pressed and not before,
//    which is the whole reason the snapshot exists as the default answer.
//
// The panel's own read (lib/reviews/useSessionMap) is mocked: this file is about what the
// panel DRAWS, and the hook has its own coverage.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LobbyReview } from '../../../lib/lobby/useLobbyData';
import type { LineSession, SessionCardRef } from '../../../lib/reviews/linesRepo';
import type { ReviewLine } from '../../../lib/reviews/lines';
import type { ModelRevision } from '../../../lib/reviews/revisionsRepo';

const { mapData, deletes, viewer } = vi.hoisted(() => ({
  mapData: {
    current: {
      lines: [] as ReviewLine[],
      sessions: [] as LineSession[],
      revisions: [] as ModelRevision[],
      cards: [] as SessionCardRef[],
      loading: false,
      refresh: () => {},
    },
  },
  deletes: { review: vi.fn(), session: vi.fn() },
  /** Bumped by the module factory, which runs when — and only when — the chunk loads. */
  viewer: { imports: 0 },
}));

vi.mock('../../../lib/reviews/useSessionMap', () => ({
  useSessionMap: () => mapData.current,
}));

vi.mock('../../../lib/reviews/deleteClient', () => ({
  deleteReview: (...args: unknown[]) => deletes.review(...args),
  deleteSession: (...args: unknown[]) => deletes.session(...args),
}));

// The lazy boundary under test. vi.mock replaces the module, and the FACTORY is what
// React.lazy's import() resolves to — so counting factory calls counts chunk loads
// without needing a real bundle.
vi.mock('../ReviewModelViewer', () => {
  viewer.imports += 1;
  return { default: () => <div data-testid="viewer-3d" /> };
});

const ReviewPreview = (await import('../ReviewPreview')).default;

const MAIN: ReviewLine = {
  id: 'line-main', reviewId: 'r1', kind: 'main', name: 'Main line', letter: null,
  parentSessionId: null, status: 'active', createdBy: null, createdByName: 'Coaco',
  createdAt: '2026-09-20T09:00:00.000Z', closedAt: null,
};

const VARIANT: ReviewLine = {
  ...MAIN, id: 'line-a', kind: 'variant', name: 'Steel hinge pin', letter: 'A',
  parentSessionId: 's1', status: 'adopted', closedAt: '2026-09-23T09:00:00.000Z',
};

function session(id: string, over: Partial<LineSession> = {}): LineSession {
  return {
    id, title: id, endedAt: '2026-09-20T09:00:00.000Z', participantCount: 2,
    attendeeNames: ['Coaco', 'Ben'], modelName: 'hinge.glb', lineId: 'line-main',
    seq: 1, revisionIds: [], summary: null, ...over,
  };
}

function card(id: string, sessionId: string, type: SessionCardRef['type']): SessionCardRef {
  return { id, sessionId, type, title: `Card ${id}`, status: 'Open', priority: 'High', lineId: 'line-main', originLineId: null };
}

function review(over: Partial<LobbyReview> = {}): LobbyReview {
  return {
    id: 'r1', title: 'Door hinge, rev C', description: '', thumbnail: 'data:image/jpeg;base64,AAAA',
    modelName: 'hinge.glb', updatedAt: '2026-09-24T09:00:00.000Z', createdAt: '2026-09-01T09:00:00.000Z',
    archived: false, listed: true, memberRole: 'owner', mine: true, visited: true,
    lastVisitedAt: '2026-09-24T09:00:00.000Z',
    sessions: [], lines: [], openCards: { RISK: 3, ACTION: 5, RATIONALE: 2 }, revision: 'Rev C',
    ...over,
  };
}

/** The review the panel is given, with the detail its own read would have answered. */
function armDetail() {
  mapData.current = {
    lines: [MAIN, VARIANT],
    sessions: [
      session('s1', { seq: 1, endedAt: '2026-09-20T09:00:00.000Z' }),
      session('s2', { seq: 1, lineId: 'line-a', endedAt: '2026-09-22T09:00:00.000Z', attendeeNames: ['Olga'] }),
      session('s3', {
        seq: 2,
        endedAt: '2026-09-24T09:00:00.000Z',
        attendeeNames: ['Coaco', 'Maria'],
        summary: '## Risks raised\n- Hinge pin wears after 1000 cycles\n## Actions\n- Cycle test the steel pin',
      }),
    ],
    revisions: [],
    cards: [card('c1', 's3', 'RISK'), card('c2', 's3', 'ACTION'), card('c3', 's1', 'RATIONALE')],
    loading: false,
    refresh: () => {},
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof ReviewPreview>> = {}) {
  render(
    <MemoryRouter>
      <ReviewPreview
        review={review()}
        mayDelete
        onOpen={() => {}}
        onDeleted={() => {}}
        onChanged={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  armDetail();
  deletes.review.mockReset().mockResolvedValue({ ok: true, sessions: 3, items: 6 });
  deletes.session.mockReset().mockResolvedValue({ ok: true, items: 2 });
  // `viewer.imports` is deliberately NOT reset: it counts module loads, and a module is
  // loaded once per run no matter how many panels mount. Resetting it would make the
  // laziness assertion depend on which test pressed the button first.
});

afterEach(cleanup);

describe('the preview panel — the session map it embeds', () => {
  it('embeds it compact, so the panel does not say everything twice', () => {
    renderPanel();

    const map = screen.getByTestId('preview-session-map');
    // This panel's own header has just named the review, counted its sessions and drawn
    // a card around the lot. Batch BO embedded the map as the room mounts it, so the
    // same three facts appeared again three lines lower, inside a second card inside
    // the first — which is what `compact` is for.
    expect(map.querySelector('[data-testid="session-map-heading"]')).toBeNull();
    expect(map.innerHTML).not.toMatch(/shadow-xl/);
    // What the map is FOR survives: the drawing, its stops, and the key that explains
    // the two end states a line can be in.
    expect(map.querySelectorAll('[data-testid="session-stop"]')).toHaveLength(3);
    expect(map.textContent).toContain('Adopted');
    expect(map.textContent).toContain('Dropped');
  });
});

describe('the preview panel', () => {
  it('names the review, how many people have been in it, and how many meetings it has held', () => {
    renderPanel();
    // The panel's own heading, not the session map's: the map repeats the review's name
    // because it is a self-contained component the room and the tracker also show.
    expect(screen.getByTestId('preview-title')).toHaveTextContent('Door hinge, rev C');
    expect(screen.getByText(/4 people · 3 sessions · 1 variant/)).toBeInTheDocument();
  });

  it('lists every meeting with its label, its date, who was in it and its card count', () => {
    renderPanel();
    const rows = screen.getByTestId('preview-session-rows');
    expect(rows).toHaveTextContent('S2');
    expect(rows).toHaveTextContent('Coaco, Maria');
    expect(rows).toHaveTextContent('2 cards');
    // The variant's meeting is labelled by its own line, not by the main line's numbering.
    expect(rows).toHaveTextContent('A1');
  });

  it('lists the meetings newest first, because the last one is the one worth reading', () => {
    renderPanel();
    const labels = screen
      .getAllByTestId(/^delete-session-/)
      .map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual(['Delete session S2', 'Delete session A1', 'Delete session S1']);
  });

  it('draws the last meeting’s minutes the way the room’s session panel does', () => {
    renderPanel();
    const minutes = screen.getByTestId('preview-minutes');
    // "## " and "- " are recognised as a heading and a bullet, so the markers do not show.
    expect(minutes).toHaveTextContent('Risks raised');
    expect(minutes).toHaveTextContent('Hinge pin wears after 1000 cycles');
    expect(minutes.textContent).not.toContain('##');
    expect(minutes.textContent).not.toContain('- ');
  });

  it('shows no minutes block at all for a review whose last meeting stored none', () => {
    mapData.current = {
      ...mapData.current,
      sessions: [session('s1', { summary: null })],
    };
    renderPanel();
    expect(screen.queryByTestId('preview-minutes')).toBeNull();
  });

  it('links to the tracker filtered to this review', () => {
    renderPanel();
    expect(screen.getByTestId('preview-tracker')).toHaveAttribute('href', '/tracker?review=r1');
  });

  it('makes Join the primary button for somebody who arrived by a link', () => {
    renderPanel({ invited: true });
    expect(screen.getByTestId('preview-join')).toHaveTextContent('Join');
    expect(screen.queryByTestId('preview-open-room')).toBeNull();
  });
});

describe('the preview panel — deleting', () => {
  it('offers the deletes to an owner, and asks inline before doing anything', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderPanel({ mayDelete: true });

    fireEvent.click(screen.getByTestId('delete-review'));
    expect(screen.getByTestId('inline-confirm')).toHaveTextContent('Delete this design review?');
    expect(deletes.review).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deletes.review).toHaveBeenCalledTimes(1));
    expect(deletes.review.mock.calls[0][0]).toBe('r1');
    // Never a browser dialog: it cannot be styled to the panel, cannot be tested, and
    // freezes the page behind it while it waits.
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('offers the delete ONCE, inline — the map inside the panel is a diagram', () => {
    // SessionMap carries its own "Delete review" and per-stop session deletes, and both
    // ask with window.confirm. In the room and the tracker that is the only control
    // surface there is, so it is right; in a panel that already has both deletes under
    // its own list of sessions it would be a second way to remove the same review.
    renderPanel({ mayDelete: true });
    expect(screen.getAllByRole('button', { name: /Delete review/i })).toHaveLength(1);
    expect(screen.queryByTestId('delete-review')).toBeInTheDocument();
  });

  it('does not offer them to somebody who may not delete the review', () => {
    renderPanel({ mayDelete: false });
    expect(screen.queryByTestId('delete-review')).toBeNull();
    expect(screen.queryAllByTestId(/^delete-session-/)).toHaveLength(0);
  });

  it('says what the endpoint refused, and keeps the review', async () => {
    deletes.review.mockResolvedValue({ ok: false, error: 'Only the owner of this design review can delete it.' });
    const onDeleted = vi.fn();
    renderPanel({ mayDelete: true, onDeleted });

    fireEvent.click(screen.getByTestId('delete-review'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Only the owner of this design review');
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('deletes one meeting through the same endpoint, and cancels without deleting', async () => {
    renderPanel({ mayDelete: true });

    fireEvent.click(screen.getByTestId('delete-session-S1'));
    expect(screen.getByTestId('inline-confirm')).toHaveTextContent('Delete S1');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deletes.session).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('delete-session-S1'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deletes.session).toHaveBeenCalledTimes(1));
    expect(deletes.session.mock.calls[0][0]).toBe('r1');
    expect(deletes.session.mock.calls[0][1]).toBe('s1');
  });

  it('passes the meeting-host claim only where the caller says to', async () => {
    // A deployment with no accounts has no token to verify, so the endpoint takes the
    // caller's own claim — see api/reviews/delete.ts. Where there ARE accounts the claim
    // must stay false, or the lobby would be asserting something the room never said.
    renderPanel({ mayDelete: true, isMeetingHost: true });
    fireEvent.click(screen.getByTestId('delete-review'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deletes.review).toHaveBeenCalledTimes(1));
    expect(deletes.review.mock.calls[0][1]).toEqual({ isMeetingHost: true });
  });
});

describe('the preview panel — "Turn in 3D" is lazy', () => {
  it('does not load the viewer until the button is pressed', async () => {
    // Counted from wherever the module registry happens to be, so the assertion is about
    // THIS panel and not about which test ran first: React.lazy resolves the chunk the
    // first time the element renders, and never before.
    const loadedBefore = viewer.imports;
    renderPanel();
    expect(screen.getByTestId('preview-thumbnail')).toBeInTheDocument();
    expect(screen.queryByTestId('viewer-3d')).toBeNull();
    // The panel is fully drawn — map, sessions, minutes — and three.js has not been fetched.
    expect(viewer.imports).toBe(loadedBefore);

    await act(async () => {
      fireEvent.click(screen.getByTestId('turn-in-3d'));
    });

    await waitFor(() => expect(viewer.imports).toBeGreaterThan(loadedBefore));
    expect(await screen.findByTestId('viewer-3d')).toBeInTheDocument();
    // The snapshot is no longer the thing being shown.
    expect(screen.queryByTestId('preview-thumbnail')).toBeNull();
  });

  it('goes back to the snapshot, and does not fetch the chunk a second time', async () => {
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByTestId('turn-in-3d'));
    });
    await screen.findByTestId('viewer-3d');
    const loadedBefore = viewer.imports;

    await act(async () => {
      fireEvent.click(screen.getByTestId('turn-in-3d'));
    });
    expect(screen.getByTestId('preview-thumbnail')).toBeInTheDocument();
    expect(screen.queryByTestId('viewer-3d')).toBeNull();
    // Unmounting is what disposes the viewer's geometry; turning back does not re-fetch.
    expect(viewer.imports).toBe(loadedBefore);
  });

  it('shows the model name in the placeholder when the review has no snapshot', () => {
    renderPanel({ review: review({ thumbnail: null }) });
    expect(screen.getByTestId('preview-placeholder')).toHaveTextContent('hinge.glb');
  });
});
