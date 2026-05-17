// Imports an Onshape element as GLB. Uses Onshape's translation API which
// is the more reliable path for both part studios and assemblies — POST to
// kick off a translation, poll status until DONE, then download the binary
// via the documents/externaldata endpoint. The whole dance is wrapped in
// a single request to the browser so the frontend just does one fetch.
//
// GET /api/onshape/gltf?d=<documentId>&w=<workspaceId>&e=<elementId>&type=ASSEMBLY|PARTSTUDIO

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callOnshape, applyRefreshedCookies, withAuth } from '../_lib/onshape.js';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 55_000; // stay inside Vercel's 60s function ceiling

interface TranslationHandle {
  id: string;
  requestState?: string;
}

interface TranslationStatus {
  requestState: 'ACTIVE' | 'PENDING' | 'WAITING' | 'DONE' | 'FAILED' | string;
  resultExternalDataIds?: string[];
  documentId?: string;
  failureReason?: string;
}

async function pollUntilDone(
  req: VercelRequest,
  res: VercelResponse,
  translationId: string,
): Promise<{ documentId: string; dataId: string }> {
  const started = Date.now();
  // Quick first poll — small parts often finish before our 1.5s interval.
  await new Promise((r) => setTimeout(r, 500));
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const { response, refreshedCookies } = await callOnshape(req, `/api/v9/translations/${translationId}`);
    applyRefreshedCookies(res, refreshedCookies);
    if (!response.ok) {
      throw new Error(`Translation status ${response.status}: ${await response.text()}`);
    }
    const status = await response.json() as TranslationStatus;
    if (status.requestState === 'DONE') {
      const dataId = status.resultExternalDataIds?.[0];
      const documentId = status.documentId;
      if (!dataId || !documentId) {
        throw new Error(`Translation done but missing result IDs: ${JSON.stringify(status)}`);
      }
      return { documentId, dataId };
    }
    if (status.requestState === 'FAILED') {
      throw new Error(`Translation failed: ${status.failureReason || 'unknown'}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
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

    // 1) Kick off the translation. GLTF needs glTFVersion + outputFormat
    // ('binary' = .glb). storeInDocument MUST be false because our OAuth
    // scope is read-only (true requires Write). Without glTFVersion /
    // outputFormat set, Onshape returns "Invalid GLTF detail parameters".
    const translationsPath = type === 'ASSEMBLY'
      ? `/api/v9/assemblies/d/${d}/w/${w}/e/${e}/translations`
      : `/api/v9/partstudios/d/${d}/w/${w}/e/${e}/translations`;
    const body: Record<string, unknown> = {
      formatName: 'GLTF',
      storeInDocument: false,
      glTFVersion: '2.0',
      outputFormat: 'binary',
    };
    const start = await callOnshape(req, translationsPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    applyRefreshedCookies(res, start.refreshedCookies);
    if (!start.response.ok) {
      const detail = await start.response.text();
      res.status(start.response.status).json({ error: 'onshape_translation_start_failed', detail: detail.slice(0, 500) });
      return;
    }
    const handle = await start.response.json() as TranslationHandle;
    if (!handle.id) {
      res.status(502).json({ error: 'onshape_translation_no_id', detail: JSON.stringify(handle).slice(0, 300) });
      return;
    }

    // 2) Poll until the translation is done.
    let target: { documentId: string; dataId: string };
    try {
      target = await pollUntilDone(req, res, handle.id);
    } catch (err) {
      res.status(504).json({ error: 'onshape_translation_failed', detail: (err as Error).message.slice(0, 500) });
      return;
    }

    // 3) Download the resulting GLB binary.
    const dl = await callOnshape(req, `/api/v9/documents/d/${target.documentId}/externaldata/${target.dataId}`);
    applyRefreshedCookies(res, dl.refreshedCookies);
    if (!dl.response.ok) {
      const detail = await dl.response.text();
      res.status(dl.response.status).json({ error: 'onshape_download_failed', detail: detail.slice(0, 500) });
      return;
    }
    const buf = Buffer.from(await dl.response.arrayBuffer());
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Content-Disposition', `inline; filename="onshape-${e}.glb"`);
    res.status(200).send(buf);
  });
}
