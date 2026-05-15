import React, { useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import ViewpointCanvas from '../components/Scene/ViewpointCanvas';
import Interface from '../components/UI/Interface';
import MobileRoomView from '../components/UI/MobileRoomView';
import { useStore } from '../store';
import { usePartyPresence } from '../lib/usePartyPresence';
import { PresenceContext } from '../lib/PresenceContext';
import { useWebRTC } from '../lib/useWebRTC';
import { WebRTCContext } from '../lib/WebRTCContext';
import { useReviewSetupStore } from '../lib/reviewSetupStore';
import { useActiveReviewStore } from '../lib/activeReviewStore';

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

  const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);

  // Guard: if arriving directly (not from lobby), redirect to lobby to set identity
  useEffect(() => {
    const enteredRoom = sessionStorage.getItem('vp_enteredRoom');
    const fromLobby = (location.state as any)?.fromLobby;
    if (!fromLobby && enteredRoom !== roomId) {
      navigate('/', { state: { joinRoomId: roomId }, replace: true });
    }
  }, [roomId]);

  const presence = usePartyPresence(roomId);

  // If we hold a local review draft matching this room id, publish it once
  // the socket is open so all participants share the same viewpoints/pins.
  // Also seed our own activeReviewStore immediately so the host doesn't have
  // to wait for the server echo.
  useEffect(() => {
    const draft = useReviewSetupStore.getState().draft;
    if (!roomId || !draft || draft.reviewId !== roomId) return;
    useActiveReviewStore.getState().setConfig(draft);

    // Try to broadcast as soon as the socket is open. The send function returns
    // false when the socket isn't ready yet; poll briefly until it lands.
    let sent = presence.broadcastReviewConfig(draft);
    if (sent) return;
    const id = setInterval(() => {
      if (presence.broadcastReviewConfig(draft)) {
        clearInterval(id);
      }
    }, 250);
    const stop = setTimeout(() => clearInterval(id), 5000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [roomId, presence]);

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
        <div className="relative w-full h-screen bg-[#F2F2F2] overflow-hidden select-none">
          {!isMeetingEnded && <ViewpointCanvas />}
          <div className="absolute inset-0 z-10 pointer-events-none">
            <Interface />
          </div>
        </div>
      )}
    </WebRTCContext.Provider>
    </PresenceContext.Provider>
  );
};

export default RoomPage;
