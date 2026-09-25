// Which models the main line ends up showing when a variant is adopted into it.
//
// docs/plan/15-sessions-and-variants.md batch BL. The plan's rule, in the user's
// own words: "the variant's latest model revision(s) become the main line's current
// ones … If both lines changed the model, adopting asks one plain question: 'Keep
// Rev C from the main line or Rev B2 from Variant A?'".
//
// So there are exactly three answers, and the third is a SENTENCE rather than a
// screen. That is the whole design constraint here: two hardware engineers who have
// spent a week on a variant and a fortnight on the main line are not being shown a
// three-way comparison with coloured hunks, they are being asked which model to put
// on the screen and given two buttons.
//
// Everything is pure — revision ids in, a plan out. No reads, no clock, no React.
// The same function decides in two places that share no runtime: api/reviews/lines.ts,
// which is the answer that counts, and a test. The browser never computes it: it
// posts "adopt" and, when the endpoint answers that a question has to be asked, it
// asks the one the endpoint wrote.
//
// THE WORDS ARE THE SPEC. Nothing in this file may print branch, fork, merge or
// commit; the question it builds is read out loud in a meeting.

import { revisionLabel } from '../trackerContinuity';
import { MAIN_LINE_NAME } from './lines';

/** The three fields of a model_revisions row the decision needs. */
export interface AdoptableRevision {
  id: string;
  /** The model this is a revision OF: "Bracket", "Housing". Not a review line. */
  line: string;
  /** The letter it is known by: "B2" reads as "Rev B2". */
  revision: string;
}

/** Everything the decision is made from, as the endpoint read it. */
export interface AdoptFacts {
  /**
   * The revisions on screen at the session the variant left, which is the point
   * both lines agree on. Empty for a parent session recorded before
   * tracker_sessions.revision_ids existed — and then nothing can be proved to have
   * changed, so every difference is asked about rather than guessed at.
   */
  parentRevisionIds: readonly string[];
  /** What the main line is showing now. */
  mainRevisionIds: readonly string[];
  /** What the variant is showing now. */
  variantRevisionIds: readonly string[];
  /** The review's stored history, so an id can be named. */
  revisions: readonly AdoptableRevision[];
  /** "Variant A" — how the question names the variant. Null names it "the variant". */
  variantLabel: string | null;
}

/** The question, and the two complete scenes its two answers mean. */
export interface AdoptChoice {
  /** One plain sentence, ending in a question mark. Shown as it is. */
  question: string;
  /** The main line's scene if the answer is "keep the main line's". */
  mainRevisionIds: string[];
  /** The main line's scene if the answer is "take the variant's". */
  variantRevisionIds: string[];
}

export type AdoptPlan =
  /** Neither line's models differ: adopting moves the cards and changes no scene. */
  | { kind: 'unchanged'; revisionIds: string[] }
  /** Only the variant moved, so its models become the main line's. No question. */
  | { kind: 'take'; revisionIds: string[] }
  /** Both moved the same model. One question, two answers. */
  | { kind: 'ask'; choice: AdoptChoice };

/** Which of the two answers the caller gave. Anything else is no answer at all. */
export function asAdoptKeep(value: unknown): 'main' | 'variant' | null {
  return value === 'main' || value === 'variant' ? value : null;
}

/** One model line's newest visible revision, out of a set of revision ids. */
function byModelLine(
  ids: readonly string[],
  revisions: readonly AdoptableRevision[],
): Map<string, string> {
  const wanted = new Set(ids);
  const out = new Map<string, string>();
  for (const revision of revisions) {
    if (!wanted.has(revision.id)) continue;
    // A scene holds one visible revision per model, so the first id that matches
    // is the answer; a set that somehow names two of them keeps the earlier one
    // rather than picking between two models that cannot both be on screen.
    if (!out.has(revision.line)) out.set(revision.line, revision.id);
  }
  return out;
}

/** "Rev C" for an id, or the model's own name when the row has no letter. */
function nameOf(id: string, revisions: readonly AdoptableRevision[]): string {
  const row = revisions.find((revision) => revision.id === id) ?? null;
  return revisionLabel(row) ?? row?.line ?? 'the newer model';
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((id) => other.has(id));
}

/**
 * What adopting this variant does to the main line's models.
 *
 * Decided PER MODEL, not per review, because a review can hold the product under
 * review and a mating part beside it and a variant that only ever touched one of
 * them must not put the other back to where it was. For each model:
 *
 *   the variant has none            keep the main line's — a variant that never
 *                                   showed a model has nothing to say about it;
 *   the main line has none          take the variant's — the variant added a model
 *                                   the main line has never had;
 *   both, and the same one          nothing to decide;
 *   both, and only the variant's    take it: this is the case the plan means by
 *       differs from the parent     "the variant's latest revision(s) become the
 *                                   main line's current ones";
 *   both, and only the main line's  keep the main line's — the variant left before
 *       differs from the parent     that upload and has no opinion on it;
 *   both differ                     ASK. Two answers to the same question is the
 *                                   one thing nobody can decide for them.
 *
 * A parent session that stored no revision ids makes every difference a question,
 * which is the honest reading of "we cannot tell who moved".
 */
export function adoptPlan(facts: AdoptFacts): AdoptPlan {
  const { parentRevisionIds, mainRevisionIds, variantRevisionIds, revisions } = facts;
  const parent = new Set(parentRevisionIds);
  const main = byModelLine(mainRevisionIds, revisions);
  const variant = byModelLine(variantRevisionIds, revisions);

  const modelLines: string[] = [];
  for (const line of [...main.keys(), ...variant.keys()]) {
    if (!modelLines.includes(line)) modelLines.push(line);
  }

  // No model either scene can be named for: an install whose database predates
  // model_revisions, a review whose meetings ran on a built-in preset, or a variant
  // started from a session that stored nothing. There is nothing to compare and
  // nothing to ask about, so the main line keeps what it has and the adoption moves
  // the cards — which is the part of it that was ever really about the cards.
  if (modelLines.length === 0) return { kind: 'unchanged', revisionIds: [] };

  const decided = new Map<string, string>();
  const conflicts: Array<{ modelLine: string; main: string; variant: string }> = [];

  for (const modelLine of modelLines) {
    const mine = main.get(modelLine) ?? null;
    const theirs = variant.get(modelLine) ?? null;
    if (!theirs) {
      if (mine) decided.set(modelLine, mine);
      continue;
    }
    if (!mine) {
      decided.set(modelLine, theirs);
      continue;
    }
    if (mine === theirs) {
      decided.set(modelLine, mine);
      continue;
    }
    const mainMoved = !parent.has(mine);
    const variantMoved = !parent.has(theirs);
    if (variantMoved && !mainMoved) {
      decided.set(modelLine, theirs);
      continue;
    }
    if (mainMoved && !variantMoved) {
      decided.set(modelLine, mine);
      continue;
    }
    // Both moved, or neither can be shown to have: the same question either way.
    conflicts.push({ modelLine, main: mine, variant: theirs });
    decided.set(modelLine, mine);
  }

  if (conflicts.length === 0) {
    const revisionIds = [...decided.values()];
    return sameSet(revisionIds, mainRevisionIds)
      ? { kind: 'unchanged', revisionIds }
      : { kind: 'take', revisionIds };
  }

  const withSide = (pick: 'main' | 'variant'): string[] =>
    modelLines.map((modelLine) => {
      const conflict = conflicts.find((entry) => entry.modelLine === modelLine);
      if (conflict) return conflict[pick];
      return decided.get(modelLine) ?? '';
    }).filter((id) => id !== '');

  return {
    kind: 'ask',
    choice: {
      question: adoptQuestion(conflicts, facts.variantLabel, revisions),
      mainRevisionIds: withSide('main'),
      variantRevisionIds: withSide('variant'),
    },
  };
}

/**
 * The one plain question.
 *
 * "Keep Rev C from the main line or Rev B2 from Variant A?" for the single model
 * both lines moved, and the same sentence with the revisions listed for the rare
 * review where two models moved on both — still one question with the same two
 * answers, because two questions in a row is the beginning of a conflict screen.
 */
export function adoptQuestion(
  conflicts: readonly { main: string; variant: string }[],
  variantLabel: string | null,
  revisions: readonly AdoptableRevision[],
): string {
  const theirs = variantLabel ?? 'the variant';
  const join = (ids: readonly string[]): string => {
    const names = ids.map((id) => nameOf(id, revisions));
    if (names.length <= 1) return names[0] ?? 'the model';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  };
  const ours = join(conflicts.map((conflict) => conflict.main));
  const theirList = join(conflicts.map((conflict) => conflict.variant));
  return `Keep ${ours} from the ${MAIN_LINE_NAME.toLowerCase()} or ${theirList} from ${theirs}?`;
}

/**
 * The scene the main line gets, once the answer is known.
 *
 * Null when the plan asked a question and `keep` is not one of its two answers —
 * the caller then asks rather than choosing, which is the whole point of the plan
 * being a plan.
 */
export function adoptRevisionIds(plan: AdoptPlan, keep: 'main' | 'variant' | null): string[] | null {
  if (plan.kind === 'ask') {
    if (keep === 'main') return plan.choice.mainRevisionIds;
    if (keep === 'variant') return plan.choice.variantRevisionIds;
    return null;
  }
  return plan.revisionIds;
}
