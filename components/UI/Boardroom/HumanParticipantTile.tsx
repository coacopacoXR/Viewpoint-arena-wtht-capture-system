import React, { useEffect, useRef, useState } from 'react';

interface HumanParticipantTileProps {
  stream: MediaStream | null;
  name: string;
  color: string;
  isMicOn?: boolean;
  isCamOn?: boolean;
  isYou?: boolean;
  isPresenter?: boolean;
  size?: 'sm' | 'md' | 'fill';
  // Remote peer's WebRTC connection state. Undefined for the local "You" tile.
  // Surfaced as a small badge so a stuck "connecting" tile is visible at a
  // glance — that's the common production failure when STUN/TURN can't
  // establish a path.
  connectionState?: RTCPeerConnectionState;
}

const HumanParticipantTile: React.FC<HumanParticipantTileProps> = ({
  stream,
  name,
  color,
  isMicOn = true,
  isCamOn = true,
  isYou = false,
  isPresenter = false,
  size = 'md',
  connectionState,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Attach stream to video element and force play(). Some browsers (notably
  // Safari and Chrome with autoplay-with-sound restrictions) silently leave
  // remote video paused — calling play() explicitly and catching the rejection
  // lets us flip a "click to play" badge instead of showing a black tile.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (stream) {
      v.srcObject = stream;
      v.play()
        .then(() => setAutoplayBlocked(false))
        .catch((err) => {
          console.warn('[HumanParticipantTile] play() rejected:', err?.name, err?.message);
          setAutoplayBlocked(true);
        });
    } else {
      v.srcObject = null;
      setAutoplayBlocked(false);
    }
  }, [stream]);

  // Audio level detection — only for local user for performance
  useEffect(() => {
    if (!stream || !isYou) return;
    let ctx: AudioContext | null = null;
    let animId: number;
    try {
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyzer = ctx.createAnalyser();
      analyzer.fftSize = 256;
      src.connect(analyzer);
      const buf = new Uint8Array(analyzer.frequencyBinCount);
      function tick() {
        analyzer.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setAudioLevel(avg);
        animId = requestAnimationFrame(tick);
      }
      tick();
    } catch {
      // AudioContext not available
    }
    return () => {
      cancelAnimationFrame(animId);
      ctx?.close();
    };
  }, [stream, isYou]);

  const isSpeaking = isYou && isMicOn && audioLevel > 12;

  const hasActiveVideo = !!(
    stream &&
    isCamOn !== false &&
    stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live')
  );

  const initials = name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const sizeClasses =
    size === 'sm'
      ? 'w-28 h-20'
      : size === 'fill'
      ? 'w-full h-full'
      : 'w-44 h-32';

  return (
    <div
      className={`relative rounded-lg overflow-hidden shrink-0 ${size !== 'fill' ? sizeClasses : 'w-full h-full'} group`}
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${color}22 0%, #0d0d0d 80%)`,
        boxShadow: isSpeaking ? `0 0 0 2px ${color}` : '0 0 0 1px rgba(255,255,255,0.12)',
      }}
    >
      {/* Corner brackets */}
      <div className="absolute top-1.5 left-1.5 w-3 h-3 border-t border-l border-white/20 rounded-tl z-10 pointer-events-none" />
      <div className="absolute top-1.5 right-1.5 w-3 h-3 border-t border-r border-white/20 rounded-tr z-10 pointer-events-none" />
      <div className="absolute bottom-6 left-1.5 w-3 h-3 border-b border-l border-white/20 rounded-bl z-10 pointer-events-none" />
      <div className="absolute bottom-6 right-1.5 w-3 h-3 border-b border-r border-white/20 rounded-br z-10 pointer-events-none" />

      {/* Video element — always mounted, hidden when no active video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isYou}
        className="absolute inset-0 w-full h-full"
        style={{
          objectFit: 'cover',
          display: hasActiveVideo ? 'block' : 'none',
        }}
      />

      {/* Avatar fallback when no video */}
      {!hasActiveVideo && (
        <div className="flex items-center justify-center h-[calc(100%-28px)] relative">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shadow-lg"
            style={{ background: color, boxShadow: `0 0 20px ${color}55` }}
          >
            {initials}
          </div>
          {!isCamOn && (
            <div className="absolute bottom-2 right-2 text-[7px] font-mono text-white/25 bg-black/30 px-1.5 py-0.5 rounded tracking-wider">
              CAM OFF
            </div>
          )}
        </div>
      )}

      {/* Speaking ring glow */}
      {isSpeaking && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{ boxShadow: `inset 0 0 0 2px ${color}`, opacity: 0.85 }}
        />
      )}

      {/* Live indicator */}
      {hasActiveVideo && !autoplayBlocked && (
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/50 px-1.5 py-0.5 rounded z-20">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[7px] font-mono text-green-400">LIVE</span>
        </div>
      )}

      {/* Connection-state badge for remote tiles. Hidden once connected so
          the tile chrome stays clean — only visible while connecting/failed
          so the user can spot a stuck peer at a glance. */}
      {!isYou && connectionState && connectionState !== 'connected' && (
        <div
          className={`absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded z-20 ${
            connectionState === 'failed' || connectionState === 'closed'
              ? 'text-red-400'
              : connectionState === 'disconnected'
              ? 'text-amber-400'
              : 'text-blue-300'
          }`}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${
            connectionState === 'failed' || connectionState === 'closed'
              ? 'bg-red-400'
              : connectionState === 'disconnected'
              ? 'bg-amber-400'
              : 'bg-blue-300 animate-pulse'
          }`} />
          <span className="text-[7px] font-mono uppercase tracking-widest">
            {connectionState}
          </span>
        </div>
      )}

      {/* Autoplay-blocked overlay: click to start playback. Required when
          remote audio tracks are unmuted and the user hasn't gestured on the
          page yet (some browsers gate cross-origin audio behind a click). */}
      {autoplayBlocked && stream && (
        <button
          onClick={() => {
            videoRef.current?.play().then(() => setAutoplayBlocked(false)).catch(() => {});
          }}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 hover:bg-black/70 transition-colors"
        >
          <div className="text-white text-[9px] font-mono uppercase tracking-widest bg-black/70 px-2 py-1 rounded border border-white/30">
            ▶ Click to play
          </div>
        </button>
      )}

      {/* Mic muted indicator */}
      {!isMicOn && (
        <div className="absolute top-1.5 right-1.5 bg-red-500/80 p-0.5 rounded z-20">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>
      )}

      {/* Name bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-2 py-1 flex items-center justify-between z-20">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-white text-[10px] font-mono font-bold truncate">
            {isYou ? 'YOU' : name.split(' ')[0]}
          </span>
        </div>
        {isPresenter && (
          <span className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0 bg-yellow-500/30 text-yellow-300">PRES</span>
        )}
        {isYou && !isPresenter && (
          <span className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0 bg-emerald-500/30 text-emerald-300">YOU</span>
        )}
      </div>
    </div>
  );
};

export default HumanParticipantTile;
