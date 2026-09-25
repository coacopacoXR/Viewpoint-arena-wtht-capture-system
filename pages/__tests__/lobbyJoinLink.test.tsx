// The lobby page: how you get into a room from it, and what the grid shows.
//
// docs/plan/15-sessions-and-variants.md batch BO. Two things about the page as a whole
// that neither the card's test nor the data hook's test can see:
//
//   * WHAT THE JOIN BOX ACCEPTS. A bare id, a path, or the whole link somebody pasted —
//     including the `?line=` of a variant, because dropping it would put a person
//     invited to Variant A into the main line's meeting. And what it refuses: a box with
//     nothing recognisable in it is an error message, not a room called "https:".
//   * THAT THE OLD RULES SURVIVED THE REBUILD. Nobody enters a room nameless; a guest
//     sees only the review they were invited to; arriving by a link preselects that
//     review and makes Join the primary button; the Admin link is drawn only for somebody
//     the admin screen would let in.
//
// The mocking setup is the one pages/__tests__/lobbyNewSession.test.tsx established,
// widened to every table lib/lobby/useLobbyData batches.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useReviewSetupStore } from '../../lib/reviewSetupStore';
import type { MyReview } from '../../lib/reviewParticipantsRepo';

const { tables, mineMock, createReviewMock, summaryMock, configHolder } = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  mineMock: { current: [] as MyReview[] },
  createReviewMock: vi.fn<(reviewId: string) => Promise<unknown>>(),
  summaryMock: { current: null as null | Record<string, unknown> },
  configHolder: { current: null as Record<string, unknown> | null },
}));

vi.mock('../../lib/supabase', () => {
  const OPS = ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle', 'single', 'is', 'neq'];
  function chainFor(table: string) {
    const methods: Record<string, () => unknown> = {};
    for (const op of OPS) methods[op] = () => chainFor(table);
    return Object.assign(Promise.resolve({ data: tables[table] ?? [], error: null }), methods);
  }
  return {
    supabase: {
      from: (table: string) => chainFor(table),
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
    supabaseConfigured: true,
  };
});

vi.mock('../../lib/curationsRepo', () => ({
  createReview: (reviewId: string) => createReviewMock(reviewId),
  getCurationSummary: () => Promise.resolve(summaryMock.current),
  // Imported by the room-side code the lobby pulls in; nothing on this page calls them.
  listRecentCurations: vi.fn(async () => []),
  listArchivedIds: vi.fn(async () => new Set<string>()),
  deleteCuration: vi.fn(),
  trackCurationPresence: vi.fn(() => () => {}),
}));

vi.mock('../../lib/reviewParticipantsRepo', () => ({
  listMyReviews: () => Promise.resolve(mineMock.current),
  describeLastVisit: () => 'today',
}));

vi.mock('../../lib/reviews/deleteClient', () => ({
  deleteReview: vi.fn(async () => ({ ok: true })),
  deleteSession: vi.fn(async () => ({ ok: true })),
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
const ACCOUNTS = { identity: { mode: 'accounts', methods: ['password'], allowGuests: true } };

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

const REVIEW_ID = '2f1c9a4e-77b6-4d0e-9a11-6c1e0b7d5f33';
const LINE_ID = '9d0b1c2e-3f4a-4b5c-8d6e-7f8091a2b3c4';

function curation(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    title: `Review ${id}`,
    description: '',
    asset: { modelType: 'imported', importedFileName: `${id}.glb` },
    thumbnail: null,
    owner_id: 'somebody-else',
    archived: false,
    listed: true,
    created_at: '2026-09-01T09:00:00.000Z',
    updated_at: '2026-09-20T09:00:00.000Z',
    ...over,
  };
}

async function renderLobby(state?: { joinRoomId?: string }) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/', state: state ?? null }]}>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/room/:roomId" element={<RoomProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  // The grid arrives by promise.
  await act(async () => {});
}

/** A signed-in account on a deployment with accounts. */
function signInAs(accountId: string, name = 'Alex Chen') {
  localStorage.setItem('vp_user', JSON.stringify({ name, color: '#4F8EF7', accountId }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useReviewSetupStore.getState().discardDraft();
  for (const key of Object.keys(tables)) delete tables[key];
  tables['review_curations'] = [curation('r1', { title: 'Door hinge' }), curation('r2', { title: 'Bike frame' })];
  tables['review_members'] = [];
  tables['tracker_sessions'] = [];
  tables['review_lines'] = [];
  tables['tracker_items'] = [];
  tables['model_revisions'] = [];
  mineMock.current = [];
  summaryMock.current = null;
  createReviewMock.mockReset().mockResolvedValue({ reviewId: 'draft' });
  configHolder.current = NONE;
  localStorage.setItem('vp_user', JSON.stringify({ name: 'Alex Chen', color: '#4F8EF7' }));
});

afterEach(cleanup);

describe('the lobby — the join box', () => {
  async function join(value: string) {
    fireEvent.change(screen.getByLabelText('Room code or link'), { target: { value } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('join-button'));
    });
  }

  it('enters a room by its bare id', async () => {
    await renderLobby();
    await join(REVIEW_ID);
    expect(screen.getByTestId('room-path').textContent).toBe(`/room/${REVIEW_ID}`);
    expect(screen.getByTestId('room-search').textContent).toBe('');
  });

  it('enters a room from the whole link somebody pasted', async () => {
    await renderLobby();
    await join(`https://arena.example.com/room/${REVIEW_ID}`);
    expect(screen.getByTestId('room-path').textContent).toBe(`/room/${REVIEW_ID}`);
  });

  it('keeps the variant a link names, because that is a different meeting', async () => {
    await renderLobby();
    await join(`/room/${REVIEW_ID}?line=${LINE_ID}`);
    expect(screen.getByTestId('room-path').textContent).toBe(`/room/${REVIEW_ID}`);
    expect(screen.getByTestId('room-search').textContent).toBe(`?line=${LINE_ID}`);
  });

  it('refuses something that is not a room, rather than opening a room called that', async () => {
    await renderLobby();
    await join('https://arena.example.com/tracker');
    expect(screen.getByRole('status')).toHaveTextContent('Enter a room code or link.');
    expect(screen.queryByTestId('room-path')).toBeNull();
  });

  it('refuses an empty box', async () => {
    await renderLobby();
    await join('   ');
    expect(screen.getByRole('status')).toHaveTextContent('Enter a room code or link.');
  });

  it('still refuses to let anybody into a room nameless', async () => {
    localStorage.clear();
    await renderLobby();
    await join(REVIEW_ID);
    expect(screen.getByRole('status')).toHaveTextContent('Enter your name first.');
    expect(screen.queryByTestId('room-path')).toBeNull();
  });

  it('creates nothing, because the review either exists or its creator made it', async () => {
    await renderLobby();
    await join(REVIEW_ID);
    expect(createReviewMock).not.toHaveBeenCalled();
  });
});

describe('the lobby — starting a review', () => {
  it('writes the row, then opens that same review with Edit on', async () => {
    await renderLobby();
    await act(async () => {
      fireEvent.click(screen.getByTestId('new-design-review'));
    });
    expect(createReviewMock).toHaveBeenCalledTimes(1);
    const reviewId = createReviewMock.mock.calls[0][0];
    expect(screen.getByTestId('room-path').textContent).toBe(`/room/${reviewId}`);
    // Edit is on: the person who just created a review is the one about to put a model in
    // it, and without Edit they land in a room where import is locked.
    expect(screen.getByTestId('room-search').textContent).toBe('?edit=1');
    expect(sessionStorage.getItem('vp_enteredRoom')).toBe(reviewId);
    expect(useReviewSetupStore.getState().draft).toEqual({ reviewId: 'draft' });
  });

  it('still opens the room when the database refused the row', async () => {
    // The default self-hosted install has no database configured, so a refused write is
    // its NORMAL answer and not an incident.
    createReviewMock.mockResolvedValue(null);
    await renderLobby();
    await act(async () => {
      fireEvent.click(screen.getByTestId('new-design-review'));
    });
    const reviewId = createReviewMock.mock.calls[0][0];
    expect(screen.getByTestId('room-path').textContent).toBe(`/room/${reviewId}`);
    expect(useReviewSetupStore.getState().draft?.reviewId).toBe(reviewId);
  });
});

describe('the lobby — the grid and its chips', () => {
  it('draws a card per review, and starts on All where there are no accounts', async () => {
    await renderLobby();
    expect(screen.getAllByTestId('review-card')).toHaveLength(2);
    expect(screen.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'true');
  });

  it('narrows to the reviews this account owns, and to the ones shared with it', async () => {
    configHolder.current = ACCOUNTS;
    signInAs('me');
    tables['review_curations'] = [
      curation('r1', { title: 'Hinge assembly', owner_id: 'me' }),
      curation('r2', { title: 'Frame jig' }),
      curation('r3', { title: 'Somebody else’s entirely' }),
    ];
    tables['review_members'] = [{ review_id: 'r2', user_id: 'me', role: 'editor' }];
    await renderLobby();

    // Asserted on the cards rather than by text: the chip is called "Mine" too, and the
    // selected card's title is repeated in the preview panel beside the grid.
    const cardTitles = () => screen.getAllByTestId('review-card').map((card) => card.textContent ?? '');

    // Signed in, so the page opens on Mine.
    expect(screen.getByTestId('filter-mine')).toHaveAttribute('aria-pressed', 'true');
    expect(cardTitles()).toEqual([expect.stringContaining('Hinge assembly')]);

    await act(async () => {
      fireEvent.click(screen.getByTestId('filter-shared'));
    });
    expect(cardTitles()).toEqual([expect.stringContaining('Frame jig')]);

    await act(async () => {
      fireEvent.click(screen.getByTestId('filter-all'));
    });
    expect(cardTitles()).toHaveLength(3);
  });

  it('shows an archived review only under Archived', async () => {
    tables['review_curations'] = [
      curation('r1', { title: 'Kept' }),
      curation('r2', { title: 'Put away by an admin', archived: true }),
    ];
    await renderLobby();
    expect(screen.getAllByTestId('review-card')).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId('filter-archived'));
    });
    const cards = screen.getAllByTestId('review-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Put away by an admin');
  });

  it('selects a card and fills the preview beside it', async () => {
    await renderLobby();
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('review-card')[1].querySelector('button') as HTMLElement);
    });
    await waitFor(() =>
      expect(screen.getByTestId('preview-title')).toHaveTextContent('Bike frame'),
    );
  });
});

describe('the lobby — arriving by a link, and arriving as a guest', () => {
  it('preselects the review the link named and makes Join the primary button', async () => {
    summaryMock.current = {
      id: 'invited-1', title: 'The one you were invited to', description: '', viewpoint_count: 0,
      pin_count: 0, slide_count: 0, listed: false, thumbnail: null,
      created_at: '2026-09-01T09:00:00.000Z', updated_at: '2026-09-20T09:00:00.000Z',
    };
    // Not in the grid: a link-only review is not offered to strangers.
    await renderLobby({ joinRoomId: 'invited-1' });
    expect(screen.getByTestId('review-preview')).toHaveTextContent('The one you were invited to');
    expect(screen.getByTestId('preview-join')).toHaveTextContent('Join');
    expect(screen.queryByTestId('preview-open-room')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-join'));
    });
    expect(screen.getByTestId('room-path').textContent).toBe('/room/invited-1');
  });

  it('shows a guest the review they were invited to and no others', async () => {
    localStorage.setItem('vp_user', JSON.stringify({ name: 'Supplier', color: '#4F8EF7', guest: true }));
    await renderLobby({ joinRoomId: 'r2' });
    const cards = screen.getAllByTestId('review-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Bike frame');
    // A guest may enter the room they were invited to and start nothing.
    expect(screen.queryByTestId('new-design-review')).toBeNull();
    // And the chips are not theirs either: they narrow a set of reviews a guest was never
    // given, and a count on one is a statement about the whole install.
    expect(screen.queryByTestId('filter-all')).toBeNull();
    expect(screen.getByText(/only design review you can open/i)).toBeInTheDocument();
  });

  it('draws the name field inline, not behind the chip, when there is no name yet', async () => {
    localStorage.clear();
    await renderLobby();
    expect(screen.getByTestId('lobby-name-field')).toBeInTheDocument();
    // Filling it in takes the inline field away; the chip's copy is then the only one.
    await act(async () => {
      fireEvent.change(screen.getByTestId('lobby-name-field'), { target: { value: 'Alex Chen' } });
    });
    expect(screen.queryByTestId('lobby-name-field')).toBeNull();
  });

  it('holds the colour, the role and Sign out behind the name chip', async () => {
    configHolder.current = ACCOUNTS;
    signInAs('me');
    await renderLobby();
    await act(async () => {
      fireEvent.click(screen.getByTestId('identity-chip'));
    });
    const menu = screen.getByTestId('identity-menu');
    expect(menu).toHaveTextContent('Avatar colour');
    expect(menu).toHaveTextContent('Systems Architect');
    expect(screen.getByTestId('identity-sign-out')).toBeInTheDocument();
    // A signed-in account's name is the account's, so the chip does not offer to edit it.
    expect(menu.querySelector('#lobby-chip-name')).toBeNull();
  });

  it('does not offer the admin screen to somebody the admin screen would lock out', async () => {
    // useAdminGate fails LOCKED when it cannot reach /api/admin-unlock, which is what
    // jsdom does — the same answer a deployment with no passphrase configured gives.
    await renderLobby();
    expect(screen.queryByTestId('lobby-admin-link')).toBeNull();
    expect(screen.getByTestId('lobby-tracker-link')).toBeInTheDocument();
  });
});
