// Archived design reviews stay out of the lobby — both of its lists — while a
// link to one still opens it.
//
// docs/plan/14-rooms-models-admin-ai.md batch BE: "archived reviews are hidden
// from the lobby but kept". The lobby has TWO lists and they are fed from
// different tables, which is why this file keeps lib/curationsRepo real and
// fakes only the database under it:
//
//   * "Saved design reviews" comes out of review_curations, so the filter is in
//     the query listRecentCurations builds;
//   * "Your design reviews" comes out of review_participants, which has no
//     `archived` column to filter on — listMyReviews is faked here (it is
//     pinned down by lib/__tests__/reviewParticipantsRepo.test.ts) and the
//     archived ones are dropped by listArchivedIds, which runs for real;
//   * the invited preview a room link produces goes through getCurationSummary,
//     which must NOT filter, or an archived review would stop opening for the
//     person holding its link.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MyReview } from '../../lib/reviewParticipantsRepo';

/** The `review_curations` rows this lobby reads. */
const db = vi.hoisted(() => ({
  curations: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../lib/supabase', () => {
  interface Filter {
    column: string;
    op: 'eq' | 'in';
    value: unknown;
  }

  const matches = (row: Record<string, unknown>, filter: Filter) =>
    filter.op === 'eq'
      ? row[filter.column] === filter.value
      : Array.isArray(filter.value) && filter.value.includes(row[filter.column]);

  function query(table: string, filters: Filter[], limit: number | null) {
    // Only review_curations is a table this page's reads care about; the
    // tracker stats read two more and render nothing from them here.
    const settle = () => {
      const rows = table === 'review_curations' ? db.curations : [];
      const kept = rows.filter((row) => filters.every((f) => matches(row, f)));
      const data = (limit === null ? kept : kept.slice(0, limit)).map((row) => ({ ...row }));
      return { data, error: null };
    };
    // `.order()` is accepted and ignored: nothing below asserts a sort, and
    // faking one would mean knowing which column each caller ordered by.
    const chain: Record<string, unknown> = {
      then: (onFulfilled: (value: unknown) => unknown) => onFulfilled(settle()),
      select: () => query(table, filters, limit),
      eq: (column: string, value: unknown) => query(table, [...filters, { column, op: 'eq', value }], limit),
      in: (column: string, value: unknown) => query(table, [...filters, { column, op: 'in', value }], limit),
      order: () => query(table, filters, limit),
      limit: (count: number) => query(table, filters, count),
      maybeSingle: () => Promise.resolve(settle()).then((answer) => {
        const rows = answer.data as Array<Record<string, unknown>>;
        return { data: rows.length > 0 ? rows[0] : null, error: null };
      }),
    };
    return chain;
  }

  const channel: Record<string, unknown> = {
    on: () => channel,
    subscribe: () => channel,
    presenceState: () => ({}),
    track: () => Promise.resolve({ error: null }),
  };

  return {
    supabase: {
      from: (table: string) => query(table, [], null),
      // Not used by the lobby, but present so an import that reaches for them
      // fails loudly rather than on a missing property.
      channel: () => channel,
      removeChannel: () => {},
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
    supabaseConfigured: true,
  };
});

const { myReviewsMock, configHolder } = vi.hoisted(() => ({
  myReviewsMock: { list: vi.fn() },
  configHolder: { current: null as Record<string, unknown> | null },
}));

// Only the participant read is faked. lib/curationsRepo stays REAL, so the
// filters the lobby ends up applying are the ones it applies in production.
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

/** A review_curations row. `listed` and `archived` are explicit: the fake
 *  database compares them by value and does not apply column defaults. */
function curation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'room-1',
    title: 'Landing gear review',
    description: '',
    viewpoints: [],
    pins: [],
    agenda: [],
    requirements: [],
    team: [],
    labels: {},
    listed: true,
    archived: false,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-22T00:00:00Z',
    ...overrides,
  };
}

function myReview(reviewId: string, title: string | null): MyReview {
  return {
    reviewId,
    role: 'participant',
    firstJoinedAt: '2026-09-20T00:00:00Z',
    lastJoinedAt: '2026-09-22T00:00:00Z',
    title,
  };
}

function signIn() {
  localStorage.setItem(
    'vp_user',
    JSON.stringify({ name: 'Alex Chen', color: '#4F8EF7', accountId: 'account-1' }),
  );
}

async function renderLobby(state?: Record<string, unknown>) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/', state: state ?? null }]}>
      <LobbyPage />
    </MemoryRouter>,
  );
  // Saved reviews, your reviews and the tracker stats all arrive by promise —
  // and "your reviews" waits on a second query for the archived flags.
  await act(async () => {});
  await act(async () => {});
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  db.curations = [];
  myReviewsMock.list.mockReset().mockResolvedValue([]);
  configHolder.current = ACCOUNTS;
  signIn();
});

afterEach(cleanup);

describe('Saved design reviews', () => {
  it('leaves out a review an admin has put away, and keeps the rest', async () => {
    db.curations = [
      curation({ id: 'room-1', title: 'Landing gear review' }),
      curation({ id: 'room-2', title: 'Put away by an admin', archived: true }),
      curation({ id: 'room-3', title: 'Wing rib study' }),
    ];

    await renderLobby();

    expect(screen.getByText('Saved design reviews · 2')).toBeInTheDocument();
    expect(screen.getByText('Landing gear review')).toBeInTheDocument();
    expect(screen.getByText('Wing rib study')).toBeInTheDocument();
    expect(screen.queryByText('Put away by an admin')).toBeNull();
  });

  it('still leaves out a link-only review, which is a different flag', async () => {
    // `listed` and `archived` are two filters on one query; adding the second
    // must not have disturbed the first.
    db.curations = [
      curation({ id: 'room-1', title: 'Landing gear review' }),
      curation({ id: 'room-2', title: 'Link only', listed: false }),
      curation({ id: 'room-3', title: 'Put away by an admin', archived: true }),
    ];

    await renderLobby();

    expect(screen.getByText('Saved design reviews · 1')).toBeInTheDocument();
    expect(screen.queryByText('Link only')).toBeNull();
    expect(screen.queryByText('Put away by an admin')).toBeNull();
  });

  it('says so when everything in it has been put away', async () => {
    db.curations = [curation({ id: 'room-2', title: 'Put away by an admin', archived: true })];

    await renderLobby();

    expect(screen.getByText('No saved design reviews yet.')).toBeInTheDocument();
    expect(screen.queryByText('Put away by an admin')).toBeNull();
  });
});

describe('Your design reviews', () => {
  it('leaves out a review an admin has put away, and keeps the rest', async () => {
    // `listed: false` keeps these out of the Saved list above, so a title in
    // this test belongs to exactly one list and getByText cannot find two.
    db.curations = [
      curation({ id: 'room-1', title: 'Landing gear review', listed: false }),
      curation({ id: 'room-2', title: 'Put away by an admin', archived: true, listed: false }),
    ];
    // An ad-hoc session has no curation row at all, so there is nothing to
    // archive and it must survive the check.
    myReviewsMock.list.mockResolvedValue([
      myReview('room-1', 'Landing gear review'),
      myReview('room-2', 'Put away by an admin'),
      myReview('aaaaaaaa-1111', null),
    ]);

    await renderLobby();

    expect(screen.getByText('Your design reviews · 2')).toBeInTheDocument();
    expect(screen.getByText('Landing gear review')).toBeInTheDocument();
    expect(screen.getByText('Session aaaaaaaa')).toBeInTheDocument();
    expect(screen.queryByText('Put away by an admin')).toBeNull();
  });

  it('is empty, not stuck loading, when all of it has been put away', async () => {
    db.curations = [
      curation({ id: 'room-2', title: 'Put away by an admin', archived: true, listed: false }),
    ];
    myReviewsMock.list.mockResolvedValue([myReview('room-2', 'Put away by an admin')]);

    await renderLobby();

    expect(
      screen.getByText('Design reviews you take part in will appear here.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Put away by an admin')).toBeNull();
  });
});

describe('a link to an archived review', () => {
  it('still previews it, because the lobby is not the only way in', async () => {
    // Archiving hides a review from the lists; it does not break the address
    // somebody already has. The invited preview is getCurationSummary, which
    // filters on the id and nothing else.
    db.curations = [
      curation({
        id: 'room-2',
        title: 'Put away by an admin',
        description: 'Still openable by its link.',
        archived: true,
        agenda: [{ id: 'a1' }],
      }),
    ];

    await renderLobby({ joinRoomId: 'room-2' });

    expect(screen.getByText('Put away by an admin')).toBeInTheDocument();
    expect(screen.getByText('Still openable by its link.')).toBeInTheDocument();
    // And it is not in the Saved list at the same time.
    expect(screen.getByText(/No saved design reviews yet/)).toBeInTheDocument();
  });
});
