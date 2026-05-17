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

// Round 4: OBJ failed with "Invalid resolution parameters" — same family
// as the GLTF error. Onshape's mesh exporters require a `resolution` enum.
// Test all four Onshape resolution presets + custom, both for GLTF and OBJ
// (for sanity check). The winner gets locked into the real translate.ts.
const ATTEMPTS: Attempt[] = [
  { label: 'GLTF res coarse',      body: { formatName: 'GLTF', storeInDocument: false, resolution: 'coarse' } },
  { label: 'GLTF res medium',      body: { formatName: 'GLTF', storeInDocument: false, resolution: 'medium' } },
  { label: 'GLTF res fine',        body: { formatName: 'GLTF', storeInDocument: false, resolution: 'fine' } },
  { label: 'GLTF res custom',      body: { formatName: 'GLTF', storeInDocument: false, resolution: 'custom', angleTolerance: 0.1745, chordTolerance: 0.06 } },
  { label: 'OBJ res coarse',       body: { formatName: 'OBJ', storeInDocument: false, resolution: 'coarse' } },
  { label: 'OBJ res medium',       body: { formatName: 'OBJ', storeInDocument: false, resolution: 'medium' } },
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
