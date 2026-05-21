import type * as Party from 'partykit/server';

export interface ParticipantPresence {
  userId: string;
  name: string;
  color: string;
  position: [number, number, number];
  lookAt: [number, number, number];
}

type RoomMessage =
  | { type: 'PRESENCE'; payload: ParticipantPresence }
  | { type: 'LEAVE'; payload: { userId: string } }
  | { type: 'ROSTER'; payload: ParticipantPresence[] }
  | { type: 'PRESENTER_CHANGE'; payload: { agentId: string | null } }
  | { type: 'INSIGHT_CARD'; payload: any }
  | { type: 'LEADER_CHANGE'; payload: { userId: string | null } }
  | { type: 'BOARDROOM_COUNTDOWN'; payload: Record<string, never> }
  | { type: 'BOARDROOM_STATE'; payload: { active: boolean; leaderId: string | null; takeover: { enabled: boolean; approvedUserIds: string[] } } }
  | { type: 'ARENA_ENTRY'; payload: Record<string, never> }
  | { type: 'LASER_MOVE'; payload: { userId: string; position: [number, number, number] | null; targetId?: string | null; targetMeshName?: string | null; targetPartName?: string | null } }
  | { type: 'PRIVACY_MODE'; payload: { enabled: boolean } }
  | { type: 'LEADER_TAKEOVER'; payload: { userId: string } }
  | { type: 'MODEL_CHANGE'; payload: { modelType: 'synth' | 'bicycle' | 'imported'; fileBase64?: string; fileName?: string } }
  | { type: 'REVIEW_CONFIG'; payload: { config: any } }
  | { type: 'HOST_CHANGE'; payload: { hostId: string | null } }
  | { type: 'HOST_TRANSFER'; payload: { toUserId: string } }
  | { type: 'MEETING_END'; payload: Record<string, never> }
  | { type: 'TAKEOVER_SYNC'; payload: { enabled: boolean; approvedUserIds: string[] } }
  | { type: 'PRESENTER_REQUEST'; payload: { fromUserId: string; fromName: string } }
  | { type: 'PRESENTER_REQUEST_DENIED'; payload: { fromUserId: string } }
  | { type: 'TAKEOVER_ATTEMPT'; payload: { userId: string } }
  | { type: 'PRESENTER_CHANGED'; payload: { userId: string } }
  | { type: 'COMMENT_ADD'; payload: { comment: any } }
  | { type: 'COMMENT_UPDATE'; payload: { id: string; updates: Record<string, any> } }
  | { type: 'COMMENT_DELETE'; payload: { id: string } }
  | { type: 'COMMENT_RESOLVE'; payload: { id: string } }
  | { type: 'COMMENT_ROSTER'; payload: { comments: any[] } }
  | { type: 'WEBRTC_SIGNAL'; payload: { from: string; to: string; data: any } }
  | { type: 'LIVE_CHAT'; payload: any }
  | { type: 'XR_PRESENCE'; payload: any };

const PRESENTER_COOLDOWN = 1500; // ms — server-authoritative cooldown between presenter changes

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
  reviewConfig: any | null = null;
  // Persisted spatial comments for late joiners
  comments: any[] = [];
  // Whether the room is currently in boardroom mode — sent to late joiners
  isBoardroomMode = false;

  constructor(readonly room: Party.Room) {}

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

  onConnect(conn: Party.Connection) {
    // Send roster + current host to the new joiner
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
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: RoomMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (msg.type === 'PRESENCE') {
      // Track which userId this connection belongs to so onClose can clean up correctly
      this.connToUser.set(sender.id, msg.payload.userId);
      const isNew = !this.participants.has(msg.payload.userId);
      this.participants.set(msg.payload.userId, msg.payload);

      if (isNew) {
        this.joinOrder.push(msg.payload.userId);
        // Broadcast updated host (no-op if host hasn't changed, but harmless)
        this.room.broadcast(JSON.stringify({
          type: 'HOST_CHANGE',
          payload: { hostId: this.computeHost() },
        } as RoomMessage));
      }

      this.room.broadcast(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'HOST_TRANSFER') {
      // Move target to front of join order → they become new host
      const { toUserId } = msg.payload;
      this.joinOrder = [toUserId, ...this.joinOrder.filter(id => id !== toUserId)];
      this.room.broadcast(JSON.stringify({
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
      this.room.broadcast(JSON.stringify(msg));

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
        this.room.broadcast(JSON.stringify({
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
      this.room.broadcast(JSON.stringify({
        type: 'TAKEOVER_SYNC',
        payload: { enabled: this.takeoverModeEnabled, approvedUserIds: this.takeoverApprovedUserIds },
      } as RoomMessage));

    } else if (msg.type === 'MODEL_CHANGE') {
      this.currentModel = msg.payload;
      this.room.broadcast(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'REVIEW_CONFIG') {
      this.reviewConfig = msg.payload.config;
      this.room.broadcast(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_ADD') {
      this.comments.push(msg.payload.comment);
      this.room.broadcast(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_UPDATE') {
      const { id, updates } = msg.payload;
      const idx = this.comments.findIndex((c: any) => c.id === id);
      if (idx !== -1) {
        this.comments[idx] = { ...this.comments[idx], ...updates };
      }
      this.room.broadcast(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_DELETE') {
      this.comments = this.comments.filter((c: any) => c.id !== msg.payload.id);
      this.room.broadcast(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_RESOLVE') {
      const idx = this.comments.findIndex((c: any) => c.id === msg.payload.id);
      if (idx !== -1) {
        this.comments[idx] = { ...this.comments[idx], resolved: true };
      }
      this.room.broadcast(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'WEBRTC_SIGNAL') {
      // Relay to all peers; client filters by `to` field
      this.room.broadcast(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'BOARDROOM_COUNTDOWN') {
      // Seed boardroom state. Leader defaults to the current host until someone
      // is explicitly promoted via LEADER_TAKEOVER or TAKEOVER_ATTEMPT.
      this.isBoardroomMode = true;
      this.boardroomLeaderId = this.computeHost();
      // Clean slate for takeover policy each entry — host re-enables explicitly
      this.takeoverModeEnabled = false;
      this.takeoverApprovedUserIds = [];
      this.lastPresenterChange = Date.now();
      this.room.broadcast(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'ARENA_ENTRY') {
      // Leaving boardroom — wipe all boardroom state so the next entry is clean
      this.resetBoardroomState();
      this.room.broadcast(JSON.stringify(msg), [sender.id]);

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
      this.room.broadcast(JSON.stringify(msg), [sender.id]);
    }
  }

  onClose(conn: Party.Connection) {
    const userId = this.connToUser.get(conn.id);
    this.connToUser.delete(conn.id);

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

    this.room.broadcast(JSON.stringify({
      type: 'LEAVE',
      payload: { userId },
    } as RoomMessage));

    this.room.broadcast(JSON.stringify({
      type: 'HOST_CHANGE',
      payload: { hostId: this.computeHost() },
    } as RoomMessage));

    if (takeoverChanged) {
      this.room.broadcast(JSON.stringify({
        type: 'TAKEOVER_SYNC',
        payload: { enabled: this.takeoverModeEnabled, approvedUserIds: this.takeoverApprovedUserIds },
      } as RoomMessage));
    }

    if (leaderChanged && this.boardroomLeaderId) {
      this.room.broadcast(JSON.stringify({
        type: 'LEADER_TAKEOVER',
        payload: { userId: this.boardroomLeaderId },
      } as RoomMessage));
    }
  }
}
