// The lines of a design review, read from and written to the database.
//
// docs/plan/15-sessions-and-variants.md batch BK. lib/reviews/lines.ts holds the
// pure half — what a line is called, which room it meets in, which letter the next
// variant gets; this holds the half that touches Postgres: making sure a review has
// a main line, listing its lines, numbering the next session on one, and reading
// back what the map and the "carried over" group need.
//
// Every read answers with an empty list or a null rather than throwing, following
// lib/reviews/revisionsRepo.ts and lib/auditRepo.ts. The failure these are written
// for is an install whose database has not had docs/supabase-schema.sql re-applied
// since this batch: review_lines does not exist there (42P01) and tracker_sessions
// has no line_id (42703). Such an install is not broken, it has no lines yet, and
// the room, the tracker and the map all have to open exactly as they did — a review
// that cannot list its lines is a review with one line nobody named, not a review
// that will not load.
//
// Writes are the other way round: `ensureMainLine` is the only one batch BK makes,
// and it is the one that has to be right, because a session recorded against no
// line is a session the map cannot place and the tracker cannot label.

import { supabase, type TrackerItem } from '../supabase';
import { getStoredIdentity } from '../identity';
import {
  MAIN_LINE_NAME,
  orderedLines,
  toReviewLine,
  type ReviewLine,
} from './lines';

interface LineRow extends Record<string, unknown> {
  id: string;
}

const LINE_COLUMNS =
  'id,review_id,kind,name,letter,parent_session_id,status,created_by,created_by_name,created_at,closed_at';

/**
 * The lines this browser has already read for a review.
 *
 * Module-level for the reason lib/reviews/membersRepo.ts caches its claims: a room
 * asks for its line on open, the tracker asks for every review it has a card from,
 * and the meeting flush asks again at the end — three reads of a row that cannot
 * change while the page is open. Batch BL, which creates variants, calls
 * `resetLineCache` after a write so the next read sees it.
 */
const lineCache = new Map<string, ReviewLine[]>();

/** Tests, and a page that has just written a line and must read it back. */
export function resetLineCache(): void {
  lineCache.clear();
}

/**
 * Every line of one design review, main line first then variants in the order they
 * were started.
 *
 * [] for a review that has met but whose lines were never written, for an install
 * whose database predates the table, and for any failure. Callers treat [] as "no
 * lines to show" and never as an error.
 */
export async function listLines(reviewId: string | null | undefined): Promise<ReviewLine[]> {
  if (!reviewId) return [];
  const cached = lineCache.get(reviewId);
  if (cached) return cached;
  try {
    const { data, error } = await supabase
      .from('review_lines')
      .select(LINE_COLUMNS)
      .eq('review_id', reviewId);
    if (error || !data) return [];
    const lines: ReviewLine[] = [];
    for (const row of data as LineRow[]) {
      const line = toReviewLine(row);
      if (line) lines.push(line);
    }
    const ordered = orderedLines(lines);
    lineCache.set(reviewId, ordered);
    return ordered;
  } catch (err) {
    console.error('[linesRepo] listLines threw:', err);
    return [];
  }
}

/** Who started a line, as far as this browser can say. See revisionsRepo.attribution. */
function attribution(): { createdBy: string | null; createdByName: string } {
  const stored = getStoredIdentity();
  const name = stored?.name?.trim() || '';
  if (stored?.guest === true) return { createdBy: null, createdByName: name };
  const accountId = stored?.accountId;
  return {
    createdBy: typeof accountId === 'string' && accountId !== '' ? accountId : null,
    createdByName: name,
  };
}

/**
 * The review's main line, creating it if it has none.
 *
 * Called from a room on open and from the meeting flush, so it has to answer the
 * same row every time and must never make a second one. Two things guarantee that:
 * the partial unique index `review_lines_one_main_per_review` in
 * docs/supabase-schema.sql, and the read-then-insert below, whose insert failure is
 * answered by reading again — two people opening the same review at the same moment
 * both see no main line, both insert, one wins, and the loser reads the winner's row
 * rather than reporting a failure the review does not have.
 *
 * Null when the review cannot have one: no id, no database, or a table this install
 * has not created yet. A null is not an error and the room carries on — its meeting
 * is recorded with line_id NULL, exactly as every meeting was before this batch.
 */
export async function ensureMainLine(reviewId: string | null | undefined): Promise<ReviewLine | null> {
  if (!reviewId) return null;

  const existing = await listLines(reviewId);
  const main = existing.find((line) => line.kind === 'main');
  if (main) return main;

  const who = attribution();
  try {
    const { data, error } = await supabase
      .from('review_lines')
      .insert({
        review_id: reviewId,
        kind: 'main',
        name: MAIN_LINE_NAME,
        letter: null,
        parent_session_id: null,
        status: 'active',
        created_by: who.createdBy,
        created_by_name: who.createdByName,
      })
      .select(LINE_COLUMNS)
      .single();
    if (!error && data) {
      const line = toReviewLine(data as LineRow);
      if (line) {
        lineCache.set(reviewId, orderedLines([...existing, line]));
        return line;
      }
    }
    // Somebody else wrote it between the read and the insert, which is what the
    // partial unique index refuses. Their row is the answer; drop the cache this
    // call poisoned with a read that was already stale.
    lineCache.delete(reviewId);
    const reread = await listLines(reviewId);
    const raced = reread.find((line) => line.kind === 'main') ?? null;
    if (!raced) {
      console.error('[linesRepo] could not create the main line:', error?.code ?? '', error?.message ?? '');
    }
    return raced;
  } catch (err) {
    console.error('[linesRepo] ensureMainLine threw:', err);
    return null;
  }
}

/**
 * The line a room is on.
 *
 * `lineId` is what the address asked for; when it names a line of this review that
 * line is the answer, and when it does not — a stale link, a variant somebody
 * deleted, an id from another review — the main line is, because a room that opens
 * on a line it cannot find must still open. A null `lineId` is the main line, which
 * is every address that predates this batch.
 */
export async function resolveLine(
  reviewId: string | null | undefined,
  lineId: string | null | undefined,
): Promise<ReviewLine | null> {
  if (!reviewId) return null;
  if (lineId) {
    const lines = await listLines(reviewId);
    const wanted = lines.find((line) => line.id === lineId);
    if (wanted) return wanted;
  }
  return ensureMainLine(reviewId);
}

/** One meeting, as the map and the session panel need it. */
export interface LineSession {
  id: string;
  title: string;
  endedAt: string;
  participantCount: number;
  modelName: string | null;
  /** The line this meeting was on, or null for one recorded before lines existed. */
  lineId: string | null;
  /** Its number on that line: 3 for "S3", 2 for "A2". Null when it has none. */
  seq: number | null;
  /** The model_revisions that were on screen when it ended. */
  revisionIds: string[];
  /**
   * The minutes, when they were stored.
   *
   * Always null today and the column does not exist: /api/capture/summary answers
   * with markdown and stores nothing, so a summary is generated for a meeting that
   * is still open and is gone when it ends. The field is here because the session
   * panel has a slot for one and a slot that cannot be filled is a slot that lies
   * by omission — reading `row['summary']` costs nothing, answers null on every
   * schema version so far, and starts working the day a summary is persisted.
   */
  summary: string | null;
}

function toLineSession(row: Record<string, unknown>): LineSession | null {
  const id = typeof row['id'] === 'string' ? row['id'] : '';
  if (!id) return null;
  const rawSeq = row['seq'];
  const seq = typeof rawSeq === 'number' && Number.isInteger(rawSeq) ? rawSeq : null;
  const rawRevisions = row['revision_ids'];
  const rawCount = row['participant_count'];
  const summary = typeof row['summary'] === 'string' && row['summary'] !== '' ? row['summary'] : null;
  return {
    id,
    title: typeof row['title'] === 'string' ? row['title'] : '',
    endedAt: typeof row['ended_at'] === 'string' ? row['ended_at'] : '',
    participantCount: typeof rawCount === 'number' ? rawCount : Number(rawCount ?? 0),
    modelName: typeof row['model_name'] === 'string' ? row['model_name'] : null,
    lineId: typeof row['line_id'] === 'string' && row['line_id'] !== '' ? row['line_id'] : null,
    seq,
    // `select('*')` rather than a column list on purpose: an install whose database
    // has not been re-applied since batch BC has no revision_ids, and naming it in
    // the select would fail the whole read and lose the meetings too.
    revisionIds: Array.isArray(rawRevisions)
      ? rawRevisions.filter((entry): entry is string => typeof entry === 'string')
      : [],
    summary,
  };
}

/**
 * Every meeting of one design review, oldest first — the order the map draws them
 * in and the order a history reads.
 *
 * Ordered by `ended_at` and then by id, because two meetings of one review can end
 * inside the same second and a map whose stops swap places between two renders
 * looks broken. Sessions with no line (an install that has not been upgraded, or an
 * ad-hoc meeting recorded against this review's id) are returned as they are; the
 * map puts them on the main line, which is where the backfill in
 * docs/supabase-schema.sql puts them too.
 */
export async function listReviewSessions(reviewId: string | null | undefined): Promise<LineSession[]> {
  if (!reviewId) return [];
  try {
    const { data, error } = await supabase
      .from('tracker_sessions')
      .select('*')
      .eq('review_id', reviewId)
      .order('ended_at', { ascending: true });
    if (error || !data) return [];
    const sessions: LineSession[] = [];
    for (const row of data as Array<Record<string, unknown>>) {
      const session = toLineSession(row);
      if (session) sessions.push(session);
    }
    return sessions.sort((a, b) => a.endedAt.localeCompare(b.endedAt) || a.id.localeCompare(b.id));
  } catch (err) {
    console.error('[linesRepo] listReviewSessions threw:', err);
    return [];
  }
}

/**
 * The number the next session on this line is: one more than the highest it
 * already has.
 *
 * Highest rather than a count, so a meeting somebody deleted from the tracker does
 * not hand its number to the next one — two meetings of a review both called S3 is
 * a map that cannot be read and a set of cards whose "raised in S3" is ambiguous.
 * 1 for a line that has never met.
 */
export async function nextSessionSeq(lineId: string | null | undefined): Promise<number> {
  if (!lineId) return 1;
  try {
    const { data, error } = await supabase.from('tracker_sessions').select('seq').eq('line_id', lineId);
    if (error || !data) return 1;
    let highest = 0;
    for (const row of data as Array<{ seq: number | null }>) {
      if (typeof row.seq === 'number' && Number.isInteger(row.seq) && row.seq > highest) highest = row.seq;
    }
    return highest + 1;
  } catch (err) {
    console.error('[linesRepo] nextSessionSeq threw:', err);
    return 1;
  }
}

/** The newest meeting on one line, or null when it has not met. */
export async function lastSessionOnLine(lineId: string | null | undefined): Promise<LineSession | null> {
  if (!lineId) return null;
  try {
    const { data, error } = await supabase
      .from('tracker_sessions')
      .select('*')
      .eq('line_id', lineId)
      .order('ended_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return toLineSession((data as Array<Record<string, unknown>>)[0]);
  } catch (err) {
    console.error('[linesRepo] lastSessionOnLine threw:', err);
    return null;
  }
}

/**
 * What was on screen when this line last met, as revision ids.
 *
 * This is how a session starts where its line left off: a room opened on a line
 * that has already met shows the model that meeting was looking at, rather than the
 * newest revision of every line the review has ever stored. Null when there is
 * nothing to start from — a line that has never met, a meeting recorded before
 * revision_ids existed, or an install with no database — and the caller then does
 * what it does today and rebuilds from the review's whole history.
 *
 * An EMPTY list is answered as null too, and deliberately: `revision_ids` is empty
 * for every meeting held on a built-in preset or before batch BC, and treating that
 * as "show nothing" would open such a room on an empty scene.
 */
export async function originRevisionIds(
  reviewId: string | null | undefined,
  lineId: string | null | undefined,
): Promise<string[] | null> {
  if (!reviewId) return null;
  const line = await resolveLine(reviewId, lineId);
  if (!line) return null;
  const last = await lastSessionOnLine(line.id);
  if (!last || last.revisionIds.length === 0) return null;
  return last.revisionIds;
}

/**
 * One of a line's cards, as the room's "Carried over" group shows it.
 *
 * This is a tracker_items row and stays one: the group renders it, editing it edits
 * it, and the meeting flush never writes it again — a card carried into a meeting is
 * the same card, not a copy raised twice.
 */
export interface CarriedOverItem {
  id: string;
  type: TrackerItem['type'];
  title: string;
  description: string;
  priority: TrackerItem['priority'];
  status: TrackerItem['status'];
  assignee: string | null;
  /** Where it was raised, as the group's "from S2". Null when it has no number. */
  fromSessionId: string | null;
  fromSeq: number | null;
  createdAt: string;
}

const OPEN_STATUSES: string[] = ['Open', 'In Review'];

function toCarriedOver(row: Record<string, unknown>): CarriedOverItem | null {
  const id = typeof row['id'] === 'string' ? row['id'] : '';
  const type = row['type'];
  const priority = row['priority'];
  const status = row['status'];
  if (!id) return null;
  if (type !== 'RISK' && type !== 'ACTION' && type !== 'RATIONALE') return null;
  if (priority !== 'Critical' && priority !== 'High' && priority !== 'Medium' && priority !== 'Low') return null;
  if (status !== 'Open' && status !== 'In Review' && status !== 'Approved' && status !== 'Rejected') return null;
  const session = (row['session'] ?? null) as Record<string, unknown> | null;
  const rawSeq = session?.['seq'];
  return {
    id,
    type,
    title: typeof row['title'] === 'string' ? row['title'] : '',
    description: typeof row['description'] === 'string' ? row['description'] : '',
    priority,
    status,
    assignee: typeof row['assignee'] === 'string' && row['assignee'] !== '' ? row['assignee'] : null,
    fromSessionId: typeof session?.['id'] === 'string' ? session['id'] : null,
    fromSeq: typeof rawSeq === 'number' && Number.isInteger(rawSeq) ? rawSeq : null,
    createdAt: typeof row['created_at'] === 'string' ? row['created_at'] : '',
  };
}

/**
 * The cards still open on this line, from every meeting before this one.
 *
 * "Still open" is the tracker's own definition (lib/trackerContinuity.isClosed):
 * Open and In Review. An Approved or Rejected card was dealt with and is not
 * something the next meeting has to pick up again, and showing it would bury the
 * two risks that matter under a list of everything the review ever said.
 *
 * [] when the line has met once or not at all, when the install has no database, and
 * when the database predates line_id — which is why the read filters on the line
 * rather than joining through the review: a card whose meeting was on this line is
 * on this line, and the filter is one indexed column.
 */
export async function listOpenLineItems(line: Pick<ReviewLine, 'id'> | null | undefined): Promise<CarriedOverItem[]> {
  if (!line?.id) return [];
  try {
    const { data, error } = await supabase
      .from('tracker_items')
      .select('*, session:tracker_sessions(*)')
      .eq('line_id', line.id)
      .in('status', OPEN_STATUSES)
      .order('created_at', { ascending: true });
    if (error || !data) return [];
    const items: CarriedOverItem[] = [];
    for (const row of data as Array<Record<string, unknown>>) {
      const item = toCarriedOver(row);
      if (item) items.push(item);
    }
    return items;
  } catch (err) {
    console.error('[linesRepo] listOpenLineItems threw:', err);
    return [];
  }
}

/**
 * Change one carried-over card, in the tracker.
 *
 * The same two writes pages/TrackerPage.tsx's updateItem makes — the row and, when
 * the status moved, the history entry that lets lib/trackerContinuity say when it
 * closed. Going through the tracker's own columns rather than into the room's store
 * is the point: this card is not an InsightCard, it is a tracker item the room is
 * showing, and everybody else in the meeting sees the change the same way they see
 * a card moved on the tracker page.
 *
 * @returns false when the write did not land, so the caller can put the value back.
 */
export async function updateLineItem(
  id: string,
  updates: Partial<Pick<CarriedOverItem, 'status' | 'assignee' | 'title' | 'description' | 'priority'>>,
  changedBy: string,
): Promise<boolean> {
  if (!id) return false;
  try {
    const { error } = await supabase
      .from('tracker_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('[linesRepo] could not update the carried-over card:', error.message);
      return false;
    }
    if (updates.status) {
      // Not fatal: the card is changed, and a missing history entry only costs the
      // tracker the date it would have said the card closed on.
      const { error: historyError } = await supabase
        .from('tracker_status_history')
        .insert({ item_id: id, status: updates.status, changed_by: changedBy || 'room' });
      if (historyError) {
        console.error('[linesRepo] could not record the status change:', historyError.message);
      }
    }
    return true;
  } catch (err) {
    console.error('[linesRepo] updateLineItem threw:', err);
    return false;
  }
}

/** One card of a review, as the map counts them and its panel lists them. */
export interface SessionCardRef {
  id: string;
  sessionId: string | null;
  type: TrackerItem['type'];
  title: string;
  status: TrackerItem['status'];
  priority: TrackerItem['priority'];
  /** The line it is on now, which after an adoption is not the one it was raised on. */
  lineId: string | null;
  originLineId: string | null;
}

/**
 * Every card of one design review, light enough to read when the map is opened.
 *
 * Read by review_id rather than by session so the map can count a meeting's cards
 * without loading the tracker, and capped: a review that has met fifty times has
 * thousands of cards, and the map only ever shows one meeting's at a time.
 */
export async function listReviewCardRefs(
  reviewId: string | null | undefined,
  limit = 1000,
): Promise<SessionCardRef[]> {
  if (!reviewId) return [];
  try {
    const { data, error } = await supabase
      .from('tracker_items')
      .select('id,session_id,type,title,status,priority,line_id,origin_line_id')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    const refs: SessionCardRef[] = [];
    for (const row of data as Array<Record<string, unknown>>) {
      const id = typeof row['id'] === 'string' ? row['id'] : '';
      const type = row['type'];
      const status = row['status'];
      const priority = row['priority'];
      if (!id) continue;
      if (type !== 'RISK' && type !== 'ACTION' && type !== 'RATIONALE') continue;
      if (status !== 'Open' && status !== 'In Review' && status !== 'Approved' && status !== 'Rejected') continue;
      if (priority !== 'Critical' && priority !== 'High' && priority !== 'Medium' && priority !== 'Low') continue;
      refs.push({
        id,
        sessionId: typeof row['session_id'] === 'string' ? row['session_id'] : null,
        type,
        title: typeof row['title'] === 'string' ? row['title'] : '',
        status,
        priority,
        lineId: typeof row['line_id'] === 'string' && row['line_id'] !== '' ? row['line_id'] : null,
        originLineId:
          typeof row['origin_line_id'] === 'string' && row['origin_line_id'] !== '' ? row['origin_line_id'] : null,
      });
    }
    return refs;
  } catch {
    // An install whose database has no line_id column gets here (42703). The map
    // still draws, without counts — better than no map. Nothing to log that the
    // caller cannot already see: a map with no counts on it.
    return [];
  }
}
