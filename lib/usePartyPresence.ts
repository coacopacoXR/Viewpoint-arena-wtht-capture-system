import React, { useEffect, useRef, useCallback } from 'react';
import PartySocket from 'partysocket';
import type { ParticipantPresence } from '../party/room.server';
import type { InsightCard } from '../types';
import { useStore } from '../store';
import { ViewMode } from '../types';
import { parseModelFile } from '../utils/modelLoader';

export type { ParticipantPresence };

type RoomMessage =
  | { type: 'PRESENCE'; payload: ParticipantPresence }
  | { type: 'LEAVE'; payload: { userId: string } }
  | { type: 'ROSTER'; payload: ParticipantPresence[] }
  | { type: 'PRESENTER_CHANGE'; payload: { agentId: string | null } }
  | { type: 'INSIGHT_CARD'; payload: InsightCard }
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
  | { type: 'COMMENT_ROSTER'; payload: { comments: any[] } }
  | { type: 'WEBRTC_SIGNAL'; payload: { from: string; to: string; data: any } };

// Module-level ref so it persists across re-renders and is accessible from the message handler
const webRTCSignalHandlerRef: { current: ((payload: { from: string; to: string; data: any }) => void) | null } = { current: null };

const PARTYKIT_HOST: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PARTYKIT_HOST) || 'localhost:1999';

function getUserInfo(): { userId: string; name: string; color: string } {
  const stored = localStorage.getItem('vp_user');
  const user = stored ? JSON.parse(stored) : { name: 'Guest', color: '#4F8EF7' };
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
  broadcastArenaEntry: () => void;
  broadcastLaserMove: (position: [number, number, number] | null) => void;
  broadcastPrivacyMode: (enabled: boolean) => void;
  broadcastLeaderTakeover: (userId: string) => void;
  broadcastModelChange: (modelType: 'synth' | 'bicycle' | 'imported', fileBase64?: string, fileName?: string) => void;
  broadcastMeetingEnd: () => void;
  broadcastTakeoverSync: (enabled: boolean, approvedUserIds: string[]) => void;
  broadcastHostTransfer: (toUserId: string) => void;
  broadcastPresenterRequest: (fromUserId: string, fromName: string) => void;
  broadcastTakeoverAttempt: (userId: string) => void;
  broadcastCommentAdd: (comment: any) => void;
  broadcastCommentUpdate: (id: string, updates: Record<string, any>) => void;
  broadcastCommentDelete: (id: string) => void;
  broadcastCommentResolve: (id: string) => void;
  broadcastWebRTCSignal: (to: string, data: any) => void;
  registerWebRTCSignalHandler: (handler: (payload: { from: string; to: string; data: any }) => void) => () => void;
}

export function usePartyPresence(roomId: string | undefined): UsePartyPresenceReturn {
  const remoteParticipants = useRef<Map<string, ParticipantPresence>>(new Map());
  const remoteLasers = useRef<Map<string, [number, number, number] | null>>(new Map());
  const [remoteParticipantList, setRemoteParticipantList] = React.useState<RemoteParticipantInfo[]>([]);
  const socketRef = useRef<PartySocket | null>(null);
  const userRef = useRef(getUserInfo());

  const {
    addInsightCard, setActiveAgent, setViewMode, setFollowingRemoteUser,
    triggerBoardroomEntry, setPrivacyMode, setBoardroomLeaderId, setSessionHostId,
    setPendingPresenterRequest,
  } = useStore.getState();

  function syncList() {
    setRemoteParticipantList(
      Array.from(remoteParticipants.current.values()).map(({ userId, name, color }) => ({ userId, name, color })),
    );
  }

  useEffect(() => {
    if (!roomId) return;

    const socket = new PartySocket({ host: PARTYKIT_HOST, room: roomId });
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
          if (isNew) syncList();
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
        const { leaderId, followingRemoteUserId } = useStore.getState();
        if (leaderId === 'USER' && !followingRemoteUserId) return;
        setFollowingRemoteUser(msg.payload.userId);
      } else if (msg.type === 'BOARDROOM_COUNTDOWN') {
        triggerBoardroomEntry();
      } else if (msg.type === 'ARENA_ENTRY') {
        const { isBoardroomMode, toggleBoardroomMode } = useStore.getState();
        if (isBoardroomMode) toggleBoardroomMode();
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
          setFollowingRemoteUser(null);
        }
      } else if (msg.type === 'MODEL_CHANGE') {
        const { modelType, fileBase64, fileName } = msg.payload;
        const { setActiveModelType, setImportedModel } = useStore.getState();
        if (modelType === 'synth' || modelType === 'bicycle') {
          setActiveModelType(modelType);
        } else if (modelType === 'imported' && fileBase64 && fileName) {
          const ext = fileName.split('.').pop()?.toLowerCase() || 'glb';
          const mimeMap: Record<string, string> = {
            glb: 'model/gltf-binary', gltf: 'model/gltf+json',
            obj: 'text/plain', fbx: 'application/octet-stream', stl: 'application/octet-stream',
          };
          const mime = mimeMap[ext] || 'application/octet-stream';
          const bytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
          const file = new File([bytes], fileName, { type: mime });
          parseModelFile(file)
            .then(result => setImportedModel(result.root, result.sceneTree, result.fileName, result.baseScale, result.basePosition))
            .catch(err => console.error('[MODEL_CHANGE] Parse error:', err));
        }
      } else if (msg.type === 'HOST_CHANGE') {
        setSessionHostId(msg.payload.hostId);
        // If I just became the host (e.g. previous host left), update local state
        if (msg.payload.hostId === userRef.current.userId) {
          setSessionHostId(msg.payload.hostId);
        }
      } else if (msg.type === 'MEETING_END') {
        const { endMeeting } = useStore.getState();
        endMeeting(true);
      } else if (msg.type === 'TAKEOVER_SYNC') {
        const { setTakeoverModeEnabled, setTakeoverApprovedUserIds } = useStore.getState();
        setTakeoverModeEnabled(msg.payload.enabled);
        setTakeoverApprovedUserIds(msg.payload.approvedUserIds);
      } else if (msg.type === 'PRESENTER_REQUEST') {
        // Only the host handles this — store it for the host's UI to show
        const { sessionHostId } = useStore.getState();
        if (sessionHostId === userRef.current.userId) {
          setPendingPresenterRequest(msg.payload);
        }
      } else if (msg.type === 'PRESENTER_CHANGED') {
        // Server-authoritative presenter change (takeover mode)
        const newUserId = msg.payload.userId;
        const { setBoardroomLeaderId, resumeBoardroomPresenter } = useStore.getState();
        setBoardroomLeaderId(newUserId);
        resumeBoardroomPresenter(); // clear local detach state; BoardroomPresenterSync will update followingRemoteUserId
      } else if (msg.type === 'COMMENT_ROSTER') {
        const { setAllComments } = useStore.getState();
        setAllComments(msg.payload.comments);
      } else if (msg.type === 'COMMENT_ADD') {
        const { addComment } = useStore.getState();
        addComment(msg.payload.comment);
      } else if (msg.type === 'COMMENT_UPDATE') {
        const { updateComment } = useStore.getState();
        updateComment(msg.payload.id, msg.payload.updates);
      } else if (msg.type === 'COMMENT_DELETE') {
        const { deleteComment } = useStore.getState();
        deleteComment(msg.payload.id);
      } else if (msg.type === 'COMMENT_RESOLVE') {
        const { resolveComment } = useStore.getState();
        resolveComment(msg.payload.id);
      } else if (msg.type === 'WEBRTC_SIGNAL') {
        webRTCSignalHandlerRef.current?.(msg.payload);
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
      remoteParticipants.current.clear();
      setRemoteParticipantList([]);
    };
  }, [roomId]);

  function broadcastPresence(position: [number, number, number], lookAt: [number, number, number]) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const msg: RoomMessage = {
      type: 'PRESENCE',
      payload: { userId: userRef.current.userId, name: userRef.current.name, color: userRef.current.color, position, lookAt },
    };
    socket.send(JSON.stringify(msg));
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

  function broadcastArenaEntry() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'ARENA_ENTRY', payload: {} }));
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

  function broadcastModelChange(modelType: 'synth' | 'bicycle' | 'imported', fileBase64?: string, fileName?: string) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'MODEL_CHANGE', payload: { modelType, fileBase64, fileName } }));
  }

  function broadcastMeetingEnd() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'MEETING_END', payload: {} }));
  }

  function broadcastTakeoverSync(enabled: boolean, approvedUserIds: string[]) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'TAKEOVER_SYNC', payload: { enabled, approvedUserIds } }));
  }

  function broadcastHostTransfer(toUserId: string) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'HOST_TRANSFER', payload: { toUserId } }));
  }

  function broadcastPresenterRequest(fromUserId: string, fromName: string) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'PRESENTER_REQUEST', payload: { fromUserId, fromName } }));
  }

  function broadcastTakeoverAttempt(userId: string) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'TAKEOVER_ATTEMPT', payload: { userId } }));
  }

  function broadcastCommentAdd(comment: any) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'COMMENT_ADD', payload: { comment } }));
  }

  function broadcastCommentUpdate(id: string, updates: Record<string, any>) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'COMMENT_UPDATE', payload: { id, updates } }));
  }

  function broadcastCommentDelete(id: string) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'COMMENT_DELETE', payload: { id } }));
  }

  function broadcastCommentResolve(id: string) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'COMMENT_RESOLVE', payload: { id } }));
  }

  function broadcastWebRTCSignal(to: string, data: any) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      type: 'WEBRTC_SIGNAL',
      payload: { from: userRef.current.userId, to, data },
    }));
  }

  // Stable reference — must not change across renders so the useWebRTC effect only runs once.
  // If this were a plain function it would be recreated every render, causing the effect to
  // repeatedly cleanup (null) then re-register, creating a window where signals get dropped.
  const registerWebRTCSignalHandler = useCallback((handler: (payload: { from: string; to: string; data: any }) => void): () => void => {
    webRTCSignalHandlerRef.current = handler;
    return () => { webRTCSignalHandlerRef.current = null; };
  }, []);

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
    broadcastArenaEntry,
    broadcastLaserMove,
    broadcastPrivacyMode,
    broadcastLeaderTakeover,
    broadcastModelChange,
    broadcastMeetingEnd,
    broadcastTakeoverSync,
    broadcastHostTransfer,
    broadcastPresenterRequest,
    broadcastTakeoverAttempt,
    broadcastCommentAdd,
    broadcastCommentUpdate,
    broadcastCommentDelete,
    broadcastCommentResolve,
    broadcastWebRTCSignal,
    registerWebRTCSignalHandler,
  };
}
