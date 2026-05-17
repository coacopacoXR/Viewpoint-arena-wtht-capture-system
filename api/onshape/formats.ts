// Debug helper: returns Onshape's full list of available translation formats
// for the authenticated user. Used to discover the correct formatName and
// valid params for GLTF / GLB so we can build a request Onshape accepts.
//
// GET /api/onshape/formats

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callOnshape, applyRefreshedCookies, withAuth } from '../_lib/onshape.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withAuth(res, async () => {
    const { response, refreshedCookies } = await callOnshape(req, '/api/v9/translations/formats');
    applyRefreshedCookies(res, refreshedCookies);
    if (!response.ok) {
      res.status(response.status).json({ error: 'onshape_formats_failed', detail: await response.text() });
      return;
    }
    res.status(200).json(await response.json());
  });
}
