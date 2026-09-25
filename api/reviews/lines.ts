// Starting a variant, adopting one into the main line, and dropping one.
//
// docs/plan/15-sessions-and-variants.md batch BL. One endpoint with an `action`
// field rather than three, because the three are the same shape of thing — a
// decision about a line, made by somebody with a role in the review, that moves
// several rows at once — and because they share every line of plumbing that makes
// them safe.
//
//   POST /api/reviews/lines   explore | adopt | drop
//
// WHY THE WRITES ARE HERE AND NOT IN THE BROWSER. docs/supabase-schema.sql used to
// let the published anon key insert and update review_lines freely, which was
// harmless while the only write was `ensureMainLine` and is not harmless now:
// adopting a variant re-homes every card it raised and changes what the main line
// opens on, and dropping one closes other people's open risks with a reason. So the
// schema now allows the browser exactly one insert — a `kind='main'` row — and no
// update or delete at all, and the two multi-row writes are the Postgres functions
// `adopt_review_line` and `drop_review_line`, executable by the service role alone.
// One function call is one transaction, which is what makes a half-adopted variant
// impossible rather than merely unlikely: cards moved and status still 'active' is
// a variant that can be adopted twice, and cards closed with no variant marked
// dropped is a set of risks nobody can find again.
//
// WHO MAY DO IT. All three are `editReview` in lib/reviews/roles.ts — the review's
// owners and editors, and on a deployment with no accounts the meeting host. They
// are deliberately NOT three new named actions: the table in roles.ts reads as four
// levels of trust, and "may start a variant" is not a fifth level, it is the same
// permission as "may change the review's agenda, viewpoints, pins and models". A
// new row per capability would bury that and cost nothing at runtime, because the
// answer is identical. The check is made here, from the caller's own verified token
// and the roster as the database holds it right now, the way
// api/reviews/members.ts makes it — a rule in the UI is a rule anybody can lift.
//
// identity.mode 'none' is served, not 404'd (unlike the People endpoint, which has
// no roster to manage without accounts). There is no token to verify there, so the
// caller's claim to be the meeting host is taken as it is: on such an install the
// anon key in the browser bundle could until this batch write these rows outright,
// and the room server — which is where the claim is actually checked for anything
// that matters — has nothing better to go on either.
//
// THE WORDS ARE THE SPEC. Every sentence this endpoint answers is shown to a person
// in a meeting. Never branch, fork, merge or commit.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadConfig } from '../../lib/config/loadConfig.ts';
import { identityOf } from '../../lib/config/schema.ts';
import { verifyAccessToken } from '../../lib/auth/verifyJwt.ts';
import { can, asMemberRole, resolveRole, type ReviewMember, type Role } from '../../lib/reviews/roles.ts';
import {
  MAIN_LINE_NAME,
  droppedCardReason,
  lineById,
  nextVariantLetter,
  shortLineLabel,
  toReviewLine,
  type ReviewLine,
} from '../../lib/reviews/lines.ts';
import {
  adoptPlan,
  adoptRevisionIds,
  asAdoptKeep,
  type AdoptableRevision,
} from '../../lib/reviews/adopt.ts';
import { postgrestFetch } from '../_lib/postgrest.ts';

/** What a line is called, read back. adopted_revision_ids is not here: see readAdoptedScenes. */
const LINE_COLUMNS =
  'id,review_id,kind,name,letter,parent_session_id,status,created_by,created_by_name,created_at,closed_at';

/** A variant's name is a phrase somebody says out loud, not a paragraph. */
const MAX_NAME = 80;
/** Same for the reason a variant was dropped, which ends up on every card it closes. */
const MAX_REASON = 200;

/** One meeting, as far as a scene decision needs it. */
interface SessionRow {
  id: string;
  reviewId: string | null;
  lineId: string | null;
  endedAt: string;
  revisionIds: string[];
}

interface RpcAnswer {
  ok?: unknown;
  error?: unknown;
  status?: unknown;
  moved?: unknown;
  closed?: unknown;
  mainLineId?: unknown;
  variantId?: unknown;
  letter?: unknown;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

function enc(value: string): string {
  return encodeURIComponent(value);
}

/** Throws 'store_unavailable' when the database cannot be reached at all. */
async function json(res: Response | null, what: string): Promise<unknown> {
  if (!res) throw new Error('store_unavailable');
  if (!res.ok) {
    console.error(`[reviews/lines] ${what} failed: ${res.status}`);
    throw new Error('upstream_error');
  }
  return res.json();
}

async function readLines(reviewId: string): Promise<ReviewLine[]> {
  const rows = (await json(
    await postgrestFetch(`review_lines?review_id=eq.${enc(reviewId)}&select=${LINE_COLUMNS}`),
    'the line read',
  )) as Array<Record<string, unknown>>;
  const lines: ReviewLine[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const line = toReviewLine(row);
    if (line) lines.push(line);
  }
  return lines;
}

function toSessionRow(row: Record<string, unknown> | undefined): SessionRow | null {
  if (!row) return null;
  const id = typeof row['id'] === 'string' ? row['id'] : '';
  if (!id) return null;
  const raw = row['revision_ids'];
  return {
    id,
    reviewId: typeof row['review_id'] === 'string' ? row['review_id'] : null,
    lineId: typeof row['line_id'] === 'string' && row['line_id'] !== '' ? row['line_id'] : null,
    endedAt: typeof row['ended_at'] === 'string' ? row['ended_at'] : '',
    revisionIds: Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [],
  };
}

const SESSION_COLUMNS = 'id,review_id,line_id,ended_at,revision_ids';

async function readSession(id: string): Promise<SessionRow | null> {
  const rows = (await json(
    await postgrestFetch(`tracker_sessions?id=eq.${enc(id)}&select=${SESSION_COLUMNS}&limit=1`),
    'the session read',
  )) as Array<Record<string, unknown>>;
  return toSessionRow(Array.isArray(rows) ? rows[0] : undefined);
}

/** The newest meeting on one line, or null when it has not met. */
async function readLastSession(lineId: string): Promise<SessionRow | null> {
  const rows = (await json(
    await postgrestFetch(
      `tracker_sessions?line_id=eq.${enc(lineId)}&select=${SESSION_COLUMNS}&order=ended_at.desc&limit=1`,
    ),
    'the last session read',
  )) as Array<Record<string, unknown>>;
  return toSessionRow(Array.isArray(rows) ? rows[0] : undefined);
}

async function readRevisions(reviewId: string): Promise<AdoptableRevision[]> {
  const rows = (await json(
    await postgrestFetch(`model_revisions?review_id=eq.${enc(reviewId)}&select=id,line,revision&order=created_at.asc`),
    'the revision read',
  )) as Array<Record<string, unknown>>;
  const revisions: AdoptableRevision[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = typeof row['id'] === 'string' ? row['id'] : '';
    const line = typeof row['line'] === 'string' ? row['line'] : '';
    const revision = typeof row['revision'] === 'string' ? row['revision'] : '';
    if (!id || !line || !revision) continue;
    revisions.push({ id, line, revision });
  }
  return revisions;
}

/**
 * What the main line is showing now.
 *
 * The same derivation lib/reviews/linesRepo.originRevisionIds makes in the browser,
 * and it has to be the same one: this is what the adoption is decided against and
 * what a room will open on afterwards, so the two disagreeing would mean the
 * question asked in a meeting was not the question the scene answered.
 *
 * The newest adoption wins only while it is NEWER than the main line's last meeting;
 * a meeting held since then wrote its own revision_ids and is the newer fact.
 */
async function mainLineScene(reviewId: string, main: ReviewLine): Promise<string[]> {
  const rows = (await json(
    await postgrestFetch(
      `review_lines?review_id=eq.${enc(reviewId)}&status=eq.adopted&select=closed_at,adopted_revision_ids`,
    ),
    'the adoption read',
  )) as Array<{ closed_at?: unknown; adopted_revision_ids?: unknown }>;

  let newestAt = '';
  let newest: string[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const ids = Array.isArray(row.adopted_revision_ids)
      ? row.adopted_revision_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (ids.length === 0) continue;
    const closedAt = typeof row.closed_at === 'string' ? row.closed_at : '';
    if (newest.length === 0 || closedAt > newestAt) {
      newestAt = closedAt;
      newest = ids;
    }
  }

  const last = await readLastSession(main.id);
  if (newest.length > 0 && (!last?.endedAt || newestAt > last.endedAt)) return newest;
  return last?.revisionIds ?? [];
}

/**
 * The review's main line, created if it has none.
 *
 * The service role writes it, so the browser-only `kind='main'` policy is not what
 * is being relied on here. A review that has met has one already — the backfill in
 * docs/supabase-schema.sql saw to that — and this is for the one that has a variant
 * somehow recorded against a session no line claims.
 */
async function ensureMainLine(reviewId: string, lines: readonly ReviewLine[], actor: string): Promise<ReviewLine | null> {
  const existing = lines.find((line) => line.kind === 'main') ?? null;
  if (existing) return existing;
  const res = await postgrestFetch('review_lines', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      review_id: reviewId,
      kind: 'main',
      name: MAIN_LINE_NAME,
      letter: null,
      parent_session_id: null,
      status: 'active',
      created_by: null,
      created_by_name: actor,
    }),
  });
  if (!res) throw new Error('store_unavailable');
  if (res.ok) {
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const created = toReviewLine(Array.isArray(rows) ? rows[0] : undefined);
    if (created) return created;
  } else {
    console.error(`[reviews/lines] the main line insert failed: ${res.status}`);
  }
  // Somebody else wrote it between the read and the insert, which is what the
  // partial unique index refuses. Their row is the answer, so read the lines again
  // rather than reporting a failure this review does not have.
  const reread = await readLines(reviewId);
  return reread.find((line) => line.kind === 'main') ?? null;
}

// ─── Request plumbing ───────────────────────────────────────────────────────

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token === '' ? null : token;
}

function bodyRecord(req: VercelRequest): Record<string, unknown> {
  const body = req.body;
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

function bodyString(body: Record<string, unknown>, key: string): string | null {
  const raw = body[key];
  if (typeof raw !== 'string') return null;
  // One line, because it is printed on a card and inside a filter: a reason with
  // newlines in it would break the row it is shown in and is never what somebody
  // meant by "a one-line reason".
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return trimmed === '' ? null : trimmed;
}

interface Caller {
  accountId: string | null;
  name: string;
  role: Role;
}

/**
 * Who is asking, and what this review says about them.
 *
 * With accounts, from the verified token and the roster as the database holds it.
 * Without them, from the caller's own claim to be running the meeting — see the
 * note at the top of this file about what there is to check that against.
 */
async function callerFor(
  req: VercelRequest,
  body: Record<string, unknown>,
  reviewId: string,
  accountsOn: boolean,
): Promise<Caller | null> {
  if (!accountsOn) {
    const isMeetingHost = body['isMeetingHost'] === true;
    return {
      accountId: null,
      name: bodyString(body, 'actorName') ?? '',
      role: resolveRole({
        identityMode: 'none',
        accountId: null,
        isGuest: false,
        members: [],
        ownerId: null,
        isAdmin: false,
        isMeetingHost,
      }),
    };
  }

  const secret = process.env.JWT_SECRET ?? '';
  if (!secret) throw new Error('config_unavailable');
  const token = bearerToken(req);
  if (!token) return null;
  const verified = await verifyAccessToken(token, secret);
  if (!verified) return null;

  const id = enc(reviewId);
  const [curationRes, membersRes] = await Promise.all([
    postgrestFetch(`review_curations?id=eq.${id}&select=owner_id`),
    postgrestFetch(`review_members?review_id=eq.${id}&select=user_id,role`),
  ]);
  if (!curationRes || !membersRes) throw new Error('store_unavailable');
  if (!curationRes.ok || !membersRes.ok) {
    console.error(`[reviews/lines] roster read failed: ${curationRes.status} / ${membersRes.status}`);
    throw new Error('upstream_error');
  }
  const curations = (await curationRes.json()) as Array<{ owner_id?: unknown }>;
  const rawOwner = curations[0]?.owner_id;
  const ownerId = typeof rawOwner === 'string' && rawOwner !== '' ? rawOwner : null;
  const rows = (await membersRes.json()) as Array<Record<string, unknown>>;
  const members: ReviewMember[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const userId = row['user_id'];
    if (typeof userId !== 'string' || userId === '') continue;
    const role = asMemberRole(row['role']);
    if (!role) continue;
    members.push({ userId, role });
  }

  return {
    accountId: verified.sub,
    name: bodyString(body, 'actorName') ?? '',
    // `isMeetingHost` is false: it only changes a role on a deployment with no
    // accounts, and this is one with them.
    role: resolveRole({
      identityMode: 'accounts',
      accountId: verified.sub,
      isGuest: false,
      members,
      ownerId,
      isAdmin: verified.role === 'admin',
      isMeetingHost: false,
    }),
  };
}

// ─── The three actions ──────────────────────────────────────────────────────

/**
 * "Explore a variant from here."
 *
 * The letter is computed here rather than left to the database because it is an
 * identity and not a slot: `nextVariantLetter` counts every line of the review
 * including the dropped ones, so a variant started after Variant A was dropped is
 * Variant B and never a second Variant A — two sets of cards both saying they came
 * from Variant A is exactly what keeping a dropped variant for the record is meant
 * to prevent. `unique (review_id, kind, letter)` backs it up, and a collision from
 * two people clicking at the same moment is answered by reading the lines again and
 * taking the next letter, once.
 */
async function explore(
  res: VercelResponse,
  reviewId: string,
  body: Record<string, unknown>,
  caller: Caller,
): Promise<void> {
  const name = bodyString(body, 'name');
  if (!name) {
    res.status(400).json({ error: 'Give the variant a short name, so the map can say what it was for.' });
    return;
  }
  if (name.length > MAX_NAME) {
    res.status(400).json({ error: `That name is longer than ${MAX_NAME} characters.` });
    return;
  }
  const parentSessionId = bodyString(body, 'parentSessionId');
  if (!parentSessionId) {
    res.status(400).json({ error: 'A variant leaves from one of this review’s sessions.' });
    return;
  }

  const parent = await readSession(parentSessionId);
  // A session of ANOTHER review is refused rather than ignored: the map draws a
  // variant leaving from a stop it names, and a stop from somewhere else is a line
  // floating in mid-air with nothing attached to it.
  if (!parent || (parent.reviewId !== null && parent.reviewId !== reviewId)) {
    res.status(404).json({ error: 'That session is not part of this design review.' });
    return;
  }

  const lines = await readLines(reviewId);
  await ensureMainLine(reviewId, lines, caller.name);

  for (let attempt = 0; attempt < 2; attempt++) {
    const known = attempt === 0 ? lines : await readLines(reviewId);
    const letter = nextVariantLetter(known);
    const created = await postgrestFetch('review_lines', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        review_id: reviewId,
        kind: 'variant',
        name,
        letter,
        parent_session_id: parentSessionId,
        status: 'active',
        created_by: caller.accountId,
        created_by_name: caller.name,
      }),
    });
    if (!created) {
      res.status(503).json({ error: 'The database could not be reached. Try again.' });
      return;
    }
    if (created.status === 409 && attempt === 0) continue;
    if (!created.ok) {
      console.error(`[reviews/lines] explore failed: ${created.status}`);
      res.status(502).json({ error: 'The variant could not be started. Try again.' });
      return;
    }
    const rows = (await created.json()) as Array<Record<string, unknown>>;
    const line = toReviewLine(Array.isArray(rows) ? rows[0] : undefined);
    if (!line) {
      res.status(502).json({ error: 'The variant was started but could not be read back.' });
      return;
    }
    res.status(200).json({ ok: true, line });
    return;
  }
  res.status(409).json({ error: 'Two variants are being started at the same moment. Try again.' });
}

/** The sentence a refusal from one of the two functions is answered with. */
function rpcRefusal(answer: RpcAnswer): { status: number; error: string } | null {
  if (answer.ok === true) return null;
  const reason = typeof answer.error === 'string' ? answer.error : '';
  if (reason === 'no_such_variant') return { status: 404, error: 'That variant is not part of this design review.' };
  if (reason === 'already_closed') {
    const status = typeof answer.status === 'string' ? answer.status : 'closed';
    return { status: 409, error: `That variant has already been ${status}.` };
  }
  if (reason === 'no_main_line') {
    return { status: 409, error: 'This design review has no main line to adopt into.' };
  }
  return { status: 502, error: 'That change did not land. Try again.' };
}

async function rpc(path: string, body: Record<string, unknown>): Promise<RpcAnswer> {
  const res = await postgrestFetch(path, { method: 'POST', body: JSON.stringify(body) });
  const answer = (await json(res, path)) as RpcAnswer;
  return answer ?? {};
}

/**
 * "Adopt into main line."
 *
 * The models are decided here and not in the browser, so that the one plain question
 * cannot be skipped by a client that would rather not ask it: when both lines moved
 * the same model, a request with no answer is refused with the question in it, and
 * the browser asks the person and posts again. The cards move either way, and both
 * halves are one transaction.
 */
async function adopt(
  res: VercelResponse,
  reviewId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const lineId = bodyString(body, 'lineId');
  if (!lineId) {
    res.status(400).json({ error: 'lineId is required' });
    return;
  }
  const lines = await readLines(reviewId);
  const variant = lineById(lines, lineId);
  if (!variant || variant.kind !== 'variant') {
    res.status(404).json({ error: 'That variant is not part of this design review.' });
    return;
  }
  if (variant.status !== 'active') {
    res.status(409).json({ error: `That variant has already been ${variant.status}.` });
    return;
  }

  const main = await ensureMainLine(reviewId, lines, '');
  if (!main) {
    res.status(409).json({ error: 'This design review has no main line to adopt into.' });
    return;
  }

  const [parent, variantLast, revisions, mainScene] = await Promise.all([
    variant.parentSessionId ? readSession(variant.parentSessionId) : Promise.resolve(null),
    readLastSession(variant.id),
    readRevisions(reviewId),
    mainLineScene(reviewId, main),
  ]);

  const plan = adoptPlan({
    parentRevisionIds: parent?.revisionIds ?? [],
    mainRevisionIds: mainScene,
    variantRevisionIds: variantLast?.revisionIds ?? [],
    revisions,
    variantLabel: shortLineLabel(variant),
  });

  const keep = asAdoptKeep(body['keep']);
  if (plan.kind === 'ask' && keep === null) {
    // 409 rather than 400: the request was understood and is not wrong, it is
    // missing an answer only the people in the meeting can give. The question is
    // the endpoint's own words, built by the same pure rule that decides the write,
    // so the browser cannot get one without the other.
    res.status(409).json({
      error: plan.choice.question,
      question: plan.choice.question,
      keep: ['main', 'variant'],
    });
    return;
  }

  const chosen = adoptRevisionIds(plan, keep);
  if (chosen === null) {
    // Unreachable: `ask` with no answer was just refused, and every other plan
    // answers with a scene. Written down rather than assumed, because the
    // alternative is writing an empty adoption to the main line.
    console.error('[reviews/lines] the adoption produced no scene to write');
    res.status(500).json({ error: 'internal_error' });
    return;
  }

  const answer = await rpc('rpc/adopt_review_line', {
    p_variant: variant.id,
    p_revision_ids: chosen,
  });
  const refusal = rpcRefusal(answer);
  if (refusal) {
    if (refusal.status >= 500) console.error(`[reviews/lines] adopt refused: ${String(answer.error)}`);
    res.status(refusal.status).json({ error: refusal.error });
    return;
  }
  res.status(200).json({
    ok: true,
    lineId: variant.id,
    mainLineId: main.id,
    moved: typeof answer.moved === 'number' ? answer.moved : 0,
    status: 'adopted',
    revisionIds: chosen,
  });
}

/**
 * "Drop variant."
 *
 * The reason is one line and is stored word for word on every card the drop closes,
 * so that a reviewer who finds one of them in six months' time is reading the
 * sentence the meeting agreed. The variant itself stays, greyed, for the record.
 */
async function drop(
  res: VercelResponse,
  reviewId: string,
  body: Record<string, unknown>,
  caller: Caller,
): Promise<void> {
  const lineId = bodyString(body, 'lineId');
  const reason = bodyString(body, 'reason');
  if (!lineId) {
    res.status(400).json({ error: 'lineId is required' });
    return;
  }
  if (!reason) {
    res.status(400).json({ error: 'Say in one line why the variant was dropped — it goes on every card it closes.' });
    return;
  }
  if (reason.length > MAX_REASON) {
    res.status(400).json({ error: `That reason is longer than ${MAX_REASON} characters.` });
    return;
  }

  const variant = lineById(await readLines(reviewId), lineId);
  if (!variant || variant.kind !== 'variant') {
    res.status(404).json({ error: 'That variant is not part of this design review.' });
    return;
  }
  if (variant.status !== 'active') {
    res.status(409).json({ error: `That variant has already been ${variant.status}.` });
    return;
  }
  // Built here rather than in the database so that the words a card carries are the
  // words lib/reviews/lines.ts says they are, in the one file that decides them.
  const closedReason = droppedCardReason(variant, reason);
  if (!closedReason) {
    res.status(400).json({ error: 'That variant has no name to close its cards under.' });
    return;
  }

  const answer = await rpc('rpc/drop_review_line', {
    p_variant: variant.id,
    p_closed_reason: closedReason,
    p_actor_name: caller.name,
  });
  const refusal = rpcRefusal(answer);
  if (refusal) {
    if (refusal.status >= 500) console.error(`[reviews/lines] drop refused: ${String(answer.error)}`);
    res.status(refusal.status).json({ error: refusal.error });
    return;
  }
  res.status(200).json({
    ok: true,
    lineId: variant.id,
    closed: typeof answer.closed === 'number' ? answer.closed : 0,
    status: 'dropped',
    closedReason,
  });
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.error('[reviews/lines] failed to load config:', err);
    res.status(500).json({ error: 'config_unavailable' });
    return;
  }
  const identity = identityOf(config);
  const accountsOn = identity.mode === 'accounts' || identity.mode === 'sso';

  const body = bodyRecord(req);
  const reviewId = bodyString(body, 'reviewId');
  if (!reviewId) {
    res.status(400).json({ error: 'reviewId is required' });
    return;
  }
  const action = bodyString(body, 'action');
  if (action !== 'explore' && action !== 'adopt' && action !== 'drop') {
    res.status(400).json({ error: 'action must be explore, adopt or drop' });
    return;
  }

  try {
    const caller = await callerFor(req, body, reviewId, accountsOn);
    if (!caller) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    // One gate for all three, and it is `editReview`: see the top of this file for
    // why starting, adopting and dropping a variant are not three new actions.
    if (!can(caller.role, 'editReview')) {
      res.status(403).json({
        error: 'Only the owner and the editors of this design review can start, adopt or drop a variant.',
      });
      return;
    }

    if (action === 'explore') {
      await explore(res, reviewId, body, caller);
    } else if (action === 'adopt') {
      await adopt(res, reviewId, body);
    } else {
      await drop(res, reviewId, body, caller);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'config_unavailable') {
      console.error('[reviews/lines] JWT_SECRET is not set but identity mode requires it');
      res.status(500).json({ error: 'config_unavailable' });
    } else if (message === 'store_unavailable') {
      res.status(503).json({ error: 'The database could not be reached. Try again.' });
    } else if (message === 'upstream_error') {
      res.status(502).json({ error: 'upstream_error' });
    } else {
      console.error('[reviews/lines] unhandled:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  }
}

export default handler;
