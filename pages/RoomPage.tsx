import React, { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import ViewpointCanvas from '../components/Scene/ViewpointCanvas';
import Interface from '../components/UI/Interface';
import MobileRoomView from '../components/UI/MobileRoomView';
import ManagerPanel from '../components/UI/ManagerPanel';
import { useStore } from '../store';
import { usePartyPresence } from '../lib/usePartyPresence';
import { PresenceContext } from '../lib/PresenceContext';
import { useWebRTC } from '../lib/useWebRTC';
import { WebRTCContext } from '../lib/WebRTCContext';
import { useReviewSetupStore } from '../lib/reviewSetupStore';
import type { ReviewDraft } from '../lib/reviewSetupStore';
import { useActiveReviewStore } from '../lib/activeReviewStore';
import { loadCuration, saveCuration } from '../lib/curationsRepo';
import { useIsMobile } from '../lib/useIsMobile';
import { RecordingProvider } from '../lib/RecordingContext';
import RemoteAudioSink from '../components/UI/RemoteAudioSink';
import { useJoinState } from '../lib/usePartyPresence';
import JoinWaitingRoom from '../components/UI/JoinWaitingRoom';
import { recordJoin, joinRoleFor, type ReviewRole } from '../lib/reviewParticipantsRepo';

function getMobileUserName(): string {
  try {
    const s = localStorage.getItem('vp_user');
    return s ? (JSON.parse(s).name || 'Guest') : 'Guest';
  } catch {
    return 'Guest';
  }
}

const RoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const isMeetingEnded = useStore(state => state.isMeetingEnded);
  const isBoardroomMode = useStore(state => state.isBoardroomMode);

  // Stable mobile detection: keyed off UA + pointer capability rather than viewport
  // width, so a narrow desktop window never flips into the mobile UI mid-session.
  const isMobile = useIsMobile();

  // Guard: if arriving directly (not from lobby), redirect to lobby to set identity
  useEffect(() => {
    const enteredRoom = sessionStorage.getItem('vp_enteredRoom');
    const fromLobby = (location.state as { fromLobby?: boolean } | null)?.fromLobby;
    if (!fromLobby && enteredRoom !== roomId) {
      navigate('/', { state: { joinRoomId: roomId }, replace: true });
    }
  }, [roomId]);

  const presence = usePartyPresence(roomId);
  const joinState = useJoinState();

  // Seed the active review for this room:
  //   1. Use the local draft if it matches the roomId (the host who just
  //      finished setup arrives here with the freshest copy in memory).
  //   2. Otherwise pull from the cloud — anyone with the URL joins into the
  //      same curation across sessions and devices.
  // Then broadcast to other participants.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const broadcastWhenReady = (draft: ReviewDraft) => {
      if (presence.broadcastReviewConfig(draft)) return;
      const id = setInterval(() => {
        if (presence.broadcastReviewConfig(draft)) clearInterval(id);
      }, 250);
      const stop = setTimeout(() => clearInterval(id), 5000);
      return () => { clearInterval(id); clearTimeout(stop); };
    };

    const localDraft = useReviewSetupStore.getState().draft;
    if (localDraft && localDraft.reviewId === roomId) {
      useActiveReviewStore.getState().setConfig(localDraft);
      return broadcastWhenReady(localDraft);
    }

    let cleanup: (() => void) | undefined;
    (async () => {
      const remote = await loadCuration(roomId);
      if (cancelled || !remote) return;
      useActiveReviewStore.getState().setConfig(remote);
      cleanup = broadcastWhenReady(remote);
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [roomId, presence]);

  // Persist in-room edits to viewpoints / pins / agenda back to the cloud
  // (debounced). Only the host writes through — other participants get the
  // latest via PartyKit's REVIEW_CONFIG broadcast and don't need to push.
  const sessionHostId = useStore(state => state.sessionHostId);
  useEffect(() => {
    if (!roomId) return;
    const isHost = sessionHostId === presence.localUserId || sessionHostId === null;
    if (!isHost) return;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useActiveReviewStore.subscribe((state, prev) => {
      if (!state.config || state.config === prev.config) return;
      if (state.config.reviewId !== roomId) return;
      // debounce per-host via a moving timer keyed off the config object
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        saveCuration(state.config!);
      }, 1000);
    });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, [roomId, sessionHostId, presence.localUserId]);

  // "The reviews I have been part of" (docs/plan/13-identity.md batch AZ).
  // Written once per room entry, and only for somebody this deployment signed
  // in: recordJoin is the one place that knows what that means, and it does
  // nothing at all for a guest or for an install on identity.mode 'none'. It
  // also cannot break the room — every failure is logged and dropped there.
  const recordedRef = useRef<{ roomId: string; role: ReviewRole } | null>(null);
  useEffect(() => {
    // Not before this: a person parked in the waiting room has not taken part
    // in anything yet, and a declined one never does.
    const role = joinRoleFor({
      admitted: joinState === 'admitted',
      sessionHostId,
      localUserId: presence.localUserId,
    });
    if (!roomId || !role) return;
    const recorded = recordedRef.current;
    // Once per room entry, plus one correction: JOIN_ADMITTED reaches the
    // client a message before HOST_CHANGE, so the first write can predate this
    // client learning that it is the host. The upsert never downgrades a role,
    // so the second write can only be the upgrade.
    if (recorded?.roomId === roomId && (recorded.role === role || role !== 'host')) return;
    recordedRef.current = { roomId, role };
    void recordJoin(roomId, role);
  }, [roomId, joinState, sessionHostId, presence.localUserId]);

  // Clear active review when leaving the room so it doesn't leak across sessions.
  useEffect(() => {
    return () => { useActiveReviewStore.getState().setConfig(null); };
  }, []);

  const webrtc = useWebRTC({
    localUserId: presence.localUserId,
    remoteParticipantList: presence.remoteParticipantList,
    broadcastWebRTCSignal: presence.broadcastWebRTCSignal,
    registerWebRTCSignalHandler: presence.registerWebRTCSignalHandler,
    active: joinState === 'admitted',
    isBoardroomMode,
  });

  // PresenceContext wraps BOTH mobile and desktop so ViewpointCanvas works in both.
  // RecordingProvider sits inside WebRTCContext (it reads localStream /
  // remoteStreams) and outside the layout so both the sidebar ConversationPanel
  // and the Manager Workspace share one recorder instance.
  return (
    <PresenceContext.Provider value={presence}>
    <WebRTCContext.Provider value={webrtc}>
    <RecordingProvider>
      <RemoteAudioSink />
      {joinState !== 'admitted' ? (
        <JoinWaitingRoom roomId={roomId ?? ''} />
      ) : isMobile ? (
        <MobileRoomView
          roomId={roomId ?? ''}
          userName={getMobileUserName()}
        />
      ) : (
        <DesktopRoomLayout isMeetingEnded={isMeetingEnded} />
      )}
    </RecordingProvider>
    </WebRTCContext.Provider>
    </PresenceContext.Provider>
  );
};

// Desktop-only: viewport + Interface overlay, with an optional resizable
// split-screen Manager workspace on the right (host-only, toggled from the
// Review popup). Width is persisted to localStorage so the layout sticks
// between sessions.
const MANAGER_WIDTH_KEY = 'vp_manager_width';
const MIN_VIEWPORT = 480;
const MIN_MANAGER  = 320;

const DesktopRoomLayout: React.FC<{ isMeetingEnded: boolean }> = ({ isMeetingEnded }) => {
  const managerMode = useActiveReviewStore((s) => s.managerMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const [managerWidth, setManagerWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MANAGER_WIDTH_KEY));
    return Number.isFinite(stored) && stored >= MIN_MANAGER ? stored : 480;
  });
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Persist width.
  useEffect(() => {
    localStorage.setItem(MANAGER_WIDTH_KEY, String(managerWidth));
  }, [managerWidth]);

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: managerWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const next = dragRef.current.startWidth - dx; // dragging left grows the panel
      const containerWidth = containerRef.current.clientWidth;
      const clamped = Math.max(MIN_MANAGER, Math.min(containerWidth - MIN_VIEWPORT, next));
      setManagerWidth(clamped);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div ref={containerRef} className="flex w-full h-screen bg-[#F2F2F2] overflow-hidden select-none">
      {/* Left: 3D viewport + UI overlay. Flexes to fill remaining space. */}
      <div className="relative flex-1 min-w-0">
        {!isMeetingEnded && <ViewpointCanvas />}
        <div className="absolute inset-0 z-10 pointer-events-none">
          <Interface />
        </div>
      </div>

      {managerMode && (
        <>
          {/* Drag handle */}
          <div
            onMouseDown={onDragStart}
            className="w-1.5 bg-[#0a0a0b] hover:bg-emerald-500 cursor-col-resize shrink-0 transition-colors"
            title="Drag to resize"
          />
          {/* Right: Manager workspace */}
          <div className="shrink-0 h-full" style={{ width: managerWidth }}>
            <ManagerPanel />
          </div>
        </>
      )}
    </div>
  );
};

export default RoomPage;
