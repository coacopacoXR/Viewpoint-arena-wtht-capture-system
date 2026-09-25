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
// Imported for its parser and its row type only: lib/capture/transcriptText has no
// runtime dependencies at all, so this pulls no capture path into the reviews repo.
import { parseTranscriptRows, type TranscriptRow } from '../capture/transcriptText';
import {
  MAIN_LINE_NAME,
  isMainLine,
  lineById,
  mainLineOf,
  orderedLines,
  sessionLabel,
  toReviewLine,
  type ReviewLine,
} from './lines';

interface LineRow extends Record<string, unknown> {
  id: string;
}

const LINE_COLUMNS =
  'id,review_id,kind,name,letter,parent_session_id,status,created_by,created_by_name,created_at,closed_at';

/**
 * The columns a LIST of sessions reads — every one of them except `transcript`.
 *
 * `select('*')` stays what a read of ONE session uses, and deliberately: an install
 * whose database predates a column must still read the meeting rather than fail on
 * the column it does not have. A list is the other case, because batch BU put up to
 * two megabytes of transcript on a row, and a review that has met twenty times would
 * otherwise drag twenty of them into the lobby's grid, the room's map and the
 * tracker's history just to draw a dot per meeting. So a list names what it wants,
 * and `readSessionRows` falls back to `'*'` when this database does not have one of
 * those columns yet — both rules kept: no transcript in a list, and no read lost to
 * an install that has not been upgraded.
 */
const SESSION_LIST_COLUMNS =
  'id,room_id,title,ended_at,created_at,participant_count,model_name,labels,review_id,revision_ids,line_id,seq,attendee_names,summary';

/** Postgres' "column … does not exist": what an un-upgraded install answers. */
const UNDEFINED_COLUMN = '42703';

interface SessionRowsAnswer {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

function sessionRows(data: unknown): Array<Record<string, unknown>> {
  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

/**
 * Read a list of sessions without their transcripts, and survive a database that
 * does not have every column named above.
 *
 * The caller passes the query rather than the columns because the three lists here
 * are three different queries over the same table, and the retry has to be the same
 * query with `'*'` in place of the column list — including the nested
 * `session:tracker_sessions(…)` one, where the columns are inside a join.
 */
async function readSessionRows(
  build: (columns: string) => PromiseLike<SessionRowsAnswer>,
): Promise<Array<Record<string, unknown>>> {
  const first = await build(SESSION_LIST_COLUMNS);
  if (!first.error) return sessionRows(first.data);
  if (first.error.code !== UNDEFINED_COLUMN) return [];
  const again = await build('*');
  if (again.error) return [];
  return sessionRows(again.data);
}

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
  /**
   * Who attended, by name — the person who ended the meeting first, then everybody
   * else in the room, deduplicated (lib/identity.attendeeNames).
   *
   * Optional and [] for a meeting recorded before the column existed, which is why
   * `participantCount` is still here: the session panel shows the names when there
   * are any and the count when there are not, so an old row still says something
   * true about who was in the room.
   */
  attendeeNames?: string[];
  modelName: string | null;
  /** The line this meeting was on, or null for one recorded before lines existed. */
  lineId: string | null;
  /** Its number on that line: 3 for "S3", 2 for "A2". Null when it has none. */
  seq: number | null;
  /** The model_revisions that were on screen when it ended. */
  revisionIds: string[];
  /**
   * The minutes of the meeting, when they were written.
   *
   * Null is the normal answer and not a gap: api/capture/summary.ts is asked once
   * per meeting by the one browser that recorded it (lib/capture/meetingMinutes),
   * and a meeting with no transcript and no cards, a room in privacy mode, capture
   * paused while somebody curated the review, and any provider failure all leave it
   * null. The session panel then says that no summary was stored, which is the
   * truth about that meeting rather than a blank slot.
   */
  summary: string | null;
}

export function toLineSession(row: Record<string, unknown>): LineSession | null {
  const id = typeof row['id'] === 'string' ? row['id'] : '';
  if (!id) return null;
  const rawSeq = row['seq'];
  const seq = typeof rawSeq === 'number' && Number.isInteger(rawSeq) ? rawSeq : null;
  const rawRevisions = row['revision_ids'];
  const rawAttendees = row['attendee_names'];
  const rawCount = row['participant_count'];
  const summary = typeof row['summary'] === 'string' && row['summary'] !== '' ? row['summary'] : null;
  return {
    id,
    title: typeof row['title'] === 'string' ? row['title'] : '',
    endedAt: typeof row['ended_at'] === 'string' ? row['ended_at'] : '',
    participantCount: typeof rawCount === 'number' ? rawCount : Number(rawCount ?? 0),
    // `select('*')` and a runtime check rather than a column list, for the reason
    // revision_ids below gives: an install whose database predates batch BM has no
    // attendee_names, and an empty list is the answer that lets the panel fall back
    // to the count instead of the read failing and losing the meeting.
    attendeeNames: Array.isArray(rawAttendees)
      ? rawAttendees.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
      : [],
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
    const rows = await readSessionRows((columns) =>
      supabase
        .from('tracker_sessions')
        .select(columns)
        .eq('review_id', reviewId)
        .order('ended_at', { ascending: true }),
    );
    const sessions: LineSession[] = [];
    for (const row of rows) {
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
    const rows = await readSessionRows((columns) =>
      supabase
        .from('tracker_sessions')
        .select(columns)
        .eq('line_id', lineId)
        .order('ended_at', { ascending: false })
        .limit(1),
    );
    if (rows.length === 0) return null;
    return toLineSession(rows[0]);
  } catch (err) {
    console.error('[linesRepo] lastSessionOnLine threw:', err);
    return null;
  }
}

/** One meeting by id, or null. The session a variant left from. */
export async function sessionById(id: string | null | undefined): Promise<LineSession | null> {
  if (!id) return null;
  try {
    const rows = await readSessionRows((columns) =>
      supabase
        .from('tracker_sessions')
        .select(columns)
        .eq('id', id)
        .limit(1),
    );
    if (rows.length === 0) return null;
    return toLineSession(rows[0]);
  } catch (err) {
    console.error('[linesRepo] sessionById threw:', err);
    return null;
  }
}

/**
 * One meeting's transcript, read on its own.
 *
 * The ONLY reader of tracker_sessions.transcript, and the reason no other query in
 * this file asks for it — not even the two above, which read a single row. Batch BU
 * made that column up to two megabytes of a meeting, and the only surface that shows
 * it is the session map's panel for the ONE stop somebody clicked, so it is asked for
 * when that happens and never before.
 *
 * Null when the meeting has no transcript — every meeting recorded before this
 * column existed, every meeting nobody asked to keep, every meeting held in privacy
 * mode — and when this database does not have the column yet. Both are the same
 * answer to the caller: the panel shows no transcript row at all, rather than an
 * empty one that offers a download of nothing.
 */
export async function sessionTranscript(
  id: string | null | undefined,
): Promise<TranscriptRow[] | null> {
  if (!id) return null;
  try {
    const { data, error } = await supabase
      .from('tracker_sessions')
      .select('transcript')
      .eq('id', id)
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const rows = parseTranscriptRows((data as Array<Record<string, unknown>>)[0]?.['transcript']);
    return rows !== null && rows.length > 0 ? rows : null;
  } catch (err) {
    console.error('[linesRepo] sessionTranscript threw:', err);
    return null;
  }
}

/**
 * The meeting this line starts from.
 *
 * Its own newest one, which is batch BK's "a session starts where the line left
 * off". For a variant that has NEVER met there is no such meeting, and the answer
 * is the one it left: the session it was started from, whose scene and whose open
 * cards are what the first meeting on a variant is a continuation of
 * (docs/plan/15-sessions-and-variants.md batch BL). Without this a brand new
 * variant opens on the review's whole history — whatever the main line uploaded
 * last, which is exactly the model the people exploring the variant walked away
 * from.
 *
 * A variant that HAS met answers its own last meeting and never the parent, so
 * meeting A2 on a variant starts from A1 and not from the main line's S3.
 */
export async function lineOriginSession(line: ReviewLine | null | undefined): Promise<LineSession | null> {
  if (!line) return null;
  const last = await lastSessionOnLine(line.id);
  if (last) return last;
  if (line.kind === 'variant' && line.parentSessionId) return sessionById(line.parentSessionId);
  return null;
}

/** One row of review_lines this read needs the adopted scene from. */
interface AdoptedSceneRow {
  closed_at: string | null;
  adopted_revision_ids: string[] | null;
}

/**
 * What the main line's scene became at the newest adoption, or null.
 *
 * Read as its own query rather than as a column on ReviewLine on purpose: an
 * install that applied docs/supabase-schema.sql at batch BK has review_lines and
 * no `adopted_revision_ids`, and naming the column in the shared select would fail
 * the whole read and take the map with it. Here a 42703 answers null, which is
 * "no adoption to honour", and everything else carries on.
 *
 * Only honoured while it is NEWER than the main line's last meeting. A meeting held
 * after the adoption wrote its own revision_ids and is the newer fact about what
 * the main line is looking at, so nothing has to clear the column afterwards.
 */
async function adoptedSceneFor(reviewId: string, mainLineId: string): Promise<string[] | null> {
  try {
    const { data, error } = await supabase
      .from('review_lines')
      .select('closed_at,adopted_revision_ids')
      .eq('review_id', reviewId)
      .eq('status', 'adopted');
    if (error || !data) return null;
    let newest: AdoptedSceneRow | null = null;
    for (const row of data as AdoptedSceneRow[]) {
      const ids = Array.isArray(row.adopted_revision_ids)
        ? row.adopted_revision_ids.filter((id): id is string => typeof id === 'string')
        : [];
      if (ids.length === 0) continue;
      if (!newest || (row.closed_at ?? '') > (newest.closed_at ?? '')) newest = { ...row, adopted_revision_ids: ids };
    }
    if (!newest) return null;
    const ids = (newest.adopted_revision_ids ?? []).filter((id): id is string => typeof id === 'string');
    const last = await lastSessionOnLine(mainLineId);
    if (last?.endedAt && (newest.closed_at ?? '') <= last.endedAt) return null;
    return ids.length > 0 ? ids : null;
  } catch (err) {
    console.error('[linesRepo] adoptedSceneFor threw:', err);
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
 *
 * Two additions in batch BL, and both are about a line that has not met since
 * something changed: a variant that has never met starts from the session it left
 * (lineOriginSession), and the main line starts from what the newest adoption put
 * on it while no meeting has superseded that.
 *
 * Batch BQ added the third: a variant with NO meeting to leave from, which is one
 * started in a review that had never met. It has no parent session and no session of
 * its own, so `lineOriginSession` answers null for it — and null here means "rebuild
 * from the review's whole history", which for such a variant is the newest revision
 * of every line it has ever stored rather than the scene the main line is showing.
 * So the main line's own answer is asked for instead: what an adoption put on it, or
 * what its last meeting was looking at, or — for a review that still has not met —
 * null, and the caller rebuilds from the review's stored revisions, which is exactly
 * the scene the main line's room would show.
 */
export async function originRevisionIds(
  reviewId: string | null | undefined,
  lineId: string | null | undefined,
): Promise<string[] | null> {
  if (!reviewId) return null;
  const line = await resolveLine(reviewId, lineId);
  if (!line) return null;
  if (isMainLine(line)) {
    const adopted = await adoptedSceneFor(reviewId, line.id);
    if (adopted) return adopted;
  }
  const origin = await lineOriginSession(line);
  if (origin && origin.revisionIds.length > 0) return origin.revisionIds;
  if (line.kind === 'variant' && line.parentSessionId === null) {
    const main = mainLineOf(await listLines(reviewId));
    if (main && main.id !== line.id) {
      const adopted = await adoptedSceneFor(reviewId, main.id);
      if (adopted) return adopted;
      const last = await lastSessionOnLine(main.id);
      if (last && last.revisionIds.length > 0) return last.revisionIds;
    }
  }
  return null;
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
  /**
   * The same "S2", already spelled — but by the line the card is actually ON.
   *
   * Optional, and only `listCarriedOver` fills it. A card carried into a variant
   * that has never met comes from the main line, and numbering it with the
   * variant's own letter would call S2 "A2" on a line that has held two meetings
   * at most. A reader with no label falls back to `sessionLabel(line, fromSeq)`,
   * which is right for every card the line raised itself.
   */
  fromLabel?: string | null;
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
 * The still-open cards on one line, as raw rows, oldest first.
 *
 * Split out of `listOpenLineItems` because batch BL reads the same rows for a
 * second purpose — the cards a brand new variant carries from the session it left
 * — and has to filter them by WHEN they were raised before it can show them.
 */
async function readOpenRows(lineId: string): Promise<Array<Record<string, unknown>>> {
  try {
    // The joined session's columns go through the same list as every other session
    // list, for the same reason: a card's meeting is here to be labelled, not to be
    // read aloud, and its transcript is up to two megabytes of neither.
    return await readSessionRows((columns) =>
      supabase
        .from('tracker_items')
        .select(`*, session:tracker_sessions(${columns})`)
        .eq('line_id', lineId)
        .in('status', OPEN_STATUSES)
        .order('created_at', { ascending: true }),
    );
  } catch (err) {
    console.error('[linesRepo] could not read the line’s open cards:', err);
    return [];
  }
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
  const rows = await readOpenRows(line.id);
  const items: CarriedOverItem[] = [];
  for (const row of rows) {
    const item = toCarriedOver(row);
    if (item) items.push(item);
  }
  return items;
}

/**
 * Whether this card was raised at or before a given meeting on its own line.
 *
 * By the meeting's number first, because `seq` is the order the line's history is
 * numbered in and is what the map draws; by timestamp when either meeting has no
 * number (recorded before `seq` existed); and by the card's own creation as a last
 * resort for one added by hand through the tracker, which names no meeting at all.
 *
 * Unanswerable is FALSE, not true: carrying a card nobody can place would put a
 * risk in front of a meeting that may have closed it twice already, and the cost
 * of leaving one out is a card that is still in the tracker where anybody can see it.
 */
function raisedAtOrBefore(row: Record<string, unknown>, upto: LineSession): boolean {
  const session = (row['session'] ?? null) as Record<string, unknown> | null;
  const rawSeq = session?.['seq'];
  const seq = typeof rawSeq === 'number' && Number.isInteger(rawSeq) ? rawSeq : null;
  if (seq !== null && upto.seq !== null) return seq <= upto.seq;
  const ended = typeof session?.['ended_at'] === 'string' ? (session?.['ended_at'] as string) : '';
  if (ended !== '' && upto.endedAt !== '') return ended <= upto.endedAt;
  const created = typeof row['created_at'] === 'string' ? row['created_at'] : '';
  if (created !== '' && upto.endedAt !== '') return created <= upto.endedAt;
  return false;
}

/**
 * The cards this room's meeting is a continuation of — what the Capture panel's
 * "Carried over" group shows.
 *
 * For a line that has met, exactly `listOpenLineItems`: its own still-open cards,
 * each labelled by its own number. For a VARIANT THAT HAS NEVER MET, the cards its
 * parent line was still carrying at the session it left from (batch BL), because
 * the plan's rule is that a variant "begins with that session's model and open
 * cards" — and those cards are on the parent line, not on it.
 *
 * They are the SAME tracker items, not copies: nothing here writes a row, and a
 * card closed in the variant's room is closed in the tracker and on the main line
 * too. Adopting the variant therefore does not move them either — they were never
 * on it. Only the cards the variant's own meetings raised move.
 *
 * Once the variant has met, its own cards are what it carries and this answers them;
 * a variant that has met and closed everything is a variant with nothing to carry,
 * and reaching back to the parent would resurrect cards the people exploring it
 * dealt with on purpose.
 */
export async function listCarriedOver(line: ReviewLine | null | undefined): Promise<CarriedOverItem[]> {
  if (!line) return [];
  const own = await listOpenLineItems(line);
  const label = (items: CarriedOverItem[], from: ReviewLine | null): CarriedOverItem[] =>
    items.map((item) => ({ ...item, fromLabel: sessionLabel(from, item.fromSeq) }));
  if (own.length > 0) return label(own, line);
  if (line.kind !== 'variant' || !line.parentSessionId) return own;

  const met = await lastSessionOnLine(line.id);
  if (met) return own;
  const parent = await sessionById(line.parentSessionId);
  if (!parent?.lineId) return own;

  const rows = await readOpenRows(parent.lineId);
  const carried: CarriedOverItem[] = [];
  for (const row of rows) {
    if (!raisedAtOrBefore(row, parent)) continue;
    const item = toCarriedOver(row);
    if (item) carried.push(item);
  }
  if (carried.length === 0) return own;
  // The label is the PARENT line's, so a card raised in S3 reads "from S3" in a
  // room that is on Variant A rather than "from A3".
  const lines = await listLines(line.reviewId);
  return label(carried, lineById(lines, parent.lineId));
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

// ─── The same reads, for a LIST of reviews at once ───────────────────────────
//
// docs/plan/15-sessions-and-variants.md batch BO. The lobby draws a card per design
// review and every card carries a miniature of that review's session map, so it needs
// the meetings and the lines of everything on screen. One query per card is a
// waterfall of forty requests behind a page that is supposed to be a list, so both
// reads are batched on `review_id in (…)` and grouped here instead.
//
// They answer an empty record rather than throwing, for the reason every read above
// does: an install whose database has no review_lines yet gets cards with no variants
// on them, which is the truth about it, and not an empty lobby.

/** How many rows one batched read will pull. Bounded so a big install cannot OOM a list. */
const BATCH_SESSION_LIMIT = 600;
const BATCH_LINE_LIMIT = 300;

function groupByReview<T>(
  rows: readonly Record<string, unknown>[],
  read: (row: Record<string, unknown>) => T | null,
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const row of rows) {
    const reviewId = typeof row['review_id'] === 'string' ? row['review_id'] : '';
    if (reviewId === '') continue;
    const value = read(row);
    if (!value) continue;
    (grouped[reviewId] ??= []).push(value);
  }
  return grouped;
}

/**
 * The meetings of several design reviews, oldest first within each, keyed by review.
 *
 * The same rows and the same ordering `listReviewSessions` answers for one review,
 * read in one request. A review with no meetings is simply absent from the record,
 * which the caller reads as "no sessions yet".
 */
export async function listSessionsForReviews(
  reviewIds: readonly string[],
): Promise<Record<string, LineSession[]>> {
  if (reviewIds.length === 0) return {};
  try {
    const rows = await readSessionRows((columns) =>
      supabase
        .from('tracker_sessions')
        .select(columns)
        .in('review_id', [...reviewIds])
        .order('ended_at', { ascending: true })
        .limit(BATCH_SESSION_LIMIT),
    );
    const grouped = groupByReview(rows, toLineSession);
    for (const list of Object.values(grouped)) {
      list.sort((a, b) => a.endedAt.localeCompare(b.endedAt) || a.id.localeCompare(b.id));
    }
    return grouped;
  } catch (err) {
    console.error('[linesRepo] listSessionsForReviews threw:', err);
    return {};
  }
}

/**
 * The lines of several design reviews, main line first within each, keyed by review.
 *
 * Read straight from the table and NOT through `listLines`, because that one caches
 * per review for a room that will ask again and again; a list page asks once for
 * forty reviews and a cache nobody will hit is only forty entries to leak.
 */
export async function listLinesForReviews(
  reviewIds: readonly string[],
): Promise<Record<string, ReviewLine[]>> {
  if (reviewIds.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from('review_lines')
      .select(LINE_COLUMNS)
      .in('review_id', [...reviewIds])
      .limit(BATCH_LINE_LIMIT);
    if (error || !data) return {};
    const grouped = groupByReview(data as Array<Record<string, unknown>>, (row) => toReviewLine(row));
    for (const [reviewId, list] of Object.entries(grouped)) {
      grouped[reviewId] = orderedLines(list);
    }
    return grouped;
  } catch (err) {
    console.error('[linesRepo] listLinesForReviews threw:', err);
    return {};
  }
}

