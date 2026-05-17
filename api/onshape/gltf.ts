// Streams the GLTF binary for a given Onshape part studio or assembly. The
// frontend feeds the response into parseModelFile() so it reuses the same
// importer pipeline as drag-and-drop uploads.
//
// GET /api/onshape/gltf?d=<documentId>&w=<workspaceId>&e=<elementId>&type=ASSEMBLY|PARTSTUDIO

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callOnshape, applyRefreshedCookies, withAuth } from '../_lib/onshape';

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

    const base = type === 'ASSEMBLY'
      ? `/api/v9/assemblies/d/${d}/w/${w}/e/${e}/gltf`
      : `/api/v9/partstudios/d/${d}/w/${w}/e/${e}/gltf`;

    const { response, refreshedCookies } = await callOnshape(req, base, {
      headers: { 'Accept': 'model/gltf-binary;qs=0.9, model/gltf+json;qs=0.5' },
    });
    applyRefreshedCookies(res, refreshedCookies);
    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: 'onshape_gltf_failed', detail: text.slice(0, 500) });
      return;
    }

    const ct = response.headers.get('content-type') || 'model/gltf-binary';
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `inline; filename="onshape-${e}.glb"`);
    const buf = Buffer.from(await response.arrayBuffer());
    res.status(200).send(buf);
  });
}
