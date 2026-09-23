// Tests for the admin page: gate states and the delete confirmation flow.
//
// The page imports curationsRepo → supabase, so we mock supabase at the
// module level (same pattern as curationsRepo.listed.test.ts). The admin
// gate is controlled by mocking fetch to /api/admin-unlock.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// Mock supabase before importing AdminPage (which pulls in curationsRepo).
const mockSelectChain = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockEq = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockDeleteEq = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: mockSelectChain,
      update: mockUpdate,
      delete: mockDelete,
      eq: mockEq,
    }),
  },
  supabaseConfigured: true,
}));

// Mock the label fields repo to avoid the real supabase import.
vi.mock('../../lib/labelFieldsRepo', () => ({
  fetchLabelFields: vi.fn().mockResolvedValue([]),
  insertLabelField: vi.fn(),
  updateLabelField: vi.fn(),
  deleteLabelField: vi.fn(),
}));

// Mock the audit repo so the Activity section does not hit the shared
// supabase mock (which is set up for curations queries, not audit_events).
vi.mock('../../lib/auditRepo', () => ({
  listAuditEvents: vi.fn().mockResolvedValue({ status: 'ok', events: [] }),
}));

import AdminPage from '../AdminPage';
import { resetAdminGateForTests } from '../../lib/access/useAdminGate';

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe('AdminPage', () => {
  beforeEach(() => {
    resetAdminGateForTests();
    vi.stubGlobal('fetch', vi.fn());
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders "not configured" when required: false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ required: false, unlocked: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    renderAdmin();

    await vi.waitFor(() => {
      expect(screen.getByText('Admin not available')).toBeTruthy();
    });
    expect(screen.getByText(/passphrase is not set/)).toBeTruthy();
  });

  it('renders the unlock form when required && !unlocked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ required: true, unlocked: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    renderAdmin();

    await vi.waitFor(() => {
      expect(screen.getByText('Admin access')).toBeTruthy();
    });
    expect(screen.getByPlaceholderText('Enter admin passphrase')).toBeTruthy();
  });

  it('renders the three sections when unlocked', async () => {
    // Admin gate: unlocked.
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') {
        return new Response(JSON.stringify({ unlocked: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ required: true, unlocked: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    // Reviews: empty list.
    const afterOrder = { limit: mockLimit };
    mockLimit.mockResolvedValue({ data: [], error: null });
    mockSelectChain.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue(afterOrder);

    renderAdmin();

    await vi.waitFor(() => {
      expect(screen.getByText('Reviews')).toBeTruthy();
    });
    expect(screen.getByText('Label fields')).toBeTruthy();
    expect(screen.getByText('Access')).toBeTruthy();
    expect(screen.getByText('No reviews yet.')).toBeTruthy();
  });

  it('delete requires two clicks before deleteCuration is called', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ required: true, unlocked: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    // Reviews: one review.
    const afterOrder = { limit: mockLimit };
    mockLimit.mockResolvedValue({
      data: [{
        id: 'rev-1', title: 'Test Review', description: '',
        viewpoints: [], pins: [], agenda: [], listed: true,
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
      }],
      error: null,
    });
    mockSelectChain.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue(afterOrder);

    // Delete: success.
    mockDelete.mockReturnValue({ eq: mockDeleteEq });
    mockDeleteEq.mockResolvedValue({ error: null });

    renderAdmin();

    await vi.waitFor(() => {
      expect(screen.getByText('Test Review')).toBeTruthy();
    });

    // First click: shows "Confirm delete", does NOT call deleteCuration.
    const deleteBtn = screen.getByText('Delete');
    fireEvent.click(deleteBtn);

    await vi.waitFor(() => {
      expect(screen.getByText('Confirm delete')).toBeTruthy();
    });
    expect(screen.queryByText('Delete')).toBeNull();

    // Second click: actually deletes.
    const confirmBtn = screen.getByText('Confirm delete');
    fireEvent.click(confirmBtn);

    await vi.waitFor(() => {
      expect(mockDelete).toHaveBeenCalled();
    });
  });
});
