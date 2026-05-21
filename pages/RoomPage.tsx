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
import { useActiveReviewStore } from '../lib/activeReviewStore';
import { loadCuration, saveCuration } from '../lib/curationsRepo';
import { useIsMobile } from '../lib/useIsMobile';

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
    const fromLobby = (location.state as any)?.fromLobby;
    if (!fromLobby && enteredRoom !== roomId) {
      navigate('/', { state: { joinRoomId: roomId }, replace: true });
    }
  }, [roomId]);

  const presence = usePartyPresence(roomId);

  // Seed the active review for this room:
  //   1. Use the local draft if it matches the roomId (the host who just
  //      finished setup arrives here with the freshest copy in memory).
  //   2. Otherwise pull from the cloud — anyone with the URL joins into the
  //      same curation across sessions and devices.
  // Then broadcast to other participants.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const broadcastWhenReady = (draft: any) => {
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
    const unsub = useActiveReviewStore.subscribe((state, prev) => {
      if (!state.config || state.config === prev.config) return;
      if (state.config.reviewId !== roomId) return;
      // debounce per-host via a moving timer keyed off the config object
      (unsub as any)._pending && clearTimeout((unsub as any)._pending);
      (unsub as any)._pending = setTimeout(() => {
        saveCuration(state.config!);
      }, 1000);
    });
    return () => {
      (unsub as any)._pending && clearTimeout((unsub as any)._pending);
      unsub();
    };
  }, [roomId, sessionHostId, presence.localUserId]);

  // Clear active review when leaving the room so it doesn't leak across sessions.
  useEffect(() => {
    return () => { useActiveReviewStore.getState().setConfig(null); };
  }, []);

  const webrtc = useWebRTC({
    localUserId: presence.localUserId,
    remoteParticipantList: presence.remoteParticipantList,
    broadcastWebRTCSignal: presence.broadcastWebRTCSignal,
    registerWebRTCSignalHandler: presence.registerWebRTCSignalHandler,
    active: isBoardroomMode,
  });

  // PresenceContext wraps BOTH mobile and desktop so ViewpointCanvas works in both
  return (
    <PresenceContext.Provider value={presence}>
    <WebRTCContext.Provider value={webrtc}>
      {isMobile ? (
        <MobileRoomView
          roomId={roomId ?? ''}
          userName={getMobileUserName()}
        />
      ) : (
        <DesktopRoomLayout isMeetingEnded={isMeetingEnded} />
      )}
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
