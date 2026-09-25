// What a lobby card's miniature has to say about a design review.
//
// docs/plan/15-sessions-and-variants.md batch BO. The card is the first thing a
// reviewer sees of a review they have not opened in a fortnight, and the miniature is
// the whole of its answer to "how far did this get?". What is pinned here is
// therefore the four readings the sketch promises and the one thing that would make
// them all wrong:
//
//   * a stop per session, and the NEWEST one on the main line filled — not the last
//     thing drawn, which for an adopted variant is the green stop where it came back;
//   * an adopted variant drawn as a green stop on the main line, and a dropped one
//     greyed and dashed but still there, because a dropped variant is kept for the
//     record and a card that hides it hides a decision the review made;
//   * a review that has never met says so in words rather than drawing an empty box,
//     which on a card reads as a picture that failed to load;
//   * nothing it draws or says may use branch, fork, merge or commit.
//
// No mocks and no router: the component is pure, and layoutSessionMap — which it
// shares with the full map — is the real one, so a fixture that draws here draws the
// same shape there.

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import MiniSessionMap from '../MiniSessionMap';
import type { ReviewLine } from '../../../lib/reviews/lines';
import type { LineSession } from '../../../lib/reviews/linesRepo';

const REVIEW = 'rev-1';
const MAIN_ID = 'line-main';
const VARIANT_ID = 'line-a';

/** The colours SessionMap draws with, which the miniature has to keep meaning. */
const INK = '#111827';
const ADOPTED = '#059669';
const DROPPED = '#d1d5db';
const VARIANT_INK = '#7c3aed';
const HOLLOW = '#ffffff';

const MAIN: ReviewLine = {
  id: MAIN_ID, reviewId: REVIEW, kind: 'main', name: '', letter: null,
  parentSessionId: null, status: 'active', createdBy: null, createdByName: '',
  createdAt: '2026-03-01T09:00:00.000Z', closedAt: null,
};

/** A variant started from the main line's second meeting, which is the usual case. */
function variant(overrides: Partial<ReviewLine> = {}): ReviewLine {
  return {
    id: VARIANT_ID, reviewId: REVIEW, kind: 'variant', name: 'Steel hinge pin', letter: 'A',
    parentSessionId: 'sess-2', status: 'active', createdBy: null, createdByName: 'Rae',
    createdAt: '2026-05-04T09:00:00.000Z', closedAt: null, ...overrides,
  };
}

function session(id: string, seq: number, endedAt: string, lineId: string | null = MAIN_ID): LineSession {
  return {
    id, title: `Design review — ${id}`, endedAt, participantCount: 4, modelName: 'Bracket',
    lineId, seq, revisionIds: [], summary: null,
  };
}

const MAIN_SESSIONS: LineSession[] = [
  session('sess-1', 1, '2026-05-01T16:00:00.000Z'),
  session('sess-2', 2, '2026-05-03T16:00:00.000Z'),
  session('sess-3', 3, '2026-05-07T16:00:00.000Z'),
];

/** One meeting held on the variant, so it has a shape of its own to draw. */
const VARIANT_SESSIONS: LineSession[] = [
  session('sess-a1', 1, '2026-05-05T16:00:00.000Z', VARIANT_ID),
];

function draw(props: Partial<React.ComponentProps<typeof MiniSessionMap>> = {}) {
  return render(<MiniSessionMap lines={[MAIN]} sessions={MAIN_SESSIONS} {...props} />);
}

/** One attribute of a node, as a string, '' when it is not there. */
function attr(node: Element | null, name: string): string {
  return node?.getAttribute(name) ?? '';
}

function num(node: Element | null, name: string): number {
  return Number(attr(node, name));
}

function circleOf(stop: Element | null): Element | null {
  return stop?.querySelector('circle') ?? null;
}

function stops(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('[data-testid="mini-stop"]')];
}

function rejoins(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('[data-testid="mini-rejoin"]')];
}

afterEach(cleanup);

describe('the miniature of a review that has met three times on its main line', () => {
  it('draws one stop for every session, and nothing that came back', () => {
    const { container } = draw();

    expect(stops(container)).toHaveLength(3);
    expect(rejoins(container)).toHaveLength(0);
    // All three on the main line, and the main line is a row of its own: the stops
    // sit at three different places along it rather than on top of one another.
    const xs = stops(container).map((stop) => num(circleOf(stop), 'cx'));
    expect(new Set(xs).size).toBe(3);
    expect(stops(container).every((stop) => attr(stop, 'data-line') === 'main')).toBe(true);
  });

  it('fills exactly one stop, and it is the newest meeting on the main line', () => {
    const { container } = draw();

    const current = container.querySelectorAll('[data-current]');
    expect(current).toHaveLength(1);
    expect(attr(current[0], 'data-testid')).toBe('mini-stop');
    expect(attr(circleOf(current[0]), 'fill')).toBe(INK);

    // The newest, which on the main line is the rightmost: a filled dot on any other
    // stop would say the review is somewhere it has already been.
    const furthest = Math.max(...stops(container).map((stop) => num(circleOf(stop), 'cx')));
    expect(num(circleOf(current[0]), 'cx')).toBe(furthest);

    // And every other meeting stays hollow, which is what makes the filled one legible.
    const hollow = stops(container).filter((stop) => !stop.hasAttribute('data-current'));
    expect(hollow).toHaveLength(2);
    expect(hollow.every((stop) => attr(circleOf(stop), 'fill') === HOLLOW)).toBe(true);
  });

  it('says in words that there are no variants', () => {
    draw();

    expect(attr(screen.getByTestId('mini-session-map'), 'aria-label')).toBe('Main line, no variants');
  });
});

describe('the miniature of a review with a variant', () => {
  it('draws an adopted variant coming back to a green stop on the main line', () => {
    const lines = [MAIN, variant({ status: 'adopted', closedAt: '2026-05-08T10:00:00.000Z' })];
    const { container } = draw({ lines, sessions: [...MAIN_SESSIONS, ...VARIANT_SESSIONS] });

    const rejoin = rejoins(container);
    expect(rejoin).toHaveLength(1);
    expect(attr(circleOf(rejoin[0]), 'fill')).toBe(ADOPTED);
    expect(attr(circleOf(rejoin[0]), 'stroke')).toBe(ADOPTED);
    // The green stop is on the main line: that is where the variant came back to.
    expect(attr(rejoin[0], 'data-line')).toBe('main');
    // And the meeting that was held on the variant is still on the card, hollow like
    // any other, in the variant's own colour.
    const onVariant = container.querySelector('[data-testid="mini-stop"][data-line="variant"]');
    expect(attr(circleOf(onVariant), 'fill')).toBe(HOLLOW);
    expect(attr(circleOf(onVariant), 'stroke')).toBe(VARIANT_INK);
    expect(stops(container)).toHaveLength(4);

    // Coming back does not move the review on: the filled stop is still the main
    // line's newest meeting, not the green one drawn to the right of it.
    const current = container.querySelector('[data-current]');
    expect(attr(current, 'data-testid')).toBe('mini-stop');
    expect(num(circleOf(current), 'cx')).toBeLessThan(num(circleOf(rejoin[0]), 'cx'));
  });

  it('draws a dropped variant greyed and dashed, and keeps its meeting on the card', () => {
    const lines = [MAIN, variant({ status: 'dropped', closedAt: '2026-05-06T10:00:00.000Z' })];
    const { container } = draw({ lines, sessions: [...MAIN_SESSIONS, ...VARIANT_SESSIONS] });

    const dropped = container.querySelectorAll('[data-testid="mini-stop"][data-dropped]');
    expect(dropped).toHaveLength(1);
    expect(attr(circleOf(dropped[0]), 'stroke')).toBe(DROPPED);
    expect(circleOf(dropped[0])?.hasAttribute('stroke-dasharray')).toBe(true);
    expect(rejoins(container)).toHaveLength(0);

    // The line that leaves for it is dashed too: a dropped variant reads as history
    // in the stroke, not in a label this drawing has no room for.
    const dashed = [...container.querySelectorAll('path[stroke-dasharray]')];
    expect(dashed.length).toBeGreaterThan(0);
    expect(dashed.every((path) => attr(path, 'stroke') === DROPPED)).toBe(true);
  });

  it('draws a variant in its own colour, not the main line\'s', () => {
    const lines = [MAIN, variant()];
    const { container } = draw({ lines, sessions: [...MAIN_SESSIONS, ...VARIANT_SESSIONS] });

    const onVariant = container.querySelector('[data-testid="mini-stop"][data-line="variant"]');
    const onMain = container.querySelector('[data-testid="mini-stop"][data-line="main"]');
    expect(attr(circleOf(onVariant), 'stroke')).toBe(VARIANT_INK);
    expect(attr(circleOf(onVariant), 'stroke')).not.toBe(attr(circleOf(onMain), 'stroke'));
    expect(attr(circleOf(onMain), 'stroke')).toBe(INK);
  });

  it('names how many variants there are, and never the programming words', () => {
    const lines = [MAIN, variant(), variant({ id: 'line-b', letter: 'B', name: 'Glued joint' })];
    const { container } = draw({ lines, sessions: MAIN_SESSIONS });

    const label = attr(screen.getByTestId('mini-session-map'), 'aria-label');
    expect(label).toBe('Main line and 2 variants');
    expect(label.toLowerCase()).not.toMatch(/branch|fork|merge|commit/);
    expect(container.innerHTML.toLowerCase()).not.toMatch(/branch|fork|merge|commit/);
  });
});

describe('a review that has not met', () => {
  it('says so in words and draws nothing', () => {
    draw({ sessions: [] });

    expect(screen.getByTestId('mini-session-map-empty').textContent).toBe('No sessions yet');
    expect(screen.queryByTestId('mini-session-map')).toBeNull();
    expect(document.querySelector('svg')).toBeNull();
  });

  it('says so for a review with a variant started and no sessions recorded on either line', () => {
    // layoutSessionMap draws a line leaving for a variant even when nothing was ever
    // held on it, so this is the case where "no stops" and "no edges" come apart.
    draw({ lines: [MAIN, variant()], sessions: [] });

    expect(screen.getByTestId('mini-session-map-empty').textContent).toBe('No sessions yet');
    expect(screen.queryByTestId('mini-session-map')).toBeNull();
  });
});

describe('drawing into 34px', () => {
  it('keeps the whole map in the box, and left-aligned in it', () => {
    draw();

    const svg = screen.getByTestId('mini-session-map');
    expect(attr(svg, 'height')).toBe('34');
    expect(attr(svg, 'preserveAspectRatio')).toBe('xMinYMid meet');
    expect(attr(svg, 'width')).toBe('100%');
    expect(attr(svg, 'viewBox').split(' ')).toHaveLength(4);
  });

  it('thickens every line as the map grows taller, so none of them vanish', () => {
    // `meet` scales the viewBox to 34px of height, so a stroke written in viewBox
    // units arrives at 34 / height of itself: 2 units is 0.66px on a main line alone
    // and 0.34px with one variant row under it, which is a line nobody can see. The
    // strokes are therefore written in units of that shrink, and get thicker as the
    // map gets taller.
    const plain = draw();
    const plainWidths = [...plain.container.querySelectorAll('path')].map((path) =>
      num(path, 'stroke-width'),
    );
    expect(plainWidths.length).toBeGreaterThan(0);
    expect(Math.min(...plainWidths)).toBeGreaterThan(2);

    const withVariant = draw({
      lines: [MAIN, variant()],
      sessions: [...MAIN_SESSIONS, ...VARIANT_SESSIONS],
    });
    const taller = [...withVariant.container.querySelectorAll('path')].map((path) =>
      num(path, 'stroke-width'),
    );
    // Taller viewBox, smaller scale, thicker strokes: the two have to move together.
    expect(Math.min(...taller)).toBeGreaterThan(Math.max(...plainWidths));
  });
});
