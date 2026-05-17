// Lists the elements (part studios + assemblies) inside a document workspace.
// The frontend uses this to populate the "pick something to import" list.
//
// GET /api/onshape/elements?d=<documentId>&w=<workspaceId>

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callOnshape, applyRefreshedCookies, withAuth } from '../_lib/onshape';

interface OnshapeElement {
  id: string;
  name: string;
  type: 'PARTSTUDIO' | 'ASSEMBLY' | 'DRAWING' | 'BLOB' | string;
  elementType: string;
  microversionId?: string;
  thumbnailInfo?: { sizes?: { size: string; href: string }[] };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withAuth(res, async () => {
    const d = typeof req.query.d === 'string' ? req.query.d : '';
    const w = typeof req.query.w === 'string' ? req.query.w : '';
    if (!d || !w) {
      res.status(400).json({ error: 'Missing d (document id) or w (workspace id)' });
      return;
    }

    const { response, refreshedCookies } = await callOnshape(req, `/api/v9/documents/d/${d}/w/${w}/elements`);
    applyRefreshedCookies(res, refreshedCookies);
    if (!response.ok) {
      res.status(response.status).json({ error: 'onshape_api_error', detail: await response.text() });
      return;
    }
    const items = await response.json() as OnshapeElement[];
    const trimmed = items
      .filter((e) => e.type === 'ASSEMBLY' || e.type === 'PARTSTUDIO')
      .map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        thumbnail: e.thumbnailInfo?.sizes?.[0]?.href,
      }));
    res.status(200).json({ items: trimmed });
  });
}
