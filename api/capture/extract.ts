// POST /api/capture/extract   — transcript → InsightCard[] via a cloud LLM
// HEAD /api/capture/extract   — configuration check (200 when a key is present)
//
// Server-side proxy for the OpenAI and Anthropic capture providers. The API
// key is read from process.env ONLY, using the env var NAME from
// viewpoint.config.ts (`capture.apiKeyEnv`) when the config names this
// provider, and falling back to the conventional OPENAI_API_KEY /
// ANTHROPIC_API_KEY. The browser clients (lib/connectors/capture/openai.ts,
// anthropic.ts) hold no credential and cannot be given one — this is the rule
// in docs/plan/02-connector-adapters.md §2: "never call these directly from
// the browser with a key".
//
// SECURITY — nothing in an error response may contain:
//   1. the API key (or its env var name),
//   2. the raw upstream response body,
//   3. the transcript, or
//   4. the model's output (which quotes the transcript).
// Every failure therefore returns a short machine-readable code, and the
// detail that an operator needs goes to the server log instead.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
} from '../../lib/connectors/capture/extractionPrompt.ts';
import {
  CaptureExtractionError,
  parseInsightCards,
} from '../../lib/connectors/capture/parseInsightCards.ts';
import type {
  SlideContext,
  TranscriptChunk,
} from '../../lib/connectors/capture/types.ts';

type CloudProvider = 'openai' | 'anthropic';

const DEFAULT_API_KEY_ENV: Record<CloudProvider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

// Only used when viewpoint.config.ts is absent or does not select this
// provider. A real deployment sets capture.model in the config.
const DEFAULT_MODEL: Record<CloudProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5',
};

const UPSTREAM_URL: Record<CloudProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
};

const ANTHROPIC_VERSION = '2023-06-01';

// Boundary limits: this endpoint spends real money on whatever it is sent, so
// an oversized window is rejected before it reaches the model rather than
// after.
const MAX_CHUNKS = 2000;
const MAX_TRANSCRIPT_CHARS = 200_000;
/** Generous ceiling for the model's answer; a truncated reply is reported as such. */
const MAX_OUTPUT_TOKENS = 4096;

// ─── Config resolution (mirrors api/turn-credentials.ts) ────────────────────

async function resolveCloudConfig(
  provider: CloudProvider,
): Promise<{ apiKeyEnv: string; model: string }> {
  try {
    const { loadConfig } = await import('../../lib/config/loadConfig.ts');
    const config = await loadConfig();
    const capture = config.capture;
    // Only honour the config when it actually selects this provider; a
    // deployment running capture.provider 'mock' has no business lending its
    // (unrelated) key name to a cloud extraction request.
    if (capture.provider === provider) {
      return { apiKeyEnv: capture.apiKeyEnv, model: capture.model };
    }
  } catch {
    // No viewpoint.config.ts (local dev, or this repo's default) — fall back
    // to the conventional names rather than failing the request.
  }
  return {
    apiKeyEnv: DEFAULT_API_KEY_ENV[provider],
    model: DEFAULT_MODEL[provider],
  };
}

/** True when at least one of the two cloud providers has a usable key. */
async function anyCloudKeyConfigured(): Promise<boolean> {
  for (const provider of ['openai', 'anthropic'] as const) {
    const { apiKeyEnv } = await resolveCloudConfig(provider);
    if (process.env[apiKeyEnv]) return true;
  }
  return false;
}

// ─── Request validation ─────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseTranscript(value: unknown): TranscriptChunk[] | null {
  if (!Array.isArray(value)) return null;

  const chunks: TranscriptChunk[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (!isNonEmptyString(entry.speakerId)) return null;
    if (typeof entry.text !== 'string') return null;
    if (!isFiniteNumber(entry.startMs) || !isFiniteNumber(entry.endMs)) return null;
    if (entry.startMs < 0 || entry.endMs < entry.startMs) return null;
    chunks.push({
      speakerId: entry.speakerId,
      text: entry.text,
      startMs: entry.startMs,
      endMs: entry.endMs,
    });
  }
  return chunks;
}

/** Size is checked separately from shape so the two report different codes. */
function isTooLarge(transcript: TranscriptChunk[]): boolean {
  if (transcript.length > MAX_CHUNKS) return true;
  return (
    transcript.reduce((total, chunk) => total + chunk.text.length, 0) >
    MAX_TRANSCRIPT_CHARS
  );
}

function parseContext(value: unknown): SlideContext | null {
  if (!isRecord(value)) return null;
  if (!isFiniteNumber(value.agendaIdx)) return null;
  if (!isNonEmptyString(value.slideTitle)) return null;

  const context: SlideContext = {
    agendaIdx: value.agendaIdx,
    slideTitle: value.slideTitle,
  };
  if (value.hoveredPartName !== undefined) {
    if (!isNonEmptyString(value.hoveredPartName)) return null;
    context.hoveredPartName = value.hoveredPartName;
  }
  if (value.laserTargetPartName !== undefined) {
    if (!isNonEmptyString(value.laserTargetPartName)) return null;
    context.laserTargetPartName = value.laserTargetPartName;
  }
  return context;
}

// ─── Upstream calls ─────────────────────────────────────────────────────────

interface UpstreamResult {
  /** The model's text, or null when the response carried none. */
  text: string | null;
  /** True when the model stopped because it ran out of output tokens. */
  truncated: boolean;
}

async function callOpenAI(
  model: string,
  apiKey: string,
  userPrompt: string,
): Promise<UpstreamResult> {
  const resp = await fetch(UPSTREAM_URL.openai, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      // Constrains the reply to valid JSON. It does NOT constrain the schema —
      // parseInsightCards is still the authority on shape.
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!resp.ok) throw new UpstreamError(resp.status, await drain(resp));

  const data = (await resp.json().catch(() => null)) as {
    choices?: Array<{
      message?: { content?: unknown };
      finish_reason?: string;
    }>;
  } | null;

  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  return {
    text: typeof content === 'string' ? content : null,
    truncated: choice?.finish_reason === 'length',
  };
}

async function callAnthropic(
  model: string,
  apiKey: string,
  userPrompt: string,
): Promise<UpstreamResult> {
  const resp = await fetch(UPSTREAM_URL.anthropic, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!resp.ok) throw new UpstreamError(resp.status, await drain(resp));

  const data = (await resp.json().catch(() => null)) as {
    content?: Array<{ type?: string; text?: unknown }>;
    stop_reason?: string;
  } | null;

  // A reply can be split across several text blocks; concatenate them.
  const text = (data?.content ?? [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('');

  return {
    text: text.length > 0 ? text : null,
    truncated: data?.stop_reason === 'max_tokens',
  };
}

/** Carries the upstream status plus a body that must never reach the client. */
class UpstreamError extends Error {
  readonly status: number;
  /** Server-log only. */
  readonly upstreamBody: string;

  constructor(status: number, upstreamBody: string) {
    super(`upstream returned ${status}`);
    this.name = 'UpstreamError';
    this.status = status;
    this.upstreamBody = upstreamBody;
  }
}

async function drain(resp: Response): Promise<string> {
  try {
    return (await resp.text()).slice(0, 500);
  } catch {
    return '';
  }
}

/** Defence in depth for the server log: strip the key even from upstream text. */
function redact(text: string, apiKey: string): string {
  if (!apiKey) return text;
  return text.split(apiKey).join('<redacted>');
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'HEAD') {
    // A HEAD probe cannot know which provider the caller means, so it reports
    // whether EITHER cloud key is configured. Used by the browser clients to
    // tell "not configured" from "unreachable".
    res.status((await anyCloudKeyConfigured()) ? 200 : 503).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, HEAD');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body: unknown = req.body;
  if (!isRecord(body)) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  const provider = body.provider;
  if (provider !== 'openai' && provider !== 'anthropic') {
    // Deliberately names no other provider: this endpoint only ever proxies
    // the two cloud vendors whose keys live here.
    res.status(400).json({ error: 'invalid_provider' });
    return;
  }

  const transcript = parseTranscript(body.transcript);
  if (transcript === null) {
    res.status(400).json({ error: 'invalid_transcript' });
    return;
  }
  if (transcript.length === 0) {
    res.status(400).json({ error: 'empty_transcript' });
    return;
  }
  if (isTooLarge(transcript)) {
    // Rejected before the model sees it: this endpoint spends real money on
    // whatever it is sent.
    res.status(413).json({ error: 'transcript_too_large', provider });
    return;
  }
  const context = parseContext(body.context);
  if (context === null) {
    res.status(400).json({ error: 'invalid_context' });
    return;
  }

  const { apiKeyEnv, model } = await resolveCloudConfig(provider);
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    // Names the variable in the SERVER LOG, because that is what an operator
    // needs in order to fix the deployment. The response names only the
    // provider: which variable holds the key is deployment internals, the same
    // reasoning that makes api/public-config.ts refuse to return err.message.
    console.error(`[capture/extract] ${provider} API key is not set: ${apiKeyEnv} is empty`);
    res.status(503).json({ error: 'capture_not_configured', provider });
    return;
  }

  const userPrompt = buildExtractionUserPrompt(transcript, context);
  const defaultAgentId = transcript[0].speakerId;

  let result: UpstreamResult;
  try {
    result =
      provider === 'openai'
        ? await callOpenAI(model, apiKey, userPrompt)
        : await callAnthropic(model, apiKey, userPrompt);
  } catch (err) {
    if (err instanceof UpstreamError) {
      console.error(
        `[capture/extract] ${provider} upstream ${err.status}: ` +
          redact(err.upstreamBody, apiKey),
      );
      // Status only. The upstream body is never forwarded: it can quote the
      // prompt, which contains the transcript.
      res.status(502).json({ error: 'capture_upstream_error', provider });
      return;
    }
    console.error(`[capture/extract] ${provider} request failed`);
    res.status(502).json({ error: 'capture_upstream_unreachable', provider });
    return;
  }

  if (result.truncated) {
    console.error(`[capture/extract] ${provider} output hit the token limit`);
    res.status(422).json({ error: 'capture_output_truncated', provider });
    return;
  }

  try {
    const cards = parseInsightCards(result.text, { defaultAgentId });
    // The success body is EXACTLY the envelope the parser enforces, with no
    // transport metadata mixed in — that is what lets the browser client
    // re-validate it verbatim with the same strict rules (extra fields
    // included) instead of needing a second, laxer schema for our own API.
    res.status(200).json({ cards });
  } catch (err) {
    if (err instanceof CaptureExtractionError) {
      // `reason` is an enum and safe to return. err.message is NOT: it quotes
      // the model output, which quotes the transcript.
      console.error(
        `[capture/extract] ${provider} unparseable output: ${err.reason}`,
      );
      res.status(422).json({
        error: 'capture_parse_error',
        reason: err.reason,
        provider,
      });
      return;
    }
    // Anything unexpected is still reported as a parse failure rather than
    // propagated: an unhandled throw would surface as a 500 with a stack.
    console.error('[capture/extract] unexpected parse failure');
    res.status(422).json({ error: 'capture_parse_error', provider });
  }
}
