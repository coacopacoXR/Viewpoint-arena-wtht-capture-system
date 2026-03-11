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
  | { type: 'LASER_MOVE'; payload: { userId: string; position: [number, number, number] | null } }
  | { type: 'PRIVACY_MODE'; payload: { enabled: boolean } }
  | { type: 'LEADER_TAKEOVER'; payload: { userId: string } };

export default class RoomServer implements Party.Server {
  // In-memory map of who's in the room
  participants = new Map<string, ParticipantPresence>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    // Send the new joiner the current roster so they see existing participants immediately
    const roster: RoomMessage = {
      type: 'ROSTER',
      payload: Array.from(this.participants.values()),
    };
    conn.send(JSON.stringify(roster));
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: RoomMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (msg.type === 'PRESENCE') {
      this.participants.set(msg.payload.userId, msg.payload);
      this.room.broadcast(JSON.stringify(msg), [sender.id]);
    } else if (
      msg.type === 'PRESENTER_CHANGE' ||
      msg.type === 'INSIGHT_CARD' ||
      msg.type === 'LEADER_CHANGE' ||
      msg.type === 'BOARDROOM_COUNTDOWN' ||
      msg.type === 'LASER_MOVE' ||
      msg.type === 'PRIVACY_MODE' ||
      msg.type === 'LEADER_TAKEOVER'
    ) {
      this.room.broadcast(JSON.stringify(msg), [sender.id]);
    }
  }

  onClose(conn: Party.Connection) {
    // Find the participant associated with this connection and broadcast their departure
    for (const [userId, p] of this.participants) {
      // We store connectionId as userId for simplicity; if needed, map separately
      if (p.userId === conn.id) {
        this.participants.delete(userId);
        const leave: RoomMessage = { type: 'LEAVE', payload: { userId } };
        this.room.broadcast(JSON.stringify(leave));
        break;
      }
    }
  }
}
