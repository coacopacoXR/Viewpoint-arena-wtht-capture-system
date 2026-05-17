// Kicks off an Onshape GLTF translation and returns the translation handle.
// The browser polls /api/onshape/translate-status and then downloads via
// /api/onshape/translate-download. Splitting into three tiny endpoints
// (instead of one long-running 'fetch gltf' function) sidesteps Vercel's
// 60-second function ceiling for big assemblies that take minutes to
// translate.
//
// GET /api/onshape/translate?d=<documentId>&w=<workspaceId>&e=<elementId>&type=ASSEMBLY|PARTSTUDIO

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callOnshape, applyRefreshedCookies, withAuth } from '../_lib/onshape.js';

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

    const { response, refreshedCookies } = await callOnshape(req, path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formatName: 'GLTF', storeInDocument: false }),
    });
    applyRefreshedCookies(res, refreshedCookies);
    if (!response.ok) {
      const detail = await response.text();
      res.status(response.status).json({ error: 'translation_start_failed', detail: detail.slice(0, 500) });
      return;
    }
    const handle = await response.json() as { id?: string };
    if (!handle.id) {
      res.status(502).json({ error: 'translation_no_id' });
      return;
    }
    res.status(200).json({ id: handle.id });
  });
}
