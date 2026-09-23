// Tests for POST /api/capture/extract (T4.5).
//
// Two things are under test, in roughly equal measure:
//   1. Behaviour — the transcript reaches the right upstream in the right
//      shape, and the model's answer comes back as validated InsightCards.
//   2. SECURITY — the API key, the env var NAME that holds it, the raw
//      upstream body and the transcript itself never appear in a response,
//      on ANY path including every failure path.
//
// No test here touches the network: globalThis.fetch is always stubbed, and
// every key is an obviously-fake placeholder.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SlideContext, TranscriptChunk } from './types';
import { hashPassword, signToken } from '../../../api/_lib/accessControl.ts';

const FAKE_OPENAI_KEY = 'sk-FAKEFAKEFAKEFAKEFAKEFAKE00';
const FAKE_ANTHROPIC_KEY = 'sk-ant-FAKEFAKEFAKEFAKEFAKE00';
const FAKE_CUSTOM_KEY = 'custom-FAKEFAKEFAKEFAKEFAKE00';

/** Marker strings: if one of these reaches a response, that is a leak. */
const TRANSCRIPT_MARKER = 'TRANSCRIPT-MARKER-do-not-echo';
const UPSTREAM_MARKER = 'UPSTREAM-BODY-MARKER-do-not-echo';

const transcript: TranscriptChunk[] = [
  {
    speakerId: 'speaker-1',
    text: `The wall drops from 2.8mm to 1.2mm here. ${TRANSCRIPT_MARKER}`,
    startMs: 0,
    endMs: 4200,
  },
  {
    speakerId: 'speaker-2',
    text: 'That is going to sink on the A-surface.',
    startMs: 4200,
    endMs: 7000,
  },
];

const context: SlideContext = {
  agendaIdx: 3,
  slideTitle: 'Bracket moulding review',
  hoveredPartName: 'Bracket Alpha',
  laserTargetPartName: 'Rib Pattern 2',
};

const VALID_MODEL_JSON = JSON.stringify({
  cards: [
    {
      type: 'RISK',
      title: 'Wall transition risks sink marks',
      description: 'A 57% wall reduction historically causes sink on A-surfaces.',
      agentId: 'speaker-1',
      relatedPoiId: 'Bracket Alpha',
      sourceMessageIds: ['c0', 'c1'],
      details: {
        priority: 'High',
        componentReference: 'Bracket Alpha',
        impact: 'Visible sink on the A-surface',
        mitigationStrategy: 'Re-run moldflow',
      },
    },
  ],
});

// ─── Vercel req/res doubles (same shape as notify/__tests__) ────────────────

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

function createMockReq(method: string, body?: unknown) {
  return { method, body, headers: {} } as never;
}

async function callHandler(req: unknown, res: MockRes): Promise<void> {
  const { default: handler } = await import('../../../api/capture/extract.ts');
  await handler(req as never, res as never);
}

interface StubbedCall {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Stubs fetch and records what the handler actually sent upstream. */
function stubUpstream(
  reply: () => Response | Promise<Response>,
): { calls: StubbedCall[] } {
  const calls: StubbedCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : String(input);
    // Headers normalises names to lowercase, so the assertions below read
    // `headers.authorization`, not the `Authorization` the handler set.
    const rawHeaders = new Headers(init?.headers);
    const headers: Record<string, string> = {};
    rawHeaders.forEach((value, key) => {
      headers[key] = value;
    });
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    } catch {
      body = {};
    }
    calls.push({ url, headers, body });
    return reply();
  });
  return { calls };
}

function openAiReply(content: string, finishReason = 'stop'): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content }, finish_reason: finishReason }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function anthropicReply(text: string, stopReason = 'end_turn'): Response {
  return new Response(
    JSON.stringify({ content: [{ type: 'text', text }], stop_reason: stopReason }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

/** Every string that must never reach the browser. */
const FORBIDDEN = [
  FAKE_OPENAI_KEY,
  FAKE_ANTHROPIC_KEY,
  FAKE_CUSTOM_KEY,
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'CUSTOM_CAPTURE_KEY',
  TRANSCRIPT_MARKER,
  UPSTREAM_MARKER,
];

function expectNoLeaks(res: MockRes): void {
  const serialized = JSON.stringify(res._body ?? '');
  for (const forbidden of FORBIDDEN) {
    expect(serialized, `response leaked ${forbidden}`).not.toContain(forbidden);
  }
}

function expectNoLeaksInLogs(logs: string[]): void {
  const serialized = logs.join('\n');
  for (const key of [FAKE_OPENAI_KEY, FAKE_ANTHROPIC_KEY, FAKE_CUSTOM_KEY]) {
    expect(serialized, `server log leaked ${key}`).not.toContain(key);
  }
}

describe('api/capture/extract — behaviour', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    process.env.OPENAI_API_KEY = FAKE_OPENAI_KEY;
    process.env.ANTHROPIC_API_KEY = FAKE_ANTHROPIC_KEY;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CUSTOM_CAPTURE_KEY;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns validated InsightCards for an OpenAI reply', async () => {
    const { calls } = stubUpstream(() => openAiReply(VALID_MODEL_JSON));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(200);
    const body = res._body as { cards: Array<Record<string, unknown>> };
    // The success envelope carries cards and NOTHING else, so the browser
    // client can re-validate it with the same strict parser (which rejects
    // unknown envelope fields) rather than a second, laxer schema.
    expect(Object.keys(body)).toEqual(['cards']);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0].type).toBe('RISK');
    expect(body.cards[0].title).toBe('Wall transition risks sink marks');
    expect(body.cards[0].details).toMatchObject({
      priority: 'High',
      status: 'Open',
      impact: 'Visible sink on the A-surface',
    });
    // id and timestamp are minted server-side, never left to the model.
    expect(typeof body.cards[0].id).toBe('string');
    expect(typeof body.cards[0].timestamp).toBe('number');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expectNoLeaks(res);
  });

  it('sends the OpenAI request with the key, JSON mode and temperature 0', async () => {
    const { calls } = stubUpstream(() => openAiReply(VALID_MODEL_JSON));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    // The key IS used — server-side, in the upstream request only.
    expect(calls[0].headers.authorization).toBe(`Bearer ${FAKE_OPENAI_KEY}`);
    expect(calls[0].body.response_format).toEqual({ type: 'json_object' });
    expect(calls[0].body.temperature).toBe(0);
    expect(typeof calls[0].body.model).toBe('string');
  });

  it('fuses the transcript and the spatial context into the prompt', async () => {
    const { calls } = stubUpstream(() => openAiReply(VALID_MODEL_JSON));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    const messages = calls[0].body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe('system');
    // The system prompt is the format contract: it names the three insight
    // types and the exact envelope the parser enforces.
    expect(messages[0].content).toContain('RISK');
    expect(messages[0].content).toContain('"cards"');
    expect(messages[1].role).toBe('user');

    const user = messages[1].content;
    expect(user).toContain('Agenda item 3: Bracket moulding review');
    expect(user).toContain('hovering over: Bracket Alpha');
    expect(user).toContain('laser pointer was on: Rib Pattern 2');
    // Speaker labels and stable chunk labels the model cites in sourceMessageIds.
    expect(user).toContain('c0 [00:00-00:04] speaker-1:');
    expect(user).toContain('c1 [00:04-00:07] speaker-2:');
    expect(user).toContain(TRANSCRIPT_MARKER);
  });

  it('returns validated InsightCards for an Anthropic reply', async () => {
    const { calls } = stubUpstream(() => anthropicReply(VALID_MODEL_JSON));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'anthropic', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(200);
    const body = res._body as { cards: unknown[] };
    expect(Object.keys(body)).toEqual(['cards']);
    expect(body.cards).toHaveLength(1);

    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].headers['x-api-key']).toBe(FAKE_ANTHROPIC_KEY);
    expect(calls[0].headers['anthropic-version']).toBe('2023-06-01');
    // Anthropic takes the system prompt as a top-level field, not a message.
    expect(typeof calls[0].body.system).toBe('string');
    expect(calls[0].body.temperature).toBe(0);
    expectNoLeaks(res);
  });

  it('concatenates Anthropic text blocks split across content entries', async () => {
    // A long answer can arrive as several text blocks; splitting the JSON
    // mid-token proves they are joined before parsing rather than parsed
    // block-by-block.
    const splitAt = Math.floor(VALID_MODEL_JSON.length / 2);
    stubUpstream(
      () =>
        new Response(
          JSON.stringify({
            content: [
              { type: 'text', text: VALID_MODEL_JSON.slice(0, splitAt) },
              { type: 'thinking', thought: 'not a text block' },
              { type: 'text', text: VALID_MODEL_JSON.slice(splitAt) },
            ],
            stop_reason: 'end_turn',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'anthropic', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(200);
    expect((res._body as { cards: unknown[] }).cards).toHaveLength(1);
  });

  it('returns an empty card list when the model found nothing to capture', async () => {
    stubUpstream(() => openAiReply('{"cards":[]}'));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(200);
    expect((res._body as { cards: unknown[] }).cards).toEqual([]);
  });

  it('HEAD reports 200 when a cloud key is configured', async () => {
    const res = createMockRes();
    await callHandler(createMockReq('HEAD'), res);
    expect(res._statusCode).toBe(200);
    expectNoLeaks(res);
  });

  it('HEAD reports 503 when neither cloud key is configured', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const res = createMockRes();

    await callHandler(createMockReq('HEAD'), res);

    expect(res._statusCode).toBe(503);
  });
});

describe('api/capture/extract — request validation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.OPENAI_API_KEY = FAKE_OPENAI_KEY;
    process.env.ANTHROPIC_API_KEY = FAKE_ANTHROPIC_KEY;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('rejects GET with 405 and an Allow header', async () => {
    const res = createMockRes();
    await callHandler(createMockReq('GET'), res);

    expect(res._statusCode).toBe(405);
    expect(res._headers.Allow).toBe('POST, HEAD');
  });

  it('rejects a non-object body', async () => {
    const res = createMockRes();
    await callHandler(createMockReq('POST', 'transcript please'), res);
    expect(res._statusCode).toBe(400);
    expect(res._body).toEqual({ error: 'invalid_body' });
  });

  it('rejects a provider that is not openai or anthropic', async () => {
    for (const provider of ['ollamaDirect', 'mock', 'local', undefined, 'OPENAI']) {
      const res = createMockRes();
      await callHandler(createMockReq('POST', { provider, transcript, context }), res);
      expect(res._statusCode, `provider ${String(provider)}`).toBe(400);
      expect(res._body).toEqual({ error: 'invalid_provider' });
      expectNoLeaks(res);
    }
  });

  it('rejects a malformed transcript', async () => {
    const bad = [
      undefined,
      'not an array',
      [{ speakerId: 'a', text: 'b', startMs: 0 }],
      [{ speakerId: '', text: 'b', startMs: 0, endMs: 1 }],
      [{ speakerId: 'a', text: 5, startMs: 0, endMs: 1 }],
      [{ speakerId: 'a', text: 'b', startMs: 500, endMs: 100 }],
      [{ speakerId: 'a', text: 'b', startMs: -1, endMs: 1 }],
    ];
    for (const t of bad) {
      const res = createMockRes();
      await callHandler(createMockReq('POST', { provider: 'openai', transcript: t, context }), res);
      expect(res._statusCode).toBe(400);
      expect(res._body).toEqual({ error: 'invalid_transcript' });
    }
  });

  it('rejects an empty transcript before spending any tokens', async () => {
    const { calls } = stubUpstream(() => openAiReply(VALID_MODEL_JSON));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript: [], context }),
      res,
    );

    expect(res._statusCode).toBe(400);
    expect(res._body).toEqual({ error: 'empty_transcript' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a malformed slide context', async () => {
    const bad = [
      undefined,
      { agendaIdx: 'three', slideTitle: 'x' },
      { agendaIdx: 1 },
      { agendaIdx: 1, slideTitle: '' },
      { agendaIdx: 1, slideTitle: 'x', hoveredPartName: 7 },
    ];
    for (const c of bad) {
      const res = createMockRes();
      await callHandler(createMockReq('POST', { provider: 'openai', transcript, context: c }), res);
      expect(res._statusCode).toBe(400);
      expect(res._body).toEqual({ error: 'invalid_context' });
    }
  });

  it('rejects an oversized transcript with 413 before calling the model', async () => {
    const { calls } = stubUpstream(() => openAiReply(VALID_MODEL_JSON));
    const huge: TranscriptChunk[] = Array.from({ length: 60 }, (_, i) => ({
      speakerId: `s${i}`,
      text: 'x'.repeat(4000),
      startMs: i * 1000,
      endMs: i * 1000 + 999,
    }));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript: huge, context }),
      res,
    );

    expect(res._statusCode).toBe(413);
    expect((res._body as { error: string }).error).toBe('transcript_too_large');
    expect(calls).toHaveLength(0);
    expectNoLeaks(res);
  });

  it('rejects too many chunks with 413', async () => {
    stubUpstream(() => openAiReply(VALID_MODEL_JSON));
    const manyChunks: TranscriptChunk[] = Array.from({ length: 2001 }, (_, i) => ({
      speakerId: 's',
      text: 'ok',
      startMs: i,
      endMs: i + 1,
    }));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript: manyChunks, context }),
      res,
    );

    expect(res._statusCode).toBe(413);
  });
});

describe('api/capture/extract — MALFORMED MODEL OUTPUT', () => {
  // Each case must come back as a 422 with a machine-readable `reason`, and
  // must never carry the model's text (which quotes the transcript).
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    process.env.OPENAI_API_KEY = FAKE_OPENAI_KEY;
    process.env.ANTHROPIC_API_KEY = FAKE_ANTHROPIC_KEY;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function expectParseFailure(
    modelOutput: string,
    reason: string,
    provider: 'openai' | 'anthropic' = 'openai',
  ): Promise<MockRes> {
    stubUpstream(() =>
      provider === 'openai'
        ? openAiReply(modelOutput)
        : anthropicReply(modelOutput),
    );
    const res = createMockRes();
    await callHandler(createMockReq('POST', { provider, transcript, context }), res);

    expect(res._statusCode, `expected 422 for ${reason}`).toBe(422);
    expect(res._body).toEqual({
      error: 'capture_parse_error',
      reason,
      provider,
    });
    expectNoLeaks(res);
    return res;
  }

  it('prose → 422 reason "prose"', async () => {
    await expectParseFailure(
      `Sure! Looking at the transcript, ${TRANSCRIPT_MARKER} is the main risk.`,
      'prose',
    );
  });

  it('truncated JSON → 422 reason "truncated_json"', async () => {
    await expectParseFailure(VALID_MODEL_JSON.slice(0, 90), 'truncated_json');
  });

  it('unclosed markdown fence → 422 reason "markdown_fenced"', async () => {
    await expectParseFailure('```json\n' + VALID_MODEL_JSON, 'markdown_fenced');
  });

  it('extra fields → 422 reason "extra_fields"', async () => {
    await expectParseFailure(
      JSON.stringify({
        cards: [{ ...JSON.parse(VALID_MODEL_JSON).cards[0], confidence: 0.9 }],
      }),
      'extra_fields',
    );
  });

  it('a bare array → 422 reason "wrong_envelope"', async () => {
    await expectParseFailure(
      JSON.stringify(JSON.parse(VALID_MODEL_JSON).cards),
      'wrong_envelope',
    );
  });

  it('an invalid enum value → 422 reason "invalid_card"', async () => {
    await expectParseFailure(
      JSON.stringify({
        cards: [{ ...JSON.parse(VALID_MODEL_JSON).cards[0], type: 'OBSERVATION' }],
      }),
      'invalid_card',
    );
  });

  it('the same four cases are handled identically for Anthropic', async () => {
    await expectParseFailure('No insights found in this window.', 'prose', 'anthropic');
    await expectParseFailure(VALID_MODEL_JSON.slice(0, 90), 'truncated_json', 'anthropic');
    await expectParseFailure('```\n' + VALID_MODEL_JSON, 'markdown_fenced', 'anthropic');
    await expectParseFailure(
      JSON.stringify({ cards: [], note: 'nothing found' }),
      'extra_fields',
      'anthropic',
    );
  });

  it('a reply with no text content at all → 422 reason "malformed_json"', async () => {
    stubUpstream(
      () =>
        new Response(JSON.stringify({ choices: [{ message: {}, finish_reason: 'stop' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }),
    );
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(422);
    expect((res._body as { reason: string }).reason).toBe('malformed_json');
    expectNoLeaks(res);
  });

  it('an Anthropic reply with no text block → 422 reason "malformed_json"', async () => {
    stubUpstream(
      () =>
        new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'anthropic', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(422);
    expect((res._body as { reason: string }).reason).toBe('malformed_json');
  });

  it('logs the reason but not the model output', async () => {
    await expectParseFailure(
      `Prose mentioning ${TRANSCRIPT_MARKER}`,
      'prose',
    );

    const logged = logs.join('\n');
    expect(logged).toContain('prose');
    expect(logged).not.toContain(TRANSCRIPT_MARKER);
    expect(logged).not.toContain(FAKE_OPENAI_KEY);
  });

  it('reports a completion cut short by the token limit distinctly', async () => {
    stubUpstream(() => openAiReply('{"cards":[{', 'length'));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(422);
    expect(res._body).toEqual({
      error: 'capture_output_truncated',
      provider: 'openai',
    });
    expectNoLeaks(res);
  });

  it('reports Anthropic stop_reason max_tokens distinctly', async () => {
    stubUpstream(() => anthropicReply('{"cards":[{', 'max_tokens'));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'anthropic', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(422);
    expect((res._body as { error: string }).error).toBe('capture_output_truncated');
  });
});

describe('api/capture/extract — upstream and configuration failures', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    process.env.OPENAI_API_KEY = FAKE_OPENAI_KEY;
    process.env.ANTHROPIC_API_KEY = FAKE_ANTHROPIC_KEY;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CUSTOM_CAPTURE_KEY;
    vi.doUnmock('../../config/loadConfig.ts');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('503 when the key is missing, naming the provider but not the variable', async () => {
    delete process.env.OPENAI_API_KEY;
    stubUpstream(() => openAiReply(VALID_MODEL_JSON));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(503);
    expect(res._body).toEqual({ error: 'capture_not_configured', provider: 'openai' });
    expectNoLeaks(res);
    // The split that matters: the SERVER LOG names the missing variable so an
    // operator can fix the deployment; the RESPONSE names only the provider,
    // because env var names are deployment internals.
    expect(logs.join('\n')).toContain('OPENAI_API_KEY');
    expect(JSON.stringify(res._body)).not.toContain('OPENAI_API_KEY');
  });

  it('502 when the upstream rejects the request, without forwarding its body', async () => {
    stubUpstream(
      () =>
        new Response(`{"error":{"message":"${UPSTREAM_MARKER} invalid api key"}}`, {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(502);
    expect(res._body).toEqual({ error: 'capture_upstream_error', provider: 'openai' });
    expectNoLeaks(res);
    // The detail IS logged server-side, which is where an operator looks.
    expect(logs.join('\n')).toContain(UPSTREAM_MARKER);
  });

  it('redacts the API key from the upstream body before logging it', async () => {
    stubUpstream(
      () =>
        new Response(`echo of Authorization: Bearer ${FAKE_OPENAI_KEY}`, {
          status: 400,
        }),
    );
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(502);
    expectNoLeaks(res);
    const logged = logs.join('\n');
    expect(logged).not.toContain(FAKE_OPENAI_KEY);
    expect(logged).toContain('<redacted>');
    expectNoLeaksInLogs(logs);
  });

  it('502 when the upstream cannot be reached at all', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error(`fetch failed for https://api.openai.com with ${FAKE_OPENAI_KEY}`),
    );
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(502);
    expect(res._body).toEqual({
      error: 'capture_upstream_unreachable',
      provider: 'openai',
    });
    expectNoLeaks(res);
    // The fetch error message embeds the key here; it must not be logged raw.
    expect(logs.join('\n')).not.toContain(FAKE_OPENAI_KEY);
  });

  it('502 for an Anthropic upstream failure, with no body echo', async () => {
    stubUpstream(
      () => new Response(UPSTREAM_MARKER, { status: 529 }),
    );
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'anthropic', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(502);
    expect(res._body).toEqual({
      error: 'capture_upstream_error',
      provider: 'anthropic',
    });
    expectNoLeaks(res);
  });

  it('tolerates an upstream that returns a non-JSON error body', async () => {
    stubUpstream(() => new Response('<html>gateway timeout</html>', { status: 504 }));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(502);
    expect((res._body as { error: string }).error).toBe('capture_upstream_error');
    expectNoLeaks(res);
  });

  it('tolerates an upstream 200 whose body is not JSON', async () => {
    stubUpstream(() => new Response('not json at all', { status: 200 }));
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(422);
    expect((res._body as { error: string }).error).toBe('capture_parse_error');
    expectNoLeaks(res);
  });

  it('reads the key from the env var named by capture.apiKeyEnv in the config', async () => {
    // viewpoint.config.ts does not exist in this repo, so loadConfig normally
    // throws and the handler falls back to OPENAI_API_KEY. Mock it to prove the
    // config-driven path works and that the custom NAME never reaches the client.
    vi.resetModules();
    vi.doMock('../../config/loadConfig.ts', () => ({
      loadConfig: async () => ({
        capture: {
          provider: 'openai',
          model: 'gpt-4o-custom-deployment',
          apiKeyEnv: 'CUSTOM_CAPTURE_KEY',
        },
      }),
    }));
    process.env.CUSTOM_CAPTURE_KEY = FAKE_CUSTOM_KEY;
    delete process.env.OPENAI_API_KEY;

    const { calls } = stubUpstream(() => openAiReply(VALID_MODEL_JSON));
    const res = createMockRes();
    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(200);
    expect(calls[0].headers.authorization).toBe(`Bearer ${FAKE_CUSTOM_KEY}`);
    expect(calls[0].body.model).toBe('gpt-4o-custom-deployment');
    expectNoLeaks(res);
  });

  it('falls back to the conventional key name when the config selects another provider', async () => {
    vi.resetModules();
    vi.doMock('../../config/loadConfig.ts', () => ({
      loadConfig: async () => ({
        capture: {
          provider: 'anthropic',
          model: 'claude-custom',
          apiKeyEnv: 'CUSTOM_CAPTURE_KEY',
        },
      }),
    }));
    process.env.CUSTOM_CAPTURE_KEY = FAKE_CUSTOM_KEY;

    const { calls } = stubUpstream(() => openAiReply(VALID_MODEL_JSON));
    const res = createMockRes();
    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    // The config names Anthropic, so an OpenAI request must not borrow its key
    // name — it uses the conventional OPENAI_API_KEY.
    expect(res._statusCode).toBe(200);
    expect(calls[0].headers.authorization).toBe(`Bearer ${FAKE_OPENAI_KEY}`);
    expectNoLeaks(res);
  });

  it('503 when the config names a key that is not set', async () => {
    vi.resetModules();
    vi.doMock('../../config/loadConfig.ts', () => ({
      loadConfig: async () => ({
        capture: { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'CUSTOM_CAPTURE_KEY' },
      }),
    }));
    delete process.env.CUSTOM_CAPTURE_KEY;
    const res = createMockRes();

    await callHandler(
      createMockReq('POST', { provider: 'openai', transcript, context }),
      res,
    );

    expect(res._statusCode).toBe(503);
    expectNoLeaks(res);
  });
});

describe('api/capture/extract — the front-door password', () => {
  // This endpoint bills the deployment's own OpenAI or Anthropic key, so when
  // a front-door password is set it must not answer a caller who has not
  // entered it. Before this, the password guarded the screens and left the
  // spending endpoints open to anyone who could reach the origin.
  const STORED = hashPassword('right-password');

  beforeEach(() => {
    process.env.OPENAI_API_KEY = FAKE_OPENAI_KEY;
  });

  afterEach(() => {
    delete process.env.ACCESS_PASSWORD_HASH;
    delete process.env.OPENAI_API_KEY;
    vi.restoreAllMocks();
  });

  it('refuses a POST with no cookie when a password is configured', async () => {
    process.env.ACCESS_PASSWORD_HASH = STORED;
    const { calls } = stubUpstream(() => new Response('{}', { status: 200 }));
    const res = createMockRes();

    await callHandler(
      { method: 'POST', headers: {}, cookies: {}, body: { provider: 'openai', transcript } },
      res,
    );

    expect(res._statusCode).toBe(401);
    expect(calls).toHaveLength(0); // nothing was billed
  });

  it('refuses a forged cookie', async () => {
    process.env.ACCESS_PASSWORD_HASH = STORED;
    const { calls } = stubUpstream(() => new Response('{}', { status: 200 }));
    const res = createMockRes();

    await callHandler(
      {
        method: 'POST',
        headers: {},
        cookies: { vp_access: 'deadbeef' },
        body: { provider: 'openai', transcript },
      },
      res,
    );

    expect(res._statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('lets an unlocked caller through', async () => {
    process.env.ACCESS_PASSWORD_HASH = STORED;
    stubUpstream(() => new Response(JSON.stringify({
      choices: [{ message: { content: VALID_MODEL_JSON } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const res = createMockRes();

    await callHandler(
      {
        method: 'POST',
        headers: {},
        cookies: { vp_access: signToken(STORED, 'vp_access') },
        body: { provider: 'openai', transcript, context },
      },
      res,
    );

    expect(res._statusCode).toBe(200);
  });

  it('changes nothing when no password is configured', async () => {
    process.env.ACCESS_PASSWORD_HASH = '';
    stubUpstream(() => new Response(JSON.stringify({
      choices: [{ message: { content: VALID_MODEL_JSON } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const res = createMockRes();

    await callHandler(
      { method: 'POST', headers: {}, body: { provider: 'openai', transcript, context } },
      res,
    );

    expect(res._statusCode).toBe(200);
  });
});
