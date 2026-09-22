// Tests for the vertical icon rail in ReviewSetupPage (plan §L).
//
// What is pinned here:
//   1. Six tabs render in grouped order with correct ARIA roles and labels
//   2. Active tab has aria-selected="true", others have "false"
//   3. Arrow Up/Down and Home/End move selection and fire onSelect
//   4. Count badges appear when counts > 0
//   5. Dividers separate the three groups (Model | Views·Pins·Agenda | Reqs·People)
//   6. Clicking a tab calls onSelect with the correct id

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SidebarRail, RAIL_TABS, type TabId } from '../ReviewSetupPage';

describe('SidebarRail', () => {
  const defaultProps = {
    tab: 'asset' as TabId,
    onSelect: vi.fn(),
    counts: {
      viewpoints: 3,
      pins: 2,
      agenda: 1,
      requirements: 5,
      people: 4,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders six tabs in the correct grouped order', () => {
    render(<SidebarRail {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(6);
    // Grouped order: Model | Views · Pins · Agenda | Reqs · People
    const labels = tabs.map((t) => t.getAttribute('aria-label'));
    expect(labels).toEqual(['Asset', 'Viewpoints', 'Pins', 'Agenda', 'Requirements', 'People']);
  });

  it('marks the active tab with aria-selected="true"', () => {
    render(<SidebarRail {...defaultProps} tab="pins" />);
    const tabs = screen.getAllByRole('tab');
    tabs.forEach((tab, i) => {
      const expected = RAIL_TABS[i].id === 'pins' ? 'true' : 'false';
      expect(tab.getAttribute('aria-selected')).toBe(expected);
    });
  });

  it('sets tabIndex=0 on active tab, -1 on others', () => {
    render(<SidebarRail {...defaultProps} tab="agenda" />);
    const tabs = screen.getAllByRole('tab');
    tabs.forEach((tab, i) => {
      const expected = RAIL_TABS[i].id === 'agenda' ? 0 : -1;
      expect(tab.tabIndex).toBe(expected);
    });
  });

  it('renders dividers between groups', () => {
    render(<SidebarRail {...defaultProps} />);
    const separators = screen.getAllByRole('separator');
    // Two dividers: before Views (group 2) and before Reqs (group 3)
    expect(separators).toHaveLength(2);
  });

  it('shows count badges when count > 0', () => {
    render(<SidebarRail {...defaultProps} />);
    // Viewpoints=3, Pins=2, Agenda=1, Reqs=5, People=4
    // Asset has no count (always 0)
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('does not show a count badge for asset (count=0)', () => {
    render(<SidebarRail {...defaultProps} counts={{ ...defaultProps.counts, viewpoints: 0 }} />);
    // Only 4 badges now (Pins=2, Agenda=1, Reqs=5, People=4)
    expect(screen.queryAllByText('0')).toHaveLength(0);
  });

  it('calls onSelect with the correct id when a tab is clicked', () => {
    render(<SidebarRail {...defaultProps} />);
    const viewpointsTab = screen.getByRole('tab', { name: 'Viewpoints' });
    fireEvent.click(viewpointsTab);
    expect(defaultProps.onSelect).toHaveBeenCalledWith('viewpoints');
  });

  describe('keyboard navigation', () => {
    it('ArrowDown moves to the next tab (wraps around)', () => {
      render(<SidebarRail {...defaultProps} tab="asset" />);
      const tablist = screen.getByRole('tablist');
      fireEvent.keyDown(tablist, { key: 'ArrowDown' });
      expect(defaultProps.onSelect).toHaveBeenCalledWith('viewpoints');
    });

    it('ArrowUp moves to the previous tab (wraps around)', () => {
      render(<SidebarRail {...defaultProps} tab="asset" />);
      const tablist = screen.getByRole('tablist');
      fireEvent.keyDown(tablist, { key: 'ArrowUp' });
      expect(defaultProps.onSelect).toHaveBeenCalledWith('people');
    });

    it('Home jumps to the first tab', () => {
      render(<SidebarRail {...defaultProps} tab="requirements" />);
      const tablist = screen.getByRole('tablist');
      fireEvent.keyDown(tablist, { key: 'Home' });
      expect(defaultProps.onSelect).toHaveBeenCalledWith('asset');
    });

    it('End jumps to the last tab', () => {
      render(<SidebarRail {...defaultProps} tab="asset" />);
      const tablist = screen.getByRole('tablist');
      fireEvent.keyDown(tablist, { key: 'End' });
      expect(defaultProps.onSelect).toHaveBeenCalledWith('people');
    });

    it('ArrowDown from last tab wraps to first', () => {
      render(<SidebarRail {...defaultProps} tab="people" />);
      const tablist = screen.getByRole('tablist');
      fireEvent.keyDown(tablist, { key: 'ArrowDown' });
      expect(defaultProps.onSelect).toHaveBeenCalledWith('asset');
    });

    it('ignores unrelated keys', () => {
      render(<SidebarRail {...defaultProps} tab="asset" />);
      const tablist = screen.getByRole('tablist');
      fireEvent.keyDown(tablist, { key: 'Enter' });
      fireEvent.keyDown(tablist, { key: ' ' });
      fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
      expect(defaultProps.onSelect).not.toHaveBeenCalled();
    });
  });

  it('has aria-orientation="vertical" on the tablist', () => {
    render(<SidebarRail {...defaultProps} />);
    const tablist = screen.getByRole('tablist');
    expect(tablist.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('has an accessible name on the tablist', () => {
    render(<SidebarRail {...defaultProps} />);
    const tablist = screen.getByRole('tablist');
    expect(tablist.getAttribute('aria-label')).toBe('Review sections');
  });
});
