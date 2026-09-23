import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const { mockListUsedLabelValues } = vi.hoisted(() => ({
  mockListUsedLabelValues: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../lib/curationsRepo', () => ({
  listUsedLabelValues: mockListUsedLabelValues,
}));

vi.mock('../../lib/reviewSetupStore', () => ({
  useReviewSetupStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      draft: { labels: {} },
      setLabel: vi.fn(),
      clearLabel: vi.fn(),
    }),
}));

const loadFieldsMock = vi.fn();

vi.mock('../../lib/labelFieldsStore', () => ({
  useLabelFieldsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      fields: [
        { id: 'free', name: 'Free', position: 0, values: [] },
        { id: 'fixed', name: 'Fixed', position: 1, values: ['A', 'B'] },
      ],
      loaded: true,
      load: loadFieldsMock,
    }),
}));

import { LabelsTab } from '../ReviewSetupPage';

describe('LabelsTab — datalist suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListUsedLabelValues.mockResolvedValue({
      free: ['Alpha', 'Beta'],
      fixed: ['Should', 'Not', 'Appear'],
    });
  });

  it('renders a <datalist> with used values for a free-text field', async () => {
    const { container } = render(<LabelsTab />);

    await waitFor(() => {
      const datalist = container.querySelector('datalist#label-suggestions-free');
      expect(datalist).not.toBeNull();
    });

    const datalist = container.querySelector('datalist#label-suggestions-free');
    const options = datalist!.querySelectorAll('option');
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute('value')).toBe('Alpha');
    expect(options[1].getAttribute('value')).toBe('Beta');
  });

  it('does not render a <datalist> for a field with a fixed value list', async () => {
    const { container } = render(<LabelsTab />);

    await waitFor(() => {
      expect(container.querySelector('datalist#label-suggestions-free')).not.toBeNull();
    });

    expect(container.querySelector('datalist#label-suggestions-fixed')).toBeNull();
  });
});
