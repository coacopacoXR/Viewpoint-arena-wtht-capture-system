// The lines of a design review, in words and in ids.
//
// docs/plan/15-sessions-and-variants.md batch BK. A design review is the lasting
// thing; inside it a LINE is one continuous run of meetings, and every session
// belongs to exactly one. The main line is the review's own story; a variant is a
// named side line somebody started from one of its sessions to try a different
// answer without losing the one the main line is holding.
//
// Everything here is pure: rows in, strings and ids out. No reads, no React, no
// clock. The database half is lib/reviews/linesRepo.ts, and the split is the same
// one lib/trackerContinuity.ts and lib/scene/roomScene.ts already make — the
// interesting cases are all about data that is missing (a session recorded before
// lines existed, a variant whose letter was never assigned, a review on an install
// with no database), and each of them has to answer "say nothing" rather than
// invent a label, because a label on a card reads as a fact about the review.
//
// THE WORDS ARE THE SPEC. On screen this is a "Design review" with a "Main line"
// and "Variant A"; a session is a "Session". Never branch, fork, merge or commit:
// the people using this are hardware engineers and the plan is explicit that the
// programming metaphor must not show through. Nothing in this file may print one.

import { shortDate } from '../trackerContinuity';

/** What kind of line this is. The main line is the review's own run of meetings. */
export type LineKind = 'main' | 'variant';

/**
 * A variant's fate. 'active' while it is being explored, 'adopted' when its model
 * and cards have been taken into the main line, 'dropped' when they were not.
 * Batch BK only ever produces 'active'; the other two are batch BL's, and the map
// renders all three from data it is given.
 */
export type LineStatus = 'active' | 'adopted' | 'dropped';

/** One row of review_lines, in the app's own naming. */
export interface ReviewLine {
  id: string;
  reviewId: string;
  kind: LineKind;
  /** What the variant is called by the people exploring it. '' for the main line. */
  name: string;
  /** 'A', 'B'… for a variant; null for the main line, which needs no letter. */
  letter: string | null;
  /** The main line's session this variant left from, or null for the main line. */
  parentSessionId: string | null;
  status: LineStatus;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  closedAt: string | null;
}

/** What the main line is called everywhere it is named on screen. */
export const MAIN_LINE_NAME = 'Main line';

/**
 * The separator the rest of the app uses between two labels that belong together
 * ("Bracket · Rev B", "Raised on Rev A · still open on Rev C"). A line label is
 * the same kind of thing.
 */
const SEPARATOR = ' · ';

/** The letters a variant may be given, in the order they are handed out. */
const VARIANT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Read a database value that may be a string, null, or missing entirely. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function lineKind(value: unknown): LineKind | null {
  return value === 'main' || value === 'variant' ? value : null;
}

function lineStatus(value: unknown): LineStatus | null {
  return value === 'active' || value === 'adopted' || value === 'dropped' ? value : null;
}

/**
 * A review_lines row into the app's own shape, or null when it is not one.
 *
 * Null rather than a guess for a row this code has never heard of: a `kind` or a
 * `status` from a later batch is not something to render as though it were one of
 * ours, and dropping the row leaves the map one line short instead of mislabelled.
 */
export function toReviewLine(row: Record<string, unknown> | null | undefined): ReviewLine | null {
  if (!row) return null;
  const id = text(row['id']);
  const reviewId = text(row['review_id']);
  const kind = lineKind(row['kind']);
  if (!id || !reviewId || !kind) return null;
  const rawLetter = text(row['letter']).trim().toUpperCase();
  return {
    id,
    reviewId,
    kind,
    name: text(row['name']),
    // A main line has no letter and never gets one; a variant with an unusable
    // letter keeps null and is rendered by its name alone.
    letter: kind === 'main' || rawLetter === '' ? null : rawLetter,
    parentSessionId: text(row['parent_session_id']) || null,
    status: lineStatus(row['status']) ?? 'active',
    createdBy: text(row['created_by']) || null,
    createdByName: text(row['created_by_name']),
    createdAt: text(row['created_at']),
    closedAt: text(row['closed_at']) || null,
  };
}

/** Whether this line is the review's own run of meetings. */
export function isMainLine(line: Pick<ReviewLine, 'kind'> | null | undefined): boolean {
  return line?.kind === 'main';
}

/**
 * The letter a variant is known by, or null for the main line.
 *
 * Falls back to the first letter of the variant's name when it was stored without
 * one — a row written by hand, or by an install that assigned letters later — so a
 * variant called "Weld fix" still reads as "Variant W" rather than as a line with
 * no label at all. The main line never gets a letter: its sessions are S1, S2, S3,
 * and giving it an "A" would make it look like one more variant.
 */
export function variantLetter(line: Pick<ReviewLine, 'kind' | 'letter' | 'name'> | null): string | null {
  if (!line || line.kind !== 'variant') return null;
  if (line.letter) return line.letter;
  const first = line.name.trim().charAt(0).toUpperCase();
  return VARIANT_LETTERS.includes(first) ? first : null;
}

/**
 * "S3" on the main line, "A2" on Variant A.
 *
 * Null when the session has no number, which is a session recorded before `seq`
 * existed and which the backfill in docs/supabase-schema.sql has not reached. A
 * null is the honest answer and the caller renders the card or the stop without a
 * label; "S0" or "S?" would be a number this review never had.
 */
export function sessionLabel(
  line: Pick<ReviewLine, 'kind' | 'letter' | 'name'> | null | undefined,
  seq: number | null | undefined,
): string | null {
  if (!Number.isInteger(seq) || (seq as number) < 1) return null;
  const prefix = isMainLine(line) ? 'S' : (variantLetter(line ?? null) ?? 'S');
  return `${prefix}${seq}`;
}

/**
 * "Main line", or "Variant A" — the short form, for a chip on a card where the
 * variant's own name would not fit and adds nothing the card's reader needs.
 */
export function shortLineLabel(line: Pick<ReviewLine, 'kind' | 'letter' | 'name'> | null | undefined): string | null {
  if (!line) return null;
  if (isMainLine(line)) return MAIN_LINE_NAME;
  const letter = variantLetter(line);
  return letter ? `Variant ${letter}` : 'Variant';
}

/**
 * "Main line", or "Variant A · Weld fix" — the full form, for a heading where
 * there is room for the name the people exploring it gave it.
 *
 * A variant with no usable letter is named on its own ("Weld fix") rather than as
 * "Variant · Weld fix", which would read as a label with a hole in it.
 */
export function lineLabel(line: Pick<ReviewLine, 'kind' | 'letter' | 'name'> | null | undefined): string | null {
  if (!line) return null;
  if (isMainLine(line)) return MAIN_LINE_NAME;
  const letter = variantLetter(line);
  const name = line.name.trim();
  if (!letter) return name || 'Variant';
  return name ? `Variant ${letter}${SEPARATOR}${name}` : `Variant ${letter}`;
}

/**
 * "Main line · S3" / "Variant A · A2" — what a card says about where it came from.
 *
 * Null unless BOTH halves are there. A card whose session has no number still
 * knows its line, and a card whose line row could not be read still has a number,
 * and neither half on its own is the sentence the plan asks for.
 */
export function cardLineLabel(
  line: Pick<ReviewLine, 'kind' | 'letter' | 'name'> | null | undefined,
  seq: number | null | undefined,
): string | null {
  const where = shortLineLabel(line);
  const which = sessionLabel(line, seq);
  if (!where || !which) return null;
  return `${where}${SEPARATOR}${which}`;
}

/**
 * The PartyKit room a line's meetings are held in.
 *
 * The main line keeps the review's own id, so every link already in circulation —
 * a shared URL, an email, a lobby tile, a bookmark from before lines existed —
 * opens exactly the room it always did. A variant gets `<reviewId>~<letter>`,
 * which is a DIFFERENT room: its own live presence, its own audio, and its own
 * scene on the room server, so a meeting exploring the variant cannot put a model
 * on the main line's screen by moving it.
 *
 * `~` because it is legal in a PartyKit room name and cannot appear in a
 * review id, which is a uuid or a lobby-generated slug. A variant with no letter
 * falls back to the main line's room rather than to a room named after nothing:
 * two people in the same meeting is a smaller problem than two people in two
 * rooms who cannot hear each other.
 */
export function partyRoomName(reviewId: string, line: Pick<ReviewLine, 'kind' | 'letter' | 'name'> | null | undefined): string {
  if (!reviewId) return reviewId;
  const letter = variantLetter(line ?? null);
  return letter ? `${reviewId}~${letter}` : reviewId;
}

/** The query parameter a room link carries to say which line it is on. */
export const LINE_QUERY_PARAM = 'line';

/**
 * The room address for a line: `/room/<reviewId>` for the main line, with
 * `?line=<lineId>` for a variant.
 *
 * The main line deliberately carries no parameter, so the address of every review
 * that exists today is unchanged — and so a room link is still a thing a person
 * can read out loud to another person.
 */
export function roomPath(reviewId: string, lineId?: string | null): string {
  if (!reviewId) return '/';
  return lineId ? `/room/${reviewId}?${LINE_QUERY_PARAM}=${lineId}` : `/room/${reviewId}`;
}

/** The line id a room address asks for, or null when it asks for none. */
export function lineIdFromSearch(search: string | null | undefined): string | null {
  if (!search) return null;
  try {
    const value = new URLSearchParams(search).get(LINE_QUERY_PARAM);
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  } catch {
    // An address somebody typed. It cannot name a line, and the room is the main
    // one — which is the answer every link that predates lines gives.
    return null;
  }
}

/**
 * The next letter for a new variant: the first of A…Z no line of this review has
 * taken, then AA, AB… once a review has run out of single letters.
 *
 * Taken from every line including the dropped ones, because a letter is an
 * identity and not a slot: reusing "Variant A" for a new exploration after the
// first one was dropped would leave two different sets of cards both saying they
// came from Variant A, and the whole point of keeping a dropped variant for the
// record is that its cards still say where they came from.
 */
export function nextVariantLetter(lines: readonly Pick<ReviewLine, 'kind' | 'letter' | 'name'>[]): string {
  const taken = new Set<string>();
  for (const line of lines) {
    const letter = variantLetter(line);
    if (letter) taken.add(letter);
  }
  for (const letter of VARIANT_LETTERS) {
    if (!taken.has(letter)) return letter;
  }
  for (const first of VARIANT_LETTERS) {
    for (const second of VARIANT_LETTERS) {
      const pair = `${first}${second}`;
      if (!taken.has(pair)) return pair;
    }
  }
  // 702 variants into one design review. Unreachable, and a label has to be
  // something, so it counts rather than throwing.
  return `V${taken.size + 1}`;
}

/** The review's main line, or null when it has none (and no sessions either). */
export function mainLineOf(lines: readonly ReviewLine[]): ReviewLine | null {
  return lines.find((line) => line.kind === 'main') ?? null;
}

/** One line by id, or null. */
export function lineById(lines: readonly ReviewLine[], id: string | null | undefined): ReviewLine | null {
  if (!id) return null;
  return lines.find((line) => line.id === id) ?? null;
}

/**
 * Lines in the order the map draws them: the main line first, then its variants
 * in the order they were started.
 *
 * Sorted here rather than left to whatever order the database answered in, because
 * the map's rows are positional — a variant that moved between two renders would
 * look like a different variant.
 */
export function orderedLines(lines: readonly ReviewLine[]): ReviewLine[] {
  const byCreated = [...lines].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return [...byCreated.filter((line) => line.kind === 'main'), ...byCreated.filter((line) => line.kind === 'variant')];
}

// ─── A line that is finished with ───────────────────────────────────────────
// docs/plan/15-sessions-and-variants.md batch BL. An adopted or dropped variant is
// kept, greyed, for the record — and "kept for the record" only means something if
// every place its name appears says what happened to it. A filter entry that reads
// "Variant B" for a side line nobody is meeting on any more is an offer to look at
// something that is over; a card that reads "Variant B · B4" for a card closed
// because the variant was dropped hides the reason it was closed.

/**
 * 'adopted' or 'dropped' for a variant that is finished with, null for one still
 * being explored and for the main line — which is never either, because a review
 * that has stopped meeting has not adopted or dropped itself.
 */
export function lineStatusWord(line: Pick<ReviewLine, 'kind' | 'status'> | null | undefined): 'adopted' | 'dropped' | null {
  if (!line || line.kind !== 'variant') return null;
  return line.status === 'adopted' || line.status === 'dropped' ? line.status : null;
}

/**
 * "Variant A · Steel hinge pin · adopted" — the full label plus what became of it.
 *
 * For the tracker's line filter, which lists every line of a review including the
 * finished ones and has nowhere else to put the fact. Identical to `lineLabel` for
 * a line still being explored and for the main line, so a filter that offers three
 * live lines reads exactly as it did before this batch.
 */
export function lineFilterLabel(line: Pick<ReviewLine, 'kind' | 'letter' | 'name' | 'status'> | null | undefined): string | null {
  const base = lineLabel(line);
  if (!base) return null;
  const status = lineStatusWord(line);
  return status ? `${base}${SEPARATOR}${status}` : base;
}

/**
 * "Raised in Variant A · adopted 12 Oct" — what a card says once the variant it was
 * raised on has been taken into the main line.
 *
 * Null unless BOTH halves are there. A card with no origin line was raised on the
 * line it is on and has nothing to say about coming from somewhere else — including
 * a card that has always been on the main line, where "Raised in Main line" would
 * be a sentence about nothing; a card whose `adopted_at` was never written says
 * where it was raised and stops there, because a date invented from `updated_at`
 * would be the date somebody last touched the card and not the date the review took
 * it in.
 */
export function adoptedCardLabel(
  originLine: Pick<ReviewLine, 'kind' | 'letter' | 'name'> | null | undefined,
  adoptedAt: string | null | undefined,
): string | null {
  if (!originLine || originLine.kind !== 'variant') return null;
  const where = shortLineLabel(originLine);
  if (!where) return null;
  const when = adoptedAt ? shortDate(adoptedAt) : null;
  if (!when) return null;
  return `Raised in ${where}${SEPARATOR}adopted ${when}`;
}

/**
 * "Dropped with Variant A: Too expensive to tool" — the reason stored on every card
 * a dropped variant left open.
 *
 * Written by api/reviews/lines.ts and handed to drop_review_line, which puts the
 * same string on every card it closes: one reason, word for word, on all of them,
 * so that a reviewer who finds one of these cards in six months' time is reading
 * the sentence the meeting agreed rather than a summary of it. Null for a variant
 * with no usable label or no reason, because "Dropped with : " is not a sentence —
 * and null for the main line, which is never dropped and which would otherwise
 * produce a card saying "Dropped with Main line" about the review's own history.
 */
export function droppedCardReason(
  variant: Pick<ReviewLine, 'kind' | 'letter' | 'name'> | null | undefined,
  reason: string | null | undefined,
): string | null {
  if (!variant || variant.kind !== 'variant') return null;
  const where = shortLineLabel(variant);
  const why = reason?.trim();
  if (!where || !why) return null;
  return `Dropped with ${where}: ${why}`;
}

/**
 * "Closed — dropped with Variant A: Too expensive to tool" — how the tracker shows
 * a card that was closed because the variant exploring it was dropped.
 *
 * The stored reason is a sentence of its own ("Dropped with …") and this is a
 * clause after the word "Closed", so the first letter goes down: the alternative is
 * "Closed — Dropped with", which reads as two headings that have collided. Null for
 * a card with no reason, which is every card closed by hand — those are described by
 * their status and by lib/trackerContinuity's own line, and inventing a reason for
 * them would be inventing a decision.
 */
export function closedCardLabel(closedReason: string | null | undefined): string | null {
  const reason = closedReason?.trim();
  if (!reason) return null;
  return `Closed — ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
}

