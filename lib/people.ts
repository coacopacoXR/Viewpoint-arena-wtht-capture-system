import { useMemo } from 'react';
import { usePresence } from './PresenceContext';
import { useActiveReviewStore } from './activeReviewStore';
import { getIdentity } from './identity';

// A person on the review's team roster. Stored as jsonb on ReviewDraft.
// `id` is a stable key for reordering / editing; `name` is what gets written
// onto cards as the assignee string.
export interface TeamMember {
  id: string;
  name: string;
  role?: string;
  email?: string;
}

// One entry in the assembled assignee list. `inRoom` is true when the person
// is currently in the meeting (presence list or the local user) — the UI
// tags these so the host can see who is live vs. on the roster only.
export interface PeopleOption {
  name: string;
  inRoom: boolean;
  // 'unassigned' | 'room' | 'roster' | 'orphan' — lets the UI group or tag.
  source: 'unassigned' | 'room' | 'roster' | 'orphan';
}

// Assignees on cards/tracker items stay plain strings (`assignee: string`).
// This helper assembles the dropdown list from live sources; it does NOT
// introduce user ids on cards. The boundary is intentional — a name is the
// assignee's identity until a later batch adds real user ids.
// A stable empty array. `?? []` inside a zustand selector builds a NEW array
// on every render whenever the source is null, so the store sees a changed
// snapshot forever and React throws "Maximum update depth exceeded" (error
// #185 — it took down the lobby on 2026-09-22).
const NO_TEAM: TeamMember[] = [];

export function usePeopleOptions(currentAssignee?: string): PeopleOption[] {
  const { remoteParticipantList, localUserId } = usePresence();
  const team = useActiveReviewStore((s) => s.config?.team ?? NO_TEAM);

  return useMemo(() => {
    const result: PeopleOption[] = [{ name: 'Unassigned', inRoom: false, source: 'unassigned' }];
    const seen = new Set<string>(['unassigned']);

    // Local user first among room participants.
    const localIdentity = getIdentity();
    if (localIdentity?.name) {
      const key = localIdentity.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ name: localIdentity.name, inRoom: true, source: 'room' });
      }
    }

    // Remote participants currently in the room.
    for (const p of remoteParticipantList) {
      if (p.userId === localUserId) continue;
      const key = p.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ name: p.name, inRoom: true, source: 'room' });
    }

    // Review's team roster.
    for (const m of team) {
      const key = m.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ name: m.name, inRoom: false, source: 'roster' });
    }

    // Preserve the card's existing value even if it matches nobody — an old
    // assignee must never be silently dropped from the list.
    if (currentAssignee && currentAssignee !== 'Unassigned') {
      const key = currentAssignee.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ name: currentAssignee, inRoom: false, source: 'orphan' });
      }
    }

    return result;
  }, [remoteParticipantList, localUserId, team, currentAssignee]);
}
