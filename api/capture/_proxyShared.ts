// Shared proxy plumbing for the capture-service routes (T4.4 + T4.7).
//
// Both api/capture/local.ts (batch capture) and api/capture/transcribe.ts
// (live-transcript chunks) forward multipart audio to capture-service with the
// same secret-header pattern. The only differences are the upstream path, the
// body-size ceiling and the timeout. This module owns everything they share:
// config resolution, raw-body reading, redaction, error-code validation, and
// the generic "forward to capture-service" handler.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  CAPTURE_AUTH_HEADER,
  CAPTURE_SHARED_SECRET_ENV,
} from '../../lib/health/probes.ts';

const SAFE_UPSTREAM_CODE = /^[a-z_]{1,64}$/;

export async function resolveServiceUrl(): Promise<string | null> {
  try {
    const { defaultConfigPath, loadConfig } = await import(
      '../../lib/config/loadConfig.ts'
    );
    const loaded = await loadConfig(defaultConfigPath());
    const capture = loaded.capture;
    if (capture.provider !== 'local') return null;
    return capture.serviceUrl;
  } catch (err) {
    console.error('[capture/proxy] config did not load:', err);
    return null;
  }
}

export function buildUpstreamUrl(serviceUrl: string, path: string): string | null {
  try {
    const url = new URL(serviceUrl);
    url.pathname = path;
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

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

function redact(text: string, secret: string, serviceUrl: string): string {
  let redacted = text;
  if (secret) redacted = redacted.split(secret).join('<redacted>');
  if (serviceUrl) redacted = redacted.split(serviceUrl).join('<redacted>');
  return redacted.slice(0, 500);
}

function safeCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
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

export interface CaptureProxyOptions {
  /** The capture-service path to proxy to (e.g. '/capture' or '/transcribe'). */
  upstreamPath: string;
  /** Upstream timeout in ms. */
  timeoutMs: number;
  /** Tag for log lines (e.g. 'capture/local' or 'capture/transcribe'). */
  logTag: string;
}

export async function captureProxyHandler(
  req: VercelRequest,
  res: VercelResponse,
  opts: CaptureProxyOptions,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const serviceUrl = await resolveServiceUrl();
  const endpoint = serviceUrl === null ? null : buildUpstreamUrl(serviceUrl, opts.upstreamPath);
  if (serviceUrl === null || endpoint === null) {
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
  const contentType = firstHeader(req.headers['content-type']);
  if (contentType) headers['Content-Type'] = contentType;
  if (secret) headers[CAPTURE_AUTH_HEADER] = secret;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
  } catch {
    console.error(
      `[${opts.logTag}] upstream request failed (aborted=${String(controller.signal.aborted)})`,
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
      console.error(`[${opts.logTag}] upstream returned a non-JSON 2xx body`);
      res.status(502).json({ error: 'upstream_error' });
      return;
    }
    res.status(upstream.status).json(payload);
    return;
  }

  const code = safeCode(await readJson(text));
  console.error(
    `[${opts.logTag}] upstream ${upstream.status}: ` +
      redact(code ?? text, secret, serviceUrl),
  );
  res.status(upstream.status).json({ error: code ?? 'upstream_error' });
}
