// Tests for the admin page: gate states, the reviews section, and the models
// section. The Reviews section now fetches from /api/admin/reviews (the admin
// endpoint) instead of curationsRepo directly; the toggle-listed and delete
// actions still go through curationsRepo (supabase mock).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// Mock supabase for the curationsRepo calls (setCurationListed, deleteCuration).
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockDeleteEq = vi.fn();
const mockUpdateEq = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'review_curations') {
        return {
          update: mockUpdate,
          delete: mockDelete,
        };
      }
      return {};
    },
  },
  supabaseConfigured: true,
}));

// Mock the label fields repo.
vi.mock('../../lib/labelFieldsRepo', () => ({
  fetchLabelFields: vi.fn().mockResolvedValue([]),
  insertLabelField: vi.fn(),
  updateLabelField: vi.fn(),
  deleteLabelField: vi.fn(),
}));

// Mock the audit repo.
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

const ADMIN_REVIEWS_RESPONSE = {
  reviews: [
    {
      id: 'rev-1',
      title: 'Test Review',
      listed: true,
      archived: false,
      owner_id: null,
      owner_name: null,
      owner_email: null,
      member_count: 2,
      revisions_count: 1,
      last_meeting_at: '2026-09-24T09:00:00Z',
      updated_at: '2026-09-24T10:00:00Z',
      created_at: '2026-09-01T00:00:00Z',
    },
  ],
};

const ADMIN_MODELS_RESPONSE = {
  models: [
    {
      hash: 'a'.repeat(64),
      file_name: 'bracket.glb',
      size: 1024,
      content_type: 'model/gltf-binary',
      uploaded_at: '2026-09-24T09:00:00Z',
      uploaded_by_name: 'Alice',
      revisions: [
        { id: 'rev-row-1', review_id: 'rev-1', review_title: 'Test Review', line: 'bracket', revision: 'Rev A' },
      ],
      curation_refs: [],
    },
  ],
  total_storage: 1024,
};

/**
 * Route fetch calls based on URL. The admin gate, the reviews endpoint, and
 * the models endpoint all ride on the same global fetch in jsdom.
 */
function routeFetch(overrides: {
  reviewsResponse?: unknown;
  modelsResponse?: unknown;
  gateUnlocked?: boolean;
} = {}) {
  const gateUnlocked = overrides.gateUnlocked ?? true;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes('/api/admin-unlock')) {
      if (init?.method === 'DELETE') {
        return new Response(JSON.stringify({ unlocked: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ required: true, unlocked: gateUnlocked }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/admin/reviews')) {
      return new Response(JSON.stringify(overrides.reviewsResponse ?? ADMIN_REVIEWS_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/admin/models')) {
      return new Response(JSON.stringify(overrides.modelsResponse ?? ADMIN_MODELS_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

describe('AdminPage', () => {
  beforeEach(() => {
    resetAdminGateForTests();
    vi.clearAllMocks();
    // eq chains for curationsRepo (setCurationListed, deleteCuration).
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });
    mockUpdateEq.mockResolvedValue({ error: null });
    mockDelete.mockReturnValue({ eq: mockDeleteEq });
    mockDeleteEq.mockResolvedValue({ error: null });
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
    vi.stubGlobal('fetch', routeFetch({ gateUnlocked: false }));

    renderAdmin();

    await vi.waitFor(() => {
      expect(screen.getByText('Admin access')).toBeTruthy();
    });
    expect(screen.getByPlaceholderText('Enter admin passphrase')).toBeTruthy();
  });

  it('renders the sidebar with all sections including Models', async () => {
    vi.stubGlobal('fetch', routeFetch());

    renderAdmin();

    await vi.waitFor(() => {
      expect(screen.getByText('Design reviews')).toBeTruthy();
    });
    expect(screen.getByText('Models')).toBeTruthy();
    expect(screen.getByText('Labels')).toBeTruthy();
    expect(screen.getByText('Access')).toBeTruthy();
  });

  it('renders the reviews section with data from the admin endpoint', async () => {
    vi.stubGlobal('fetch', routeFetch());

    renderAdmin();

    await vi.waitFor(() => {
      expect(screen.getByText('Test Review')).toBeTruthy();
    });
    // The enriched data from the admin endpoint.
    expect(screen.getByText(/2 members/)).toBeTruthy();
    expect(screen.getByText(/1 revision/)).toBeTruthy();
  });

  it('delete requires two clicks before deleteCuration is called', async () => {
    vi.stubGlobal('fetch', routeFetch());

    renderAdmin();

    await vi.waitFor(() => {
      expect(screen.getByText('Test Review')).toBeTruthy();
    });

    const deleteBtn = screen.getByText('Delete');
    fireEvent.click(deleteBtn);

    await vi.waitFor(() => {
      expect(screen.getByText('Confirm delete')).toBeTruthy();
    });

    const confirmBtn = screen.getByText('Confirm delete');
    fireEvent.click(confirmBtn);

    await vi.waitFor(() => {
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  it('renders the models section when navigated to', async () => {
    vi.stubGlobal('fetch', routeFetch());

    renderAdmin();

    await vi.waitFor(() => {
      expect(screen.getByText('Test Review')).toBeTruthy();
    });

    // Click the Models section in the sidebar.
    fireEvent.click(screen.getByText('Models'));

    await vi.waitFor(() => {
      expect(screen.getByText('bracket.glb')).toBeTruthy();
    });
    expect(screen.getAllByText(/1\.0 KB/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Alice/)).toBeTruthy();
  });

  it('mode none hides the owner column and transfer button', async () => {
    // In mode 'none', the admin endpoint returns reviews without owner fields.
    const noOwnerReviews = {
      reviews: [
        {
          id: 'rev-1',
          title: 'Test Review',
          listed: true,
          archived: false,
          owner_id: null,
          owner_name: null,
          owner_email: null,
          member_count: 0,
          revisions_count: 0,
          last_meeting_at: null,
          updated_at: '2026-09-24T10:00:00Z',
          created_at: '2026-09-01T00:00:00Z',
        },
      ],
    };
    vi.stubGlobal('fetch', routeFetch({ reviewsResponse: noOwnerReviews }));

    renderAdmin();

    await vi.waitFor(() => {
      expect(screen.getByText('Test Review')).toBeTruthy();
    });

    // No owner line, no Transfer button.
    expect(screen.queryByText(/Owner:/)).toBeNull();
    expect(screen.queryByText('Transfer')).toBeNull();
  });
});
