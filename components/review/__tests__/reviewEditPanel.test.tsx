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
//   • Losing the review mid-edit is worth one sentence rather than six empty tabs.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useActiveReviewStore } from '../../../lib/activeReviewStore';
import { createReviewDraft } from '../../../lib/reviewSetupStore';
import type { ReviewDraft } from '../../../lib/reviewSetupStore';

const { configHolder } = vi.hoisted(() => ({
  configHolder: { current: null as Record<string, unknown> | null },
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

  it('says so in one sentence when the room has no review to edit', () => {
    useActiveReviewStore.setState({ config: null });
    render(<ReviewEditPanel reviewId="rev-1" />);

    expect(screen.getByText('This room has no design review to edit yet.')).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tablist', { name: 'Review sections' })).toBeNull();
  });
});
