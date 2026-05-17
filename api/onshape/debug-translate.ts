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

// Round 2: focus on the variations that got past the POST validation
// (200 OK) but never got polled, plus a few new combos using Onshape's
// full visualization-tessellation param set.
const ATTEMPTS: Attempt[] = [
  { label: 'D: maxFacet only',        body: { formatName: 'GLTF', storeInDocument: false, maxFacetWidth: 1.0 } },
  { label: 'F: flattenAssemblies',    body: { formatName: 'GLTF', storeInDocument: false, flattenAssemblies: false } },
  { label: 'G: outputFormat+version', body: { formatName: 'GLTF', storeInDocument: false, outputFormat: 'binary', glTFVersion: '2.0' } },
  { label: 'J: full tessellation',    body: { formatName: 'GLTF', storeInDocument: false, angleTolerance: 0.1745, chordTolerance: 0.06, maxFacetWidth: 0.5, minimumFacetWidth: 0.01 } },
  { label: 'K: explicit unitSystem',  body: { formatName: 'GLTF', storeInDocument: false, unit: 'millimeter' } },
  { label: 'L: triangulationFalse',   body: { formatName: 'GLTF', storeInDocument: false, triangulate: true } },
  { label: 'M: assembly-format-only', body: { formatName: 'GLTF', storeInDocument: false, includeNonSolids: false, expandSubassemblies: true } },
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
