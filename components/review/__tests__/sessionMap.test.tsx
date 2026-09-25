// Tests for components/review/SessionMap.tsx — the map of one design review's
// sessions (docs/plan/15-sessions-and-variants.md batch BK).
//
// Everything is fixture data: the map reads no database, so what is pinned here is
// the drawing. A main line of numbered stops, a variant leaving from the session it
// was started at, an adopted variant rejoining with a green stop, a dropped one
// greyed and dashed and still on the map — and the panel one of them opens.
//
// The words are pinned too. This is the screen a hardware engineer reads the whole
// history of a review on, and the plan is explicit that branch, fork, merge and
// commit must not appear on it.

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SessionMap, { layoutSessionMap, rowLabels, stopLabels } from '../SessionMap';
import type { ReviewLine } from '../../../lib/reviews/lines';
import type { LineSession, SessionCardRef } from '../../../lib/reviews/linesRepo';
import type { ModelRevision } from '../../../lib/reviews/revisionsRepo';

afterEach(cleanup);

const REVIEW = 'review-1';

const MAIN: ReviewLine = {
  id: 'line-main', reviewId: REVIEW, kind: 'main', name: 'Main line', letter: null,
  parentSessionId: null, status: 'active', createdBy: null, createdByName: '',
  createdAt: '2026-03-01T09:00:00.000Z', closedAt: null,
};

const VARIANT_A: ReviewLine = {
  id: 'line-a', reviewId: REVIEW, kind: 'variant', name: 'Weld fix', letter: 'A',
  parentSessionId: 'sess-2', status: 'active', createdBy: null, createdByName: 'Paco',
  createdAt: '2026-05-04T09:00:00.000Z', closedAt: null,
};

function session(id: string, seq: number, lineId: string | null, overrides: Partial<LineSession> = {}): LineSession {
  return {
    id,
    title: `Design Review — ${id}`,
    endedAt: `2026-0${seq}-0${seq}T16:00:00.000Z`,
    participantCount: 4,
    modelName: 'imported',
    lineId,
    seq,
    revisionIds: [],
    summary: null,
    ...overrides,
  };
}

function revision(id: string, letter: string, line = 'Bracket'): ModelRevision {
  return {
    id, reviewId: REVIEW, line, revision: letter, hash: `${letter}${letter}`.repeat(32).slice(0, 64),
    fileName: `${line.toLowerCase()}-${letter}.step`, size: 1024, notes: '',
    uploadedBy: null, uploadedByName: 'Paco', createdAt: `2026-01-0${letter.charCodeAt(0) - 64}T09:00:00.000Z`,
  };
}

function card(id: string, sessionId: string, overrides: Partial<SessionCardRef> = {}): SessionCardRef {
  return {
    id, sessionId, type: 'RISK', title: 'Hinge pin wears', status: 'Open', priority: 'High',
    lineId: MAIN.id, originLineId: MAIN.id, ...overrides,
  };
}

/** Three meetings on the main line, Rev A then Rev B then Rev B beside Rev C. */
const MAIN_SESSIONS = [
  session('sess-1', 1, MAIN.id, { revisionIds: ['rev-a'] }),
  session('sess-2', 2, MAIN.id, { revisionIds: ['rev-b'], participantCount: 6 }),
  session('sess-3', 3, MAIN.id, { revisionIds: ['rev-b', 'rev-c'] }),
];

const REVISIONS = [revision('rev-a', 'A'), revision('rev-b', 'B'), revision('rev-c', 'C')];

function renderMap(props: Partial<React.ComponentProps<typeof SessionMap>> = {}) {
  return render(
    <MemoryRouter>
      <SessionMap
        reviewTitle="Bracket assembly"
        lines={[MAIN, VARIANT_A]}
        sessions={MAIN_SESSIONS}
        revisions={REVISIONS}
        cards={[card('item-1', 'sess-2'), card('item-2', 'sess-2'), card('item-3', 'sess-3')]}
        {...props}
      />
    </MemoryRouter>,
  );
}

// ─── The layout ─────────────────────────────────────────────────────────────

describe('layoutSessionMap', () => {
  it('lays the main line out left to right in session order', () => {
    const layout = layoutSessionMap([MAIN], MAIN_SESSIONS, REVISIONS, []);
    expect(stopLabels(layout)).toEqual(['S1', 'S2', 'S3']);
    const [first, second] = layout.stops;
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBe(first.y);
  });

  it('names the rows down the left edge, main line first, in the short form', () => {
    // The left edge has room for a chip and not for a sentence; the variant's own
    // name goes in its tooltip and in the panel one of its stops opens.
    const layout = layoutSessionMap([VARIANT_A, MAIN], MAIN_SESSIONS, REVISIONS, []);
    expect(rowLabels(layout)).toEqual(['Main line', 'Variant A']);
    expect(layout.rows[1].title).toBe('Variant A · Weld fix');
  });

  it('starts a variant to the right of the session it left from, on its own row', () => {
    const variantSessions = [session('v-1', 1, VARIANT_A.id), session('v-2', 2, VARIANT_A.id)];
    const layout = layoutSessionMap([MAIN, VARIANT_A], [...MAIN_SESSIONS, ...variantSessions], REVISIONS, []);
    const parent = layout.stops.find((stop) => stop.session.id === 'sess-2');
    const first = layout.stops.find((stop) => stop.session.id === 'v-1');
    const second = layout.stops.find((stop) => stop.session.id === 'v-2');

    expect(parent).toBeTruthy();
    expect(first).toBeTruthy();
    expect(first?.x).toBeGreaterThan(parent?.x ?? 0);
    expect(first?.y).not.toBe(parent?.y);
    expect(second?.y).toBe(first?.y);
    expect(stopLabels(layout)).toContain('A1');
    expect(stopLabels(layout)).toContain('A2');
  });

  it('draws a variant leaving the main line, and running along itself', () => {
    const layout = layoutSessionMap(
      [MAIN, VARIANT_A],
      [...MAIN_SESSIONS, session('v-1', 1, VARIANT_A.id), session('v-2', 2, VARIANT_A.id)],
      REVISIONS,
      [],
    );
    const kinds = layout.edges.map((edge) => edge.kind);
    expect(kinds).toContain('leave');
    // Two along the main line between its three stops, one along the variant.
    expect(kinds.filter((kind) => kind === 'along').length).toBeGreaterThanOrEqual(3);
  });

  it('puts a session with no number on the map by its date instead', () => {
    // A meeting recorded before seq existed is still a meeting; the map cannot leave
    // it off, and it must not invent "S0".
    const layout = layoutSessionMap(
      [MAIN],
      [session('sess-x', 0, null, { endedAt: '2026-03-12T16:00:00.000Z' })],
      REVISIONS,
      [],
    );
    expect(stopLabels(layout)).toEqual(['12 Mar']);
  });

  it('puts a session with no line on the main row, where the backfill puts it', () => {
    const layout = layoutSessionMap([], [session('sess-1', 1, null), session('sess-2', 2, null)], REVISIONS, []);
    expect(stopLabels(layout)).toEqual(['S1', 'S2']);
    expect(rowLabels(layout)).toEqual(['Main line']);
  });

  it('draws no stops for a review that has never met', () => {
    const layout = layoutSessionMap([MAIN], [], REVISIONS, []);
    expect(layout.stops.filter((stop) => !stop.rejoin)).toHaveLength(0);
  });

  it('names what was on screen at each stop', () => {
    const layout = layoutSessionMap([MAIN], MAIN_SESSIONS, REVISIONS, []);
    expect(layout.stops.find((stop) => stop.session.id === 'sess-3')?.revisions).toBe('Rev B · Rev C');
    expect(layout.stops.find((stop) => stop.session.id === 'sess-1')?.revisions).toBe('Rev A');
  });

  it('says nothing about revisions it has no row for, rather than "Rev undefined"', () => {
    const layout = layoutSessionMap([MAIN], [session('sess-1', 1, MAIN.id, { revisionIds: ['gone'] })], REVISIONS, []);
    expect(layout.stops[0].revisions).toBe('');
  });

  it('counts a stop\'s cards', () => {
    const layout = layoutSessionMap(
      [MAIN],
      MAIN_SESSIONS,
      REVISIONS,
      [card('item-1', 'sess-2'), card('item-2', 'sess-2')],
    );
    expect(layout.stops.find((stop) => stop.session.id === 'sess-2')?.cards).toBe(2);
    expect(layout.stops.find((stop) => stop.session.id === 'sess-1')?.cards).toBe(0);
  });

  it('is wide enough to scroll rather than squashed enough to read', () => {
    // A review that has met twenty times is twenty stops wide. Squashing them to fit
    // the container would make the labels unreadable, and unreadable is worse than a
    // scrollbar.
    const many = Array.from({ length: 20 }, (_, index) => session(`s-${index}`, index + 1, MAIN.id));
    const layout = layoutSessionMap([MAIN], many, [], []);
    expect(layout.width).toBeGreaterThan(2000);
  });
});

describe('layoutSessionMap — a variant that is finished with', () => {
  const variantSessions = [session('v-1', 1, VARIANT_A.id), session('v-2', 2, VARIANT_A.id)];

  it('rejoins an ADOPTED variant with a green stop on the main line', () => {
    const adopted: ReviewLine = { ...VARIANT_A, status: 'adopted', closedAt: '2026-06-01T09:00:00.000Z' };
    const layout = layoutSessionMap([MAIN, adopted], [...MAIN_SESSIONS, ...variantSessions], REVISIONS, []);

    const rejoin = layout.stops.find((stop) => stop.rejoin);
    expect(rejoin).toBeTruthy();
    // On the main line's row, past its last real meeting rather than on top of it.
    expect(rejoin?.y).toBe(layout.stops[0].y);
    const onMainRow = layout.stops.filter((stop) => !stop.rejoin && stop.y === layout.stops[0].y);
    expect(rejoin?.x).toBeGreaterThan(onMainRow[onMainRow.length - 1].x);
    expect(layout.edges.some((edge) => edge.kind === 'rejoin' && !edge.dashed)).toBe(true);
  });

  it('does not rejoin a variant that is still being explored', () => {
    const layout = layoutSessionMap([MAIN, VARIANT_A], [...MAIN_SESSIONS, ...variantSessions], REVISIONS, []);
    expect(layout.stops.some((stop) => stop.rejoin)).toBe(false);
    expect(layout.edges.some((edge) => edge.kind === 'rejoin')).toBe(false);
  });

  it('greys and dashes a DROPPED variant, and keeps it on the map', () => {
    const dropped: ReviewLine = { ...VARIANT_A, status: 'dropped', closedAt: '2026-06-01T09:00:00.000Z' };
    const layout = layoutSessionMap([MAIN, dropped], [...MAIN_SESSIONS, ...variantSessions], REVISIONS, []);

    // Kept for the record: a dropped variant is an answer the review tried, and
    // taking it off the map would take its cards' history with it.
    expect(stopLabels(layout)).toContain('A1');
    expect(stopLabels(layout)).toContain('A2');
    expect(layout.stops.filter((stop) => stop.dropped)).toHaveLength(2);
    expect(layout.edges.filter((edge) => edge.dashed).length).toBeGreaterThan(0);
    expect(layout.stops.some((stop) => stop.rejoin)).toBe(false);
    expect(layout.rows[1]).toMatchObject({ dropped: true });
  });

  it('two adopted variants rejoin at two different stops, not on top of each other', () => {
    const adoptedA: ReviewLine = { ...VARIANT_A, status: 'adopted' };
    const adoptedB: ReviewLine = {
      ...VARIANT_A, id: 'line-b', letter: 'B', name: 'Lighter bracket',
      status: 'adopted', createdAt: '2026-06-01T09:00:00.000Z',
    };
    const layout = layoutSessionMap(
      [MAIN, adoptedA, adoptedB],
      [...MAIN_SESSIONS, session('v-1', 1, 'line-a'), session('w-1', 1, 'line-b')],
      REVISIONS,
      [],
    );
    const rejoins = layout.stops.filter((stop) => stop.rejoin);
    expect(rejoins).toHaveLength(2);
    expect(rejoins[0].x).not.toBe(rejoins[1].x);
  });

  it('leaves from the main line\'s last meeting when the session it was started at is gone', () => {
    // A side line floating in mid-air with nothing attached to it would look like a
    // bug rather than like a gap in the record.
    const orphan: ReviewLine = { ...VARIANT_A, parentSessionId: 'sess-deleted' };
    const layout = layoutSessionMap([MAIN, orphan], [...MAIN_SESSIONS, session('v-1', 1, orphan.id)], REVISIONS, []);
    const variantStop = layout.stops.find((stop) => stop.session.id === 'v-1');
    const lastMain = layout.stops.find((stop) => stop.session.id === 'sess-3');
    expect(variantStop?.x).toBeGreaterThan(lastMain?.x ?? 0);
  });
});

// ─── The drawing ────────────────────────────────────────────────────────────

describe('SessionMap', () => {
  it('draws the main line and its variant, named the way the app names them', () => {
    renderMap({ sessions: [...MAIN_SESSIONS, session('v-1', 1, VARIANT_A.id)] });
    expect(screen.getByText('S1')).toBeTruthy();
    expect(screen.getByText('S3')).toBeTruthy();
    expect(screen.getByText('A1')).toBeTruthy();
    expect(screen.getByText('Main line')).toBeTruthy();
    expect(screen.getByText('Variant A')).toBeTruthy();
    expect(screen.getByText('Bracket assembly')).toBeTruthy();
    expect(screen.getByText(/4 sessions/)).toBeTruthy();
    expect(screen.getByText(/1 variant/)).toBeTruthy();
  });

  it('says what there is to say when a review has not met', () => {
    renderMap({ sessions: [], cards: [] });
    expect(screen.getByText('No sessions recorded in this design review yet.')).toBeTruthy();
  });

  it('says it is reading, rather than showing an empty map, while it loads', () => {
    renderMap({ sessions: [], cards: [], emptyMessage: 'Reading this design review’s sessions…' });
    expect(screen.getByText('Reading this design review’s sessions…')).toBeTruthy();
  });

  it('closes when asked to', () => {
    let closed = 0;
    renderMap({ onClose: () => { closed += 1; } });
    fireEvent.click(screen.getByLabelText('Close the session map'));
    expect(closed).toBe(1);
  });

  it('has no close button where the map is part of the page', () => {
    renderMap();
    expect(screen.queryByLabelText('Close the session map')).toBeNull();
  });

  it('dashes a dropped variant\'s stops in the drawing, not only in the layout', () => {
    const dropped: ReviewLine = { ...VARIANT_A, status: 'dropped' };
    renderMap({
      lines: [MAIN, dropped],
      sessions: [...MAIN_SESSIONS, session('v-1', 1, VARIANT_A.id)],
    });
    const circle = screen.getByText('A1').parentElement?.querySelector('circle');
    expect(circle?.getAttribute('stroke-dasharray')).toBeTruthy();
    const mainCircle = screen.getByText('S1').parentElement?.querySelector('circle');
    expect(mainCircle?.getAttribute('stroke-dasharray')).toBeNull();
  });
});

// ─── One session, opened ────────────────────────────────────────────────────

describe('SessionMap — a stop opens its session', () => {
  it('shows nothing until a stop is clicked', () => {
    renderMap();
    expect(screen.queryByText('Attended')).toBeNull();
  });

  it('shows the date, who attended, what was on screen and the cards', () => {
    renderMap();
    fireEvent.click(screen.getByText('S2'));

    expect(screen.getByText('Attended')).toBeTruthy();
    expect(screen.getByText('6 people')).toBeTruthy();
    expect(screen.getByText('On screen')).toBeTruthy();
    // The stop names them too, so the panel is the second place "Rev B" appears.
    expect(screen.getAllByText('Rev B').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Cards from this session')).toBeTruthy();
    // Two cards were raised in S2 and one in S3; only S2's are listed.
    expect(screen.getAllByText('Hinge pin wears')).toHaveLength(2);
  });

  it('links a card into the tracker, on the meeting it came from', () => {
    renderMap();
    fireEvent.click(screen.getByText('S2'));
    const link = screen.getAllByText('Hinge pin wears')[0].closest('a');
    expect(link?.getAttribute('href')).toBe('/tracker?session=sess-2');
  });

  it('says a session had no summary rather than leaving the slot out', () => {
    // /api/capture/summary answers with markdown and stores nothing, so no session
    // has one today. The slot is there and says so honestly.
    renderMap();
    fireEvent.click(screen.getByText('S1'));
    expect(screen.getByText('No summary was stored for this session.')).toBeTruthy();
  });

  it('shows the summary when a session has one', () => {
    renderMap({
      sessions: [session('sess-1', 1, MAIN.id, { summary: 'Decisions: Rev B approved.' })],
      cards: [],
    });
    fireEvent.click(screen.getByText('S1'));
    expect(screen.getByText(/Rev B approved/)).toBeTruthy();
  });

  it('says which line the session was on, by its full name', () => {
    renderMap({ sessions: [...MAIN_SESSIONS, session('v-1', 1, VARIANT_A.id)] });
    fireEvent.click(screen.getByText('A1'));
    // The row's tooltip carries the same name; the panel adds the meeting's title to
    // it, which is what makes this the panel's answer and not the tooltip's.
    expect(screen.getByText('Variant A · Weld fix · Design Review — v-1')).toBeTruthy();
  });

  it('closes again, both from its own button and from a second click on the stop', () => {
    renderMap();
    // The open panel repeats the stop's label, and the drawing comes first in the
    // document, so the stop is always the first match.
    const stop = (label: string) => screen.getAllByText(label)[0];
    fireEvent.click(stop('S1'));
    expect(screen.getByText('Attended')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close this session'));
    expect(screen.queryByText('Attended')).toBeNull();

    fireEvent.click(stop('S1'));
    expect(screen.getByText('Attended')).toBeTruthy();
    fireEvent.click(stop('S1'));
    expect(screen.queryByText('Attended')).toBeNull();
  });

  it('does not open a panel for the green stop an adopted variant rejoins at', () => {
    // It is not a meeting; it is the moment a variant's model and cards became the
    // main line's.
    const adopted: ReviewLine = { ...VARIANT_A, status: 'adopted' };
    renderMap({
      lines: [MAIN, adopted],
      sessions: [...MAIN_SESSIONS, session('v-1', 1, VARIANT_A.id)],
    });
    fireEvent.click(screen.getByText('✓'));
    expect(screen.queryByText('Attended')).toBeNull();
  });
});

// ─── The words ──────────────────────────────────────────────────────────────

describe('SessionMap — the words on screen', () => {
  it('never says branch, fork, merge or commit', () => {
    const adopted: ReviewLine = { ...VARIANT_A, status: 'adopted', name: 'Thicker flange' };
    const dropped: ReviewLine = {
      ...VARIANT_A, id: 'line-b', letter: 'B', name: 'Old idea', status: 'dropped',
    };
    const { container } = renderMap({
      lines: [MAIN, adopted, dropped],
      sessions: [
        ...MAIN_SESSIONS,
        session('v-1', 1, 'line-a'),
        session('w-1', 1, 'line-b'),
      ],
    });
    fireEvent.click(screen.getByText('S1'));

    // Every word the map itself puts on screen: the heading, the legend, the row
    // names, the stops, the panel and its labels.
    const shown = (container.textContent ?? '').toLowerCase();
    for (const word of ['branch', 'fork', 'merge', 'commit']) {
      expect(shown, `the map says "${word}"`).not.toContain(word);
    }
  });

  it('calls them a design review, its lines and its sessions', () => {
    renderMap();
    expect(screen.getByText('Design review')).toBeTruthy();
    expect(screen.getByText(/sessions/)).toBeTruthy();
    expect(screen.getByText('Main line')).toBeTruthy();
  });
});
