// The browser's side of api/reviews/lines.ts: start a variant, adopt one, drop one.
//
// docs/plan/15-sessions-and-variants.md batch BL. Everything here carries the
// signed-in person's own access token when there is one, and nothing else decides
// anything: the endpoint reads the review's owner_id and roster as the database
// holds them and answers from lib/reviews/roles.ts, so there is no "am I allowed"
// logic on this side to get wrong or to lift with devtools. That is also why the
// three writes are not made straight at Supabase the way the rest of the tracker's
// are — docs/supabase-schema.sql lets the published anon key insert a main line and
// nothing else into review_lines, and adopts and drops through the two Postgres
// functions only the api can call.
//
// An answer is always a value rather than a thrown exception, in the shape
// lib/reviews/membersClient.ts uses: every one of these calls happens behind a
// button somebody pressed in a meeting, and the only useful answer is the sentence
// that can be shown to them.

import { supabase } from '../supabase';
import { getStoredIdentity } from '../identity';
import { toReviewLine, type ReviewLine } from './lines';

/**
 * Whether an action landed, and what it produced.
 *
 * `error` optional rather than a discriminated union for the reason membersClient
 * gives: this tsconfig does not narrow `{ ok: true } | { ok: false; error: string }`
 * on the boolean, so `result.error` would not type.
 */
export interface LineActionResult {
  ok: boolean;
  /** The sentence to show when it did not land. */
  error?: string;
  /** The variant that was started, when one was. */
  line?: ReviewLine;
  /**
   * The one plain question an adoption asked, when it asked one: "Keep Rev C from
   * the main line or Rev B2 from Variant A?". The caller shows it and posts again
   * with `keep`, which is why the question comes from the endpoint rather than
   * being worked out here — there is one copy of the rule and it is the one that
   * also does the write.
   */
  question?: string;
  /** How many cards the action moved or closed, for the sentence that says it worked. */
  changed?: number;
}

/** What the caller knows about this browser that the endpoint cannot work out. */
export interface LineActionContext {
  /**
   * Whether this browser is running the meeting.
   *
   * Read only on a deployment whose identity.mode is 'none', where there is no
   * token to verify and the meeting host holds the editor's powers — which is the
   * rule lib/reviews/roles.ts applies and the same claim the room's own UI makes.
   * On a deployment with accounts the endpoint ignores it and asks the token.
   */
  isMeetingHost?: boolean;
}

const REFUSED = 'That change was refused.';

/**
 * Under `vite preview` — which is what the Playwright suite serves — every `/api/*`
 * route answers 200 with index.html, because Vercel functions do not run there and
 * the SPA fallback takes the request. `response.json()` on that throws a SyntaxError
 * with nothing in it that points at the real cause, so the content type is checked
 * first and the answer is a sentence about the endpoint instead.
 *
 * The same check lib/reviews/membersClient.ts and the capture clients make.
 */
function isJson(res: Response): boolean {
  return (res.headers.get('content-type') ?? '').includes('application/json');
}

async function accessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Post to the endpoint.
 *
 * The token is attached when this browser holds one and omitted when it does not,
 * rather than refused outright the way membersClient refuses: an install with no
 * accounts has no session to hold, and its meeting host is exactly the person the
 * endpoint lets act.
 */
async function call(body: Record<string, unknown>): Promise<Response | null> {
  const token = await accessToken();
  const name = getStoredIdentity()?.name?.trim() || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch('/api/reviews/lines', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, actorName: name }),
  });
}

/**
 * The endpoint answers with the line as a `ReviewLine` (camelCase), not as the
 * database row `toReviewLine` parses (snake_case). Mapped back to the row's names so
 * the one parser — and its checks on kind, letter and status — is the only one.
 */
export function lineFromApi(value: unknown): ReviewLine | null {
  if (!value || typeof value !== 'object') return null;
  const line = value as Record<string, unknown>;
  return toReviewLine({
    id: line['id'],
    review_id: line['reviewId'],
    kind: line['kind'],
    name: line['name'],
    letter: line['letter'],
    parent_session_id: line['parentSessionId'],
    status: line['status'],
    created_by: line['createdBy'],
    created_by_name: line['createdByName'],
    created_at: line['createdAt'],
    closed_at: line['closedAt'],
  });
}

async function read(res: Response): Promise<LineActionResult> {
  if (!isJson(res)) {
    return { ok: false, error: 'The lines endpoint did not answer. Is the api running?' };
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok && body?.ok === true) {
    const question = typeof body['question'] === 'string' ? body['question'] : undefined;
    const moved = typeof body['moved'] === 'number' ? body['moved'] : undefined;
    const closed = typeof body['closed'] === 'number' ? body['closed'] : undefined;
    const line = lineFromApi(body['line']) ?? undefined;
    return {
      ok: true,
      question,
      line,
      changed: moved ?? closed,
    };
  }
  const error = typeof body?.['error'] === 'string' && body?.['error'] !== '' ? (body['error'] as string) : null;
  const question = typeof body?.['question'] === 'string' ? (body['question'] as string) : null;
  // A question is not a failure: it is the endpoint asking the one thing only the
  // people in the meeting can answer, and the caller shows it.
  if (question) return { ok: false, question, error: error ?? REFUSED };
  return { ok: false, error: error ?? `${REFUSED} (${res.status})` };
}

async function post(body: Record<string, unknown>): Promise<LineActionResult> {
  try {
    const res = await call(body);
    if (!res) return { ok: false, error: 'The lines endpoint could not be reached.' };
    return await read(res);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : REFUSED };
  }
}

/**
 * "Explore a variant from here."
 *
 * The variant starts from `parentSessionId`: the endpoint records it as the line's
 * parent_session_id, and lib/reviews/linesRepo then gives the new room that
 * session's model and its line's still-open cards rather than the review's newest
 * of either. The caller navigates to `roomPath(reviewId, result.line.id)`.
 *
 * NULL for a review that has never recorded a meeting (batch BQ): there is no
 * session to leave from, and the variant starts from what the main line is showing
 * now. The endpoint accepts that only when the line really has no sessions — a
 * variant that leaves from nowhere in a review that HAS met would be a line the map
 * cannot draw and a room that opens on the wrong model.
 */
export async function exploreVariant(
  reviewId: string,
  parentSessionId: string | null,
  name: string,
  context: LineActionContext = {},
): Promise<LineActionResult> {
  return post({
    action: 'explore',
    reviewId,
    // Omitted rather than sent as null, so the endpoint's `bodyString` sees the one
    // thing it has to distinguish: no meeting named.
    ...(parentSessionId ? { parentSessionId } : {}),
    name,
    isMeetingHost: context.isMeetingHost === true,
  });
}

/**
 * "Adopt into main line."
 *
 * Answers `{ ok: false, question }` when both lines moved the same model and the
 * endpoint needs one answer before it will write anything. Post again with `keep`.
 */
export async function adoptVariant(
  reviewId: string,
  lineId: string,
  keep: 'main' | 'variant' | null = null,
  context: LineActionContext = {},
): Promise<LineActionResult> {
  return post({
    action: 'adopt',
    reviewId,
    lineId,
    ...(keep ? { keep } : {}),
    isMeetingHost: context.isMeetingHost === true,
  });
}

/**
 * "Drop variant." The reason ends up word for word on every card the drop closes.
 */
export async function dropVariant(
  reviewId: string,
  lineId: string,
  reason: string,
  context: LineActionContext = {},
): Promise<LineActionResult> {
  return post({
    action: 'drop',
    reviewId,
    lineId,
    reason,
    isMeetingHost: context.isMeetingHost === true,
  });
}
