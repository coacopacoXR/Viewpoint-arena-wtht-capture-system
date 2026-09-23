// Tests for POST /api/capture/local (T4.4) — the Vercel half of local capture.
//
// Two things are under test, in roughly equal measure:
//   1. Behaviour — the multipart body reaches capture-service's /capture
//      byte-for-byte with its boundary intact, the shared secret is attached
//      here and only here, and the service's answer comes back unchanged.
//   2. SECURITY — the secret, the NAME of the variable holding it, the internal
//      serviceUrl and any other upstream text never appear in a response, on
//      ANY path including every failure path.
//
// No test here touches the network: globalThis.fetch is always stubbed, and the
// secret is an obviously-fake placeholder.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { Readable } from 'node:stream';
import type { ViewpointConfig } from '../../config/schema.ts';

vi.mock('../../config/loadConfig.ts', async (importOriginal) => ({
  // Keeps the real defaultConfigPath: the path is what one test asserts on.
  ...(await importOriginal<typeof import('../../config/loadConfig.ts')>()),
  loadConfig: vi.fn(),
}));

const FAKE_SECRET = 'capture-FAKEFAKEFAKEFAKEFAKE-secret';
const SERVICE_URL = 'http://capture-service:8080';
/** Marker text: if this reaches a response, upstream prose was forwarded. */
const UPSTREAM_MARKER = 'UPSTREAM-BODY-MARKER-do-not-echo';

const LOCAL_CONFIG: ViewpointConfig = {
  plm: { provider: 'none' },
  capture: { provider: 'local', serviceUrl: SERVICE_URL },
  turn: {
    provider: 'cloudflare',
    tokenIdEnv: 'CF_TURN_TOKEN_ID',
    apiTokenEnv: 'CF_TURN_API_TOKEN',
  },
  db: {
    provider: 'supabase',
    urlEnv: 'VITE_SUPABASE_URL',
    anonKeyEnv: 'VITE_SUPABASE_ANON_KEY',
  },
  notifications: [],
  modelImport: { provider: 'genericGltf' },
};

/** A plausible multipart body, boundary included. */
const MULTIPART_BOUNDARY = '----vitestBoundary7MA4YWxkTrZu0gW';
const MULTIPART_BODY =
  `--${MULTIPART_BOUNDARY}\r\n` +
  `Content-Disposition: form-data; name="agendaIdx"\r\n\r\n3\r\n` +
  `--${MULTIPART_BOUNDARY}\r\n` +
  `Content-Disposition: form-data; name="slideTitle"\r\n\r\n${UPSTREAM_MARKER}\r\n` +
  `--${MULTIPART_BOUNDARY}\r\n` +
  `Content-Disposition: form-data; name="audio"; filename="meeting.webm"\r\n` +
  `Content-Type: audio/webm\r\n\r\n\u0000\u0001\u0002audio-bytes\r\n` +
  `--${MULTIPART_BOUNDARY}--\r\n`;

// ─── Vercel req/res doubles ─────────────────────────────────────────────────

interface MockRes {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  _statusCode: number;
  _body: unknown;
  _headers: Record<string, string>;
}

function createMockRes(): MockRes {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    _statusCode: 0,
    _body: null as unknown,
    _headers: {} as Record<string, string>,
  } as unknown as MockRes;
  res.status.mockImplementation((code: number) => {
    res._statusCode = code;
    return res;
  });
  res.json.mockImplementation((body: unknown) => {
    res._body = body;
    return res;
  });
  res.setHeader.mockImplementation((name: string, value: string) => {
    res._headers[name] = value;
    return res;
  });
  return res;
}

/**
 * A request double that is also a readable stream, because with
 * `bodyParser: false` the handler reads the raw body itself.
 */
function createMockReq(
  method: string,
  body: string = MULTIPART_BODY,
  headers: Record<string, string> = {
    'content-type': `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
  },
) {
  const stream = Readable.from([Buffer.from(body, 'utf8')]);
  return Object.assign(stream, { method, headers }) as never;
}

async function callHandler(req: unknown, res: MockRes): Promise<void> {
  const { default: handler } = await import('../../../api/capture/local.ts');
  await handler(req as never, res as never);
}

interface StubbedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal | undefined;
}

function stubUpstream(reply: () => Response | Promise<Response>) {
  const calls: StubbedCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const rawHeaders = new Headers(init?.headers as HeadersInit);
    const headers: Record<string, string> = {};
    rawHeaders.forEach((value, key) => {
      headers[key] = value;
    });
    calls.push({
      url: typeof input === 'string' ? input : String(input),
      method: init?.method ?? 'GET',
      headers,
      body: Buffer.isBuffer(init?.body)
        ? (init.body as Buffer).toString('utf8')
        : String(init?.body ?? ''),
      signal: init?.signal,
    });
    return reply();
  });
  return { calls };
}

function upstreamReply(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Every string that must never reach the browser. */
const FORBIDDEN = [
  FAKE_SECRET,
  'CAPTURE_SHARED_SECRET',
  'X-Capture-Token',
  SERVICE_URL,
  'capture-service:8080',
  UPSTREAM_MARKER,
];

function expectNoLeaks(res: MockRes): void {
  const serialized =
    JSON.stringify(res._body ?? '') + JSON.stringify(res._headers);
  for (const forbidden of FORBIDDEN) {
    expect(serialized, `response leaked ${forbidden}`).not.toContain(forbidden);
  }
}

function expectNoLeaksInLogs(logs: string[]): void {
  const serialized = logs.join('\n');
  expect(serialized, 'server log leaked the secret').not.toContain(FAKE_SECRET);
  expect(serialized, 'server log leaked the serviceUrl').not.toContain(SERVICE_URL);
}

let loadConfig: Mock;
let logs: string[];

beforeEach(async () => {
  vi.clearAllMocks();
  logs = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  loadConfig = vi.mocked((await import('../../config/loadConfig.ts')).loadConfig);
  loadConfig.mockResolvedValue(LOCAL_CONFIG);
  vi.stubEnv('CAPTURE_SHARED_SECRET', FAKE_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ─── Behaviour ──────────────────────────────────────────────────────────────

describe('api/capture/local — behaviour', () => {
  it('rejects anything but POST, and says what is allowed', async () => {
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
      const res = createMockRes();
      await callHandler(createMockReq(method, ''), res);

      expect(res._statusCode, method).toBe(405);
      expect(res._body).toEqual({ error: 'method_not_allowed' });
      expect(res._headers.Allow).toBe('POST');
      expectNoLeaks(res);
    }
  });

  it('forwards to <serviceUrl origin>/capture', async () => {
    const { calls } = stubUpstream(() => upstreamReply({ cards: [] }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://capture-service:8080/capture');
    expect(calls[0].method).toBe('POST');
  });

  it('reduces a serviceUrl with a path and query to origin + /capture', async () => {
    loadConfig.mockResolvedValue({
      ...LOCAL_CONFIG,
      capture: {
        provider: 'local',
        serviceUrl: 'http://capture-service:8080/nested?token=abc',
      },
    });
    const { calls } = stubUpstream(() => upstreamReply({ cards: [] }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    // A configured path would 404 for a reason that has nothing to do with
    // capture, and a query string is where a secret would end up in an access
    // log. capture-service mounts /capture at the root.
    expect(calls[0].url).toBe('http://capture-service:8080/capture');
  });

  it('lets loadConfig choose the source (VIEWPOINT_CONFIG, else the root file)', async () => {
    stubUpstream(() => upstreamReply({ cards: [] }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    // No argument on purpose: an explicit path would bypass VIEWPOINT_CONFIG.
    // The absolute no-argument default is pinned in
    // lib/config/__tests__/loadConfigPath.test.ts.
    expect(loadConfig).toHaveBeenCalledWith();
  });

  it('forwards the multipart body byte-for-byte with its original Content-Type', async () => {
    const { calls } = stubUpstream(() => upstreamReply({ cards: [] }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(calls[0].body).toBe(MULTIPART_BODY);
    // The boundary lives in the incoming header. Rewriting it — or letting a
    // body parser rebuild the body — is the classic way to make a multipart
    // upload unparseable on the far side.
    expect(calls[0].headers['content-type']).toBe(
      `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
    );
  });

  it('returns the upstream JSON body unchanged on success', async () => {
    const cards = [
      {
        id: 'insight-1',
        type: 'RISK',
        agentId: 'speaker-1',
        title: 'Wall transition risks sink marks',
        description: 'A 57% wall reduction causes sink on A-surfaces.',
        timestamp: 1_700_000_000_000,
        details: { priority: 'High', status: 'Open' },
      },
    ];
    stubUpstream(() => upstreamReply({ cards }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(res._statusCode).toBe(200);
    // Verbatim, including the minted id and timestamp: the browser re-validates
    // this with the same strict parser, so a proxy that "improved" the envelope
    // would break it.
    expect(res._body).toEqual({ cards });
  });

  it('forwards an empty-cards answer rather than inventing one', async () => {
    stubUpstream(() => upstreamReply({ cards: [] }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(res._statusCode).toBe(200);
    expect(res._body).toEqual({ cards: [] });
  });

  it('forwards the upstream status and code on failure', async () => {
    stubUpstream(() => upstreamReply({ error: 'upload_too_large' }, 413));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(res._statusCode).toBe(413);
    expect(res._body).toEqual({ error: 'upload_too_large' });
    expectNoLeaks(res);
  });

  it('replaces a non-machine-readable upstream code with upstream_error', async () => {
    // A framework's `http_500`, HTML from an intermediate proxy, or a service
    // that starts echoing detail: none of it is safe to forward, because it can
    // quote the request and the request is a meeting recording.
    stubUpstream(() =>
      upstreamReply({ error: `<html>${UPSTREAM_MARKER}</html>` }, 502),
    );
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(res._statusCode).toBe(502);
    expect(res._body).toEqual({ error: 'upstream_error' });
    expectNoLeaks(res);
  });

  it('reports 502 when the service cannot be reached', async () => {
    stubUpstream(() => {
      throw new TypeError('fetch failed');
    });
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(res._statusCode).toBe(502);
    expect(res._body).toEqual({ error: 'upstream_error' });
    expectNoLeaks(res);
  });

  it('reports 502 when a 2xx body is not JSON', async () => {
    // An SPA fallback or a proxy answering for a route it does not own.
    stubUpstream(
      () =>
        new Response(`<!doctype html>${UPSTREAM_MARKER}`, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(res._statusCode).toBe(502);
    expect(res._body).toEqual({ error: 'upstream_error' });
    expectNoLeaks(res);
  });

  it('bounds the upstream call with an abort signal', async () => {
    const { calls } = stubUpstream(() => upstreamReply({ cards: [] }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    // Without one, a hung transcription keeps a serverless function — and the
    // caller's tab — waiting until the platform kills it.
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
  });
});

// ─── Configuration ──────────────────────────────────────────────────────────

describe('api/capture/local — configuration', () => {
  it('answers 503 not_configured when the config does not load', async () => {
    // loadConfig's message names the config file and the missing env var —
    // exactly what an operator needs and exactly what must not be published.
    loadConfig.mockRejectedValue(
      new Error(
        `Missing required environment variables:\n  - db.urlEnv 'VITE_SUPABASE_URL' is not set`,
      ),
    );
    const { calls } = stubUpstream(() => upstreamReply({ cards: [] }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(res._statusCode).toBe(503);
    expect(res._body).toEqual({ error: 'not_configured' });
    expect(calls).toHaveLength(0);
    expectNoLeaks(res);
  });

  it('answers 503 not_configured when the deployment chose another provider', async () => {
    loadConfig.mockResolvedValue({
      ...LOCAL_CONFIG,
      capture: { provider: 'mock' },
    });
    const { calls } = stubUpstream(() => upstreamReply({ cards: [] }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(res._statusCode).toBe(503);
    expect(res._body).toEqual({ error: 'not_configured' });
    // A mock-capture deployment has no business having its recording forwarded
    // to a service it never asked for.
    expect(calls).toHaveLength(0);
    expectNoLeaks(res);
  });

  it('answers 503 not_configured when serviceUrl is not a URL', async () => {
    loadConfig.mockResolvedValue({
      ...LOCAL_CONFIG,
      capture: { provider: 'local', serviceUrl: 'not a url' },
    });
    const { calls } = stubUpstream(() => upstreamReply({ cards: [] }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(res._statusCode).toBe(503);
    expect(res._body).toEqual({ error: 'not_configured' });
    expect(calls).toHaveLength(0);
    expectNoLeaks(res);
  });
});

// ─── The shared secret ──────────────────────────────────────────────────────

describe('api/capture/local — the shared secret', () => {
  it('adds the header capture-service requires, from server-side env only', async () => {
    const { calls } = stubUpstream(() => upstreamReply({ cards: [] }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(calls[0].headers['x-capture-token']).toBe(FAKE_SECRET);
    // It is USED server-side and never returned.
    expectNoLeaks(res);
  });

  it('omits the header entirely when no secret is configured', async () => {
    vi.stubEnv('CAPTURE_SHARED_SECRET', '');
    const { calls } = stubUpstream(() => upstreamReply({ cards: [] }));
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    // An empty header would be rejected as a bad token; capture-service reads an
    // empty secret as "authentication off", and the request must agree.
    expect('x-capture-token' in calls[0].headers).toBe(false);
    expect(res._statusCode).toBe(200);
    expectNoLeaks(res);
  });

  it('accepts a secret from the conventional variable name only', async () => {
    // The header name and the variable name are shared with
    // lib/health/probes.ts, which is pinned against capture-service's auth.py by
    // capture-service/tests/test_typescript_parity.py.
    const { CAPTURE_AUTH_HEADER, CAPTURE_SHARED_SECRET_ENV } = await import(
      '../../health/probes.ts'
    );
    expect(CAPTURE_AUTH_HEADER).toBe('X-Capture-Token');
    expect(CAPTURE_SHARED_SECRET_ENV).toBe('CAPTURE_SHARED_SECRET');
  });
});

// ─── Leaks, on every path ───────────────────────────────────────────────────

describe('api/capture/local — nothing leaks on any path', () => {
  /**
   * Every terminal response this handler can produce, driven by a real call
   * rather than a list copied from the source: a new failure path that forwards
   * something it should not fails here without anybody remembering to add it.
   */
  const PATHS: Array<{
    name: string;
    arrange(): void;
  }> = [
    {
      name: 'success',
      arrange() {
        stubUpstream(() => upstreamReply({ cards: [] }));
      },
    },
    {
      name: 'upstream 400 invalid_request',
      arrange() {
        stubUpstream(() => upstreamReply({ error: 'invalid_request' }, 400));
      },
    },
    {
      name: 'upstream 401 with a body quoting the token',
      arrange() {
        stubUpstream(() =>
          new Response(
            JSON.stringify({
              error: 'unauthorized',
              detail: `X-Capture-Token did not match ${FAKE_SECRET}`,
            }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          ),
        );
      },
    },
    {
      name: 'upstream 500 with prose that quotes the upload',
      arrange() {
        stubUpstream(() =>
          new Response(
            `Internal Server Error while handling ${UPSTREAM_MARKER} from ` +
              `${SERVICE_URL} with token ${FAKE_SECRET}`,
            { status: 500, headers: { 'content-type': 'text/plain' } },
          ),
        );
      },
    },
    {
      name: 'upstream unreachable',
      arrange() {
        stubUpstream(() => {
          throw new TypeError(`fetch failed for ${SERVICE_URL}`);
        });
      },
    },
    {
      name: 'method not allowed',
      arrange() {
        stubUpstream(() => upstreamReply({ cards: [] }));
      },
    },
    {
      name: 'config not available',
      arrange() {
        loadConfig.mockRejectedValue(
          new Error(`Failed to load config, secret was ${FAKE_SECRET}`),
        );
        stubUpstream(() => upstreamReply({ cards: [] }));
      },
    },
  ];

  it.each(PATHS)('the "$name" response carries no secret, no name and no URL', async ({
    name,
    arrange,
  }) => {
    arrange();
    const res = createMockRes();

    await callHandler(
      createMockReq(name === 'method not allowed' ? 'GET' : 'POST', ''),
      res,
    );

    expect(res._statusCode).toBeGreaterThan(0);
    expectNoLeaks(res);
  });

  it('keeps the secret and the serviceUrl out of the server log', async () => {
    stubUpstream(() =>
      new Response(
        `boom ${UPSTREAM_MARKER} ${SERVICE_URL} ${FAKE_SECRET}`,
        { status: 500, headers: { 'content-type': 'text/plain' } },
      ),
    );
    const res = createMockRes();

    await callHandler(createMockReq('POST'), res);

    expect(res._statusCode).toBe(500);
    expectNoLeaks(res);
    // The response and the log are deliberately asymmetric, the same split
    // api/capture/extract.ts makes: the log is where an operator finds the
    // upstream's own text (redacted for the secret and the internal URL), and
    // the response gets a code and nothing else. The marker stands in for
    // meeting content — it is the slideTitle this test put in the multipart
    // body — and it must not survive into the response.
    expect(JSON.stringify(res._body)).not.toContain(UPSTREAM_MARKER);
    expectNoLeaksInLogs(logs);
  });
});
