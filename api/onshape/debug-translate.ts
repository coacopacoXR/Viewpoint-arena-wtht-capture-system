// Debug helper: tries multiple translation body variations against the
// authenticated user's Onshape account and reports which (if any) succeed.
// Used to figure out what GLTF translation params actually work for a given
// element — fixing the "Invalid GLTF detail parameters" loop.
//
// GET /api/onshape/debug-translate?d=<documentId>&w=<workspaceId>&e=<elementId>&type=ASSEMBLY|PARTSTUDIO

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callOnshape, applyRefreshedCookies, withAuth } from '../_lib/onshape.js';

const POLL_MAX = 25; // ~50s per variation (2s intervals)

interface Attempt {
  label: string;
  body: Record<string, unknown>;
}

const ATTEMPTS: Attempt[] = [
  { label: 'A: bare-minimum',          body: { formatName: 'GLTF' } },
  { label: 'B: bare + storeFalse',     body: { formatName: 'GLTF', storeInDocument: false } },
  { label: 'C: tolerances',            body: { formatName: 'GLTF', storeInDocument: false, angleTolerance: 0.1745, chordTolerance: 0.06 } },
  { label: 'D: maxFacet only',         body: { formatName: 'GLTF', storeInDocument: false, maxFacetWidth: 1.0 } },
  { label: 'E: storeTrue',             body: { formatName: 'GLTF', storeInDocument: true } },
  { label: 'F: flatten + storeFalse',  body: { formatName: 'GLTF', storeInDocument: false, flattenAssemblies: false } },
  { label: 'G: visualization',         body: { formatName: 'GLTF', storeInDocument: false, outputFormat: 'binary', glTFVersion: '2.0' } },
  { label: 'H: GLB (binary)',          body: { formatName: 'GLB' } },
  { label: 'I: gltf lowercase',        body: { formatName: 'gltf', storeInDocument: false } },
];

async function pollOnce(req: VercelRequest, res: VercelResponse, translationId: string): Promise<{ state: string; reason?: string; dataId?: string; documentId?: string }> {
  for (let i = 0; i < POLL_MAX; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { response, refreshedCookies } = await callOnshape(req, `/api/v9/translations/${translationId}`);
    applyRefreshedCookies(res, refreshedCookies);
    if (!response.ok) return { state: 'STATUS_CHECK_FAILED', reason: await response.text() };
    const s = await response.json() as any;
    if (s.requestState === 'DONE' || s.requestState === 'FAILED') {
      return { state: s.requestState, reason: s.failureReason, dataId: s.resultExternalDataIds?.[0], documentId: s.documentId };
    }
  }
  return { state: 'TIMED_OUT' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withAuth(res, async () => {
    const d = typeof req.query.d === 'string' ? req.query.d : '';
    const w = typeof req.query.w === 'string' ? req.query.w : '';
    const e = typeof req.query.e === 'string' ? req.query.e : '';
    const type = typeof req.query.type === 'string' ? req.query.type.toUpperCase() : '';
    if (!d || !w || !e || (type !== 'ASSEMBLY' && type !== 'PARTSTUDIO')) {
      res.status(400).json({ error: 'Missing/invalid d, w, e, or type (ASSEMBLY|PARTSTUDIO)' });
      return;
    }
    const path = type === 'ASSEMBLY'
      ? `/api/v9/assemblies/d/${d}/w/${w}/e/${e}/translations`
      : `/api/v9/partstudios/d/${d}/w/${w}/e/${e}/translations`;

    const results: any[] = [];

    // We only have ~55s total on Vercel — try the first 3 with full polling,
    // the rest with just the start-call (often Onshape's body validation
    // happens before processing, so 400 vs 200 on POST is already informative).
    for (let i = 0; i < ATTEMPTS.length; i++) {
      const attempt = ATTEMPTS[i];
      const start = await callOnshape(req, path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt.body),
      });
      applyRefreshedCookies(res, start.refreshedCookies);
      const startStatus = start.response.status;
      const startBody = await start.response.text();
      const entry: any = { label: attempt.label, body: attempt.body, startStatus, startBody: startBody.slice(0, 200) };

      if (start.response.ok && i < 3) {
        // For top-3, poll to find out if processing succeeds.
        try {
          const handle = JSON.parse(startBody) as { id?: string };
          if (handle.id) {
            const poll = await pollOnce(req, res, handle.id);
            entry.pollResult = poll;
          }
        } catch (err) {
          entry.pollError = (err as Error).message;
        }
      }
      results.push(entry);
    }
    res.status(200).json({ tested: ATTEMPTS.length, results });
  });
}
