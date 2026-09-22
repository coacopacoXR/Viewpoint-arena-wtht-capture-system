import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// Mock react-router-dom.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock store with meeting ended.
const mockUpdateInsight = vi.fn();
vi.mock('../../../store', () => ({
  useStore: ((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      insightCards: [],
      requirements: [],
      chatHistory: [],
      isMeetingEnded: true,
      endMeeting: vi.fn(),
      agents: [],
      time: { elapsed: 0, isRunning: false },
      updateInsightType: vi.fn(),
      updateInsight: mockUpdateInsight,
      comments: [],
    };
    if (typeof selector === 'function') return selector(state);
    return state;
  }) as unknown as typeof vi.fn,
}));

// Mock presence with one remote participant.
vi.mock('../../../lib/PresenceContext', () => ({
  usePresence: () => ({
    remoteParticipantList: [{ userId: 'r1', name: 'Maria', color: '#f00' }],
    localUserId: 'local-1',
  }),
}));

// Mock identity.
vi.mock('../../../lib/identity', () => ({
  getIdentity: () => ({ name: 'LocalUser', color: '#000' }),
}));

// Mock activeReviewStore — empty team roster so both attendees are unrostered.
const mockAddTeamMember = vi.fn();
let mockConfigTeam: { id: string; name: string }[] = [];
vi.mock('../../../lib/activeReviewStore', () => ({
  useActiveReviewStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      config: { team: mockConfigTeam },
      addTeamMember: mockAddTeamMember,
    };
    if (typeof selector === 'function') return selector(state);
    return state;
  },
}));

import MeetingSummary from '../MeetingSummary';

describe('MeetingSummary — add attendees to team offer', () => {
  afterEach(() => {
    cleanup();
    mockAddTeamMember.mockClear();
    mockConfigTeam = [];
  });

  it('shows the offer for attendees not on the roster', () => {
    mockConfigTeam = [];
    render(<MeetingSummary />);
    expect(screen.getByText(/Maria was in this meeting/)).toBeInTheDocument();
    expect(screen.getByText(/LocalUser was in this meeting/)).toBeInTheDocument();
  });

  it('does not show the offer for attendees already on the roster', () => {
    mockConfigTeam = [{ id: 't1', name: 'Maria' }, { id: 't2', name: 'LocalUser' }];
    render(<MeetingSummary />);
    expect(screen.queryByText(/Maria was in this meeting/)).toBeNull();
    expect(screen.queryByText(/LocalUser was in this meeting/)).toBeNull();
  });

  it('clicking Add to team calls addTeamMember', () => {
    mockConfigTeam = [];
    render(<MeetingSummary />);
    const addButtons = screen.getAllByText('Add to team');
    expect(addButtons.length).toBeGreaterThan(0);
    fireEvent.click(addButtons[0]);
    expect(mockAddTeamMember).toHaveBeenCalledTimes(1);
  });

  it('dismissing an offer removes it', () => {
    mockConfigTeam = [];
    render(<MeetingSummary />);
    // Find the dismiss button (X) next to Maria's offer.
    const dismissButtons = screen.getAllByLabelText(/Dismiss offer/);
    expect(dismissButtons.length).toBeGreaterThan(0);
    fireEvent.click(dismissButtons[0]);
    // After dismissal, one fewer offer should be visible.
    const addButtons = screen.queryAllByText('Add to team');
    expect(addButtons.length).toBe(1);
  });
});
