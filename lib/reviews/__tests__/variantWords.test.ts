// The words batch BL puts on screen about a line that is finished with, and about a
// card that went through one — lib/reviews/lines.ts.
//
// docs/plan/15-sessions-and-variants.md batch BL. These are pinned as sentences
// rather than as behaviour because they ARE the behaviour: a dropped variant that is
// kept "for the record" is only a record if everything that mentions it says it was
// dropped, and a card closed by a drop has to carry the reason the meeting gave
// rather than a status that says somebody decided something about the engineering.
//
// Also pinned: the letter a new variant gets. It is never a letter a DROPPED variant
// already used, because two sets of cards both saying they came from Variant A is
// exactly what keeping the dropped one was supposed to prevent.

import { describe, it, expect } from 'vitest';
import {
  adoptedCardLabel,
  closedCardLabel,
  droppedCardReason,
  lineFilterLabel,
  lineLabel,
  lineStatusWord,
  nextVariantLetter,
  shortLineLabel,
  type ReviewLine,
} from '../lines';

const REVIEW = 'review-1';

function line(overrides: Partial<ReviewLine> = {}): ReviewLine {
  return {
    id: 'line-1',
    reviewId: REVIEW,
    kind: 'variant',
    name: 'Steel hinge pin',
    letter: 'A',
    parentSessionId: 'sess-3',
    status: 'active',
    createdBy: null,
    createdByName: 'Paco',
    createdAt: '2026-05-04T09:00:00.000Z',
    closedAt: null,
    ...overrides,
  };
}

const MAIN = line({ id: 'line-main', kind: 'main', name: 'Main line', letter: null, parentSessionId: null });
const ADOPTED = line({ status: 'adopted', closedAt: '2026-10-12T15:00:00.000Z' });
const DROPPED = line({ id: 'line-b', letter: 'B', name: 'Weld fix', status: 'dropped', closedAt: '2026-10-12T15:00:00.000Z' });

describe('the next letter a variant gets', () => {
  it('is the first letter no line of this review has taken', () => {
    expect(nextVariantLetter([])).toBe('A');
    expect(nextVariantLetter([line()])).toBe('B');
    expect(nextVariantLetter([line(), DROPPED])).toBe('C');
  });

  it('never reuses the letter of a variant that was dropped or adopted', () => {
    // A letter is an identity, not a slot. Reusing "Variant A" after the first one
    // was dropped would leave two different sets of cards both saying they came from
    // Variant A, and the whole point of keeping a dropped variant is that its cards
    // still say where they came from.
    expect(nextVariantLetter([ADOPTED])).toBe('B');
    expect(nextVariantLetter([DROPPED, line({ letter: 'A' })])).toBe('C');
  });

  it('does not count the main line, which has no letter', () => {
    expect(nextVariantLetter([MAIN])).toBe('A');
  });
});

describe('lineStatusWord', () => {
  it('names the two ways a variant can be finished with', () => {
    expect(lineStatusWord(ADOPTED)).toBe('adopted');
    expect(lineStatusWord(DROPPED)).toBe('dropped');
  });

  it('says nothing about a variant still being explored', () => {
    expect(lineStatusWord(line())).toBeNull();
  });

  it('never says either about the main line', () => {
    // A review that has stopped meeting has not adopted or dropped itself.
    expect(lineStatusWord({ ...MAIN, status: 'adopted' })).toBeNull();
    expect(lineStatusWord(MAIN)).toBeNull();
  });

  it('says nothing about no line at all', () => {
    expect(lineStatusWord(null)).toBeNull();
    expect(lineStatusWord(undefined)).toBeNull();
  });
});

describe('lineFilterLabel — what the tracker\'s line filter offers', () => {
  it('labels a variant that is finished with as such', () => {
    expect(lineFilterLabel(ADOPTED)).toBe('Variant A · Steel hinge pin · adopted');
    expect(lineFilterLabel(DROPPED)).toBe('Variant B · Weld fix · dropped');
  });

  it('leaves a variant still being explored, and the main line, exactly as the map names them', () => {
    expect(lineFilterLabel(line())).toBe(lineLabel(line()));
    expect(lineFilterLabel(line())).toBe('Variant A · Steel hinge pin');
    expect(lineFilterLabel(MAIN)).toBe('Main line');
  });

  it('says nothing about no line', () => {
    expect(lineFilterLabel(null)).toBeNull();
  });
});

describe('adoptedCardLabel — "Raised in Variant A · adopted 12 Oct"', () => {
  it('names the variant it was raised in and the day the review took it in', () => {
    expect(adoptedCardLabel(ADOPTED, '2026-10-12T15:00:00.000Z')).toBe('Raised in Variant A · adopted 12 Oct');
  });

  it('uses the short form, because it sits on a card', () => {
    expect(adoptedCardLabel(ADOPTED, '2026-10-12T15:00:00.000Z')).toContain(shortLineLabel(ADOPTED) ?? '');
    expect(adoptedCardLabel(ADOPTED, '2026-10-12T15:00:00.000Z')).not.toContain('Steel hinge pin');
  });

  it('says nothing about a card that came from the main line', () => {
    // It was raised where it still is. "Raised in Main line" is a sentence about
    // nothing.
    expect(adoptedCardLabel(MAIN, '2026-10-12T15:00:00.000Z')).toBeNull();
  });

  it('says nothing when the moment it was adopted was never written', () => {
    // A date taken from updated_at would be the date somebody last touched the card.
    expect(adoptedCardLabel(ADOPTED, null)).toBeNull();
    expect(adoptedCardLabel(ADOPTED, '')).toBeNull();
    expect(adoptedCardLabel(ADOPTED, 'not a date')).toBeNull();
  });

  it('says nothing about no line', () => {
    expect(adoptedCardLabel(null, '2026-10-12T15:00:00.000Z')).toBeNull();
  });
});

describe('droppedCardReason — what goes on every card a drop closes', () => {
  it('is the variant\'s name and the reason the meeting gave, word for word', () => {
    expect(droppedCardReason(DROPPED, 'Too expensive to tool')).toBe('Dropped with Variant B: Too expensive to tool');
  });

  it('is one line, with the reason somebody typed tidied rather than rewritten', () => {
    expect(droppedCardReason(DROPPED, '  Too expensive to tool  ')).toBe('Dropped with Variant B: Too expensive to tool');
  });

  it('is nothing at all without a reason or without a name', () => {
    // "Dropped with Variant B: " and "Dropped with : too expensive" are both a
    // sentence with a hole in it, and this one is written onto other people's cards.
    expect(droppedCardReason(DROPPED, '')).toBeNull();
    expect(droppedCardReason(DROPPED, null)).toBeNull();
    expect(droppedCardReason(null, 'Too expensive to tool')).toBeNull();
    expect(droppedCardReason(MAIN, 'Too expensive to tool')).toBeNull();
  });
});

describe('closedCardLabel — how the tracker shows a card a drop closed', () => {
  it('keeps the reason and puts it after the word Closed', () => {
    expect(closedCardLabel('Dropped with Variant B: Too expensive to tool')).toBe(
      'Closed — dropped with Variant B: Too expensive to tool',
    );
  });

  it('says nothing about a card closed by hand', () => {
    // Those are described by their status and by their own continuity line. A reason
    // invented for them would be a decision invented for them.
    expect(closedCardLabel(null)).toBeNull();
    expect(closedCardLabel('')).toBeNull();
    expect(closedCardLabel('   ')).toBeNull();
  });
});

describe('the words on screen', () => {
  it('never say branch, fork, merge or commit', () => {
    const said = [
      lineFilterLabel(ADOPTED),
      lineFilterLabel(DROPPED),
      adoptedCardLabel(ADOPTED, '2026-10-12T15:00:00.000Z'),
      droppedCardReason(DROPPED, 'Too expensive to tool'),
      closedCardLabel('Dropped with Variant B: Too expensive to tool'),
      lineStatusWord(ADOPTED),
    ].filter((word): word is string => typeof word === 'string');
    expect(said.length).toBeGreaterThan(0);
    for (const word of said) {
      expect(word.toLowerCase()).not.toMatch(/branch|fork|merge|commit/);
    }
  });
});
