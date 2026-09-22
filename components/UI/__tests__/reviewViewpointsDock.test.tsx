// ReviewViewpointsDock positioning tests.
//
// The expanded card must not overlap the right sidebar. When the sidebar is
// open, the card anchors to the left of the sidebar's left edge (right-[356px]).
// When the sidebar is collapsed, the card anchors to the right edge (right-0).

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ReviewViewpointsDock from '../ReviewViewpointsDock';

// Mock the activeReviewStore
vi.mock('../../../lib/activeReviewStore', () => ({
  useActiveReviewStore: vi.fn(),
}));

import { useActiveReviewStore } from '../../../lib/activeReviewStore';

const mockUseActiveReviewStore = vi.mocked(useActiveReviewStore);

type StoreState = { config: unknown; managerMode: boolean };

function setupStore(config: unknown = null, managerMode = false) {
  const state: StoreState = {
    config,
    managerMode,
  };
  mockUseActiveReviewStore.mockImplementation(((selector?: (s: StoreState) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  }) as unknown as typeof useActiveReviewStore);
}

describe('ReviewViewpointsDock positioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('returns null when config is missing', () => {
    setupStore(null);
    const { container } = render(<ReviewViewpointsDock />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when no viewpoints, pins, or agenda', () => {
    setupStore({ title: 'Test', viewpoints: [], pins: [], agenda: [] });
    const { container } = render(<ReviewViewpointsDock />);
    expect(container.firstChild).toBeNull();
  });

  it('renders collapsed dock with title', () => {
    setupStore({
      title: 'Test Review',
      viewpoints: [{ id: 'v1', name: 'Viewpoint 1' }],
      pins: [],
      agenda: [{ id: 'a1', title: 'Item 1' }],
    });
    render(<ReviewViewpointsDock />);
    expect(screen.getByText('Test Review')).toBeInTheDocument();
  });

  it('positions expanded card to the left of sidebar when sidebar is open', () => {
    setupStore({
      title: 'Test Review',
      viewpoints: [{ id: 'v1', name: 'Viewpoint 1' }],
      pins: [],
      agenda: [],
    });
    render(<ReviewViewpointsDock isRightPanelCollapsed={false} />);
    
    // Click the expand button (the chevron button in the dock bar - first one)
    const expandButtons = screen.getAllByTitle('Expand');
    fireEvent.click(expandButtons[0]);
    
    // The expanded card should have right-[356px] class
    const activeReviewElements = screen.getAllByText('Active Review');
    const expandedCard = activeReviewElements[0].closest('div[class*="absolute"]');
    expect(expandedCard).toBeTruthy();
    expect(expandedCard?.className).toContain('right-[356px]');
  });

  it('positions expanded card at right edge when sidebar is collapsed', () => {
    setupStore({
      title: 'Test Review',
      viewpoints: [{ id: 'v1', name: 'Viewpoint 1' }],
      pins: [],
      agenda: [],
    });
    render(<ReviewViewpointsDock isRightPanelCollapsed={true} />);
    
    // Click the expand button
    const expandButtons = screen.getAllByTitle('Expand');
    fireEvent.click(expandButtons[0]);
    
    // The expanded card should have right-0 class
    const activeReviewElements = screen.getAllByText('Active Review');
    const expandedCard = activeReviewElements[0].closest('div[class*="absolute"]');
    expect(expandedCard).toBeTruthy();
    expect(expandedCard?.className).toContain('right-0');
  });

  it('auto-closes when manager mode is enabled', () => {
    setupStore({
      title: 'Test Review',
      viewpoints: [{ id: 'v1', name: 'Viewpoint 1' }],
      pins: [],
      agenda: [],
    });
    const { rerender } = render(<ReviewViewpointsDock />);
    
    // Expand the dock
    const expandButtons = screen.getAllByTitle('Expand');
    fireEvent.click(expandButtons[0]);
    expect(screen.getAllByText('Active Review').length).toBeGreaterThan(0);
    
    // Enable manager mode
    setupStore(
      {
        title: 'Test Review',
        viewpoints: [{ id: 'v1', name: 'Viewpoint 1' }],
        pins: [],
        agenda: [],
      },
      true
    );
    rerender(<ReviewViewpointsDock />);
    
    // The expanded card should be gone (only the collapsed dock remains)
    expect(screen.queryAllByText('Active Review').length).toBe(0);
  });
});
