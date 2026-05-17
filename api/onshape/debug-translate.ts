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

// Round 3: every GLTF variation fails identically. Now test other formats
// (STL/STEP/PARASOLID) to determine whether it's GLTF-specific or element-
// specific. If STL succeeds, we know we need a different export format.
const ATTEMPTS: Attempt[] = [
  { label: 'N: STL ascii',         body: { formatName: 'STL', storeInDocument: false, mode: 'text', units: 'millimeter' } },
  { label: 'O: STL binary',        body: { formatName: 'STL', storeInDocument: false, mode: 'binary', units: 'millimeter' } },
  { label: 'P: STEP',              body: { formatName: 'STEP', storeInDocument: false } },
  { label: 'Q: PARASOLID',         body: { formatName: 'PARASOLID', storeInDocument: false } },
  { label: 'R: OBJ',               body: { formatName: 'OBJ', storeInDocument: false } },
  { label: 'S: COLLADA',           body: { formatName: 'COLLADA', storeInDocument: false } },
  { label: 'T: FBX',               body: { formatName: 'FBX', storeInDocument: false } },
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

    // Kick off all translations in parallel — POSTs return immediately with
    // a translation id. Then poll them in parallel too. Total wall time is
    // bounded by the slowest individual translation, not the sum, so we can
    // fit everything in Vercel's 60s budget.
    const startResults = await Promise.all(ATTEMPTS.map(async (attempt) => {
      const start = await callOnshape(req, path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt.body),
      });
      applyRefreshedCookies(res, start.refreshedCookies);
      const startStatus = start.response.status;
      const startBody = await start.response.text();
      let translationId: string | null = null;
      if (start.response.ok) {
        try { translationId = (JSON.parse(startBody) as { id?: string }).id ?? null; } catch { /* */ }
      }
      return { attempt, startStatus, startBody: startBody.slice(0, 200), translationId };
    }));

    const polled = await Promise.all(startResults.map(async (r) => {
      if (!r.translationId) {
        return { label: r.attempt.label, body: r.attempt.body, startStatus: r.startStatus, startBody: r.startBody };
      }
      const poll = await pollOnce(req, res, r.translationId);
      return { label: r.attempt.label, body: r.attempt.body, startStatus: r.startStatus, pollResult: poll };
    }));

    res.status(200).json({ tested: ATTEMPTS.length, results: polled });
  });
}
