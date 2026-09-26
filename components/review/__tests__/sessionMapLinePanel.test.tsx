// The map's LINE panel — batch BV.
//
// A review whose variant has never met used to have nothing to click: the map said "No
// sessions recorded in this design review yet.", so the variant was invisible everywhere
// outside its own room and read as a variant that had not been saved. The map now draws
// every line whether or not it has met, and its two markers — the main line's hollow
// "Start" and the hollow letter a session-less variant ends at — open a panel for the
// LINE rather than for a meeting. What is pinned here is that panel: what it says, and
// the way into the room it names.
//
// The words are pinned too, as they are in sessionMap.test.tsx: this is a "Design review"
// with a "Main line" and a "Variant A", and branch, fork, merge and commit do not appear.

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SessionMap from '../SessionMap';
import type { ReviewLine } from '../../../lib/reviews/lines';
import type { LineSession } from '../../../lib/reviews/linesRepo';

afterEach(cleanup);

const REVIEW = 'review-1';

const MAIN: ReviewLine = {
  id: 'line-main', reviewId: REVIEW, kind: 'main', name: 'Main line', letter: null,
  parentSessionId: null, status: 'active', createdBy: null, createdByName: '',
  createdAt: '2026-09-01T09:00:00.000Z', closedAt: null,
};

/** The reported case: a variant started before anybody met, so it has no parent session. */
const FRAME: ReviewLine = {
  id: 'line-a', reviewId: REVIEW, kind: 'variant', name: 'Frame forward', letter: 'A',
  parentSessionId: null, status: 'active', createdBy: null, createdByName: 'Paco',
  createdAt: '2026-09-25T09:00:00.000Z', closedAt: null,
};

function session(id: string, seq: number, lineId: string | null, over: Partial<LineSession> = {}): LineSession {
  return {
    id, title: `Design review — ${id}`, endedAt: '2026-09-24T16:00:00.000Z', participantCount: 3,
    modelName: 'imported', lineId, seq, revisionIds: [], summary: null, ...over,
  };
}

function renderMap(props: Partial<React.ComponentProps<typeof SessionMap>> = {}) {
  return render(
    <MemoryRouter>
      <SessionMap
        reviewTitle="Bike"
        lines={[MAIN, FRAME]}
        sessions={[]}
        reviewId={REVIEW}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('the map — a line opens its own panel', () => {
  it('opens the main line from its start, with the way into its room', () => {
    renderMap();
    fireEvent.click(screen.getByText('Start'));

    const panel = screen.getByTestId('line-panel');
    expect(within(panel).getByText('Main line')).toBeTruthy();
    expect(panel.textContent).toContain('0 sessions');
    // The main line's address carries no ?line=, so every link already in circulation for
    // this review opens exactly the room it always did.
    expect(screen.getByTestId('open-main-line').getAttribute('href')).toBe(`/room/${REVIEW}`);
    expect(screen.getByTestId('open-main-line').textContent).toBe('Open main line');
  });

  it('opens a variant nobody has met on, with the way into ITS room', () => {
    // This is the whole of the batch: the variant's own room kept every change, and from
    // the map there was no route to it.
    renderMap();
    fireEvent.click(screen.getByText('A'));

    const panel = screen.getByTestId('line-panel');
    expect(within(panel).getByText('Variant A · Frame forward')).toBeTruthy();
    expect(panel.textContent).toContain('active');
    expect(panel.textContent).toContain('started from the start');
    expect(panel.textContent).toContain('0 sessions');
    expect(screen.getByTestId('open-variant').getAttribute('href')).toBe(`/room/${REVIEW}?line=line-a`);
    expect(screen.getByTestId('open-variant').textContent).toBe('Open variant');
  });

  it('names the meeting a variant left from, by its label and its date', () => {
    renderMap({
      lines: [MAIN, { ...FRAME, parentSessionId: 's2' }],
      sessions: [session('s1', 1, MAIN.id), session('s2', 2, MAIN.id)],
    });
    fireEvent.click(screen.getByText('A'));

    expect(screen.getByTestId('line-panel').textContent).toContain('started from S2 · 24 Sep');
  });

  it('says a variant whose parent meeting was deleted left from the start', () => {
    // The honest answer rather than a date invented from the variant's own created_at,
    // which would say when the line was started and not where it left from.
    renderMap({
      lines: [MAIN, { ...FRAME, parentSessionId: 's-deleted' }],
      sessions: [session('s1', 1, MAIN.id)],
    });
    fireEvent.click(screen.getByText('A'));

    expect(screen.getByTestId('line-panel').textContent).toContain('started from the start');
  });

  it('draws no start once the main line has met, and a meeting still opens its own panel', () => {
    // A session with no `line_id` is the main line's, which is where the map draws it and
    // where the backfill in docs/supabase-schema.sql puts it — so the main line HAS met
    // and its start is no longer the only thing on its row.
    renderMap({ sessions: [session('s1', 1, null), session('s2', 2, MAIN.id)] });

    expect(screen.queryByText('Start')).toBeNull();
    expect(screen.queryAllByTestId('map-line-stop')).toHaveLength(1); // the variant's "A"
    fireEvent.click(screen.getAllByText('S2')[0]);
    expect(screen.getByText('Attended')).toBeTruthy();
    expect(screen.queryByTestId('line-panel')).toBeNull();
  });

  it('offers the two decisions to whoever may change the review’s lines', () => {
    renderMap({ mayEditLines: true });
    fireEvent.click(screen.getByText('A'));

    const panel = screen.getByTestId('line-panel');
    expect(within(panel).getByText(/Adopt/i)).toBeTruthy();
    expect(within(panel).getByText(/Drop/i)).toBeTruthy();
  });

  it('offers a participant and a guest the way in, and nothing to decide', () => {
    renderMap();
    fireEvent.click(screen.getByText('A'));

    const panel = screen.getByTestId('line-panel');
    expect(screen.getByTestId('open-variant')).toBeTruthy();
    expect(within(panel).queryByText(/Adopt/i)).toBeNull();
    expect(within(panel).queryByText(/Drop/i)).toBeNull();
  });

  it('closes again, from its own button and from a second click on the marker', () => {
    renderMap();
    fireEvent.click(screen.getByText('A'));
    expect(screen.getByTestId('line-panel')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close this line'));
    expect(screen.queryByTestId('line-panel')).toBeNull();

    fireEvent.click(screen.getByText('A'));
    expect(screen.getByTestId('line-panel')).toBeTruthy();
    fireEvent.click(screen.getByText('A'));
    expect(screen.queryByTestId('line-panel')).toBeNull();
  });

  it('opens the same panel from the variant’s line, not only from its stop', () => {
    // For a variant nobody has met on, the branch is the only thing on the map that says
    // it exists, so the branch itself has to answer. A 1.5px stroke is not a thing
    // anybody can hit with a pointer, which is why it carries a wider invisible one.
    renderMap();
    fireEvent.click(screen.getAllByTestId('map-line-edge')[0]);

    const panel = screen.getByTestId('line-panel');
    expect(within(panel).getByText('Variant A · Frame forward')).toBeTruthy();
    expect(screen.getByTestId('open-variant').getAttribute('href')).toBe(`/room/${REVIEW}?line=line-a`);

    // And a second click on the same line closes it again, as a second click on a stop does.
    fireEvent.click(screen.getAllByTestId('map-line-edge')[0]);
    expect(screen.queryByTestId('line-panel')).toBeNull();
  });

  it('makes no other line on the map clickable', () => {
    // The main line's edges are not ways into a panel — its stops are its meetings, and
    // its start is the one marker that opens its panel. Neither is the green edge an
    // adopted variant rejoins along, which stays the inert moment it describes.
    renderMap({
      lines: [MAIN, { ...FRAME, status: 'adopted', closedAt: '2026-09-26T09:00:00.000Z' }],
      sessions: [session('s1', 1, MAIN.id), session('s2', 2, MAIN.id)],
    });

    const clickable = screen.queryAllByTestId('map-line-edge');
    expect(clickable.map((edge) => edge.getAttribute('data-line'))).toEqual(['line-a']);
    // Which is the variant's own branch: its leave, and the return it makes when adopted.
    fireEvent.click(screen.getByText('✓'));
    expect(screen.queryByTestId('line-panel')).toBeNull();
  });

  it('never says branch, fork, merge or commit', () => {
    const { container } = renderMap({ mayEditLines: true });
    fireEvent.click(screen.getByText('A'));
    fireEvent.click(screen.getByText('Start'));

    const shown = (container.textContent ?? '').toLowerCase();
    for (const word of ['branch', 'fork', 'merge', 'commit']) {
      expect(shown, `the map says "${word}"`).not.toContain(word);
    }
  });
});
