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
import { captureProxyHandler } from './_proxyShared.ts';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return captureProxyHandler(req, res, {
    upstreamPath: '/capture',
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    logTag: 'capture/local',
  });
}
