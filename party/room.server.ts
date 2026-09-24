import type * as Party from 'partykit/server';
import type { InsightCard, SpatialComment, LiveChatMessage, XRParticipantData } from '../types';
import type { ReviewDraft } from '../lib/reviewSetupStore';

export type WebRTCSignalData =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate?: RTCIceCandidateInit };

export interface ParticipantPresence {
  userId: string;
  name: string;
  color: string;
  position: [number, number, number];
  lookAt: [number, number, number];
  sameRoom?: boolean;
  // Who this client's camera is locked to, and whether they are mid-nudge
  // (dragging their own view without leaving the follow). Optional so an
  // older client's payload stays valid — a missing field means "not following".
  followingUserId?: string | null;
  followNudged?: boolean;
  // True when this person is in the room without an account, on a deployment
  // whose identity block allows guests. Carried as a flag rather than baked
  // into `name`, so the suffix a UI adds never reaches stored data (tracker
  // items, audit rows, transcripts). Optional: an older client sends nothing,
  // which reads as "not a guest" — the only answer possible before identity.
  guest?: boolean;
}

type RoomMessage =
  | { type: 'PRESENCE'; payload: ParticipantPresence }
  | { type: 'LEAVE'; payload: { userId: string } }
  | { type: 'ROSTER'; payload: ParticipantPresence[] }
  | { type: 'PRESENTER_CHANGE'; payload: { agentId: string | null } }
  | { type: 'INSIGHT_CARD'; payload: InsightCard }
  | { type: 'LEADER_CHANGE'; payload: { userId: string | null } }
  | { type: 'BOARDROOM_COUNTDOWN'; payload: Record<string, never> }
  | { type: 'BOARDROOM_STATE'; payload: { active: boolean; leaderId: string | null; takeover: { enabled: boolean; approvedUserIds: string[] } } }
  | { type: 'ARENA_ENTRY'; payload: Record<string, never> }
  | { type: 'LASER_MOVE'; payload: { userId: string; position: [number, number, number] | null; targetId?: string | null; targetMeshName?: string | null; targetPartName?: string | null } }
  | { type: 'PRIVACY_MODE'; payload: { enabled: boolean } }
  | { type: 'LEADER_TAKEOVER'; payload: { userId: string } }
  | { type: 'MODEL_CHANGE'; payload: { modelType: 'synth' | 'bicycle' | 'imported'; fileBase64?: string; fileName?: string } }
  | { type: 'REVIEW_CONFIG'; payload: { config: ReviewDraft } }
  | { type: 'HOST_CHANGE'; payload: { hostId: string | null } }
  | { type: 'HOST_TRANSFER'; payload: { toUserId: string } }
  | { type: 'MEETING_END'; payload: Record<string, never> }
  | { type: 'TAKEOVER_SYNC'; payload: { enabled: boolean; approvedUserIds: string[] } }
  | { type: 'PRESENTER_REQUEST'; payload: { fromUserId: string; fromName: string } }
  | { type: 'PRESENTER_REQUEST_DENIED'; payload: { fromUserId: string } }
  | { type: 'TAKEOVER_ATTEMPT'; payload: { userId: string } }
  | { type: 'PRESENTER_CHANGED'; payload: { userId: string } }
  | { type: 'COMMENT_ADD'; payload: { comment: SpatialComment } }
  | { type: 'COMMENT_UPDATE'; payload: { id: string; updates: Partial<SpatialComment> } }
  | { type: 'COMMENT_DELETE'; payload: { id: string } }
  | { type: 'COMMENT_RESOLVE'; payload: { id: string } }
  | { type: 'COMMENT_ROSTER'; payload: { comments: SpatialComment[] } }
  | { type: 'WEBRTC_SIGNAL'; payload: { from: string; to: string; data: unknown } }
  | { type: 'LIVE_CHAT'; payload: LiveChatMessage }
  | { type: 'XR_PRESENCE'; payload: XRParticipantData }
  | { type: 'TRANSCRIPT_LINE'; payload: { id: string; agentId: string; text: string; timestamp: number; speakerName?: string; speakerId?: string; offsetMs?: number } }
  | { type: 'RECORDING_STATE'; payload: { recording: boolean; startedAt: number; byUserId: string; byName: string } }
  | { type: 'POINTING_SEGMENT'; payload: { userId: string; userName: string; partId: string; partName: string; source: 'laser' | 'finger' | 'hover'; fromMs: number; toMs: number } }
  | { type: 'ADMIT'; payload: { userId: string } }
  | { type: 'DECLINE'; payload: { userId: string } }
  | { type: 'SET_JOIN_POLICY'; payload: { policy: 'open' | 'ask' } }
  | { type: 'JOIN_PENDING'; payload: Record<string, never> }
  | { type: 'JOIN_ADMITTED'; payload: Record<string, never> }
  | { type: 'JOIN_DECLINED'; payload: Record<string, never> }
  | { type: 'JOIN_REQUESTS'; payload: { pending: Array<{ userId: string; name: string; since: number; guest?: boolean }> } }
  | { type: 'JOIN_POLICY'; payload: { policy: 'open' | 'ask' } };

const PRESENTER_COOLDOWN = 1500; // ms — server-authoritative cooldown between presenter changes

// Where the admitted set is kept between restarts, and how many of the most
// recent admissions are worth keeping.
const ADMITTED_KEY = 'admitted-user-ids';
const MAX_PERSISTED_ADMISSIONS = 200;

export default class RoomServer implements Party.Server {
  participants = new Map<string, ParticipantPresence>();
  // Ordered by first PRESENCE — index 0 is always the session host
  joinOrder: string[] = [];
  // Maps PartyKit connection ID → app userId (populated on first PRESENCE from that conn)
  connToUser = new Map<string, string>();
  // Server-authoritative presenter tracking (boardroom)
  boardroomLeaderId: string | null = null;
  lastPresenterChange = 0;
  // Takeover-mode policy — held server-side so late joiners get a consistent view
  takeoverModeEnabled = false;
  takeoverApprovedUserIds: string[] = [];
  // Persisted model state for late joiners
  currentModel: { modelType: string; fileBase64?: string; fileName?: string } | null = null;
  // Persisted curated review config (viewpoints, pins, agenda…)
  reviewConfig: ReviewDraft | null = null;
  // Persisted spatial comments for late joiners
  comments: SpatialComment[] = [];
  // Whether the room is currently in boardroom mode — sent to late joiners
  isBoardroomMode = false;
  // Persisted recording state for late joiners (section B: per-speaker mics).
  // Null when no recording is in progress.
  recordingState: { recording: boolean; startedAt: number; byUserId: string; byName: string } | null = null;
  // Per-link join policy. 'ask' (default) means new arrivals must be admitted
  // by the host; 'open' lets anyone through. NOT persisted to Supabase in
  // batch M2 — a PartyKit room that hibernates comes back at 'ask', which is
  // the safe direction.
  joinPolicy: 'open' | 'ask' = 'ask';
  // UserIds that have been admitted through the knock gate.
  admitted = new Set<string>();
  // Pending knock queue: userId → { userId, name, since }.
  pending = new Map<string, { userId: string; name: string; since: number; guest?: boolean }>();
  // Live connection objects keyed by connection id, for targeted sends.
  connections = new Map<string, Party.Connection>();
  // Connection ids that have already been told they are in and handed the
  // room state, so a reconnect gets it once and a chatty client does not
  // get the whole bundle on every PRESENCE.
  stateSent = new Set<string>();
  // Whether we have already logged that audit is not configured (ANON_KEY
  // empty). Logged once per server instance, not per admission.
  private auditNotConfiguredLogged = false;

  constructor(readonly room: Party.Room) {}

  /**
   * Admissions outlive a restart of this server.
   *
   * Everything else here is deliberately in-memory: a room that comes back
   * empty is a room nobody is in. The admitted set is different, because the
   * container is restarted for upgrades while meetings are running, and
   * without this the first person to reconnect becomes host and everyone else
   * lands back in the queue — the host re-admitting colleagues who never left
   * (seen live 2026-09-23: guest bounced to the waiting room, host shown
   * "Maria wants to join" for someone already in the meeting).
   *
   * onStart runs before the first connection, so the set is restored before
   * any knock is judged. Storage is per room and persisted to the volume the
   * compose file already mounts; if it is unavailable, every path below
   * behaves exactly as it did before, which is the pre-restart-safety
   * behaviour rather than a broken one.
   *
   * The join policy is NOT restored: it goes back to 'ask', which is the safe
   * direction, and a host who wanted an open link can say so again.
   */
  async onStart() {
    try {
      const saved = await this.room.storage.get<string[]>(ADMITTED_KEY);
      if (Array.isArray(saved)) {
        for (const userId of saved) {
          if (typeof userId === 'string' && userId) this.admitted.add(userId);
        }
      }
    } catch {
      // No storage on this runtime — carry on with an empty set.
    }
  }

  /**
   * Write the admitted set back. Fire-and-forget: an admission must not wait
   * on a disk write, and a failed write costs a re-admission after a restart,
   * not a broken room. Capped so a long-lived room cannot grow it without
   * bound; a Set keeps insertion order, so the oldest go first.
   */
  private persistAdmitted(): void {
    try {
      const ids = [...this.admitted].slice(-MAX_PERSISTED_ADMISSIONS);
      void this.room.storage.put(ADMITTED_KEY, ids).catch(() => {});
    } catch {
      // No storage on this runtime.
    }
  }

  private computeHost(): string | null {
    return this.joinOrder[0] ?? null;
  }

  private boardroomStatePayload() {
    return {
      active: this.isBoardroomMode,
      leaderId: this.boardroomLeaderId,
      takeover: {
        enabled: this.takeoverModeEnabled,
        approvedUserIds: this.takeoverApprovedUserIds,
      },
    };
  }

  private resetBoardroomState() {
    this.isBoardroomMode = false;
    this.boardroomLeaderId = null;
    this.takeoverModeEnabled = false;
    this.takeoverApprovedUserIds = [];
    this.lastPresenterChange = 0;
  }

  private sendRoomState(conn: Party.Connection) {
    conn.send(JSON.stringify({
      type: 'ROSTER',
      payload: Array.from(this.participants.values()),
    } as RoomMessage));
    conn.send(JSON.stringify({
      type: 'HOST_CHANGE',
      payload: { hostId: this.computeHost() },
    } as RoomMessage));
    if (this.currentModel) {
      conn.send(JSON.stringify({ type: 'MODEL_CHANGE', payload: this.currentModel } as RoomMessage));
    }
    if (this.reviewConfig) {
      conn.send(JSON.stringify({ type: 'REVIEW_CONFIG', payload: { config: this.reviewConfig } } as RoomMessage));
    }
    conn.send(JSON.stringify({ type: 'COMMENT_ROSTER', payload: { comments: this.comments } } as RoomMessage));
    conn.send(JSON.stringify({
      type: 'BOARDROOM_STATE',
      payload: this.boardroomStatePayload(),
    } as RoomMessage));
    if (this.recordingState) {
      conn.send(JSON.stringify({
        type: 'RECORDING_STATE',
        payload: this.recordingState,
      } as RoomMessage));
    }
  }

  /**
   * Relay to the room — admitted connections only.
   *
   * `room.broadcast` reaches every open socket, which quietly undoes the gate:
   * a person parked at the door was receiving other people's PRESENCE, and by
   * the same route would have received the live transcript, the comments and
   * the pointing segments of a meeting nobody had let them into (found live
   * 2026-09-23 by reading the guest's websocket frames). Every relay goes
   * through here instead, so admission is the single thing that decides what
   * leaves the server. The only exception is JOIN_POLICY, which is not room
   * content and which the waiting room itself describes.
   */
  private relay(data: string, without: string[] = []) {
    const excluded = [...without];
    for (const connId of this.connections.keys()) {
      const uid = this.connToUser.get(connId);
      if (!uid || !this.admitted.has(uid)) excluded.push(connId);
    }
    this.room.broadcast(data, excluded);
  }

  private broadcastJoinRequests() {
    const list = Array.from(this.pending.values());
    const hostId = this.computeHost();
    if (!hostId) return;
    for (const [connId, userId] of this.connToUser) {
      if (userId === hostId && this.admitted.has(userId)) {
        const conn = this.connections.get(connId);
        if (conn) {
          conn.send(JSON.stringify({
            type: 'JOIN_REQUESTS',
            payload: { pending: list },
          } as RoomMessage));
        }
      }
    }
  }

  private sendToUser(userId: string, msg: RoomMessage) {
    const json = JSON.stringify(msg);
    for (const [connId, uid] of this.connToUser) {
      if (uid === userId) {
        const conn = this.connections.get(connId);
        if (conn) conn.send(json);
      }
    }
  }

  /**
   * Tell every connection of an admitted userId that it is in, and hand it the
   * room state — once per connection. JOIN_ADMITTED goes first so the client
   * can leave the waiting room before the state arrives.
   *
   * Every admitted connection must hear this, not just a brand new
   * participant: a reload or a dropped socket reconnects with the same userId,
   * which is already in `admitted`, and the client's join state starts again at
   * 'joining' on the new socket. Without this the host who refreshes their own
   * room sits on "Connecting…" for ever (found live 2026-09-23).
   */
  private deliverAdmission(userId: string) {
    for (const [connId, uid] of this.connToUser) {
      if (uid !== userId || this.stateSent.has(connId)) continue;
      const conn = this.connections.get(connId);
      if (!conn) continue;
      this.stateSent.add(connId);
      conn.send(JSON.stringify({ type: 'JOIN_ADMITTED', payload: {} } as RoomMessage));
      this.sendRoomState(conn);
    }
  }

  /**
   * Record a grant event (admission, decline, policy change) to the audit
   * table via PostgREST. Fire-and-forget: a failed write must never delay or
   * block an admission. When ANON_KEY is empty, skip silently (one log line
   * per server instance, not per event).
   */
  private audit(
    action: string,
    fields: {
      actorName?: string;
      actorId?: string;
      subjectName?: string;
      subjectId?: string;
      detail?: string;
    },
  ): void {
    // `room.env`, not `process.env`: room code runs inside workerd, which does
    // not inherit the container's environment. PartyKit puts `--var` values
    // here (deploy/partykit-entrypoint.sh passes them). process.env stays as a
    // fallback for tests and for any runtime that does populate it.
    const env = (this.room as unknown as { env?: Record<string, string | undefined> }).env ?? {};
    const anonKey = env.ANON_KEY ?? process.env.ANON_KEY;
    if (!anonKey) {
      if (!this.auditNotConfiguredLogged) {
        this.auditNotConfiguredLogged = true;
        console.log('[audit] ANON_KEY not set — audit log disabled for this room server');
      }
      return;
    }
    // PostgREST serves its tables at the ROOT. `/rest/v1/` is the prefix
    // nginx-proxy rewrites away for the browser, and posting to it from
    // inside the compose network is a 404 — which a fire-and-forget write
    // would have swallowed for ever (checked against the running container).
    const restUrl = (env.REST_URL || process.env.REST_URL || 'http://rest:3000').replace(/\/+$/, '');
    try {
      void fetch(`${restUrl}/audit_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          action,
          room_id: this.room.id,
          actor_name: fields.actorName ?? '',
          actor_id: fields.actorId ?? '',
          subject_name: fields.subjectName ?? '',
          subject_id: fields.subjectId ?? '',
          detail: fields.detail ?? '',
        }),
      }).catch(() => {});
    } catch {
      // Synchronous throw from fetch (network down, stub in tests): swallow.
    }
  }

  onConnect(conn: Party.Connection) {
    this.connections.set(conn.id, conn);
    // Before the connection has identified itself via PRESENCE we can only
    // send the current join policy. The full room state bundle is deferred
    // until the connection is admitted through the knock gate.
    conn.send(JSON.stringify({
      type: 'JOIN_POLICY',
      payload: { policy: this.joinPolicy },
    } as RoomMessage));
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: RoomMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    // Map the connection to its userId early so the gate and onClose agree.
    // PRESENCE is the only message that establishes this mapping; LEAVE only
    // needs it for cleanup, and is also allowed through the gate.
    if (msg.type === 'PRESENCE') {
      this.connToUser.set(sender.id, msg.payload.userId);
    }

    // Knock gate: a connection that has not been admitted may only send
    // PRESENCE (the knock itself) and LEAVE. Everything else is dropped.
    const senderUserId = this.connToUser.get(sender.id);
    if (senderUserId && !this.admitted.has(senderUserId) && msg.type !== 'PRESENCE' && msg.type !== 'LEAVE') {
      return;
    }

    if (msg.type === 'PRESENCE') {
      const { userId, name } = msg.payload;

      // Already admitted — normal presence update, relay to others.
      if (this.admitted.has(userId)) {
        const isNew = !this.participants.has(userId);
        this.participants.set(userId, msg.payload);

        // A reconnecting connection (reload, dropped socket) is admitted
        // already but has been told nothing yet. No-op once it has.
        this.deliverAdmission(userId);

        if (isNew) {
          this.joinOrder.push(userId);
          this.relay(JSON.stringify({
            type: 'HOST_CHANGE',
            payload: { hostId: this.computeHost() },
          } as RoomMessage));
        }

        this.relay(JSON.stringify(msg), [sender.id]);
        return;
      }

      // Not yet admitted — apply the knock-gate rules.

      // Expire stale pending entries (older than 5 minutes) while we're here.
      const now = Date.now();
      for (const [pid, entry] of this.pending) {
        if (now - entry.since > 5 * 60 * 1000) {
          this.pending.delete(pid);
        }
      }

      // Rule 1: open policy → admit immediately.
      // Rule 2: nobody is in the room → admit immediately, and this userId
      //         becomes the host (it is first in joinOrder). Two cases, one
      //         rule: the very first arrival has nobody to ask, and a waiter
      //         whose host closed the tab would otherwise wait forever.
      //         Keyed on live participants, NOT on `admitted` — that set keeps
      //         past admissions so a reload does not need re-admitting, and so
      //         it never empties.
      if (this.joinPolicy === 'open' || this.participants.size === 0) {
        this.admitted.add(userId);
        this.persistAdmitted();
        this.pending.delete(userId);

        // Now treat this as a normal first PRESENCE for an admitted user.
        const isNew = !this.participants.has(userId);
        this.participants.set(userId, msg.payload);

        if (isNew) {
          this.joinOrder.push(userId);
        }

        this.deliverAdmission(userId);

        // Broadcast presence to the rest of the room (normal join).
        this.relay(JSON.stringify(msg), [sender.id]);

        if (isNew) {
          this.relay(JSON.stringify({
            type: 'HOST_CHANGE',
            payload: { hostId: this.computeHost() },
          } as RoomMessage));
        }

        // If the queue changed, tell the host.
        this.broadcastJoinRequests();
        return;
      }

      // Rule 3: park in pending. Idempotent — only notify the host when the
      // entry is new or what the knock prompt shows them changed.
      const guest = msg.payload.guest === true;
      const existing = this.pending.get(userId);
      if (!existing || existing.name !== name || (existing.guest ?? false) !== guest) {
        this.pending.set(userId, { userId, name, since: existing?.since ?? now, guest });
        this.sendToUser(userId, { type: 'JOIN_PENDING', payload: {} });
        this.broadcastJoinRequests();
      }

    } else if (msg.type === 'ADMIT') {
      // Host-only: admit a pending userId.
      const senderId = this.connToUser.get(sender.id);
      if (senderId !== this.computeHost() || !this.admitted.has(senderId)) return;

      const { userId } = msg.payload;
      const pendingEntry = this.pending.get(userId);
      if (!pendingEntry) return;
      const subjectName = pendingEntry.name;
      this.pending.delete(userId);
      this.admitted.add(userId);
      this.persistAdmitted();

      this.deliverAdmission(userId);

      // Audit: host admitted someone.
      const hostPresence = this.participants.get(senderId);
      this.audit('admitted', {
        actorName: hostPresence?.name ?? '',
        actorId: senderId,
        subjectName,
        subjectId: userId,
      });

      // Broadcast a synthetic PRESENCE so the room sees the new participant.
      // We don't have the full presence payload here, but the newly admitted
      // client will send its own PRESENCE on the next animation frame.
      this.broadcastJoinRequests();

    } else if (msg.type === 'DECLINE') {
      // Host-only: decline a pending userId.
      const senderId = this.connToUser.get(sender.id);
      if (senderId !== this.computeHost() || !this.admitted.has(senderId)) return;

      const { userId } = msg.payload;
      const pendingEntry = this.pending.get(userId);
      if (!pendingEntry) return;
      const subjectName = pendingEntry.name;
      this.pending.delete(userId);

      // Audit: host declined someone.
      const hostPresence = this.participants.get(senderId);
      this.audit('declined', {
        actorName: hostPresence?.name ?? '',
        actorId: senderId,
        subjectName,
        subjectId: userId,
      });

      this.sendToUser(userId, { type: 'JOIN_DECLINED', payload: {} });
      this.broadcastJoinRequests();

    } else if (msg.type === 'SET_JOIN_POLICY') {
      // Host-only: change the join policy.
      const senderId = this.connToUser.get(sender.id);
      if (senderId !== this.computeHost() || !this.admitted.has(senderId)) return;

      this.joinPolicy = msg.payload.policy;

      // Audit: host changed the join policy.
      const hostPresence = this.participants.get(senderId);
      this.audit('join_policy', {
        actorName: hostPresence?.name ?? '',
        actorId: senderId,
        detail: this.joinPolicy,
      });

      // Switching to 'open' drains the queue — admit everyone pending.
      if (this.joinPolicy === 'open') {
        for (const [userId] of this.pending) {
          this.pending.delete(userId);
          this.admitted.add(userId);
          this.persistAdmitted();
          this.deliverAdmission(userId);
        }
      }

      // Everyone, waiters included: the policy is what the waiting room and
      // the invite popup describe, and it is not room content.
      this.room.broadcast(JSON.stringify({
        type: 'JOIN_POLICY',
        payload: { policy: this.joinPolicy },
      } as RoomMessage));
      this.broadcastJoinRequests();

    } else if (msg.type === 'HOST_TRANSFER') {
      // Move target to front of join order → they become new host
      const { toUserId } = msg.payload;
      this.joinOrder = [toUserId, ...this.joinOrder.filter(id => id !== toUserId)];
      this.relay(JSON.stringify({
        type: 'HOST_CHANGE',
        payload: { hostId: this.computeHost() },
      } as RoomMessage));

    } else if (msg.type === 'LEADER_TAKEOVER') {
      // Host-initiated presenter change (or accepted request). Authoritative on the
      // server so the sender + every other client end up agreeing on the leader.
      const { userId } = msg.payload;
      // Allow only if the requested user is actually a known participant — guards
      // against stale UI clicks for users who just left.
      if (!this.participants.has(userId)) return;
      this.boardroomLeaderId = userId;
      this.lastPresenterChange = Date.now();
      // Broadcast to ALL connections (no exclude) so the sender's UI updates too.
      this.relay(JSON.stringify(msg));

    } else if (msg.type === 'TAKEOVER_ATTEMPT') {
      // Server validates cooldown + approval and broadcasts authoritative
      // PRESENTER_CHANGED to ALL clients (including the attempter).
      const now = Date.now();
      const { userId } = msg.payload;
      if (
        this.takeoverModeEnabled &&
        this.takeoverApprovedUserIds.includes(userId) &&
        this.participants.has(userId) &&
        userId !== this.boardroomLeaderId &&
        now - this.lastPresenterChange > PRESENTER_COOLDOWN
      ) {
        this.boardroomLeaderId = userId;
        this.lastPresenterChange = now;
        this.relay(JSON.stringify({
          type: 'PRESENTER_CHANGED',
          payload: { userId },
        } as RoomMessage));
      }
      // If gated out (cooldown, not approved, already presenter), silently ignore

    } else if (msg.type === 'TAKEOVER_SYNC') {
      // Host-driven policy update. Persist on the server so late joiners and
      // re-entries see a consistent state, and prune stale userIds.
      const { enabled, approvedUserIds } = msg.payload;
      this.takeoverModeEnabled = enabled;
      this.takeoverApprovedUserIds = approvedUserIds.filter(id => this.participants.has(id));
      // Echo the pruned list to everyone so clients stay in lock-step
      this.relay(JSON.stringify({
        type: 'TAKEOVER_SYNC',
        payload: { enabled: this.takeoverModeEnabled, approvedUserIds: this.takeoverApprovedUserIds },
      } as RoomMessage));

    } else if (msg.type === 'MODEL_CHANGE') {
      this.currentModel = msg.payload;
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'REVIEW_CONFIG') {
      this.reviewConfig = msg.payload.config;
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_ADD') {
      this.comments.push(msg.payload.comment);
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_UPDATE') {
      const { id, updates } = msg.payload;
      const idx = this.comments.findIndex((c) => c.id === id);
      if (idx !== -1) {
        this.comments[idx] = { ...this.comments[idx], ...updates };
      }
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_DELETE') {
      this.comments = this.comments.filter((c) => c.id !== msg.payload.id);
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_RESOLVE') {
      const idx = this.comments.findIndex((c) => c.id === msg.payload.id);
      if (idx !== -1) {
        this.comments[idx] = { ...this.comments[idx], resolved: true };
      }
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'WEBRTC_SIGNAL') {
      // Relay to all peers; client filters by `to` field
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'BOARDROOM_COUNTDOWN') {
      // Seed boardroom state. Leader defaults to the current host until someone
      // is explicitly promoted via LEADER_TAKEOVER or TAKEOVER_ATTEMPT.
      this.isBoardroomMode = true;
      this.boardroomLeaderId = this.computeHost();
      // Clean slate for takeover policy each entry — host re-enables explicitly
      this.takeoverModeEnabled = false;
      this.takeoverApprovedUserIds = [];
      this.lastPresenterChange = Date.now();
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'ARENA_ENTRY') {
      // Leaving boardroom — wipe all boardroom state so the next entry is clean
      this.resetBoardroomState();
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'RECORDING_STATE') {
      // Persist for late joiners. Only the host should send this, but the
      // server does not enforce that — the client-side RecordingContext
      // gates it behind canRecord (host-only). Broadcasting to ALL (no
      // exclude) so the sender's own indicator stays in sync.
      this.recordingState = msg.payload;
      this.relay(JSON.stringify(msg));

    } else if (msg.type === 'TRANSCRIPT_LINE') {
      // Server-authoritative speaker stamp: overwrite speakerId with the
      // connection's own userId so nobody can forge a line as somebody
      // else. This closes a hole that existed before section B — the old
      // passthrough relay trusted the client-supplied speakerName/id.
      const userId = this.connToUser.get(sender.id);
      if (userId) {
        msg.payload.speakerId = userId;
      }
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'POINTING_SEGMENT') {
      // Same trust model as TRANSCRIPT_LINE: the server stamps userId from
      // the connection so one client cannot forge segments as another.
      const userId = this.connToUser.get(sender.id);
      if (userId) {
        msg.payload.userId = userId;
      }
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (
      msg.type === 'PRESENTER_CHANGE' ||
      msg.type === 'INSIGHT_CARD' ||
      msg.type === 'LEADER_CHANGE' ||
      msg.type === 'LASER_MOVE' ||
      msg.type === 'PRIVACY_MODE' ||
      msg.type === 'MEETING_END' ||
      msg.type === 'PRESENTER_REQUEST' ||
      msg.type === 'PRESENTER_REQUEST_DENIED' ||
      msg.type === 'LIVE_CHAT' ||
      msg.type === 'XR_PRESENCE'
    ) {
      this.relay(JSON.stringify(msg), [sender.id]);
    }
  }

  onClose(conn: Party.Connection) {
    this.connections.delete(conn.id);
    this.stateSent.delete(conn.id);
    const userId = this.connToUser.get(conn.id);
    this.connToUser.delete(conn.id);

    // Drop any pending knock entry for this connection.
    if (userId) {
      const wasPending = this.pending.has(userId);
      this.pending.delete(userId);
      if (wasPending) {
        this.broadcastJoinRequests();
      }
    }

    if (!userId || !this.participants.has(userId)) return;

    this.participants.delete(userId);
    this.joinOrder = this.joinOrder.filter(id => id !== userId);

    // Prune the leaving user out of any boardroom approvals/leadership so the
    // remaining room doesn't chase a ghost.
    let takeoverChanged = false;
    if (this.takeoverApprovedUserIds.includes(userId)) {
      this.takeoverApprovedUserIds = this.takeoverApprovedUserIds.filter(id => id !== userId);
      takeoverChanged = true;
    }

    let leaderChanged = false;
    if (this.boardroomLeaderId === userId) {
      this.boardroomLeaderId = this.computeHost();
      this.lastPresenterChange = Date.now();
      leaderChanged = true;
    }

    this.relay(JSON.stringify({
      type: 'LEAVE',
      payload: { userId },
    } as RoomMessage));

    this.relay(JSON.stringify({
      type: 'HOST_CHANGE',
      payload: { hostId: this.computeHost() },
    } as RoomMessage));

    if (takeoverChanged) {
      this.relay(JSON.stringify({
        type: 'TAKEOVER_SYNC',
        payload: { enabled: this.takeoverModeEnabled, approvedUserIds: this.takeoverApprovedUserIds },
      } as RoomMessage));
    }

    if (leaderChanged && this.boardroomLeaderId) {
      this.relay(JSON.stringify({
        type: 'LEADER_TAKEOVER',
        payload: { userId: this.boardroomLeaderId },
      } as RoomMessage));
    }

    // The admission is deliberately NOT revoked here. PartySocket reconnects
    // on its own after a network blip, and a browser reload keeps the same
    // userId (sessionStorage), so revoking would send the host to the back of
    // their own queue for refreshing the page. A new tab gets a new userId and
    // knocks like any other arrival, and a room with nobody left in it admits
    // its next knock by rule 2 — so nothing stays locked.

    // Send the pending queue to the new host (if any) so they see waiters
    // immediately after a host transfer.
    if (this.pending.size > 0) {
      this.broadcastJoinRequests();
    }
  }
}
