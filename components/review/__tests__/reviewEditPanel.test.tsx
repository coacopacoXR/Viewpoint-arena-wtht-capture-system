// The room's Edit panel: the curation tabs, in the place Capture · Comments ·
// Chat usually is.
//
// docs/plan/14-rooms-models-admin-ai.md batch BH. What is pinned here is the set
// of tabs and the rules about who gets which one — the tab bodies are already
// pinned where they live (components/review/__tests__, pages/__tests__), and they
// are the same components the curate page used, so only the panel around them is
// new.
//
//   • The order is Agenda · Views · Pins · Requirements · Labels · People, which
//     is the order from the approved sketch and NOT the curate page's (Asset
//     first). There is no Asset tab at all: its model picker is the model tree's
//     job, its transform is the amber strip's, and its "+ Revision" is the import
//     flow's.
//   • The People tab is ABSENT on a deployment without accounts, not disabled:
//     with identity.mode 'none' there is no roster to list and no email address
//     that could resolve to one, so the tab could only ever fail.
//   • A People tab that was selected before accounts were known about falls back
//     to Agenda rather than leaving an empty panel where six tabs were.
//   • A room with no review to edit is not a dead end (batch BN): the panel creates
//     the row, says what it is doing while it does, and only says what failed — with
//     a way to try again — if the write did not land.
//   • "Delete design review" is offered to the people the room says may, asks inline
//     and names the review, and leaves for the lobby when it lands.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useActiveReviewStore } from '../../../lib/activeReviewStore';
import { createReviewDraft } from '../../../lib/reviewSetupStore';
import type { ReviewDraft } from '../../../lib/reviewSetupStore';

const { configHolder, curationsMock, deleteMock } = vi.hoisted(() => ({
  configHolder: { current: null as Record<string, unknown> | null },
  curationsMock: { load: vi.fn(), create: vi.fn() },
  deleteMock: { review: vi.fn() },
}));

// Only the identity mode is faked. useConnectorConfig's real one fetches
// /api/public-config, which a test has no server for; the shape returned here is
// the one pages/__tests__/lobbyYourReviews.test.tsx fakes, and `config` is the
// field publicIdentityOf reads.
vi.mock('../../../lib/config/ConfigContext', () => ({
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

// The one tab that reads the members endpoint. Everything else renders for real.
vi.mock('../PeopleTab', () => ({ default: () => <div data-testid="people-tab" /> }));

// The row the panel reads and the one it writes when a room has none. Spread over the
// real module rather than replacing it, because lib/activeReviewStore and the tabs
// reach other exports of it.
vi.mock('../../../lib/curationsRepo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/curationsRepo')>()),
  loadCuration: (id: string) => curationsMock.load(id) as Promise<ReviewDraft | null>,
  createReview: (id: string) => curationsMock.create(id) as Promise<ReviewDraft | null>,
}));

// The endpoint's browser side. Faked rather than served: what matters here is which
// review the panel asked to have deleted, and that it leaves when the answer is yes.
vi.mock('../../../lib/reviews/deleteClient', () => ({
  deleteReview: (reviewId: string) => deleteMock.review(reviewId),
  deleteSession: vi.fn(),
}));

const ReviewEditPanel = (await import('../ReviewEditPanel')).default;

const ACCOUNTS = { identity: { mode: 'accounts', methods: ['password'], allowGuests: false } };
const NONE = { identity: { mode: 'none', methods: [], allowGuests: false } };

/** The six aria-labels, in the order the sketch put them in. */
const TAB_LABELS = ['Agenda', 'Viewpoints', 'Pins', 'Requirements', 'Labels', 'People'];

function seededDraft(): ReviewDraft {
  return {
    ...createReviewDraft('rev-1', 'Landing gear review'),
    viewpoints: [
      { id: 'vp-1', label: 'View 1', position: [1, 1, 1], lookAt: [0, 0, 0], createdAt: 1 },
    ],
    pins: [
      {
        id: 'pin-1',
        label: 'Bracket',
        worldPos: [0, 1, 0],
        severity: 'concern',
        createdAt: 1,
      },
    ],
    agenda: [
      { id: 'slide-1', title: 'Walk the assembly', viewpointIds: [], pinIds: [] },
    ],
    requirements: [
      { id: 'req-1', code: 'R1', description: 'Fits the bay', category: 'MECH', status: 'PENDING' },
    ],
  };
}

function tabLabels(): Array<string | null> {
  return screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'));
}

function selectedTabs(): string[] {
  return screen
    .getAllByRole('tab')
    .filter((tab) => tab.getAttribute('aria-selected') === 'true')
    .map((tab) => tab.getAttribute('aria-label') ?? '');
}

beforeEach(() => {
  configHolder.current = ACCOUNTS;
  useActiveReviewStore.setState({ config: seededDraft() });
  curationsMock.load.mockReset().mockResolvedValue(null);
  curationsMock.create.mockReset().mockResolvedValue(null);
  deleteMock.review.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  useActiveReviewStore.setState({ config: null });
});

describe('the review edit panel', () => {
  it('offers the six sections, in the order the sketch put them in', () => {
    render(<ReviewEditPanel reviewId="rev-1" />);

    expect(screen.getByRole('tablist', { name: 'Review sections' })).toBeInTheDocument();
    // The VISIBLE labels are shortened ("Reqs" for Requirements, "Views" for
    // Viewpoints) while the aria-labels are the full words, so this is the
    // naming a screen reader hears.
    expect(tabLabels()).toEqual(TAB_LABELS);
  });

  it('opens on the Agenda, with its panel the one shown', () => {
    render(<ReviewEditPanel reviewId="rev-1" />);

    expect(selectedTabs()).toEqual(['Agenda']);
    expect(screen.getByRole('tabpanel', { name: 'Agenda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add blank slide/ })).toBeInTheDocument();
  });

  it('selects a tab that is clicked and deselects every other one', () => {
    render(<ReviewEditPanel reviewId="rev-1" />);

    for (const label of TAB_LABELS) {
      fireEvent.click(screen.getByRole('tab', { name: label }));

      expect(selectedTabs()).toEqual([label]);
      expect(screen.getByRole('tabpanel', { name: label })).toBeInTheDocument();
    }
  });

  it('shows the body of the tab that was clicked', () => {
    render(<ReviewEditPanel reviewId="rev-1" />);

    fireEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(screen.getByTestId('people-tab')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Agenda' }));
    expect(screen.queryByTestId('people-tab')).toBeNull();
    // The slide's title is an input, so this is its value rather than its text.
    expect(screen.getByDisplayValue('Walk the assembly')).toBeInTheDocument();
  });

  it('has no People tab at all on a deployment without accounts', () => {
    configHolder.current = NONE;
    render(<ReviewEditPanel reviewId="rev-1" />);

    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(tabLabels()).toEqual(TAB_LABELS.filter((label) => label !== 'People'));
    // Absent, not disabled: there is no roster it could ever list.
    expect(screen.queryByRole('tab', { name: 'People' })).toBeNull();
  });

  it('falls back to the Agenda when the selected tab stops existing', () => {
    const view = render(<ReviewEditPanel reviewId="rev-1" />);

    fireEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(screen.getByTestId('people-tab')).toBeInTheDocument();

    // A config that arrives late, or arrives changed: the tab that was selected
    // is no longer offered, and an empty panel is not an answer.
    configHolder.current = NONE;
    view.rerender(<ReviewEditPanel reviewId="rev-1" />);

    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(selectedTabs()).toEqual(['Agenda']);
    expect(screen.getByRole('tabpanel', { name: 'Agenda' })).toBeInTheDocument();
    expect(screen.queryByTestId('people-tab')).toBeNull();
  });

  // ─── A room with no review to edit (batch BN) ────────────────────────────────
  // The bug this replaces: a room opened from the lobby's "New session" had no
  // review_curations row, an admin or the meeting host still got Edit, and the panel
  // said "This room has no design review to edit yet" with nothing to press — so views
  // and pins could not be saved.

  it('creates the review a room did not have, and shows the tabs once it exists', async () => {
    useActiveReviewStore.setState({ config: null });
    curationsMock.create.mockResolvedValue(seededDraft());
    render(<ReviewEditPanel reviewId="rev-1" />);

    // While the row is being written: what is happening, not a dead end.
    expect(screen.getByText('Setting up this design review…')).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);

    await vi.waitFor(() => {
      expect(screen.queryAllByRole('tab').length).toBeGreaterThan(0);
    });
    expect(curationsMock.create).toHaveBeenCalledWith('rev-1');
    // Seeded into the store, which is what makes "Save this view" have somewhere to
    // go and what RoomPage's subscriber then persists.
    expect(useActiveReviewStore.getState().config?.reviewId).toBe('rev-1');
    expect(screen.queryByText('This room has no design review to edit yet.')).toBeNull();
  });

  it('takes the row that is already there instead of writing an empty one over it', async () => {
    // RoomPage's own read may still be in flight when Edit is granted, and createReview
    // upserts: writing a fresh draft over a row that exists would empty a review
    // somebody else has already saved into.
    const existing = seededDraft();
    useActiveReviewStore.setState({ config: null });
    curationsMock.load.mockResolvedValue(existing);
    render(<ReviewEditPanel reviewId="rev-1" />);

    await vi.waitFor(() => {
      expect(screen.queryAllByRole('tab').length).toBeGreaterThan(0);
    });
    expect(curationsMock.create).not.toHaveBeenCalled();
    expect(useActiveReviewStore.getState().config).toBe(existing);
  });

  it('says plainly what failed, and tries again when asked', async () => {
    useActiveReviewStore.setState({ config: null });
    render(<ReviewEditPanel reviewId="rev-1" />);

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        'Could not create the design review for this room. Check the connection and try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);

    curationsMock.create.mockResolvedValue(seededDraft());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await vi.waitFor(() => {
      expect(screen.queryAllByRole('tab').length).toBeGreaterThan(0);
    });
    expect(curationsMock.create).toHaveBeenCalledTimes(2);
  });
});

// ─── Deleting the review ──────────────────────────────────────────────────────
// Rendered inside a router because the panel navigates to the lobby when a delete
// lands, and `useNavigate` has nothing to read outside one.

/** Where the panel went, which is the only thing a successful delete has to prove. */
const PathProbe: React.FC = () => <div data-testid="path">{useLocation().pathname}</div>;

function renderInRoom(mayDeleteReview: boolean) {
  return render(
    <MemoryRouter initialEntries={['/room/rev-1']}>
      <Routes>
        <Route
          path="/room/:roomId"
          element={<ReviewEditPanel reviewId="rev-1" mayDeleteReview={mayDeleteReview} />}
        />
        <Route path="/" element={<PathProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('deleting the design review', () => {
  it('is not offered to somebody the room did not say may', () => {
    renderInRoom(false);

    expect(screen.queryByRole('button', { name: /Delete design review/ })).toBeNull();
  });

  it('asks first, naming the review, and deletes nothing until it is answered', () => {
    renderInRoom(true);

    fireEvent.click(screen.getByRole('button', { name: /Delete design review/ }));

    expect(screen.getByTestId('delete-review')).toBeInTheDocument();
    expect(screen.getByText(/Landing gear review/)).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    expect(deleteMock.review).not.toHaveBeenCalled();
  });

  it('goes back to the lobby when the delete lands', async () => {
    renderInRoom(true);

    fireEvent.click(screen.getByRole('button', { name: /Delete design review/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await vi.waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe('/');
    });
    expect(deleteMock.review).toHaveBeenCalledWith('rev-1');
  });

  it('stays put and says what the endpoint said when it is refused', async () => {
    deleteMock.review.mockResolvedValue({
      ok: false,
      error: 'Only the owner of this design review, or an administrator, can delete it.',
    });
    renderInRoom(true);

    fireEvent.click(screen.getByRole('button', { name: /Delete design review/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await vi.waitFor(() => {
      expect(
        screen.getByText('Only the owner of this design review, or an administrator, can delete it.'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId('path')).toBeNull();
  });

  it('cancels without deleting', () => {
    renderInRoom(true);

    fireEvent.click(screen.getByRole('button', { name: /Delete design review/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteMock.review).not.toHaveBeenCalled();
    expect(screen.queryByTestId('delete-review')).toBeNull();
  });
});
