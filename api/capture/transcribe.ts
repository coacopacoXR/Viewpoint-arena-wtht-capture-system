// POST /api/capture/transcribe — live-transcript audio chunk → transcript JSON
//
// Same proxy pattern as api/capture/local.ts (T4.4): the browser posts a
// multipart body to this same-origin URL, and this function attaches the shared
// secret capture-service requires. The difference is the upstream path
// (/transcribe instead of /capture), the smaller body limit (10 MiB — a live
// chunk is seconds of audio, not a full meeting), and the shorter timeout
// (120 s — a single Whisper pass over 8 s of audio, no LLM extraction).
//
// In the self-hosted stack this function is not used: nginx proxies
// /api/capture/transcribe straight to capture-service (deploy/nginx/app.conf).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { captureProxyHandler } from './_proxyShared.ts';

export const config = {
  api: { bodyParser: false },
};

/**
 * 120 s matches capture-service's own transcription timeout and the nginx
 * proxy_read_timeout for the /api/capture/transcribe location. A live chunk is
 * 8 s of audio; Whisper on CPU takes a few seconds; 120 s is generous.
 */
const UPSTREAM_TIMEOUT_MS = 120_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return captureProxyHandler(req, res, {
    upstreamPath: '/transcribe',
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    logTag: 'capture/transcribe',
  });
}
