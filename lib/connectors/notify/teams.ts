// TeamsNotifyAdapter — browser-safe client implementing NotificationSinkAdapter.
//
// All Teams webhook posts go through the server-side Vercel function at
// /api/notify/teams. The webhook URL lives in server-side process.env
// (TEAMS_WEBHOOK_URL) and NEVER reaches this module. No method accepts a
// credential as an argument.
//
// The card-building logic was relocated from the old lib/teamsIntegration.ts
// into api/notify/teams.ts (server-side). This module just sends the raw
// session/items data to the server endpoint.

import type { NotificationSinkAdapter } from './types.ts';
import type { TrackerSession, TrackerItem } from '../../supabase.ts';

type FetchFn = typeof globalThis.fetch;

export class TeamsNotifyAdapter implements NotificationSinkAdapter {
  id = 'teams';

  private _fetch: FetchFn;

  constructor(fetchFn?: FetchFn) {
    this._fetch = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async postSession(
    session: TrackerSession,
    items: TrackerItem[],
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await this._fetch('/api/notify/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'session',
          session,
          items,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const serverError = (data as { error?: string }).error;
        return {
          ok: false,
          error: serverError ?? `Teams notification failed (${res.status})`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async postItem(item: TrackerItem): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await this._fetch('/api/notify/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'item',
          item,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const serverError = (data as { error?: string }).error;
        return {
          ok: false,
          error: serverError ?? `Teams notification failed (${res.status})`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Check whether the Teams integration is configured on the server. */
  async isConfigured(): Promise<boolean> {
    try {
      const res = await this._fetch('/api/notify/teams', { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }
}
