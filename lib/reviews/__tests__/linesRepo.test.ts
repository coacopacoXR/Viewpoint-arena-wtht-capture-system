// Tests for lib/reviews/linesRepo.ts — the lines a design review has, the number
// the next session on one gets, and the cards a line is still carrying
// (docs/plan/15-sessions-and-variants.md batch BK).
//
// Supabase is faked the way lib/reviews/__tests__/revisionsRepo.test.ts fakes it, and
// for the same reason: what is worth pinning here is the SHAPE of the read and the
// write — which table, which filter, which columns land in which row — and what the
// module answers when the database says no. An install whose database has not had
// docs/supabase-schema.sql re-applied since this batch has no review_lines table at
// all, and every one of these functions has to answer "nothing" rather than throw,
// because the room and the tracker both open on top of them.

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Answer {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

const { calls, route, identity } = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  // One router rather than one canned answer per table, because ensureMainLine reads
  // and then writes the same table and has to see a different answer each time.
  route: {
    current: ((_table: string, _ops: string[]) => ({ data: null, error: null })) as (
      table: string,
      ops: string[],
    ) => { data: unknown; error: { code?: string; message?: string } | null },
  },
  identity: { value: null as null | Record<string, unknown> },
}));

interface QueryChain extends Promise<Answer> {
  select: (...args: unknown[]) => QueryChain;
  insert: (...args: unknown[]) => QueryChain;
  update: (...args: unknown[]) => QueryChain;
  eq: (...args: unknown[]) => QueryChain;
  in: (...args: unknown[]) => QueryChain;
  order: (...args: unknown[]) => QueryChain;
  limit: (...args: unknown[]) => QueryChain;
  single: (...args: unknown[]) => QueryChain;
  maybeSingle: (...args: unknown[]) => QueryChain;
}

/** One answer per query, keyed on the operation list that query built. */
const answersForOps = new WeakMap<string[], Answer>();

function chain(table: string, ops: string[]): QueryChain {
  const step = (op: string) => (...args: unknown[]): QueryChain => {
    calls.push({ table, op, args });
    ops.push(op);
    return chain(table, ops);
  };
  // Resolved on a microtask, by which point every chained call in the expression has
  // recorded its operation — so the router can answer on "select, then eq" as well as
  // on the table alone. Answered ONCE per query and remembered: every link of the
  // chain builds a promise of its own, and a router that counted them would see one
  // read as three.
  const promise = Promise.resolve().then(() => {
    const settled = answersForOps.get(ops);
    if (settled) return settled;
    const answer = route.current(table, ops);
    answersForOps.set(ops, answer);
    return answer;
  });
  return Object.assign(promise, {
    select: step('select'),
    insert: step('insert'),
    update: step('update'),
    eq: step('eq'),
    in: step('in'),
    order: step('order'),
    limit: step('limit'),
    single: step('single'),
    maybeSingle: step('maybeSingle'),
  });
}

vi.mock('../../supabase', () => ({
  supabase: { from: (table: string) => chain(table, []) },
  supabaseConfigured: true,
}));

vi.mock('../../identity', () => ({
  getStoredIdentity: () => identity.value,
}));

import {
  ensureMainLine,
  lastSessionOnLine,
  listLines,
  listOpenLineItems,
  listReviewCardRefs,
  listReviewSessions,
  nextSessionSeq,
  originRevisionIds,
  resetLineCache,
  resolveLine,
  updateLineItem,
} from '../linesRepo';
import type { ReviewLine } from '../lines';

const REVIEW = 'review-1';

function mainRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'line-main', review_id: REVIEW, kind: 'main', name: 'Main line', letter: null,
    parent_session_id: null, status: 'active', created_by: null, created_by_name: '',
    created_at: '2026-09-01T09:00:00.000Z', closed_at: null, ...overrides,
  };
}

function variantRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return mainRow({
    id: 'line-a', kind: 'variant', name: 'Weld fix', letter: 'A',
    parent_session_id: 'sess-2', created_at: '2026-09-05T09:00:00.000Z', ...overrides,
  });
}

/** The answer for a read of a table, until a test says otherwise. */
function answerWith(data: unknown, error: Answer['error'] = null): void {
  route.current = () => ({ data, error });
}

/** A router keyed on the table, for the reads that have to differ. */
function answerByTable(tableData: Record<string, unknown>): void {
  route.current = (table) => ({ data: tableData[table] ?? [], error: null });
}

beforeEach(() => {
  calls.length = 0;
  identity.value = null;
  resetLineCache();
  route.current = () => ({ data: null, error: null });
});

const asLine = (row: Record<string, unknown>) => row as unknown as ReviewLine;

// ─── listLines ──────────────────────────────────────────────────────────────

describe('listLines', () => {
  it('answers the review\'s lines, main first', async () => {
    // Read back in whatever order the database liked, so the ordering is this
    // module's and not Postgres'.
    answerWith([variantRow(), mainRow()]);
    const lines = await listLines(REVIEW);
    expect(lines.map((line) => line.id)).toEqual(['line-main', 'line-a']);
  });

  it('reads the table once and answers from the cache after that', async () => {
    answerWith([mainRow()]);
    await listLines(REVIEW);
    await listLines(REVIEW);
    // One read is a `select` plus an `eq`, so it is the selects that count.
    const reads = calls.filter((call) => call.table === 'review_lines' && call.op === 'select');
    expect(reads).toHaveLength(1);
  });

  it('answers [] for a database with no review_lines table, and says nothing about it', async () => {
    // 42P01 is what an install that has not re-applied the schema answers. It is not
    // broken, it has no lines yet, and the room has to open anyway.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    route.current = () => ({ data: null, error: { code: '42P01', message: 'relation "review_lines" does not exist' } });
    await expect(listLines(REVIEW)).resolves.toEqual([]);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('answers [] for no review id at all', async () => {
    await expect(listLines(null)).resolves.toEqual([]);
    await expect(listLines('')).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('drops a row it cannot make sense of rather than rendering it wrong', async () => {
    answerWith([mainRow(), { id: 'line-x', review_id: REVIEW, kind: 'experiment' }]);
    const lines = await listLines(REVIEW);
    expect(lines.map((line) => line.id)).toEqual(['line-main']);
  });
});

// ─── ensureMainLine ─────────────────────────────────────────────────────────

describe('ensureMainLine', () => {
  it('answers the main line the review already has, and writes nothing', async () => {
    answerWith([mainRow()]);
    const line = await ensureMainLine(REVIEW);
    expect(line?.id).toBe('line-main');
    expect(calls.filter((call) => call.op === 'insert')).toHaveLength(0);
  });

  it('creates one when the review has none, as an unnamed main line', async () => {
    route.current = (table, ops) =>
      ops.includes('insert') ? { data: mainRow(), error: null } : { data: [], error: null };

    const line = await ensureMainLine(REVIEW);
    expect(line?.id).toBe('line-main');
    const insert = calls.find((call) => call.op === 'insert');
    expect(insert?.table).toBe('review_lines');
    expect(insert?.args[0]).toMatchObject({
      review_id: REVIEW,
      kind: 'main',
      name: 'Main line',
      letter: null,
      status: 'active',
    });
  });

  it('creates it exactly once, however often a page asks', async () => {
    // A room asks on open, the Capture panel asks for its cards, and the meeting
    // flush asks at the end. One row is the whole point of the function.
    route.current = (table, ops) =>
      ops.includes('insert') ? { data: mainRow(), error: null } : { data: [], error: null };
    await ensureMainLine(REVIEW);
    await ensureMainLine(REVIEW);
    await ensureMainLine(REVIEW);
    expect(calls.filter((call) => call.op === 'insert')).toHaveLength(1);
  });

  it('takes the winner\'s row when two people open the same review at once', async () => {
    // The partial unique index refuses the second insert. That is the constraint
    // doing its job; the answer has to be the other person's row, not a failure.
    let insertAttempts = 0;
    let reads = 0;
    route.current = (table, ops) => {
      if (table !== 'review_lines') return { data: null, error: null };
      if (ops.includes('insert')) {
        insertAttempts++;
        return { data: null, error: { code: '23505', message: 'duplicate key value' } };
      }
      // The first read sees nothing — that is why it inserts. The read after the
      // refusal finds the row the other person wrote.
      reads++;
      return { data: reads === 1 ? [] : [mainRow({ id: 'theirs' })], error: null };
    };
    const line = await ensureMainLine(REVIEW);
    expect(insertAttempts).toBe(1);
    expect(line?.id).toBe('theirs');
  });

  it('answers null when the table is not there, and does not cache the failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    route.current = () => ({ data: null, error: { code: '42P01', message: 'no table' } });
    await expect(ensureMainLine(REVIEW)).resolves.toBeNull();
    error.mockRestore();
  });

  it('answers null for no review id, without touching the database', async () => {
    await expect(ensureMainLine(null)).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('names who created it when this browser is signed in, and leaves it blank for a guest', async () => {
    route.current = (table, ops) =>
      ops.includes('insert') ? { data: mainRow(), error: null } : { data: [], error: null };

    identity.value = { name: 'Paco', accountId: 'acct-1' };
    resetLineCache();
    await ensureMainLine('review-signed-in');
    expect(calls.find((call) => call.op === 'insert')?.args[0]).toMatchObject({
      created_by: 'acct-1',
      created_by_name: 'Paco',
    });

    calls.length = 0;
    identity.value = { name: 'Guest', guest: true };
    resetLineCache();
    await ensureMainLine('review-guest');
    // A guest has no account to attribute it to, but the name is still worth having:
    // "who started this review's line" is a question the history should answer.
    expect(calls.find((call) => call.op === 'insert')?.args[0]).toMatchObject({
      created_by: null,
      created_by_name: 'Guest',
    });
  });
});

// ─── resolveLine ────────────────────────────────────────────────────────────

describe('resolveLine', () => {
  it('answers the line the address named', async () => {
    answerWith([mainRow(), variantRow()]);
    const line = await resolveLine(REVIEW, 'line-a');
    expect(line?.id).toBe('line-a');
  });

  it('falls back to the main line for a line id that is not this review\'s', async () => {
    // A stale link, a deleted variant, an id from another review. A room that opens
    // on a line it cannot find must still open.
    answerWith([mainRow(), variantRow()]);
    const line = await resolveLine(REVIEW, 'line-from-somewhere-else');
    expect(line?.id).toBe('line-main');
  });

  it('answers the main line for no line id, which is every address that predates lines', async () => {
    answerWith([mainRow()]);
    expect((await resolveLine(REVIEW, null))?.id).toBe('line-main');
  });

  it('answers null for no review, because an ad-hoc room has no lines', async () => {
    await expect(resolveLine(null, 'line-a')).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });
});

// ─── nextSessionSeq ─────────────────────────────────────────────────────────

describe('nextSessionSeq', () => {
  it('is one more than the line\'s highest number', async () => {
    answerWith([{ seq: 1 }, { seq: 2 }, { seq: 3 }]);
    await expect(nextSessionSeq('line-main')).resolves.toBe(4);
  });

  it('does not reuse the number of a session somebody deleted', async () => {
    // Two meetings of one review both called S3 would be a map nobody can read and
    // a set of cards whose "raised in S3" is ambiguous.
    answerWith([{ seq: 1 }, { seq: 3 }]);
    await expect(nextSessionSeq('line-main')).resolves.toBe(4);
  });

  it('starts at 1 for a line that has never met', async () => {
    answerWith([]);
    await expect(nextSessionSeq('line-main')).resolves.toBe(1);
  });

  it('ignores a session with no number, which is one recorded before seq existed', async () => {
    answerWith([{ seq: null }, { seq: 2 }, {}]);
    await expect(nextSessionSeq('line-main')).resolves.toBe(3);
  });

  it('answers 1 rather than nothing when the read fails', async () => {
    route.current = () => ({ data: null, error: { code: '42703', message: 'column "line_id" does not exist' } });
    await expect(nextSessionSeq('line-main')).resolves.toBe(1);
  });

  it('answers 1 for no line at all', async () => {
    await expect(nextSessionSeq(null)).resolves.toBe(1);
    expect(calls).toHaveLength(0);
  });

  it('asks for the sessions of THAT line and no others', async () => {
    answerWith([]);
    await nextSessionSeq('line-a');
    const eq = calls.find((call) => call.op === 'eq');
    expect(eq?.table).toBe('tracker_sessions');
    expect(eq?.args).toEqual(['line_id', 'line-a']);
  });
});

// ─── The sessions a line has had ────────────────────────────────────────────

describe('listReviewSessions and lastSessionOnLine', () => {
  const older = {
    id: 'sess-1', title: 'First look', ended_at: '2026-09-01T16:00:00.000Z',
    participant_count: 3, model_name: 'imported', line_id: 'line-main', seq: 1,
    revision_ids: ['rev-a'],
  };
  const newer = {
    id: 'sess-2', title: 'Second look', ended_at: '2026-09-08T16:00:00.000Z',
    participant_count: 5, model_name: null, line_id: 'line-main', seq: 2,
    revision_ids: ['rev-b', 'rev-m'],
  };

  it('answers a review\'s meetings oldest first, whichever way the database gave them', async () => {
    answerWith([newer, older]);
    const sessions = await listReviewSessions(REVIEW);
    expect(sessions.map((session) => session.id)).toEqual(['sess-1', 'sess-2']);
    expect(sessions[1]).toMatchObject({ seq: 2, lineId: 'line-main', revisionIds: ['rev-b', 'rev-m'] });
  });

  it('reads a meeting recorded before this batch, with no line and no revisions', async () => {
    answerWith([{ id: 'sess-0', title: 'Old', ended_at: '2026-01-01T10:00:00.000Z', participant_count: 2 }]);
    const [session] = await listReviewSessions(REVIEW);
    expect(session).toMatchObject({
      lineId: null, seq: null, revisionIds: [], summary: null, modelName: null, attendeeNames: [],
    });
  });

  it('reads who attended and the minutes, when the row has them', async () => {
    // Batch BM. Both come off the same `select('*')` the revisions do, and both
    // stay optional at the row level: a meeting recorded before either column
    // existed reads back [] and null, which is what the session panel falls back on.
    answerWith([{ ...newer, attendee_names: ['Olga Owner', 'Ben Editor'], summary: '## Decisions\nRev B approved.' }]);
    const [session] = await listReviewSessions(REVIEW);
    expect(session).toMatchObject({
      participantCount: 5,
      attendeeNames: ['Olga Owner', 'Ben Editor'],
      summary: '## Decisions\nRev B approved.',
    });
  });

  it('drops a blank name out of the list it reads back', async () => {
    // A blank in the middle of the list reads as a missing attendee in the panel,
    // and the count beside it is the fallback for "we never knew".
    answerWith([{ ...newer, attendee_names: ['Olga Owner', ''] }]);
    const [session] = await listReviewSessions(REVIEW);
    expect(session.attendeeNames).toEqual(['Olga Owner']);
  });

  it('answers [] for a review that has not met, and for a database that has not been upgraded', async () => {
    route.current = () => ({ data: null, error: { code: '42703', message: 'no column' } });
    await expect(listReviewSessions(REVIEW)).resolves.toEqual([]);
  });

  it('answers the newest meeting on one line', async () => {
    answerWith([newer]);
    const last = await lastSessionOnLine('line-main');
    expect(last?.id).toBe('sess-2');
    const order = calls.find((call) => call.op === 'order');
    expect(order?.args[0]).toBe('ended_at');
    expect(order?.args[1]).toEqual({ ascending: false });
  });

  it('answers null for a line that has never met', async () => {
    answerWith([]);
    await expect(lastSessionOnLine('line-a')).resolves.toBeNull();
    await expect(lastSessionOnLine(null)).resolves.toBeNull();
  });
});

describe('originRevisionIds — what a session starts from', () => {
  it('answers what the line was last looking at', async () => {
    answerByTable({
      review_lines: [mainRow()],
      tracker_sessions: [{
        id: 'sess-2', title: 'Second look', ended_at: '2026-09-08T16:00:00.000Z',
        participant_count: 5, line_id: 'line-main', seq: 2, revision_ids: ['rev-b'],
      }],
    });
    await expect(originRevisionIds(REVIEW, null)).resolves.toEqual(['rev-b']);
  });

  it('answers null for a line that has never met, so the room opens on its whole history', async () => {
    answerByTable({ review_lines: [mainRow()], tracker_sessions: [] });
    await expect(originRevisionIds(REVIEW, null)).resolves.toBeNull();
  });

  it('answers null for a meeting recorded before revision_ids existed', async () => {
    // Empty is "nothing was stored", not "show nothing": treating it as the latter
    // would open such a room on an empty scene.
    answerByTable({
      review_lines: [mainRow()],
      tracker_sessions: [{ id: 'sess-1', ended_at: '2026-09-01T16:00:00.000Z', participant_count: 3, line_id: 'line-main', seq: 1, revision_ids: [] }],
    });
    await expect(originRevisionIds(REVIEW, 'line-main')).resolves.toBeNull();
  });

  it('answers null for an ad-hoc room, which has no review to have lines', async () => {
    await expect(originRevisionIds(null, null)).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });
});

// ─── The cards a line is carrying ───────────────────────────────────────────

describe('listOpenLineItems', () => {
  const openRisk = {
    id: 'item-1', type: 'RISK', title: 'Hinge pin wears', description: 'After 4k cycles.',
    priority: 'High', status: 'Open', assignee: 'Ana', created_at: '2026-09-02T10:00:00.000Z',
    session: { id: 'sess-2', line_id: 'line-main', seq: 2 },
  };

  it('answers the line\'s still-open cards, with the session each came from', async () => {
    answerWith([openRisk]);
    const items = await listOpenLineItems(asLine(mainRow()));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'item-1', type: 'RISK', fromSeq: 2, fromSessionId: 'sess-2' });
  });

  it('asks for the cards on THIS line only, still open', async () => {
    answerWith([]);
    await listOpenLineItems(asLine(mainRow()));
    const eq = calls.find((call) => call.op === 'eq');
    const included = calls.find((call) => call.op === 'in');
    expect(eq?.args).toEqual(['line_id', 'line-main']);
    expect(included?.args[0]).toBe('status');
    expect(included?.args[1]).toEqual(['Open', 'In Review']);
  });

  it('answers [] for no line, for a first meeting, and for a database without line_id', async () => {
    await expect(listOpenLineItems(null)).resolves.toEqual([]);
    expect(calls).toHaveLength(0);

    route.current = () => ({ data: null, error: { code: '42703', message: 'no column' } });
    await expect(listOpenLineItems(asLine(mainRow()))).resolves.toEqual([]);
  });

  it('drops a row whose type or status this code has never heard of', async () => {
    answerWith([openRisk, { ...openRisk, id: 'item-2', type: 'OBSERVATION' }, { ...openRisk, id: 'item-3', status: 'Parked' }]);
    const items = await listOpenLineItems(asLine(mainRow()));
    expect(items.map((item) => item.id)).toEqual(['item-1']);
  });
});

// ─── Editing one of them ────────────────────────────────────────────────────

describe('updateLineItem', () => {
  it('writes the tracker row and the history entry, because the tracker needs both', async () => {
    answerWith([]);
    route.current = () => ({ data: null, error: null });
    await expect(updateLineItem('item-1', { status: 'Approved' }, 'Paco')).resolves.toBe(true);
    const update = calls.find((call) => call.op === 'update');
    expect(update?.table).toBe('tracker_items');
    expect(update?.args[0]).toMatchObject({ status: 'Approved' });
    expect(update?.args[0]).toHaveProperty('updated_at');
    const history = calls.find((call) => call.table === 'tracker_status_history' && call.op === 'insert');
    expect(history?.args[0]).toEqual({ item_id: 'item-1', status: 'Approved', changed_by: 'Paco' });
  });

  it('answers false when the write did not land, so the panel can put the value back', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    route.current = () => ({ data: null, error: { message: 'nope' } });
    await expect(updateLineItem('item-1', { status: 'Approved' }, 'Paco')).resolves.toBe(false);
    error.mockRestore();
  });

  it('still answers true when only the history entry failed', async () => {
    // The card IS changed. A missing history entry costs the tracker the date it
    // would have said the card closed on, which is a smaller loss than pretending
    // the change did not happen.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    route.current = (table) =>
      table === 'tracker_status_history' ? { data: null, error: { message: 'nope' } } : { data: null, error: null };
    await expect(updateLineItem('item-1', { status: 'Rejected' }, 'Paco')).resolves.toBe(true);
    error.mockRestore();
  });

  it('writes no history for a change that is not a status change', async () => {
    route.current = () => ({ data: null, error: null });
    await updateLineItem('item-1', { assignee: 'Ana' }, 'Paco');
    expect(calls.filter((call) => call.table === 'tracker_status_history')).toHaveLength(0);
  });
});

// ─── The cards the map counts ───────────────────────────────────────────────

describe('listReviewCardRefs', () => {
  it('answers a review\'s cards with the two lines each of them names', async () => {
    answerWith([
      { id: 'item-1', session_id: 'sess-2', type: 'RISK', title: 'Hinge pin wears', status: 'Open', priority: 'High', line_id: 'line-main', origin_line_id: 'line-a' },
    ]);
    const refs = await listReviewCardRefs(REVIEW);
    expect(refs[0]).toMatchObject({ id: 'item-1', sessionId: 'sess-2', lineId: 'line-main', originLineId: 'line-a' });
  });

  it('answers [] for a database that has no line_id column yet', async () => {
    // The map still draws, without counts — better than no map.
    route.current = () => ({ data: null, error: { code: '42703', message: 'no column' } });
    await expect(listReviewCardRefs(REVIEW)).resolves.toEqual([]);
  });

  it('asks for one review\'s cards and no more', async () => {
    answerWith([]);
    await listReviewCardRefs(REVIEW);
    expect(calls.find((call) => call.op === 'eq')?.args).toEqual(['review_id', REVIEW]);
  });
});
