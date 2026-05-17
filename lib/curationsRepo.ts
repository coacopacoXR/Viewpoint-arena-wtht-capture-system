// Supabase-backed persistence for review curations. The whole ReviewDraft
// shape is stored as jsonb columns in the `review_curations` table; the row
// id IS the reviewId, which IS the roomId — so /review/:id/setup and
// /room/:id refer to the same curation across browsers and devices.
//
// NOTE: imported GLB/OBJ files are NOT persisted server-side in v1 — we
// strip `importedFileBase64` before writing. TODO: move uploaded files into
// a Supabase Storage bucket ('review-models', public read) and persist the
// URL instead. Until then, a re-opened curation that previously used an
// uploaded file will fall back to the recorded `modelType` (which is set
// to 'imported' but the file is gone, so ImportedModel renders nothing).
// Consider also writing back the previous preset on strip.

import { supabase } from './supabase';
import type { ReviewDraft } from './reviewSetupStore';

export interface CurationSummary {
  id: string;
  title: string;
  description: string;
  viewpoint_count: number;
  pin_count: number;
  slide_count: number;
  updated_at: string;
  created_at: string;
}

interface CurationRow {
  id: string;
  title: string;
  description: string;
  asset: ReviewDraft['asset'];
  viewpoints: ReviewDraft['viewpoints'];
  pins: ReviewDraft['pins'];
  agenda: ReviewDraft['agenda'];
  created_at: string;
  updated_at: string;
}

function rowToDraft(row: CurationRow): ReviewDraft {
  return {
    reviewId: row.id,
    title: row.title,
    description: row.description,
    asset: row.asset,
    viewpoints: row.viewpoints ?? [],
    pins: row.pins ?? [],
    agenda: row.agenda ?? [],
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

function draftToRow(draft: ReviewDraft) {
  // Strip the large base64 blob — see file header for why.
  const { importedFileBase64: _stripped, ...assetSansBlob } = draft.asset;
  return {
    id: draft.reviewId,
    title: draft.title,
    description: draft.description,
    asset: assetSansBlob,
    viewpoints: draft.viewpoints,
    pins: draft.pins,
    agenda: draft.agenda,
  };
}

export async function loadCuration(id: string): Promise<ReviewDraft | null> {
  const { data, error } = await supabase
    .from('review_curations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[curationsRepo] loadCuration failed:', error);
    return null;
  }
  return data ? rowToDraft(data as CurationRow) : null;
}

export async function saveCuration(draft: ReviewDraft): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('review_curations')
    .upsert(draftToRow(draft), { onConflict: 'id' });
  if (error) {
    console.error('[curationsRepo] saveCuration failed:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function listRecentCurations(limit = 8): Promise<CurationSummary[]> {
  const { data, error } = await supabase
    .from('review_curations')
    .select('id,title,description,viewpoints,pins,agenda,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[curationsRepo] listRecentCurations failed:', error);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    viewpoint_count: Array.isArray(r.viewpoints) ? r.viewpoints.length : 0,
    pin_count: Array.isArray(r.pins) ? r.pins.length : 0,
    slide_count: Array.isArray(r.agenda) ? r.agenda.length : 0,
    updated_at: r.updated_at,
    created_at: r.created_at,
  }));
}

export async function deleteCuration(id: string): Promise<boolean> {
  const { error } = await supabase.from('review_curations').delete().eq('id', id);
  if (error) {
    console.error('[curationsRepo] deleteCuration failed:', error);
    return false;
  }
  return true;
}

// Fetch a single curation summary by id — used when a contributor lands on
// the lobby via a room link and we want to preview what they're joining.
export async function getCurationSummary(id: string): Promise<CurationSummary | null> {
  const { data, error } = await supabase
    .from('review_curations')
    .select('id,title,description,viewpoints,pins,agenda,created_at,updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const r: any = data;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    viewpoint_count: Array.isArray(r.viewpoints) ? r.viewpoints.length : 0,
    pin_count: Array.isArray(r.pins) ? r.pins.length : 0,
    slide_count: Array.isArray(r.agenda) ? r.agenda.length : 0,
    updated_at: r.updated_at,
    created_at: r.created_at,
  };
}

// ─── Live presence ───────────────────────────────────────────────────────────
// Built on Supabase Presence: each contributor opens a channel keyed by the
// curation id, tracks their identity, and receives the full peer list as it
// changes. No table writes — presence state lives only in the channel.

export interface CurationPresence {
  userId: string;
  name: string;
  color: string;
  joinedAt: number;
}

export function trackCurationPresence(
  id: string,
  self: Omit<CurationPresence, 'joinedAt'>,
  onSync: (peers: CurationPresence[]) => void,
): () => void {
  const channel = supabase.channel(`curation-presence:${id}`, {
    config: { presence: { key: self.userId } },
  });
  const emit = () => {
    const raw = channel.presenceState() as Record<string, CurationPresence[]>;
    const flat: CurationPresence[] = [];
    for (const arr of Object.values(raw)) {
      if (arr.length > 0) flat.push(arr[0]);
    }
    flat.sort((a, b) => a.joinedAt - b.joinedAt);
    onSync(flat);
  };
  channel
    .on('presence', { event: 'sync' }, emit)
    .on('presence', { event: 'join' }, emit)
    .on('presence', { event: 'leave' }, emit)
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ ...self, joinedAt: Date.now() });
      }
    });
  return () => { supabase.removeChannel(channel); };
}

export type SyncStatus = 'connecting' | 'live' | 'polling' | 'offline';

// Subscribe to remote changes for a single curation row. Uses Supabase
// Realtime (postgres_changes) when available; falls back to polling every
// 5 seconds if the channel fails to subscribe (e.g., the publication line
// wasn't added to supabase_realtime). The status callback lets the UI
// show whether we're actually receiving live updates.
//
// Returns an unsubscribe function.
export function subscribeCuration(
  id: string,
  onChange: (draft: ReviewDraft) => void,
  onStatus?: (status: SyncStatus) => void,
): () => void {
  let cancelled = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let realtimeOk = false;

  onStatus?.('connecting');

  const startPolling = () => {
    if (pollTimer || cancelled) return;
    onStatus?.(realtimeOk ? 'live' : 'polling');
    pollTimer = setInterval(async () => {
      if (cancelled) return;
      const draft = await loadCuration(id);
      if (!cancelled && draft) onChange(draft);
    }, 5000);
  };

  const stopPolling = () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  };

  const channel = supabase
    .channel(`curation:${id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'review_curations',
        filter: `id=eq.${id}`,
      },
      (payload) => {
        const row = payload.new as CurationRow | null;
        if (!row || !row.id) return;
        onChange(rowToDraft(row));
      },
    )
    .subscribe((status) => {
      // Supabase emits 'SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'.
      if (status === 'SUBSCRIBED') {
        realtimeOk = true;
        stopPolling();             // Realtime live → no need to poll.
        onStatus?.('live');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeOk = false;
        onStatus?.('polling');
        startPolling();            // Degrade gracefully — keep edits flowing.
      }
    });

  // Belt-and-suspenders: if the channel never reports SUBSCRIBED within 3s
  // (publication missing, network blocked, etc.), start polling anyway.
  const watchdog = setTimeout(() => {
    if (!realtimeOk) startPolling();
  }, 3000);

  return () => {
    cancelled = true;
    clearTimeout(watchdog);
    stopPolling();
    supabase.removeChannel(channel);
    onStatus?.('offline');
  };
}
