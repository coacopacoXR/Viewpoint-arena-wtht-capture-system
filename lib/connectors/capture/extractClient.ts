// Browser-safe client for POST /api/capture/extract.
//
// Both cloud capture providers (openai.ts, anthropic.ts) go through here, so
// the guarantee that matters is stated once, in one place:
//
//   NO CREDENTIAL EXISTS IN THIS MODULE OR IN ANY CALL TO IT.
//
// There is no apiKey option, no Authorization header, no process.env and no
// import.meta.env read. The browser posts a transcript to our own serverless
// function; that function holds the key in server-side process.env. This is
// the rule in docs/plan/02-connector-adapters.md §2 — "never call these
// directly from the browser with a key" — and the reason the two providers are
// 30-line files instead of SDK integrations.

import type { InsightCard } from '../../../types';
import type { SlideContext, TranscriptChunk } from './types';
import type { CaptureParseFailureReason } from './parseInsightCards';
import { validateExtractionPayload } from './parseInsightCards';

export type CloudCaptureProvider = 'openai' | 'anthropic';

export const EXTRACT_ENDPOINT = '/api/capture/extract';

type FetchFn = typeof globalThis.fetch;

export interface ExtractClientOptions {
  /** Override for tests, or a deployment that mounts the function elsewhere. */
  endpoint?: string;
  fetchFn?: FetchFn;
}

/**
 * A failed extraction request.
 *
 * `code` is the server's error code verbatim, or one of the three client-side
 * codes ('network', 'endpoint_unavailable', 'unknown'). `reason` is set only
 * when the failure was the model's output being unparseable, and carries the
 * same enum the server-side parser produced.
 */
export class CaptureEndpointError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly reason: CaptureParseFailureReason | null;

  constructor(code: string, message: string, status: number | null = null, reason: CaptureParseFailureReason | null = null) {
    super(message);
    this.name = 'CaptureEndpointError';
    this.code = code;
    this.status = status;
    this.reason = reason;
  }
}

export async function extractInsightsViaEndpoint(
  provider: CloudCaptureProvider,
  transcript: TranscriptChunk[],
  context: SlideContext,
  options: ExtractClientOptions = {},
): Promise<InsightCard[]> {
  const endpoint = options.endpoint ?? EXTRACT_ENDPOINT;
  const doFetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);

  let response: Response;
  try {
    response = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, transcript, context }),
    });
  } catch {
    // Fetch's own message is dropped: it embeds the URL, and a caller may have
    // pointed `endpoint` somewhere it should not have.
    throw new CaptureEndpointError(
      'network',
      `capture/${provider}: could not reach ${endpoint}. The serverless ` +
        `function is not answering — check that the deployment includes api/` +
        `capture/extract.ts and that the network allows the request.`,
    );
  }

  if (!response.ok) {
    throw await toEndpointError(provider, endpoint, response);
  }

  // A 200 that is not our function: an SPA fallback or a misrouted proxy
  // answers 200 text/html for any unknown /api path (this is exactly what
  // `vite preview` does). Reading it as JSON would throw a SyntaxError with no
  // context, so say what actually happened.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new CaptureEndpointError(
      'endpoint_unavailable',
      `capture/${provider}: ${endpoint} answered ${response.status} ` +
        `${contentType || 'with no content type'} instead of JSON. The ` +
        `serverless function is not running — under \`vite preview\` and any ` +
        `other static host, api/* is not executed and the SPA fallback ` +
        `returns index.html.`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CaptureEndpointError(
      'endpoint_unavailable',
      `capture/${provider}: ${endpoint} returned a body that was not valid JSON.`,
      response.status,
    );
  }

  // The endpoint has already parsed and validated the model output, but its
  // response still crosses a network and a proxy: re-validating means a
  // half-built card cannot reach the UI even if the server changes shape.
  return validateExtractionPayload(payload, {
    defaultAgentId: transcript[0]?.speakerId,
  });
}

/**
 * HEAD probe: is a cloud key configured on the server? Lets a UI say "capture
 * is not configured" instead of failing an extraction the user waited for.
 */
export async function probeExtractEndpoint(
  options: ExtractClientOptions = {},
): Promise<boolean> {
  const endpoint = options.endpoint ?? EXTRACT_ENDPOINT;
  const doFetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  try {
    const response = await doFetch(endpoint, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Error translation ──────────────────────────────────────────────────────

async function toEndpointError(
  provider: CloudCaptureProvider,
  endpoint: string,
  response: Response,
): Promise<CaptureEndpointError> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    reason?: CaptureParseFailureReason;
  } | null;
  const code = body?.error ?? 'unknown';

  switch (code) {
    case 'capture_not_configured':
      // Points at the config file, not at a variable name: which variable
      // holds the key is deployment internals, and the browser is not told.
      // The server log names it, which is where the operator will look.
      return new CaptureEndpointError(
        code,
        `capture/${provider}: the server has no API key for ${provider}. ` +
          `It is configured server-side only — check the capture section of ` +
          `viewpoint.config.ts and the deployment's secret store, then read ` +
          `the server log for the variable that is missing. No key is ever ` +
          `sent to the browser, so there is nothing to fix client-side.`,
        response.status,
      );
    case 'capture_upstream_error':
      return new CaptureEndpointError(
        code,
        `capture/${provider}: the ${provider} API rejected the extraction ` +
          `request. The upstream response is not forwarded to the browser — ` +
          `check the server log for the status and detail.`,
        response.status,
      );
    case 'capture_upstream_unreachable':
      return new CaptureEndpointError(
        code,
        `capture/${provider}: the server could not reach the ${provider} API.`,
        response.status,
      );
    case 'capture_output_truncated':
      return new CaptureEndpointError(
        code,
        `capture/${provider}: the model ran out of output tokens before ` +
          `finishing the JSON. Shorten the transcript window, or raise the ` +
          `output limit in api/capture/extract.ts.`,
        response.status,
      );
    case 'capture_parse_error':
      return new CaptureEndpointError(
        code,
        `capture/${provider}: the model did not return usable InsightCard ` +
          `JSON (${body?.reason ?? 'unknown reason'}). The raw model output ` +
          `is not forwarded because it quotes the transcript.`,
        response.status,
        body?.reason ?? null,
      );
    case 'transcript_too_large':
      return new CaptureEndpointError(
        code,
        `capture/${provider}: the transcript window exceeds the server's ` +
          `size limit. Extract over a shorter window.`,
        response.status,
      );
    case 'empty_transcript':
      return new CaptureEndpointError(
        code,
        `capture/${provider}: the transcript window was empty — there was ` +
          `nothing to extract from.`,
        response.status,
      );
    case 'invalid_transcript':
    case 'invalid_context':
    case 'invalid_provider':
    case 'invalid_body':
      return new CaptureEndpointError(
        code,
        `capture/${provider}: the server rejected the request payload ` +
          `(${code}). This is a client bug, not a model failure.`,
        response.status,
      );
    default:
      return new CaptureEndpointError(
        code,
        `capture/${provider}: ${endpoint} returned ${response.status} ` +
          `(${code}).`,
        response.status,
      );
  }
}
