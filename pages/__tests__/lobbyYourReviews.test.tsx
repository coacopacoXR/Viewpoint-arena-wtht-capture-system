// The lobby's "Your reviews" — the list that follows a person rather than a
// link.
//
// docs/plan/13-identity.md batch AZ. What is pinned here is who sees it: a
// signed-in account on a deployment that has them, and nobody else. A guest
// gets no list (they were admitted to one meeting, they do not have a history
// of the others), and a deployment on identity.mode 'none' — every install made
// before identity existed — renders exactly what it rendered before, down to
// making no request at all.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MyReview } from '../../lib/reviewParticipantsRepo';

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

const { curationsMock, myReviewsMock, configHolder } = vi.hoisted(() => ({
  curationsMock: { list: vi.fn() },
  myReviewsMock: { list: vi.fn() },
  configHolder: { current: null as Record<string, unknown> | null },
}));

vi.mock('../../lib/curationsRepo', () => ({
  listRecentCurations: () => curationsMock.list(),
  deleteCuration: vi.fn(),
  getCurationSummary: vi.fn(async () => null),
}));

// Only the read is faked. describeLastVisit stays the real one, so the "3 days
// ago" below is the string a person actually sees.
vi.mock('../../lib/reviewParticipantsRepo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/reviewParticipantsRepo')>()),
  listMyReviews: () => myReviewsMock.list(),
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

const ACCOUNTS = { identity: { mode: 'accounts', methods: ['password'], allowGuests: false } };
const NONE = { identity: { mode: 'none', methods: [], allowGuests: false } };

const DAY = 86_400_000;

function review(overrides: Partial<MyReview> = {}): MyReview {
  return {
    reviewId: 'room-1',
    role: 'participant',
    firstJoinedAt: new Date(Date.now() - 9 * DAY).toISOString(),
    lastJoinedAt: new Date().toISOString(),
    title: 'Landing gear review',
    ...overrides,
  };
}

function signIn(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    'vp_user',
    JSON.stringify({ name: 'Alex Chen', color: '#4F8EF7', accountId: 'account-1', ...overrides }),
  );
}

async function renderLobby() {
  const result = render(
    <MemoryRouter>
      <LobbyPage />
    </MemoryRouter>,
  );
  // The list, the saved reviews and the tracker stats all arrive by promise.
  await act(async () => {});
  return result;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  curationsMock.list.mockReset().mockResolvedValue([]);
  myReviewsMock.list.mockReset().mockResolvedValue([]);
  configHolder.current = ACCOUNTS;
});

afterEach(() => {
  cleanup();
});

describe('a signed-in person on a deployment with accounts', () => {
  beforeEach(() => {
    signIn();
  });

  it('lists the reviews they took part in, with their role and when', async () => {
    myReviewsMock.list.mockResolvedValue([
      review({ reviewId: 'room-1', role: 'host', title: 'Landing gear review' }),
      review({
        reviewId: 'bbbbbbbb-2222',
        role: 'participant',
        title: null,
        lastJoinedAt: new Date(Date.now() - 3 * DAY).toISOString(),
      }),
    ]);

    await renderLobby();

    expect(screen.getByText('Your Reviews · 2')).toBeInTheDocument();
    expect(screen.getByText('Landing gear review')).toBeInTheDocument();
    expect(screen.getByText('Hosted')).toBeInTheDocument();
    expect(screen.getByText('today')).toBeInTheDocument();
    // A session nobody curated has no title, and its room id is the only name
    // it ever had.
    expect(screen.getByText('Session bbbbbbbb')).toBeInTheDocument();
    expect(screen.getByText('Joined')).toBeInTheDocument();
    expect(screen.getByText('3 days ago')).toBeInTheDocument();
  });

  it('sits above the saved reviews, which are what the link gives you', async () => {
    myReviewsMock.list.mockResolvedValue([review()]);
    curationsMock.list.mockResolvedValue([
      {
        id: 'room-9',
        title: 'A saved curation',
        description: '',
        viewpoint_count: 0,
        pin_count: 0,
        slide_count: 0,
        listed: true,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    await renderLobby();

    const headings = screen.getAllByText(/Reviews/).map((el) => el.textContent);
    expect(headings[0]).toMatch(/^Your Reviews/);
    expect(headings.some((text) => text?.startsWith('Saved Reviews'))).toBe(true);
  });

  it('offers the same edit action for a curated review, and none for an ad-hoc one', async () => {
    myReviewsMock.list.mockResolvedValue([
      review({ reviewId: 'room-1', title: 'Landing gear review' }),
      review({ reviewId: 'bbbbbbbb-2222', title: null }),
    ]);

    await renderLobby();

    expect(screen.getAllByTitle('Resume editing')).toHaveLength(1);
  });

  it('opens the room through the same path as every other row in the lobby', async () => {
    myReviewsMock.list.mockResolvedValue([review({ reviewId: 'room-1' })]);

    await renderLobby();
    await act(async () => {
      screen.getByTitle('Open the review room').click();
    });

    // enterRoom, not a bare navigate: the identity is written first, and the
    // account id survives it — dropping that here would sign the person out of
    // their own lobby the moment they opened a review.
    expect(sessionStorage.getItem('vp_enteredRoom')).toBe('room-1');
    const stored = JSON.parse(localStorage.getItem('vp_user') ?? '{}');
    expect(stored.accountId).toBe('account-1');
    expect(stored.name).toBe('Alex Chen');
  });

  it('says so when there is nothing to show yet', async () => {
    myReviewsMock.list.mockResolvedValue([]);

    await renderLobby();

    expect(
      screen.getByText('Reviews you take part in will appear here.'),
    ).toBeInTheDocument();
  });

  it('shows the list even when the read failed', async () => {
    // listMyReviews answers [] rather than throwing, so an install whose
    // database has not had the schema applied looks like an empty list — which
    // is the truth from here, and no reason to hide the section.
    myReviewsMock.list.mockResolvedValue([]);

    await renderLobby();

    expect(screen.getByText('Your Reviews')).toBeInTheDocument();
  });
});

describe('who does not get the list', () => {
  it('is not rendered on a deployment with identity off, and nothing is fetched', async () => {
    configHolder.current = NONE;
    signIn();
    myReviewsMock.list.mockResolvedValue([review()]);

    await renderLobby();

    expect(screen.queryByText(/Your Reviews/)).toBeNull();
    expect(myReviewsMock.list).not.toHaveBeenCalled();
    // The rest of the lobby is untouched: the saved reviews are still there.
    expect(screen.getByText(/Saved Reviews/)).toBeInTheDocument();
  });

  it('is not rendered for a guest, who has no account to key a row on', async () => {
    localStorage.setItem(
      'vp_user',
      JSON.stringify({ name: 'Supplier Sam', color: '#4F8EF7', guest: true }),
    );
    myReviewsMock.list.mockResolvedValue([review()]);

    await renderLobby();

    expect(screen.queryByText(/Your Reviews/)).toBeNull();
    expect(myReviewsMock.list).not.toHaveBeenCalled();
  });

  it('is not rendered for a browser that has not signed in', async () => {
    localStorage.setItem('vp_user', JSON.stringify({ name: 'Alex Chen', color: '#4F8EF7' }));

    await renderLobby();

    expect(screen.queryByText(/Your Reviews/)).toBeNull();
    expect(myReviewsMock.list).not.toHaveBeenCalled();
  });

  it('is not rendered while the deployment\'s config is still unknown', async () => {
    // No config means no identity block, which publicIdentityOf reads as
    // 'none'. Guessing the other way would flash the section at every visitor
    // of a default install while /api/public-config was in flight.
    configHolder.current = null;
    signIn();

    await renderLobby();

    expect(screen.queryByText(/Your Reviews/)).toBeNull();
    expect(myReviewsMock.list).not.toHaveBeenCalled();
  });
});
