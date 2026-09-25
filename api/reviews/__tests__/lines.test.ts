// @vitest-environment node
//
// Starting a variant, adopting one into the main line, and dropping one —
// api/reviews/lines.ts.
//
// docs/plan/15-sessions-and-variants.md batch BL. What is pinned here is the three
// things a client cannot be trusted with:
//
//   * WHO. All three are `editReview` in lib/reviews/roles.ts, decided from the
//     caller's own verified token and the roster as the database holds it. A
//     participant or a guest is refused whatever the browser showed them, and on a
//     deployment with no accounts the meeting host may and anybody else may not.
//   * THE MODEL QUESTION. When both lines moved the same model, a request with no
//     answer in it is refused with the question, and the write does not happen. The
//     question cannot be skipped by not rendering it.
//   * ONE CALL. Adopting and dropping are one Postgres function each, so the cards
//     and the line cannot disagree about what happened. What is asserted is the call
//     that was SENT, not a status code.
//
// PostgREST is mocked through global fetch and routed by URL, the way
// api/reviews/__tests__/members.test.ts does it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const JWT_SECRET = 'test-jwt-secret-long-enough-for-hs256';
const POSTGREST_URL = 'http://rest:3000/rest/v1/';

const OWNER = 'user-owner';
const EDITOR = 'user-editor';
const PARTICIPANT = 'user-participant';

const REVIEW_ID = 'rev-1';
const MAIN_ID = 'line-main';
const VARIANT_ID = 'line-a';
const PARENT_SESSION = 'sess-3';

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function jwtFor(sub: string): string {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      sub,
      email: `${sub}@example.com`,
      user_metadata: { full_name: `Name of ${sub}` },
    }),
  );
  const signature = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

interface MockRes {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status(code: number): MockRes;
  json(data: unknown): MockRes;
  setHeader(name: string, value: string): MockRes;
}

function createMockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code: number) { res.statusCode = code; return res; },
    json(data: unknown) { res.body = data; return res; },
    setHeader(name: string, value: string) { res.headers[name] = value; return res; },
  };
  return res;
}

function req(body: Record<string, unknown>, overrides: { token?: string | null; method?: string } = {}) {
  const token = overrides.token === null ? undefined : (overrides.token ?? jwtFor(OWNER));
  return {
    method: overrides.method ?? 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
    query: {},
    cookies: {},
  } as never;
}

const ACCOUNTS_CONFIG = JSON.stringify({
  plm: { provider: 'none' },
  capture: { provider: 'mock' },
  turn: { provider: 'cloudflare', tokenIdEnv: 'T', apiTokenEnv: 'T' },
  db: { provider: 'supabase', urlEnv: 'U', anonKeyEnv: 'K', serverUrl: POSTGREST_URL },
  identity: { mode: 'accounts', methods: ['password'], allowGuests: false, adminUrl: 'http://auth:9999' },
  notifications: [],
  modelImport: { provider: 'genericGltf' },
});

const NONE_CONFIG = JSON.stringify({
  plm: { provider: 'none' },
  capture: { provider: 'mock' },
  turn: { provider: 'cloudflare', tokenIdEnv: 'T', apiTokenEnv: 'T' },
  db: { provider: 'supabase', urlEnv: 'U', anonKeyEnv: 'K', serverUrl: POSTGREST_URL },
  notifications: [],
  modelImport: { provider: 'genericGltf' },
});

const ENV_VARS = { T: 'x', U: 'x', K: 'x', JWT_SECRET };

const OWNED = {
  ownerId: OWNER,
  members: [
    { user_id: OWNER, role: 'owner' },
    { user_id: EDITOR, role: 'editor' },
    { user_id: PARTICIPANT, role: 'participant' },
  ],
};

// ─── The review as the database holds it ────────────────────────────────────

function mainLine(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: MAIN_ID, review_id: REVIEW_ID, kind: 'main', name: 'Main line', letter: null,
    parent_session_id: null, status: 'active', created_by: null, created_by_name: '',
    created_at: '2026-03-01T09:00:00.000Z', closed_at: null, ...overrides,
  };
}

function variant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VARIANT_ID, review_id: REVIEW_ID, kind: 'variant', name: 'Steel hinge pin', letter: 'A',
    parent_session_id: PARENT_SESSION, status: 'active', created_by: OWNER, created_by_name: 'Paco',
    created_at: '2026-05-04T09:00:00.000Z', closed_at: null, ...overrides,
  };
}

/** A stored revision of one model. */
function revision(id: string, line: string, letter: string): Record<string, unknown> {
  return { id, line, revision: letter };
}

interface World {
  lines: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  revisions: Array<Record<string, unknown>>;
  /** What the two functions answer. */
  rpcAnswer: Record<string, unknown>;
  /** Set to make the variant insert collide, once, the way two people clicking do. */
  collideOnce: boolean;
}

function world(overrides: Partial<World> = {}): World {
  return {
    lines: [mainLine(), variant()],
    sessions: [
      { id: PARENT_SESSION, review_id: REVIEW_ID, line_id: MAIN_ID, ended_at: '2026-05-03T16:00:00.000Z', revision_ids: ['r-a'], seq: 3 },
      { id: 'sess-a1', review_id: REVIEW_ID, line_id: VARIANT_ID, ended_at: '2026-05-06T16:00:00.000Z', revision_ids: ['r-b2'], seq: 1 },
      { id: 'sess-4', review_id: REVIEW_ID, line_id: MAIN_ID, ended_at: '2026-05-07T16:00:00.000Z', revision_ids: ['r-c'], seq: 4 },
    ],
    revisions: [
      revision('r-a', 'Bracket', 'A'),
      revision('r-b2', 'Bracket', 'B2'),
      revision('r-c', 'Bracket', 'C'),
    ],
    rpcAnswer: { ok: true, moved: 3, closed: 2, mainLineId: MAIN_ID, variantId: VARIANT_ID, letter: 'A' },
    collideOnce: false,
    ...overrides,
  };
}

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

function stubBackend(state: World) {
  const calls: RecordedCall[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method, body: init?.body === undefined ? null : JSON.parse(String(init.body)) });

    if (!url.startsWith(POSTGREST_URL)) return new Response('not found', { status: 404 });

    if (url.includes('rpc/adopt_review_line') || url.includes('rpc/drop_review_line')) {
      return new Response(JSON.stringify(state.rpcAnswer), { status: 200 });
    }
    if (url.includes('review_curations')) {
      return new Response(JSON.stringify([{ owner_id: OWNED.ownerId }]), { status: 200 });
    }
    if (url.includes('review_members')) {
      return new Response(JSON.stringify(OWNED.members), { status: 200 });
    }
    if (url.includes('model_revisions')) {
      return new Response(JSON.stringify(state.revisions), { status: 200 });
    }
    if (url.includes('tracker_sessions')) {
      if (url.includes('line_id=eq.')) {
        const lineId = new URL(url).searchParams.get('line_id')?.replace('eq.', '') ?? '';
        const onLine = state.sessions.filter((s) => s['line_id'] === lineId);
        const newest = [...onLine].sort((a, b) => String(b['ended_at']).localeCompare(String(a['ended_at'])))[0];
        return new Response(JSON.stringify(newest ? [newest] : []), { status: 200 });
      }
      const id = new URL(url).searchParams.get('id')?.replace('eq.', '') ?? '';
      return new Response(JSON.stringify(state.sessions.filter((s) => s['id'] === id)), { status: 200 });
    }
    if (url.includes('review_lines')) {
      if (method === 'POST') {
        if (state.collideOnce) {
          state.collideOnce = false;
          return new Response(JSON.stringify({ code: '23505' }), { status: 409 });
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        const created = { id: 'line-new', created_at: '2026-06-01T09:00:00.000Z', ...body };
        state.lines = [...state.lines, created];
        return new Response(JSON.stringify([created]), { status: 201 });
      }
      const adopted = url.includes('status=eq.adopted');
      const lines = adopted ? state.lines.filter((l) => l['status'] === 'adopted') : state.lines;
      return new Response(JSON.stringify(lines), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

function rpcCall(calls: RecordedCall[], name: string): RecordedCall | undefined {
  return calls.find((c) => c.url.includes(`rpc/${name}`));
}

describe('api/reviews/lines', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, VIEWPOINT_CONFIG: ACCOUNTS_CONFIG, ...ENV_VARS };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function callHandler(request: never, res: MockRes) {
    const { handler } = await import('../lines.ts');
    await handler(request, res as never);
    return res;
  }

  // ─── The door ─────────────────────────────────────────────────────────────

  it('refuses a caller with no token', async () => {
    stubBackend(world());
    const res = await callHandler(req({ action: 'drop', reviewId: REVIEW_ID, lineId: VARIANT_ID, reason: 'No' }, { token: null }), createMockRes());
    expect(res.statusCode).toBe(401);
  });

  it('refuses a participant, who may meet and raise cards and may not change the review\'s lines', async () => {
    const { calls } = stubBackend(world());
    for (const action of ['explore', 'adopt', 'drop'] as const) {
      const res = await callHandler(
        req({
          action,
          reviewId: REVIEW_ID,
          lineId: VARIANT_ID,
          parentSessionId: PARENT_SESSION,
          name: 'Steel hinge pin',
          reason: 'Too expensive to tool',
        }, { token: jwtFor(PARTICIPANT) }),
        createMockRes(),
      );
      expect(res.statusCode).toBe(403);
    }
    // And nothing was written while it was refusing.
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('review_lines'))).toBe(false);
    expect(rpcCall(calls, 'adopt_review_line')).toBeUndefined();
    expect(rpcCall(calls, 'drop_review_line')).toBeUndefined();
  });

  it('refuses somebody who is not on the review at all', async () => {
    stubBackend(world());
    const res = await callHandler(
      req({ action: 'adopt', reviewId: REVIEW_ID, lineId: VARIANT_ID }, { token: jwtFor('user-outsider') }),
      createMockRes(),
    );
    // A signed-in person with no membership row is a participant, and a participant
    // may not.
    expect(res.statusCode).toBe(403);
  });

  it('lets an editor do all three, not only an owner', async () => {
    stubBackend(world());
    const res = await callHandler(
      req({ action: 'drop', reviewId: REVIEW_ID, lineId: VARIANT_ID, reason: 'Too expensive to tool' }, { token: jwtFor(EDITOR) }),
      createMockRes(),
    );
    expect(res.statusCode).toBe(200);
  });

  it('asks for a reviewId and for an action it implements', async () => {
    stubBackend(world());
    expect((await callHandler(req({ action: 'explore' }), createMockRes())).statusCode).toBe(400);
    expect((await callHandler(req({ action: 'rename', reviewId: REVIEW_ID }), createMockRes())).statusCode).toBe(400);
  });

  it('answers 405 with an Allow header to a method it does not implement', async () => {
    stubBackend(world());
    const res = await callHandler(req({ action: 'adopt', reviewId: REVIEW_ID }, { method: 'GET' }), createMockRes());
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('POST');
  });

  // ─── A deployment with no accounts ────────────────────────────────────────

  it('on identity.mode none lets the meeting host, and refuses anybody else', async () => {
    process.env.VIEWPOINT_CONFIG = NONE_CONFIG;
    stubBackend(world());
    const host = await callHandler(
      req({ action: 'drop', reviewId: REVIEW_ID, lineId: VARIANT_ID, reason: 'Too expensive to tool', isMeetingHost: true }, { token: null }),
      createMockRes(),
    );
    expect(host.statusCode).toBe(200);

    const guest = await callHandler(
      req({ action: 'drop', reviewId: REVIEW_ID, lineId: VARIANT_ID, reason: 'Too expensive to tool' }, { token: null }),
      createMockRes(),
    );
    expect(guest.statusCode).toBe(403);
  });

  // ─── Explore a variant from here ──────────────────────────────────────────

  it('starts a variant from a session, with the next free letter and the session it left from', async () => {
    const { calls } = stubBackend(world({ lines: [mainLine(), variant()] }));
    const res = await callHandler(
      req({ action: 'explore', reviewId: REVIEW_ID, parentSessionId: PARENT_SESSION, name: 'Glass-filled nylon' }),
      createMockRes(),
    );
    expect(res.statusCode).toBe(200);

    const insert = calls.find((c) => c.method === 'POST' && c.url.endsWith('review_lines'));
    expect(insert).toBeTruthy();
    const body = insert?.body as Record<string, unknown>;
    expect(body['kind']).toBe('variant');
    expect(body['review_id']).toBe(REVIEW_ID);
    // Variant A exists, so this one is B — and never A again, because A's cards
    // still say they came from A.
    expect(body['letter']).toBe('B');
    expect(body['parent_session_id']).toBe(PARENT_SESSION);
    expect(body['status']).toBe('active');
    expect(body['name']).toBe('Glass-filled nylon');
  });

  it('answers with the line it created, so the browser can open its room', async () => {
    stubBackend(world());
    const res = await callHandler(
      req({ action: 'explore', reviewId: REVIEW_ID, parentSessionId: PARENT_SESSION, name: 'Glass-filled nylon' }),
      createMockRes(),
    );
    const body = res.body as { ok?: boolean; line?: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.line?.['kind']).toBe('variant');
    expect(body.line?.['id']).toBe('line-new');
  });

  it('takes the next letter when two people start a variant at the same moment', async () => {
    const { calls } = stubBackend(world({ collideOnce: true }));
    const res = await callHandler(
      req({ action: 'explore', reviewId: REVIEW_ID, parentSessionId: PARENT_SESSION, name: 'Glass-filled nylon' }),
      createMockRes(),
    );
    expect(res.statusCode).toBe(200);
    const inserts = calls.filter((c) => c.method === 'POST' && c.url.endsWith('review_lines'));
    expect(inserts).toHaveLength(2);
  });

  it('refuses a session that is not part of this design review', async () => {
    stubBackend(world());
    const res = await callHandler(
      req({ action: 'explore', reviewId: REVIEW_ID, parentSessionId: 'somewhere-else', name: 'Glass-filled nylon' }),
      createMockRes(),
    );
    expect(res.statusCode).toBe(404);
  });

  it('asks for a name, because a variant nobody named is a row on a map nobody can read', async () => {
    stubBackend(world());
    const res = await callHandler(
      req({ action: 'explore', reviewId: REVIEW_ID, parentSessionId: PARENT_SESSION, name: '   ' }),
      createMockRes(),
    );
    expect(res.statusCode).toBe(400);
  });

  // ─── Adopt into main line ─────────────────────────────────────────────────

  it('takes the variant\'s model when only the variant moved, in one call', async () => {
    // The main line is still on the Rev A the variant left from; the variant went to
    // Rev B2. No question to ask.
    const { calls } = stubBackend(world({
      sessions: [
        { id: PARENT_SESSION, review_id: REVIEW_ID, line_id: MAIN_ID, ended_at: '2026-05-03T16:00:00.000Z', revision_ids: ['r-a'], seq: 3 },
        { id: 'sess-a1', review_id: REVIEW_ID, line_id: VARIANT_ID, ended_at: '2026-05-06T16:00:00.000Z', revision_ids: ['r-b2'], seq: 1 },
      ],
    }));
    const res = await callHandler(req({ action: 'adopt', reviewId: REVIEW_ID, lineId: VARIANT_ID }), createMockRes());
    expect(res.statusCode).toBe(200);

    const rpc = rpcCall(calls, 'adopt_review_line');
    expect(rpc).toBeTruthy();
    expect(rpc?.body).toEqual({ p_variant: VARIANT_ID, p_revision_ids: ['r-b2'] });
  });

  it('refuses with the ONE plain question when both lines moved the same model', async () => {
    const { calls } = stubBackend(world());
    const res = await callHandler(req({ action: 'adopt', reviewId: REVIEW_ID, lineId: VARIANT_ID }), createMockRes());
    expect(res.statusCode).toBe(409);
    const body = res.body as { question?: string; keep?: unknown };
    expect(body.question).toBe('Keep Rev C from the main line or Rev B2 from Variant A?');
    expect(body.keep).toEqual(['main', 'variant']);
    // Nothing was written while it was asking.
    expect(rpcCall(calls, 'adopt_review_line')).toBeUndefined();
  });

  it('writes the side that was chosen, once the question has been answered', async () => {
    const { calls } = stubBackend(world());
    const kept = await callHandler(req({ action: 'adopt', reviewId: REVIEW_ID, lineId: VARIANT_ID, keep: 'main' }), createMockRes());
    expect(kept.statusCode).toBe(200);
    expect(rpcCall(calls, 'adopt_review_line')?.body).toEqual({ p_variant: VARIANT_ID, p_revision_ids: ['r-c'] });

    const taken = await callHandler(req({ action: 'adopt', reviewId: REVIEW_ID, lineId: VARIANT_ID, keep: 'variant' }), createMockRes());
    expect(taken.statusCode).toBe(200);
    const writes = calls.filter((c) => c.url.includes('rpc/adopt_review_line'));
    expect(writes).toHaveLength(2);
    expect(writes[1]?.body).toEqual({ p_variant: VARIANT_ID, p_revision_ids: ['r-b2'] });
  });

  it('honours an adoption newer than the main line\'s last meeting when it works out the scene', async () => {
    // The main line last met on Rev A; a variant adopted afterwards put Rev C on it.
    // Rev C is what "the main line" means now, so a second adoption compares against
    // that and not against a meeting that predates it.
    const state = world({
      lines: [
        mainLine(),
        variant({ id: 'line-old', letter: 'Z', status: 'adopted', closed_at: '2026-05-08T16:00:00.000Z', adopted_revision_ids: ['r-c'] }),
        variant(),
      ],
      sessions: [
        { id: PARENT_SESSION, review_id: REVIEW_ID, line_id: MAIN_ID, ended_at: '2026-05-03T16:00:00.000Z', revision_ids: ['r-a'], seq: 3 },
        { id: 'sess-a1', review_id: REVIEW_ID, line_id: VARIANT_ID, ended_at: '2026-05-06T16:00:00.000Z', revision_ids: ['r-b2'], seq: 1 },
      ],
    });
    const { calls } = stubBackend(state);
    const res = await callHandler(req({ action: 'adopt', reviewId: REVIEW_ID, lineId: VARIANT_ID }), createMockRes());
    // Rev C on the main line and Rev B2 on the variant are both newer than the Rev A
    // the variant left from, so both moved and the question is asked — against Rev C,
    // which is the adoption, and not against the Rev A meeting that predates it.
    expect(res.statusCode).toBe(409);
    const body = res.body as { question?: string };
    expect(body.question).toBe('Keep Rev C from the main line or Rev B2 from Variant A?');
    expect(rpcCall(calls, 'adopt_review_line')).toBeUndefined();
  });

  it('refuses to adopt a variant that has already been adopted, and writes nothing', async () => {
    const { calls } = stubBackend(world({
      lines: [mainLine(), variant({ status: 'adopted', closed_at: '2026-06-01T10:00:00.000Z' })],
    }));
    const res = await callHandler(req({ action: 'adopt', reviewId: REVIEW_ID, lineId: VARIANT_ID }), createMockRes());
    expect(res.statusCode).toBe(409);
    expect((res.body as { error?: string }).error).toContain('already been adopted');
    expect(rpcCall(calls, 'adopt_review_line')).toBeUndefined();
  });

  it('refuses to adopt the main line into itself', async () => {
    stubBackend(world());
    const res = await callHandler(req({ action: 'adopt', reviewId: REVIEW_ID, lineId: MAIN_ID }), createMockRes());
    expect(res.statusCode).toBe(404);
  });

  it('refuses a variant of another design review', async () => {
    stubBackend(world());
    const res = await callHandler(req({ action: 'adopt', reviewId: REVIEW_ID, lineId: 'line-somewhere-else' }), createMockRes());
    expect(res.statusCode).toBe(404);
  });

  // ─── Drop variant ─────────────────────────────────────────────────────────

  it('closes the variant\'s open cards with the reason the meeting gave, in one call', async () => {
    const { calls } = stubBackend(world());
    const res = await callHandler(
      req({ action: 'drop', reviewId: REVIEW_ID, lineId: VARIANT_ID, reason: 'Too expensive to tool' }),
      createMockRes(),
    );
    expect(res.statusCode).toBe(200);

    const rpc = rpcCall(calls, 'drop_review_line');
    expect(rpc).toBeTruthy();
    const body = rpc?.body as Record<string, unknown>;
    expect(body['p_variant']).toBe(VARIANT_ID);
    expect(body['p_closed_reason']).toBe('Dropped with Variant A: Too expensive to tool');
  });

  it('makes the reason one line, because it is printed on every card the drop closes', async () => {
    const { calls } = stubBackend(world());
    await callHandler(
      req({ action: 'drop', reviewId: REVIEW_ID, lineId: VARIANT_ID, reason: 'Too expensive\n  to tool  ' }),
      createMockRes(),
    );
    const body = rpcCall(calls, 'drop_review_line')?.body as Record<string, unknown>;
    expect(body['p_closed_reason']).toBe('Dropped with Variant A: Too expensive to tool');
  });

  it('asks why, and writes nothing without an answer', async () => {
    const { calls } = stubBackend(world());
    const res = await callHandler(req({ action: 'drop', reviewId: REVIEW_ID, lineId: VARIANT_ID }), createMockRes());
    expect(res.statusCode).toBe(400);
    expect(rpcCall(calls, 'drop_review_line')).toBeUndefined();
  });

  it('refuses to drop a variant that was already dropped', async () => {
    const { calls } = stubBackend(world({ lines: [mainLine(), variant({ status: 'dropped' })] }));
    const res = await callHandler(
      req({ action: 'drop', reviewId: REVIEW_ID, lineId: VARIANT_ID, reason: 'Too expensive to tool' }),
      createMockRes(),
    );
    expect(res.statusCode).toBe(409);
    expect(rpcCall(calls, 'drop_review_line')).toBeUndefined();
  });

  it('passes on a refusal from the function rather than answering as though it had worked', async () => {
    stubBackend(world({ rpcAnswer: { ok: false, error: 'already_closed', status: 'adopted' } }));
    const res = await callHandler(
      req({ action: 'drop', reviewId: REVIEW_ID, lineId: VARIANT_ID, reason: 'Too expensive to tool' }),
      createMockRes(),
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as { ok?: boolean }).ok).toBeUndefined();
  });

  it('answers 503, not 500, when the database cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unreachable'); }));
    const res = await callHandler(
      req({ action: 'drop', reviewId: REVIEW_ID, lineId: VARIANT_ID, reason: 'Too expensive to tool' }),
      createMockRes(),
    );
    expect(res.statusCode).toBe(503);
  });

  // ─── The words ────────────────────────────────────────────────────────────

  it('never answers with branch, fork, merge or commit', async () => {
    stubBackend(world());
    const answers: unknown[] = [
      (await callHandler(req({ action: 'adopt', reviewId: REVIEW_ID, lineId: VARIANT_ID }), createMockRes())).body,
      (await callHandler(req({ action: 'drop', reviewId: REVIEW_ID, lineId: VARIANT_ID }), createMockRes())).body,
      (await callHandler(req({ action: 'explore', reviewId: REVIEW_ID, parentSessionId: PARENT_SESSION }, { token: jwtFor(PARTICIPANT) }), createMockRes())).body,
    ];
    const said = JSON.stringify(answers).toLowerCase();
    expect(said).not.toMatch(/branch|fork|merge|commit/);
  });
});
