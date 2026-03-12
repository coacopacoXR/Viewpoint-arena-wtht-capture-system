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
  | { type: 'ARENA_ENTRY'; payload: Record<string, never> }
  | { type: 'LASER_MOVE'; payload: { userId: string; position: [number, number, number] | null } }
  | { type: 'PRIVACY_MODE'; payload: { enabled: boolean } }
  | { type: 'LEADER_TAKEOVER'; payload: { userId: string } }
  | { type: 'MODEL_CHANGE'; payload: { modelType: 'synth' | 'bicycle' | 'imported'; fileBase64?: string; fileName?: string } }
  | { type: 'HOST_CHANGE'; payload: { hostId: string | null } }
  | { type: 'HOST_TRANSFER'; payload: { toUserId: string } }
  | { type: 'MEETING_END'; payload: Record<string, never> }
  | { type: 'TAKEOVER_SYNC'; payload: { enabled: boolean; approvedUserIds: string[] } }
  | { type: 'PRESENTER_REQUEST'; payload: { fromUserId: string; fromName: string } }
  | { type: 'TAKEOVER_ATTEMPT'; payload: { userId: string } }
  | { type: 'PRESENTER_CHANGED'; payload: { userId: string } }
  | { type: 'COMMENT_ADD'; payload: { comment: any } }
  | { type: 'COMMENT_UPDATE'; payload: { id: string; updates: Record<string, any> } }
  | { type: 'COMMENT_DELETE'; payload: { id: string } }
  | { type: 'COMMENT_RESOLVE'; payload: { id: string } }
  | { type: 'COMMENT_ROSTER'; payload: { comments: any[] } };

const PRESENTER_COOLDOWN = 1500; // ms — server-authoritative cooldown between presenter changes

export default class RoomServer implements Party.Server {
  participants = new Map<string, ParticipantPresence>();
  // Ordered by first PRESENCE — index 0 is always the session host
  joinOrder: string[] = [];
  // Server-authoritative presenter tracking for takeover mode
  currentPresenter: string | null = null;
  lastPresenterChange = 0;
  // Persisted model state for late joiners
  currentModel: { modelType: string; fileBase64?: string; fileName?: string } | null = null;
  // Persisted spatial comments for late joiners
  comments: any[] = [];

  constructor(readonly room: Party.Room) {}

  private computeHost(): string | null {
    return this.joinOrder[0] ?? null;
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
    conn.send(JSON.stringify({ type: 'COMMENT_ROSTER', payload: { comments: this.comments } } as RoomMessage));
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: RoomMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (msg.type === 'PRESENCE') {
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

    } else if (msg.type === 'TAKEOVER_ATTEMPT') {
      // Server validates cooldown and broadcasts authoritative PRESENTER_CHANGED to ALL clients
      const now = Date.now();
      const { userId } = msg.payload;
      if (
        userId !== this.currentPresenter &&
        now - this.lastPresenterChange > PRESENTER_COOLDOWN
      ) {
        this.currentPresenter = userId;
        this.lastPresenterChange = now;
        // Broadcast to ALL — including sender — so everyone updates atomically
        this.room.broadcast(JSON.stringify({
          type: 'PRESENTER_CHANGED',
          payload: { userId },
        } as RoomMessage));
      }
      // If cooldown active or already presenter, silently ignore

    } else if (msg.type === 'MODEL_CHANGE') {
      this.currentModel = msg.payload;
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

    } else if (
      msg.type === 'PRESENTER_CHANGE' ||
      msg.type === 'INSIGHT_CARD' ||
      msg.type === 'LEADER_CHANGE' ||
      msg.type === 'BOARDROOM_COUNTDOWN' ||
      msg.type === 'ARENA_ENTRY' ||
      msg.type === 'LASER_MOVE' ||
      msg.type === 'PRIVACY_MODE' ||
      msg.type === 'LEADER_TAKEOVER' ||
      msg.type === 'MEETING_END' ||
      msg.type === 'TAKEOVER_SYNC' ||
      msg.type === 'PRESENTER_REQUEST'
    ) {
      this.room.broadcast(JSON.stringify(msg), [sender.id]);
    }
  }

  onClose(conn: Party.Connection) {
    for (const [userId, p] of this.participants) {
      if (p.userId === conn.id) {
        this.participants.delete(userId);
        this.joinOrder = this.joinOrder.filter(id => id !== userId);

        this.room.broadcast(JSON.stringify({
          type: 'LEAVE',
          payload: { userId },
        } as RoomMessage));

        // Broadcast new host (may have changed if the host left)
        this.room.broadcast(JSON.stringify({
          type: 'HOST_CHANGE',
          payload: { hostId: this.computeHost() },
        } as RoomMessage));
        break;
      }
    }
  }
}
