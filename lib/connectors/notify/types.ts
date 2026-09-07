// NotificationSinkAdapter interface — see docs/plan/02-connector-adapters.md §4.
//
// Every notification destination (Teams, Teamcenter, Jira, email, …) implements
// this interface. A shared contract test suite (notify.contract.test.ts)
// asserts the behavioural guarantees so any implementation — ours or a corp's —
// can be verified against the same checks.

import type { TrackerSession, TrackerItem } from '../../supabase.ts';

export interface NotificationSinkAdapter {
  /** Stable identifier for this sink — e.g. 'teams', 'teamcenter', 'jira'. */
  id: string;

  /**
   * Post a full session summary (session header + all tracker items).
   *
   * Must never accept or return a raw credential (webhook URL, API key, etc.).
   */
  postSession(
    session: TrackerSession,
    items: TrackerItem[],
  ): Promise<{ ok: boolean; error?: string }>;

  /** Post a single tracker item. */
  postItem(item: TrackerItem): Promise<{ ok: boolean; error?: string }>;
}
