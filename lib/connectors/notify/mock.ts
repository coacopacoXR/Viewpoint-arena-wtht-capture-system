// MockNotificationSink — in-memory implementation for contract tests.

import type { NotificationSinkAdapter } from './types.ts';
import type { TrackerSession, TrackerItem } from '../../supabase.ts';

export class MockNotificationSink implements NotificationSinkAdapter {
  id = 'mock';
  postedSessions: Array<{ session: TrackerSession; items: TrackerItem[] }> = [];
  postedItems: TrackerItem[] = [];
  shouldFail = false;

  async postSession(
    session: TrackerSession,
    items: TrackerItem[],
  ): Promise<{ ok: boolean; error?: string }> {
    if (this.shouldFail) return { ok: false, error: 'mock failure' };
    this.postedSessions.push({ session, items });
    return { ok: true };
  }

  async postItem(item: TrackerItem): Promise<{ ok: boolean; error?: string }> {
    if (this.shouldFail) return { ok: false, error: 'mock failure' };
    this.postedItems.push(item);
    return { ok: true };
  }
}
