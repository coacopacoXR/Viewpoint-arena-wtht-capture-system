import { useEffect, useRef, useState, useCallback } from 'react';
import type { RemoteParticipantInfo } from './usePartyPresence';

// STUN + public TURN for production NAT traversal.
// STUN alone fails when either peer is behind symmetric NAT (common on 4G /
// corporate). Cloudflare's free STUN is fronted by their global edge and is
// significantly more reliable in production than google.l alone — keep both
// for redundancy. openrelay TURN is a last-resort fallback (rate-limited).
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// Toggle verbose connection logging via localStorage so production users can
// help diagnose by running `localStorage.setItem('vp_webrtc_debug', '1')` and
// reloading. Off by default to keep the console quiet.
const DEBUG = typeof localStorage !== 'undefined' && localStorage.getItem('vp_webrtc_debug') === '1';
function log(...args: any[]) { if (DEBUG) console.log('[WebRTC]', ...args); }

export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  peerStates: Map<string, RTCPeerConnectionState>;
  isMicOn: boolean;
  isCamOn: boolean;
  hasPermission: boolean;
  isStarting: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
}

interface Params {
  localUserId: string;
  remoteParticipantList: RemoteParticipantInfo[];
  broadcastWebRTCSignal: (to: string, data: any) => void;
  registerWebRTCSignalHandler: (handler: (payload: { from: string; to: string; data: any }) => void) => () => void;
  active: boolean;
}

export function useWebRTC({
  localUserId,
  remoteParticipantList,
  broadcastWebRTCSignal,
  registerWebRTCSignalHandler,
  active,
}: Params): UseWebRTCReturn {
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const makingOffer = useRef<Map<string, boolean>>(new Map());
  const broadcastRef = useRef(broadcastWebRTCSignal);
  const localUserIdRef = useRef(localUserId);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [peerStates, setPeerStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const knownPeerIds = useRef<Set<string>>(new Set());

  useEffect(() => { broadcastRef.current = broadcastWebRTCSignal; }, [broadcastWebRTCSignal]);
  useEffect(() => { localUserIdRef.current = localUserId; }, [localUserId]);

  // Smaller userId = polite side (rolls back on offer collision)
  const isPolite = useCallback((remoteUserId: string) => localUserIdRef.current < remoteUserId, []);

  function updatePeerState(userId: string, state: RTCPeerConnectionState) {
    setPeerStates(prev => new Map(prev).set(userId, state));
  }

  function addLocalTracksToPeer(pc: RTCPeerConnection) {
    if (!localStreamRef.current) return;
    const senders = pc.getSenders();
    for (const track of localStreamRef.current.getTracks()) {
      if (!senders.some(s => s.track?.id === track.id)) {
        pc.addTrack(track, localStreamRef.current);
      }
    }
  }

  function createPeerConnection(remoteUserId: string): RTCPeerConnection {
    const existing = peerConnections.current.get(remoteUserId);
    if (existing && existing.connectionState !== 'closed' && existing.connectionState !== 'failed') {
      return existing;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add sendrecv transceivers so ICE gathers candidates immediately, even before local
    // tracks exist. addTrack() later reuses these transceivers without direction conflicts.
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.addTransceiver('video', { direction: 'sendrecv' });

    addLocalTracksToPeer(pc);

    const remoteStream = remoteStreamsRef.current.get(remoteUserId) ?? new MediaStream();
    remoteStreamsRef.current.set(remoteUserId, remoteStream);

    pc.ontrack = (event) => {
      if (!remoteStream.getTrackById(event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      setRemoteStreams(new Map(remoteStreamsRef.current));
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        broadcastRef.current(remoteUserId, { type: 'ice', candidate: e.candidate.toJSON() });
      }
    };

    // Surface ICE failures explicitly — peer connection states sometimes get
    // stuck in 'checking' when STUN/TURN can't establish a path, which is the
    // most common production failure that looks like "tiles are blank".
    pc.oniceconnectionstatechange = () => {
      log(remoteUserId, 'iceConnectionState →', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.warn('[WebRTC] ICE failed for peer', remoteUserId, '— attempting restartIce()');
        try { pc.restartIce(); } catch (e) { console.warn('[WebRTC] restartIce error', e); }
      }
    };

    pc.onconnectionstatechange = () => {
      log(remoteUserId, 'connectionState →', pc.connectionState);
      updatePeerState(remoteUserId, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peerConnections.current.delete(remoteUserId);
        remoteStreamsRef.current.delete(remoteUserId);
        makingOffer.current.delete(remoteUserId);
        setRemoteStreams(new Map(remoteStreamsRef.current));
      }
    };

    peerConnections.current.set(remoteUserId, pc);
    makingOffer.current.set(remoteUserId, false);
    updatePeerState(remoteUserId, 'new');
    return pc;
  }

  // Perfect negotiation: BOTH sides always offer.
  // Polite side (smaller userId) rolls back on collision.
  async function initiateConnection(remoteUserId: string) {
    const pc = createPeerConnection(remoteUserId);
    makingOffer.current.set(remoteUserId, true);
    try {
      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable') { makingOffer.current.set(remoteUserId, false); return; }
      await pc.setLocalDescription(offer);
      broadcastRef.current(remoteUserId, { type: 'offer', sdp: pc.localDescription });
    } catch (e) {
      console.warn('[WebRTC] offer error', e);
    } finally {
      makingOffer.current.set(remoteUserId, false);
    }
  }

  const handleSignal = useCallback(async (payload: { from: string; to: string; data: any }) => {
    if (payload.to !== localUserIdRef.current) return;
    const { from, data } = payload;

    if (data.type === 'offer') {
      const pc = createPeerConnection(from);
      const polite = isPolite(from);
      const collision = makingOffer.current.get(from) || pc.signalingState !== 'stable';

      if (!polite && collision) return;

      try {
        if (collision) {
          await pc.setLocalDescription({ type: 'rollback' });
        }
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        addLocalTracksToPeer(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        broadcastRef.current(from, { type: 'answer', sdp: pc.localDescription });
      } catch (e) {
        console.warn('[WebRTC] answer error', e);
      }

    } else if (data.type === 'answer') {
      const pc = peerConnections.current.get(from);
      if (pc && pc.signalingState === 'have-local-offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } catch (e) {
          console.warn('[WebRTC] setRemoteDescription(answer) error', e);
        }
      }

    } else if (data.type === 'ice') {
      const pc = peerConnections.current.get(from);
      if (pc && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch {
          // harmless timing issues
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start/stop media when boardroom activates
  useEffect(() => {
    if (!active) {
      for (const pc of peerConnections.current.values()) pc.close();
      peerConnections.current.clear();
      knownPeerIds.current.clear();
      remoteStreamsRef.current.clear();
      makingOffer.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      setLocalStream(null);
      setRemoteStreams(new Map());
      setPeerStates(new Map());
      setHasPermission(false);
      return;
    }

    setIsStarting(true);
    const tryMedia = (video: boolean) =>
      navigator.mediaDevices.getUserMedia({ video, audio: true });

    tryMedia(true)
      .catch((err) => {
        log('getUserMedia(video+audio) failed, retrying audio-only:', err?.name, err?.message);
        return tryMedia(false);
      })
      .then(stream => {
        log('getUserMedia success — tracks:', stream.getTracks().map(t => `${t.kind}:${t.label}`));
        localStreamRef.current = stream;
        setLocalStream(stream);
        setHasPermission(true);
        setIsStarting(false);

        for (const [userId, pc] of peerConnections.current.entries()) {
          if (pc.signalingState === 'closed') continue;
          addLocalTracksToPeer(pc);
          if (pc.signalingState === 'stable') {
            initiateConnection(userId);
          }
        }
      })
      .catch((err) => {
        // Both attempts failed — surface the cause and leave hasPermission
        // false so the UI can show "Allow camera/microphone" guidance.
        console.error('[WebRTC] getUserMedia denied or unavailable:', err?.name, err?.message);
        setIsStarting(false);
        setHasPermission(false);
      });

    return () => {
      for (const pc of peerConnections.current.values()) pc.close();
      peerConnections.current.clear();
      knownPeerIds.current.clear();
      remoteStreamsRef.current.clear();
      makingOffer.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      setLocalStream(null);
      setRemoteStreams(new Map());
      setPeerStates(new Map());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Connect to each remote participant — both sides always initiate (perfect negotiation handles collision)
  useEffect(() => {
    if (!active || !hasPermission) return;

    for (const p of remoteParticipantList) {
      if (!knownPeerIds.current.has(p.userId)) {
        knownPeerIds.current.add(p.userId);
        initiateConnection(p.userId);
      }
    }

    const currentIds = new Set(remoteParticipantList.map(p => p.userId));
    for (const [id, pc] of peerConnections.current.entries()) {
      if (!currentIds.has(id)) {
        pc.close();
        peerConnections.current.delete(id);
        knownPeerIds.current.delete(id);
        remoteStreamsRef.current.delete(id);
        makingOffer.current.delete(id);
        setRemoteStreams(new Map(remoteStreamsRef.current));
        setPeerStates(prev => { const m = new Map(prev); m.delete(id); return m; });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hasPermission, remoteParticipantList]);

  // Register signal handler unconditionally — we need to answer incoming offers even if
  // we haven't entered boardroom mode yet (avoids Perfect Negotiation deadlock where
  // the impolite side's early offer gets dropped and both sides get stuck in have-local-offer).
  useEffect(() => {
    return registerWebRTCSignalHandler(handleSignal);
  }, [registerWebRTCSignalHandler, handleSignal]);

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !isMicOn;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = next; });
    setIsMicOn(next);
  }, [isMicOn]);

  const toggleCam = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !isCamOn;
    localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = next; });
    setIsCamOn(next);
  }, [isCamOn]);

  return { localStream, remoteStreams, peerStates, isMicOn, isCamOn, hasPermission, isStarting, toggleMic, toggleCam };
}
