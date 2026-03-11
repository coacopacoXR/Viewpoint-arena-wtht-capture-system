import React, { useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import ViewpointCanvas from '../components/Scene/ViewpointCanvas';
import Interface from '../components/UI/Interface';
import { useStore } from '../store';
import { usePartyPresence } from '../lib/usePartyPresence';
import { PresenceContext } from '../lib/PresenceContext';

const RoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const isMeetingEnded = useStore(state => state.isMeetingEnded);

  // Guard: if arriving directly (not from lobby), redirect to lobby to set identity
  useEffect(() => {
    const enteredRoom = sessionStorage.getItem('vp_enteredRoom');
    const fromLobby = (location.state as any)?.fromLobby;
    if (!fromLobby && enteredRoom !== roomId) {
      navigate('/', { state: { joinRoomId: roomId }, replace: true });
    }
  }, [roomId]);

  const presence = usePartyPresence(roomId);

  return (
    <PresenceContext.Provider value={presence}>
      <div className="relative w-full h-screen bg-[#F2F2F2] overflow-hidden select-none">
        {!isMeetingEnded && <ViewpointCanvas />}
        <div className="absolute inset-0 z-10 pointer-events-none">
          <Interface />
        </div>
      </div>
    </PresenceContext.Provider>
  );
};

export default RoomPage;
