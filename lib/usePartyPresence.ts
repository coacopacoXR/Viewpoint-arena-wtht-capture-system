import React, { useEffect, useRef } from 'react';
import PartySocket from 'partysocket';
import type { ParticipantPresence } from '../party/room.server';
import type { InsightCard } from '../types';
import { useStore } from '../store';
import { ViewMode } from '../types';

export type { ParticipantPresence };

type RoomMessage =
  | { type: 'PRESENCE'; payload: ParticipantPresence }
  | { type: 'LEAVE'; payload: { userId: string } }
  | { type: 'ROSTER'; payload: ParticipantPresence[] }
  | { type: 'PRESENTER_CHANGE'; payload: { agentId: string | null } }
  | { type: 'INSIGHT_CARD'; payload: InsightCard }
  | { type: 'LEADER_CHANGE'; payload: { userId: string | null } }
  | { type: 'BOARDROOM_COUNTDOWN'; payload: Record<string, never> }
  | { type: 'LASER_MOVE'; payload: { userId: string; position: [number, number, number] | null } }
  | { type: 'PRIVACY_MODE'; payload: { enabled: boolean } }
  | { type: 'LEADER_TAKEOVER'; payload: { userId: string } };

// The host to connect to. In dev, PartyKit runs on localhost:1999.
// In production, replace with your deployed PartyKit URL.
const PARTYKIT_HOST: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PARTYKIT_HOST) || 'localhost:1999';

function getUserInfo(): { userId: string; name: string; color: string } {
  const stored = localStorage.getItem('vp_user');
  const user = stored ? JSON.parse(stored) : { name: 'Guest', color: '#4F8EF7' };
  // Use a stable userId per browser session
  let userId = sessionStorage.getItem('vp_userId');
  if (!userId) {
    userId = crypto.randomUUID();
    sessionStorage.setItem('vp_userId', userId);
  }
  return { userId, name: user.name || 'Guest', color: user.color || '#4F8EF7' };
}

export interface RemoteParticipantInfo {
  userId: string;
  name: string;
  color: string;
}

export interface UsePartyPresenceReturn {
  localUserId: string;
  remoteParticipants: React.MutableRefObject<Map<string, ParticipantPresence>>;
  remoteLasers: React.MutableRefObject<Map<string, [number, number, number] | null>>;
  remoteParticipantList: RemoteParticipantInfo[];
  broadcastPresence: (position: [number, number, number], lookAt: [number, number, number]) => void;
  broadcastPresenterChange: (agentId: string | null) => void;
  broadcastInsightCard: (card: InsightCard) => void;
  broadcastLeaderChange: (userId: string | null) => void;
  broadcastBoardroomCountdown: () => void;
  broadcastLaserMove: (position: [number, number, number] | null) => void;
  broadcastPrivacyMode: (enabled: boolean) => void;
  broadcastLeaderTakeover: (userId: string) => void;
}

export function usePartyPresence(roomId: string | undefined): UsePartyPresenceReturn {
  const remoteParticipants = useRef<Map<string, ParticipantPresence>>(new Map());
  const remoteLasers = useRef<Map<string, [number, number, number] | null>>(new Map());
  const [remoteParticipantList, setRemoteParticipantList] = React.useState<RemoteParticipantInfo[]>([]);
  const socketRef = useRef<PartySocket | null>(null);
  const userRef = useRef(getUserInfo());
  // Track last broadcast position for takeover detection
  const lastBroadcastPos = useRef<[number, number, number]>([0, 0, 0]);

  // Use getState() so we never re-subscribe inside the effect
  const { addInsightCard, setActiveAgent, setViewMode, setFollowingRemoteUser, triggerBoardroomEntry, setPrivacyMode, setBoardroomLeaderId } = useStore.getState();

  function syncList() {
    setRemoteParticipantList(
      Array.from(remoteParticipants.current.values()).map(({ userId, name, color }) => ({ userId, name, color })),
    );
  }

  useEffect(() => {
    if (!roomId) return;

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomId,
    });
    socketRef.current = socket;

    socket.addEventListener('message', (event: MessageEvent) => {
      let msg: RoomMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === 'ROSTER') {
        remoteParticipants.current.clear();
        for (const p of msg.payload) {
          if (p.userId !== userRef.current.userId) {
            remoteParticipants.current.set(p.userId, p);
          }
        }
        syncList();
      } else if (msg.type === 'PRESENCE') {
        if (msg.payload.userId !== userRef.current.userId) {
          const isNew = !remoteParticipants.current.has(msg.payload.userId);
          remoteParticipants.current.set(msg.payload.userId, msg.payload);
          if (isNew) syncList(); // only re-render UI on new join
        }
      } else if (msg.type === 'LEAVE') {
        remoteParticipants.current.delete(msg.payload.userId);
        syncList();
      } else if (msg.type === 'PRESENTER_CHANGE') {
        const { agentId } = msg.payload;
        setActiveAgent(agentId);
        setViewMode(agentId ? ViewMode.POV_AGENT : ViewMode.FREE);
      } else if (msg.type === 'INSIGHT_CARD') {
        addInsightCard(msg.payload);
      } else if (msg.type === 'LEADER_CHANGE') {
        // Anti-circular: ignore if I am currently leading (not following anyone)
        const { leaderId, followingRemoteUserId } = useStore.getState();
        if (leaderId === 'USER' && !followingRemoteUserId) return;
        setFollowingRemoteUser(msg.payload.userId);
      } else if (msg.type === 'BOARDROOM_COUNTDOWN') {
        triggerBoardroomEntry();
      } else if (msg.type === 'LASER_MOVE') {
        if (msg.payload.userId !== userRef.current.userId) {
          remoteLasers.current.set(msg.payload.userId, msg.payload.position);
        }
      } else if (msg.type === 'PRIVACY_MODE') {
        setPrivacyMode(msg.payload.enabled);
      } else if (msg.type === 'LEADER_TAKEOVER') {
        const newLeaderId = msg.payload.userId;
        setBoardroomLeaderId(newLeaderId);
        if (newLeaderId !== userRef.current.userId) {
          setFollowingRemoteUser(newLeaderId);
        } else {
          // I'm now the leader — stop following anyone
          setFollowingRemoteUser(null);
        }
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
      remoteParticipants.current.clear();
      setRemoteParticipantList([]);
    };
  }, [roomId]);

  function broadcastPresence(
    position: [number, number, number],
    lookAt: [number, number, number],
  ) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const msg: RoomMessage = {
      type: 'PRESENCE',
      payload: {
        userId: userRef.current.userId,
        name: userRef.current.name,
        color: userRef.current.color,
        position,
        lookAt,
      },
    };
    socket.send(JSON.stringify(msg));

    // Takeover detection: if I moved significantly, auto-claim leadership
    const [px, py, pz] = lastBroadcastPos.current;
    const dx = position[0] - px, dy = position[1] - py, dz = position[2] - pz;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > 0.01) { // threshold ~0.1 units
      lastBroadcastPos.current = position;
      const { isBoardroomMode, takeoverModeEnabled, takeoverApprovedUserIds, boardroomLeaderId } = useStore.getState();
      const myId = userRef.current.userId;
      if (
        isBoardroomMode &&
        takeoverModeEnabled &&
        takeoverApprovedUserIds.includes(myId) &&
        boardroomLeaderId !== myId
      ) {
        broadcastLeaderTakeover(myId);
        setBoardroomLeaderId(myId);
        setFollowingRemoteUser(null);
      }
    }
  }

  function broadcastPresenterChange(agentId: string | null) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'PRESENTER_CHANGE', payload: { agentId } }));
  }

  function broadcastInsightCard(card: InsightCard) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'INSIGHT_CARD', payload: card }));
  }

  function broadcastLeaderChange(userId: string | null) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'LEADER_CHANGE', payload: { userId } }));
  }

  function broadcastBoardroomCountdown() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'BOARDROOM_COUNTDOWN', payload: {} }));
  }

  function broadcastLaserMove(position: [number, number, number] | null) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'LASER_MOVE', payload: { userId: userRef.current.userId, position } }));
  }

  function broadcastPrivacyMode(enabled: boolean) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'PRIVACY_MODE', payload: { enabled } }));
  }

  function broadcastLeaderTakeover(userId: string) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'LEADER_TAKEOVER', payload: { userId } }));
  }

  return {
    localUserId: userRef.current.userId,
    remoteParticipants,
    remoteLasers,
    remoteParticipantList,
    broadcastPresence,
    broadcastPresenterChange,
    broadcastInsightCard,
    broadcastLeaderChange,
    broadcastBoardroomCountdown,
    broadcastLaserMove,
    broadcastPrivacyMode,
    broadcastLeaderTakeover,
  };
}
