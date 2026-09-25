// The three variant actions as a person meets them — components/review/VariantActions.tsx.
//
// docs/plan/15-sessions-and-variants.md batch BL. The decisions themselves are pinned
// elsewhere: who may act in api/reviews/__tests__/lines.test.ts, and which model the
// main line ends up showing in lib/reviews/__tests__/adopt.test.ts. What is pinned here
// is the SHAPE of asking, because that is the part the plan is most particular about:
//
//   * "Explore a variant from here" asks for a short name and then opens the variant's
//     own room — a different room, so the meeting exploring it cannot move a model on
//     the main line's screen.
//   * "Adopt into main line" asks NOTHING unless the endpoint says both lines moved the
//     same model, and then it asks the endpoint's own one plain question, inline, with
//     two answers and a way out. There is no conflict screen, and there is no second
//     question: two questions in a row is where a diff view starts.
//   * "Drop variant" asks for a one-line reason, which is the sentence that ends up on
//     every card the drop closes.
//   * A variant that has already been adopted or dropped offers nothing at all.
//   * Somebody who may not edit the review is offered nothing at all — hidden rather
//     than disabled, because the endpoint would refuse the press anyway.
//
// The client and the line cache are faked; the component under test is the real one,
// including its prompts.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const { client, cache } = vi.hoisted(() => ({
  client: {
    explore: vi.fn(),
    adopt: vi.fn(),
    drop: vi.fn(),
  },
  cache: { resets: 0 },
}));

vi.mock('../../../lib/reviews/linesClient', () => ({
  exploreVariant: (...args: unknown[]) => client.explore(...args),
  adoptVariant: (...args: unknown[]) => client.adopt(...args),
  dropVariant: (...args: unknown[]) => client.drop(...args),
}));

vi.mock('../../../lib/reviews/linesRepo', () => ({
  resetLineCache: () => { cache.resets += 1; },
}));

import { ExploreVariantButton, VariantActions } from '../VariantActions';
import type { ReviewLine } from '../../../lib/reviews/lines';
import type { LineSession } from '../../../lib/reviews/linesRepo';

const REVIEW = 'rev-1';

function line(overrides: Partial<ReviewLine> = {}): ReviewLine {
  return {
    id: 'line-a', reviewId: REVIEW, kind: 'variant', name: 'Steel hinge pin', letter: 'A',
    parentSessionId: 'sess-3', status: 'active', createdBy: null, createdByName: 'Paco',
    createdAt: '2026-05-04T09:00:00.000Z', closedAt: null, ...overrides,
  };
}

const SESSION: LineSession = {
  id: 'sess-3', title: 'Hinge review', endedAt: '2026-05-03T16:00:00.000Z', participantCount: 4,
  modelName: 'Bracket', lineId: 'line-main', seq: 3, revisionIds: ['r-b'], summary: null,
};

const Where: React.FC = () => {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
};

function renderIn(node: React.ReactElement, at = `/room/${REVIEW}`) {
  return render(<MemoryRouter initialEntries={[at]}>{node}<Where /></MemoryRouter>);
}

beforeEach(() => {
  client.explore.mockReset();
  client.adopt.mockReset();
  client.drop.mockReset();
  cache.resets = 0;
});

afterEach(cleanup);

// ─── Explore a variant from here ────────────────────────────────────────────

describe('Explore a variant from here', () => {
  it('is not offered to somebody who may not edit the review', () => {
    renderIn(<ExploreVariantButton reviewId={REVIEW} session={SESSION} mayEdit={false} />);
    expect(screen.queryByText('Explore a variant from here')).toBeNull();
  });

  it('asks for a short name before it does anything', () => {
    renderIn(<ExploreVariantButton reviewId={REVIEW} session={SESSION} mayEdit />);
    fireEvent.click(screen.getByText('Explore a variant from here'));
    expect(screen.getByPlaceholderText('Steel hinge pin')).toBeTruthy();
    expect(client.explore).not.toHaveBeenCalled();
  });

  it('starts the variant from that session and opens its room', async () => {
    client.explore.mockResolvedValue({ ok: true, line: line({ id: 'line-new', letter: 'B' }) });
    renderIn(<ExploreVariantButton reviewId={REVIEW} session={SESSION} mayEdit />);
    fireEvent.click(screen.getByText('Explore a variant from here'));
    fireEvent.change(screen.getByPlaceholderText('Steel hinge pin'), { target: { value: 'Glass-filled nylon' } });
    fireEvent.click(screen.getByText('Start'));

    await waitFor(() => expect(client.explore).toHaveBeenCalledTimes(1));
    expect(client.explore.mock.calls[0][0]).toBe(REVIEW);
    expect(client.explore.mock.calls[0][1]).toBe('sess-3');
    expect(client.explore.mock.calls[0][2]).toBe('Glass-filled nylon');
    // A different room, and the address says which line it is: /room/<id>?line=<id>.
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(`/room/${REVIEW}?line=line-new`));
    // The cache held the lines as they were before this write, and the room the
    // navigation opens resolves its own line through it.
    expect(cache.resets).toBe(1);
  });

  it('shows the sentence it was refused with, and stays where it was', async () => {
    client.explore.mockResolvedValue({ ok: false, error: 'Only the owner and the editors of this design review can start, adopt or drop a variant.' });
    renderIn(<ExploreVariantButton reviewId={REVIEW} session={SESSION} mayEdit />);
    fireEvent.click(screen.getByText('Explore a variant from here'));
    fireEvent.change(screen.getByPlaceholderText('Steel hinge pin'), { target: { value: 'Glass-filled nylon' } });
    fireEvent.click(screen.getByText('Start'));

    await waitFor(() => expect(screen.getByText(/Only the owner and the editors/)).toBeTruthy());
    expect(screen.getByTestId('where').textContent).toBe(`/room/${REVIEW}`);
  });

  it('will not start a variant nobody named', () => {
    renderIn(<ExploreVariantButton reviewId={REVIEW} session={SESSION} mayEdit />);
    fireEvent.click(screen.getByText('Explore a variant from here'));
    expect(screen.getByText('Start')).toHaveProperty('disabled', true);
  });
});

// ─── Adopt into main line ───────────────────────────────────────────────────

describe('Adopt into main line', () => {
  it('writes at once when there is nothing to ask', async () => {
    client.adopt.mockResolvedValue({ ok: true, changed: 3 });
    renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit onChanged={() => { cache.resets += 100; }} />);
    fireEvent.click(screen.getByText('Adopt into main line'));

    await waitFor(() => expect(client.adopt).toHaveBeenCalledTimes(1));
    expect(client.adopt.mock.calls[0][2]).toBeNull();
    expect(cache.resets).toBe(101);
  });

  it('asks the endpoint\'s one plain question inline, and nothing else', async () => {
    client.adopt
      .mockResolvedValueOnce({ ok: false, question: 'Keep Rev C from the main line or Rev B2 from Variant A?' })
      .mockResolvedValueOnce({ ok: true, changed: 3 });
    renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit />);
    fireEvent.click(screen.getByText('Adopt into main line'));

    await waitFor(() =>
      expect(screen.getByText('Keep Rev C from the main line or Rev B2 from Variant A?')).toBeTruthy(),
    );
    // Two answers and a way out. No side-by-side, no list of differences, no second
    // question — the buttons are the whole of the decision.
    expect(screen.getByText('Keep the main line’s')).toBeTruthy();
    expect(screen.getByText('Take Variant A’s')).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
    expect(screen.queryByText('Adopt into main line')).toBeNull();
  });

  it('posts the answer that was chosen, and only then writes', async () => {
    client.adopt
      .mockResolvedValueOnce({ ok: false, question: 'Keep Rev C from the main line or Rev B2 from Variant A?' })
      .mockResolvedValueOnce({ ok: true, changed: 3 });
    renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit />);
    fireEvent.click(screen.getByText('Adopt into main line'));
    await waitFor(() => expect(screen.getByText('Not now')).toBeTruthy());
    fireEvent.click(screen.getByText('Take Variant A’s'));

    await waitFor(() => expect(client.adopt).toHaveBeenCalledTimes(2));
    expect(client.adopt.mock.calls[1][2]).toBe('variant');
  });

  it('puts the buttons back when the answer is "not now", and writes nothing', async () => {
    client.adopt.mockResolvedValueOnce({ ok: false, question: 'Keep Rev C from the main line or Rev B2 from Variant A?' });
    renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit />);
    fireEvent.click(screen.getByText('Adopt into main line'));
    await waitFor(() => expect(screen.getByText('Not now')).toBeTruthy());
    fireEvent.click(screen.getByText('Not now'));

    await waitFor(() => expect(screen.getByText('Adopt into main line')).toBeTruthy());
    expect(client.adopt).toHaveBeenCalledTimes(1);
  });

  it('leaves the room for the main line once the variant has been adopted into it', async () => {
    client.adopt.mockResolvedValue({ ok: true, changed: 3 });
    // Arrived on the variant's own address, which is the only way to be in its room.
    renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit inRoom />, `/room/${REVIEW}?line=line-a`);
    fireEvent.click(screen.getByText('Adopt into main line'));
    // A variant that has just been adopted has no room to be in: its model and its
    // cards are on the main line now, and the main line's address carries no ?line=.
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(`/room/${REVIEW}`));
  });

  it('is not offered for a variant that has already been adopted or dropped', () => {
    renderIn(<VariantActions reviewId={REVIEW} variant={line({ status: 'adopted' })} mayEdit />);
    expect(screen.queryByText('Adopt into main line')).toBeNull();
    expect(screen.queryByText('Drop variant')).toBeNull();
  });

  it('is not offered to somebody who may not edit the review', () => {
    renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit={false} />);
    expect(screen.queryByText('Adopt into main line')).toBeNull();
  });
});

// ─── Drop variant ───────────────────────────────────────────────────────────

describe('Drop variant', () => {
  it('asks for the one-line reason first', () => {
    renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit />);
    fireEvent.click(screen.getByText('Drop variant'));
    expect(screen.getByPlaceholderText('Too expensive to tool')).toBeTruthy();
    expect(client.drop).not.toHaveBeenCalled();
  });

  it('sends the reason the meeting gave', async () => {
    client.drop.mockResolvedValue({ ok: true, changed: 2 });
    renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit />);
    fireEvent.click(screen.getByText('Drop variant'));
    fireEvent.change(screen.getByPlaceholderText('Too expensive to tool'), { target: { value: 'Too expensive to tool' } });
    fireEvent.click(screen.getByText('Drop it'));

    await waitFor(() => expect(client.drop).toHaveBeenCalledTimes(1));
    expect(client.drop.mock.calls[0][0]).toBe(REVIEW);
    expect(client.drop.mock.calls[0][1]).toBe('line-a');
    expect(client.drop.mock.calls[0][2]).toBe('Too expensive to tool');
  });

  it('will not drop a variant without saying why', () => {
    renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit />);
    fireEvent.click(screen.getByText('Drop variant'));
    expect(screen.getByText('Drop it')).toHaveProperty('disabled', true);
  });

  it('says that the cards close with the reason and the variant stays on the map', () => {
    // The person dropping it has to know it is not a delete: the risks are closed, not
    // lost, and the line stays there greyed.
    renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit />);
    fireEvent.click(screen.getByText('Drop variant'));
    expect(screen.getByText(/Its open cards close with this reason on them/)).toBeTruthy();
    expect(screen.getByText(/It stays on the map, greyed, for the record/)).toBeTruthy();
  });
});

// ─── The words ──────────────────────────────────────────────────────────────

describe('the words on screen', () => {
  it('never say branch, fork, merge or commit — in a button, a prompt or a question', async () => {
    client.adopt.mockResolvedValueOnce({ ok: false, question: 'Keep Rev C from the main line or Rev B2 from Variant A?' });
    const adopting = renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit />);
    fireEvent.click(screen.getByText('Adopt into main line'));
    await waitFor(() => expect(screen.getByText('Not now')).toBeTruthy());
    expect((adopting.container.textContent ?? '').toLowerCase()).not.toMatch(/branch|fork|merge|commit/);
    cleanup();

    const exploring = renderIn(<ExploreVariantButton reviewId={REVIEW} session={SESSION} mayEdit />);
    fireEvent.click(screen.getByText('Explore a variant from here'));
    expect((exploring.container.textContent ?? '').toLowerCase()).not.toMatch(/branch|fork|merge|commit/);
    cleanup();

    const dropping = renderIn(<VariantActions reviewId={REVIEW} variant={line()} mayEdit />);
    fireEvent.click(screen.getByText('Drop variant'));
    expect((dropping.container.textContent ?? '').toLowerCase()).not.toMatch(/branch|fork|merge|commit/);
  });
});
