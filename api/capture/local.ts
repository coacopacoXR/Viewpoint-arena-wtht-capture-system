// POST /api/capture/local — a meeting recording → InsightCard[] via capture-service
//
// Server-side forwarding proxy for the LocalCaptureProvider (T4.4). The browser
// posts a multipart body to this same-origin URL and this function is what
// attaches the shared secret capture-service requires, read from server-side
// process.env ONLY. lib/connectors/capture/local.ts holds no credential and
// cannot be given one — the rule in docs/plan/02-connector-adapters.md §2,
// "never call these directly from the browser with a key".
//
// In the self-hosted stack this function is not used at all: nginx in the `app`
// container proxies the same path straight to capture-service
// (deploy/nginx/app.conf), because that stack runs no API runtime.
//
// SECURITY — nothing in a response may contain:
//   1. the shared secret, or the NAME of the variable that holds it,
//   2. capture.serviceUrl (an internal container name on a network that
//      deliberately publishes no port),
//   3. any upstream response text other than a validated error code, or
//   4. the recording, which is what an upstream message would quote.
// Every failure therefore returns a short machine-readable code, and the detail
// an operator needs goes to the server log with the secret redacted.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  CAPTURE_AUTH_HEADER,
  CAPTURE_SHARED_SECRET_ENV,
} from '../../lib/health/probes.ts';

export const config = {
  // The body is multipart and can be 200 MiB. Letting Vercel parse it would
  // rebuild a JSON/qs representation of a binary upload; disabled, the raw
  // stream is forwarded byte-for-byte and the boundary in the incoming
  // Content-Type stays valid.
  api: { bodyParser: false },
};

/**
 * A Whisper transcription plus a local LLM extraction over a whole meeting is
 * minutes, not seconds, and capture-service's own per-request LLM timeout is
 * 120s on top of the transcription. 15 minutes matches the nginx
 * proxy_read_timeout in deploy/nginx/app.conf so the two deployment paths give
 * up at the same moment.
 */
const UPSTREAM_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * The only shape of upstream error code that may be repeated to a caller.
 *
 * capture-service's codes are `[a-z_]+` by construction
 * (capture_service/errors.py). Anything else — prose, HTML from a proxy, a
 * framework's `http_500` — is replaced with a fixed code, because that text can
 * quote the request and the request is a meeting recording.
 */
const SAFE_UPSTREAM_CODE = /^[a-z_]{1,64}$/;

/** capture-service mounts its routes at the root. */
const CAPTURE_PATH = '/capture';

// ─── Config resolution ──────────────────────────────────────────────────────

/**
 * capture.serviceUrl, but only when the deployment actually selected the local
 * provider. Null means "not configured", which the handler turns into a 503
 * naming nothing.
 *
 * Unlike api/capture/extract.ts there is no conventional fallback to land on:
 * without the serviceUrl this endpoint has nowhere to send anything.
 */
async function resolveServiceUrl(): Promise<string | null> {
  try {
    const { defaultConfigPath, loadConfig } = await import(
      '../../lib/config/loadConfig.ts'
    );
    const loaded = await loadConfig(defaultConfigPath());
    const capture = loaded.capture;
    if (capture.provider !== 'local') return null;
    return capture.serviceUrl;
  } catch (err) {
    // The message names the config file and any missing env var, which is what
    // an operator needs and exactly what this endpoint must not publish.
    console.error('[capture/local] config did not load:', err);
    return null;
  }
}

/** The serviceUrl with its path and query removed: origin + /capture only. */
function captureEndpoint(serviceUrl: string): string | null {
  try {
    const url = new URL(serviceUrl);
    url.pathname = CAPTURE_PATH;
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

// ─── Raw body ───────────────────────────────────────────────────────────────

/**
 * Collects the untouched request body.
 *
 * Buffering rather than piping: undici's fetch needs a body it can retry-free
 * and length-known, and the compose network hop this usually makes is local. The
 * size ceiling is capture-service's own CAPTURE_MAX_UPLOAD_BYTES, which rejects
 * an oversized upload while streaming it, so the failure is still legible.
 */
function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolveBody(Buffer.concat(chunks));
    });
    req.on('error', rejectBody);
  });
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Defence in depth for the server log, which may receive upstream text.
 *
 * The secret is replaced first so a body that happens to quote it cannot be
 * forwarded; the URL follows because it names an internal host.
 */
function redact(text: string, secret: string, serviceUrl: string): string {
  let redacted = text;
  if (secret) redacted = redacted.split(secret).join('<redacted>');
  if (serviceUrl) redacted = redacted.split(serviceUrl).join('<redacted>');
  return redacted.slice(0, 500);
}

/** The validated upstream code, or null when the body carried nothing safe. */
function safeCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  // capture-service reports its code as `error`; `code` is accepted too so a
  // body that names it directly still round-trips.
  const raw =
    typeof record.code === 'string'
      ? record.code
      : typeof record.error === 'string'
        ? record.error
        : '';
  return SAFE_UPSTREAM_CODE.test(raw) ? raw : null;
}

async function readJson(text: string): Promise<unknown> {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    // POST only: a GET here would otherwise be answered by the SPA fallback on a
    // static host, and a 405 with Allow says what this route actually is.
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const serviceUrl = await resolveServiceUrl();
  const endpoint = serviceUrl === null ? null : captureEndpoint(serviceUrl);
  if (serviceUrl === null || endpoint === null) {
    // Names no variable, no file and no host: which config field is missing is
    // deployment internals, and the server log already says.
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  const secret = process.env[CAPTURE_SHARED_SECRET_ENV] ?? '';

  let body: Buffer;
  try {
    body = await readRawBody(req);
  } catch {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  // The incoming Content-Type carries the multipart boundary; inventing one
  // would make the upload unparseable.
  const contentType = firstHeader(req.headers['content-type']);
  if (contentType) headers['Content-Type'] = contentType;
  // Only sent when a secret is configured. An empty value would otherwise be an
  // empty header, which capture-service's auth would reject as a bad token
  // rather than treating as "authentication is off".
  if (secret) headers[CAPTURE_AUTH_HEADER] = secret;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
  } catch {
    // The distinction between "timed out" and "refused" matters to an operator,
    // and both are invisible to a caller: the response says only that the
    // service could not be reached, never where it is.
    console.error(
      `[capture/local] upstream request failed (aborted=${String(controller.signal.aborted)})`,
    );
    res.status(502).json({ error: 'upstream_error' });
    return;
  } finally {
    clearTimeout(timer);
  }

  const text = await upstream.text().catch(() => '');

  if (upstream.ok) {
    const payload = await readJson(text);
    if (payload === null) {
      // A 2xx that is not JSON is a proxy or an SPA fallback answering for a
      // route it does not own. The body is not forwarded.
      console.error('[capture/local] upstream returned a non-JSON 2xx body');
      res.status(502).json({ error: 'upstream_error' });
      return;
    }
    // Forwarded verbatim: capture-service's success body is exactly the
    // `{ "cards": [...] }` envelope, with no transport metadata mixed in, so the
    // browser can re-validate it with the same strict parser.
    res.status(upstream.status).json(payload);
    return;
  }

  const code = safeCode(await readJson(text));
  console.error(
    `[capture/local] upstream ${upstream.status}: ` +
      redact(code ?? text, secret, serviceUrl),
  );
  res.status(upstream.status).json({ error: code ?? 'upstream_error' });
}
