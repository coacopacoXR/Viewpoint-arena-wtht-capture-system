// Lists the user's Onshape documents. Supports optional ?q=<search> and
// ?limit=<n>. Mirrors Onshape's /api/v9/documents response with light
// trimming so we don't ship the whole giant payload to the browser.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callOnshape, applyRefreshedCookies, withAuth } from '../_lib/onshape';

interface OnshapeDocSummary {
  id: string;
  name: string;
  modifiedAt: string;
  createdAt: string;
  href: string;
  thumbnail?: { sizes?: { size: string; href: string }[] };
  defaultWorkspace?: { id: string; name: string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withAuth(res, async () => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const params = new URLSearchParams({ limit: String(limit), filter: '0' /* my documents */ });
    if (q) params.set('q', q);
    const path = `/api/v9/documents?${params.toString()}`;

    const { response, refreshedCookies } = await callOnshape(req, path);
    applyRefreshedCookies(res, refreshedCookies);
    if (!response.ok) {
      res.status(response.status).json({ error: 'onshape_api_error', detail: await response.text() });
      return;
    }
    const data = await response.json() as { items: OnshapeDocSummary[]; next?: string };
    const trimmed = (data.items || []).map((d) => ({
      id: d.id,
      name: d.name,
      modifiedAt: d.modifiedAt,
      createdAt: d.createdAt,
      href: d.href,
      thumbnail: d.thumbnail?.sizes?.[0]?.href,
      defaultWorkspaceId: d.defaultWorkspace?.id,
      defaultWorkspaceName: d.defaultWorkspace?.name,
    }));
    res.status(200).json({ items: trimmed });
  });
}
