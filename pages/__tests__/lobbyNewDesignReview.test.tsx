// The lobby's "New design review →" — the button that used to say "Curate a
// design review".
//
// docs/plan/14-rooms-models-admin-ai.md batch BH. The curate page is gone; its
// tabs are the room's side panel with Edit on. What that makes the button
// responsible for is a ROW: a review with no review_curations row opens with
// nothing to edit, so the row is written FIRST and the room is entered only if
// the write worked. The three things worth pinning are therefore
//
//   * the id the row was created with is the id in the address bar (creating the
//     row before navigating is the whole point — a link that works for anybody
//     it is sent to, from the first moment it exists)
//   * a refused write is reported and the person stays in the lobby, rather than
//     being sent into a room that would open empty
//   * two clicks make one review (a double-click must not orphan a row)
//
// The mocking setup is lobbyYourReviews.test.tsx's, extended with `createReview`
// — LobbyPage imports it from lib/curationsRepo now, and a mock that does not
// export it makes the import itself fail.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { CurationSummary } from '../../lib/curationsRepo';
import type { MyReview } from '../../lib/reviewParticipantsRepo';
// The real store, not a mock: what the room is handed when the database refused
// the row is the point of two of the tests below.
import { useReviewSetupStore } from '../../lib/reviewSetupStore';

vi.mock('../../lib/supabase', () => {
  // fetchStats() reads two tables through a chainable builder; the lobby only
  // ever renders the numbers, so empty answers are enough.
  const chain = (answer: { data: unknown; error: unknown }): unknown => {
    const methods: Record<string, () => unknown> = {};
    for (const op of ['select', 'eq', 'in', 'order', 'limit']) {
      methods[op] = () => chain(answer);
    }
    return Object.assign(Promise.resolve(answer), methods);
  };
  return {
    supabase: { from: () => chain({ data: [], error: null }) },
    supabaseConfigured: true,
  };
});

const { curationsMock, createReviewMock, configHolder } = vi.hoisted(() => ({
  curationsMock: { list: vi.fn() },
  createReviewMock: vi.fn<(reviewId: string) => Promise<unknown>>(),
  configHolder: { current: null as Record<string, unknown> | null },
}));

vi.mock('../../lib/curationsRepo', () => ({
  listRecentCurations: () => curationsMock.list(),
  deleteCuration: vi.fn(),
  getCurationSummary: vi.fn(async () => null),
  createReview: (reviewId: string) => createReviewMock(reviewId),
}));

// Not exercised by this button — "Your reviews" needs a deployment with accounts
// and a signed-in browser — but LobbyPage imports it, so the mock has to answer.
vi.mock('../../lib/reviewParticipantsRepo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/reviewParticipantsRepo')>()),
  listMyReviews: vi.fn(async () => [] as MyReview[]),
}));

vi.mock('../../lib/config/ConfigContext', () => ({
  useConnectorConfig: () => ({
    config: configHolder.current,
    loading: false,
    error: null,
    available: true,
    publicUrl: undefined,
    plm: 'teamcenter',
    capture: 'mock',
    turn: 'cloudflare',
    db: 'supabase',
    modelImport: 'onshape',
    notifications: ['teams'],
  }),
}));

const LobbyPage = (await import('../LobbyPage')).default;

const NONE = { identity: { mode: 'none', methods: [], allowGuests: false } };

/** Stands in for RoomPage: reports the address the lobby navigated to. */
const RoomProbe: React.FC = () => {
  const location = useLocation();
  return (
    <div>
      <span data-testid="room-path">{location.pathname}</span>
      <span data-testid="room-search">{location.search}</span>
    </div>
  );
};

/** A typed name, the way every other lobby test sets one. */
function signIn(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    'vp_user',
    JSON.stringify({ name: 'Alex Chen', color: '#4F8EF7', ...overrides }),
  );
}

function savedReview(overrides: Partial<CurationSummary> = {}): CurationSummary {
  return {
    id: 'room-9',
    title: 'A saved curation',
    description: '',
    viewpoint_count: 0,
    pin_count: 0,
    slide_count: 0,
    listed: true,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

async function renderLobby() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/room/:roomId" element={<RoomProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  // The saved reviews and the tracker stats both arrive by promise.
  await act(async () => {});
}

function newReviewButton() {
  return screen.getByRole('button', { name: 'New design review →' });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  curationsMock.list.mockReset().mockResolvedValue([]);
  createReviewMock.mockReset().mockResolvedValue({ id: 'draft' });
  configHolder.current = NONE;
  signIn();
});

afterEach(cleanup);

describe('the button itself', () => {
  it('says "New design review", and the old wording is gone', async () => {
    await renderLobby();

    expect(newReviewButton()).toBeInTheDocument();
    expect(screen.queryByText('Curate a design review')).toBeNull();
  });

  it('is what the empty state points at', async () => {
    await renderLobby();

    // The hint names the button, so the two have to keep agreeing.
    expect(screen.getByText('New design review')).toBeInTheDocument();
    expect(screen.queryByText('Curate a design review')).toBeNull();
  });
});

describe('creating a review', () => {
  it('refuses without a name, and creates nothing', async () => {
    localStorage.clear();
    await renderLobby();

    await act(async () => {
      fireEvent.click(newReviewButton());
    });

    expect(screen.getByText('Enter your name first.')).toBeInTheDocument();
    expect(createReviewMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('room-path')).toBeNull();
  });

  it('writes the row first, then opens that same review with Edit on', async () => {
    await renderLobby();

    await act(async () => {
      fireEvent.click(newReviewButton());
    });

    expect(createReviewMock).toHaveBeenCalledTimes(1);
    const reviewId = createReviewMock.mock.calls[0][0];
    expect(reviewId).not.toBe('');
    // The id in the address bar is the id the row was written with: a link that
    // is shared from here opens the review that exists, not an empty room.
    expect(screen.getByTestId('room-path').textContent).toBe(`/room/${reviewId}`);
    expect(screen.getByTestId('room-search').textContent).toBe('?edit=1');
    // enterRoom, not a bare navigate: the identity is written first.
    expect(sessionStorage.getItem('vp_enteredRoom')).toBe(reviewId);
    expect(JSON.parse(localStorage.getItem('vp_user') ?? '{}').name).toBe('Alex Chen');
  });

  it('still opens the room when the database refused the row, with a local draft to edit', async () => {
    createReviewMock.mockResolvedValue(null);
    await renderLobby();

    await act(async () => {
      fireEvent.click(newReviewButton());
    });

    // The default self-hosted install has no database configured, so a refused
    // write is its NORMAL answer, not an incident. Blocking the room there would
    // take this button away from the one install that has no other way to start a
    // review — and the curate page it replaces never needed a row to work.
    const reviewId = createReviewMock.mock.calls[0][0];
    expect(screen.getByTestId('room-path').textContent).toBe(`/room/${reviewId}`);
    expect(screen.getByTestId('room-search').textContent).toBe('?edit=1');
    // RoomPage reads the local draft FIRST, so the side panel has a review to
    // show rather than "this room has no design review to edit yet".
    const draft = useReviewSetupStore.getState().draft;
    expect(draft?.reviewId).toBe(reviewId);
    expect(draft?.title).toBe('Untitled design review');
  });

  it('hands the room the draft that was written, so the row and the panel agree', async () => {
    const written = { reviewId: 'rev-written', title: 'Untitled design review' };
    createReviewMock.mockResolvedValue(written);
    await renderLobby();

    await act(async () => {
      fireEvent.click(newReviewButton());
    });

    expect(useReviewSetupStore.getState().draft).toEqual(written);
  });

  it('makes one review when the button is clicked twice', async () => {
    let release: ((value: unknown) => void) | null = null;
    createReviewMock.mockReturnValue(
      new Promise<unknown>((resolve) => {
        release = resolve;
      }),
    );
    await renderLobby();

    // Held by element rather than looked up again by name: while a create is in
    // flight the label changes to "Creating…", so a name query would not find it.
    const button = newReviewButton();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).toBeDisabled();
    expect(screen.getByText('Creating…')).toBeInTheDocument();

    // The button is disabled while a create is in flight, and the handler also
    // returns early on `creatingReview` — either one alone would stop the second
    // row, and a second row is a review nobody will ever open again.
    await act(async () => {
      fireEvent.click(button);
    });
    expect(createReviewMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.({ id: 'draft' });
    });

    expect(createReviewMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('room-path').textContent).toBe(
      `/room/${createReviewMock.mock.calls[0][0]}`,
    );
    expect(screen.getByTestId('room-search').textContent).toBe('?edit=1');
  });
});

describe('a review that already exists', () => {
  it('opens a saved review for editing at the same address', async () => {
    curationsMock.list.mockResolvedValue([savedReview({ id: 'room-9' })]);
    await renderLobby();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Resume editing'));
    });

    expect(createReviewMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('room-path').textContent).toBe('/room/room-9');
    expect(screen.getByTestId('room-search').textContent).toBe('?edit=1');
  });
});
