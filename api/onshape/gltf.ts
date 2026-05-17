// Streams the GLTF binary for a given Onshape part studio or assembly. The
// frontend feeds the response into parseModelFile() so it reuses the same
// importer pipeline as drag-and-drop uploads.
//
// GET /api/onshape/gltf?d=<documentId>&w=<workspaceId>&e=<elementId>&type=ASSEMBLY|PARTSTUDIO

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callOnshape, applyRefreshedCookies, withAuth } from '../_lib/onshape';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 55_000; // Vercel functions max out at 60s.

// Some assemblies are too complex for the synchronous /gltf endpoint and
// Onshape returns a JSON translation handle instead of binary. We poll the
// translation until it's done, then download the resulting GLB.
async function waitForTranslation(
  req: VercelRequest,
  res: VercelResponse,
  translationId: string,
): Promise<Response> {
  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const { response, refreshedCookies } = await callOnshape(req, `/api/v9/translations/${translationId}`);
    applyRefreshedCookies(res, refreshedCookies);
    if (!response.ok) {
      throw new Error(`Translation status check failed: ${response.status}`);
    }
    const status = await response.json() as { requestState: string; resultExternalDataIds?: string[]; documentId?: string };
    if (status.requestState === 'DONE') {
      const dataId = status.resultExternalDataIds?.[0];
      const did = status.documentId;
      if (!dataId || !did) throw new Error('Translation done but no result data id');
      const dl = await callOnshape(req, `/api/v9/documents/d/${did}/externaldata/${dataId}`);
      applyRefreshedCookies(res, dl.refreshedCookies);
      if (!dl.response.ok) throw new Error(`Translated GLB download failed: ${dl.response.status}`);
      return dl.response;
    }
    if (status.requestState === 'FAILED') {
      throw new Error('Onshape translation failed');
    }
    // ACTIVE / WAITING — keep polling
  }
  throw new Error('Translation timed out');
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

    // Onshape responds with either:
    //  - model/gltf-binary (.glb) directly — the happy path for simple parts.
    //  - application/json describing a pending translation — we then poll.
    const ct = response.headers.get('content-type') || '';
    let finalResponse: Response = response;
    if (ct.includes('application/json')) {
      const handle = await response.json() as { id?: string; requestState?: string };
      if (!handle.id) {
        res.status(502).json({ error: 'onshape_gltf_unknown_response', detail: JSON.stringify(handle).slice(0, 300) });
        return;
      }
      try {
        finalResponse = await waitForTranslation(req, res, handle.id);
      } catch (err) {
        res.status(504).json({ error: 'onshape_gltf_translation_failed', detail: (err as Error).message });
        return;
      }
    }

    const outCt = finalResponse.headers.get('content-type') || 'model/gltf-binary';
    res.setHeader('Content-Type', outCt);
    res.setHeader('Content-Disposition', `inline; filename="onshape-${e}.glb"`);
    const buf = Buffer.from(await finalResponse.arrayBuffer());
    res.status(200).send(buf);
  });
}
