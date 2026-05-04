import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { usePresence } from '../../lib/PresenceContext';
import { useWebRTCContext } from '../../lib/WebRTCContext';
import ViewpointCanvas from '../Scene/ViewpointCanvas';
import BoardroomCountdown from './BoardroomCountdown';
import HumanParticipantTile from './Boardroom/HumanParticipantTile';
import { InsightCard, SpatialComment } from '../../types';
import { MonitorPlay, Radio, Mic, MicOff, Video, VideoOff, Power } from 'lucide-react';

type Tab = '3d' | 'insights' | 'people';

const TYPE_STYLES: Record<string, { border: string; text: string; dot: string }> = {
  RISK:      { border: 'rgba(239,68,68,0.35)',  text: '#f87171', dot: '#ef4444' },
  ACTION:    { border: 'rgba(59,130,246,0.35)', text: '#60a5fa', dot: '#3b82f6' },
  RATIONALE: { border: 'rgba(251,191,36,0.35)', text: '#fbbf24', dot: '#f59e0b' },
};

interface Props {
  roomId: string;
  userName: string;
}

const MobileRoomView: React.FC<Props> = ({ roomId, userName }) => {
  const {
    insightCards, isBoardroomMode, sessionHostId,
    followingRemoteUserId, setFollowingRemoteUser,
    boardroomLeaderId, time, isPrivacyMode, endMeeting,
  } = useStore(useShallow(state => ({
    insightCards: state.insightCards,
    isBoardroomMode: state.isBoardroomMode,
    sessionHostId: state.sessionHostId,
    followingRemoteUserId: state.followingRemoteUserId,
    setFollowingRemoteUser: state.setFollowingRemoteUser,
    boardroomLeaderId: state.boardroomLeaderId,
    time: state.time,
    isPrivacyMode: state.isPrivacyMode,
    endMeeting: state.endMeeting,
  })));

  const { remoteParticipantList, broadcastPresence, broadcastCommentAdd, broadcastMeetingEnd, localUserId } = usePresence();
  const { localStream, remoteStreams, isMicOn, isCamOn, toggleMic, toggleCam } = useWebRTCContext();

  const [activeTab, setActiveTab] = useState<Tab>('3d');
  const [commentText, setCommentText] = useState('');
  const [sent, setSent] = useState(false);
  const [freeExplore, setFreeExplore] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Broadcast presence so desktop sees this mobile user in its roster
  useEffect(() => {
    const ping = () => broadcastPresence([0, 0, 0], [0, 0, 0]);
    ping();
    const interval = setInterval(ping, 5000);
    return () => clearInterval(interval);
  }, [broadcastPresence]);

  // Auto-follow host or first remote participant
  useEffect(() => {
    const hostId = sessionHostId ?? remoteParticipantList[0]?.userId ?? null;
    if (hostId && hostId !== localUserId) {
      setFollowingRemoteUser(hostId);
      setFreeExplore(false);
    }
  }, [sessionHostId, remoteParticipantList.length]);

  // When boardroom activates, make sure we follow the boardroom leader
  useEffect(() => {
    if (isBoardroomMode && boardroomLeaderId && boardroomLeaderId !== localUserId) {
      setFollowingRemoteUser(boardroomLeaderId);
    }
  }, [isBoardroomMode, boardroomLeaderId]);

  // Auto-scroll insights on new card
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [insightCards.length]);

  const followingParticipant = followingRemoteUserId
    ? remoteParticipantList.find(p => p.userId === followingRemoteUserId)
    : null;

  const leaderName = boardroomLeaderId
    ? (boardroomLeaderId === localUserId
        ? 'You'
        : remoteParticipantList.find(p => p.userId === boardroomLeaderId)?.name ?? 'Host')
    : null;

  const allParticipants = [
    { userId: localUserId, name: userName, color: '#10b981', isYou: true },
    ...remoteParticipantList.map(p => ({ ...p, isYou: false })),
  ];

  function handleSend() {
    const text = commentText.trim();
    if (!text) return;
    const comment: SpatialComment = {
      id: `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'text',
      content: text,
      author: userName,
      authorColor: '#10b981',
      timestamp: Date.now(),
      position: { x: 0, y: 0, z: 0 },
      attachedToNodeId: '',
      attachedToNodeName: '',
      assignees: [],
      resolved: false,
      linkedToMeeting: true,
    };
    broadcastCommentAdd(comment);
    setCommentText('');
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  }

  function formatTime(t: number) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ─── BOARDROOM VIEW ─────────────────────────────────────────────────────────
  if (isBoardroomMode) {
    const isHost = sessionHostId === localUserId || sessionHostId === null;

    // PiP participants: self first, then up to 2 remote
    const pipParticipants = [
      { userId: localUserId, name: userName, color: '#10b981', isYou: true, stream: localStream },
      ...remoteParticipantList.slice(0, 2).map(p => ({
        userId: p.userId, name: p.name, color: p.color, isYou: false,
        stream: remoteStreams.get(p.userId) ?? null,
      })),
    ];

    return (
      <div
        className="relative overflow-hidden"
        style={{ height: '100dvh', background: '#0a0a0a' }}
      >
        <BoardroomCountdown />

        {/* 3D canvas fills entire screen */}
        <div className="absolute inset-0">
          <ViewpointCanvas />
        </div>

        {/* Header bar */}
        <div
          className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3"
          style={{ paddingTop: 'max(10px, env(safe-area-inset-top))', paddingBottom: 10, background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
        >
          <div className="flex items-center gap-2">
            <MonitorPlay size={12} className="text-white/50" />
            <span className="text-white text-[11px] font-bold tracking-tight uppercase">Boardroom</span>
            {!isPrivacyMode && (
              <>
                <div className="h-3 w-px bg-white/20" />
                <div className="flex items-center gap-1 text-[9px] font-mono text-green-400">
                  <Radio size={7} className="animate-pulse" />
                  REC
                </div>
              </>
            )}
            <span className="font-mono text-[9px] text-white/25">{formatTime(time)}</span>
          </div>
          {leaderName && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(251,191,36,0.4)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-300 text-[9px] font-mono font-bold">{leaderName}</span>
            </div>
          )}
        </div>

        {/* PiP camera tiles — stacked on right side */}
        <div className="absolute right-3 z-20 flex flex-col gap-2" style={{ top: 'max(56px, calc(env(safe-area-inset-top) + 48px))' }}>
          {pipParticipants.map(p => (
            <div key={p.userId} style={{ width: 88, height: 66 }} className="rounded-xl overflow-hidden shadow-lg ring-1 ring-white/10">
              <HumanParticipantTile
                stream={p.stream}
                name={p.name}
                color={p.color}
                isMicOn={p.isYou ? isMicOn : true}
                isCamOn={p.isYou ? isCamOn : true}
                isYou={p.isYou}
                isPresenter={boardroomLeaderId === p.userId}
                size="fill"
              />
            </div>
          ))}
        </div>

        {/* Bottom controls */}
        <div
          className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-5 py-4"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))', background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}
        >
          <button
            onClick={toggleMic}
            className="w-13 h-13 rounded-full flex items-center justify-center transition-all"
            style={{
              width: 52, height: 52,
              background: isMicOn ? 'rgba(255,255,255,0.15)' : 'rgba(239,68,68,0.35)',
              border: `1px solid ${isMicOn ? 'rgba(255,255,255,0.25)' : 'rgba(239,68,68,0.5)'}`,
            }}
          >
            {isMicOn ? <Mic size={20} color="#fff" /> : <MicOff size={20} color="#f87171" />}
          </button>

          <button
            onClick={toggleCam}
            className="rounded-full flex items-center justify-center transition-all"
            style={{
              width: 52, height: 52,
              background: isCamOn ? 'rgba(255,255,255,0.15)' : 'rgba(239,68,68,0.35)',
              border: `1px solid ${isCamOn ? 'rgba(255,255,255,0.25)' : 'rgba(239,68,68,0.5)'}`,
            }}
          >
            {isCamOn ? <Video size={20} color="#fff" /> : <VideoOff size={20} color="#f87171" />}
          </button>

          {isHost && (
            <button
              onClick={() => { endMeeting(true); broadcastMeetingEnd(); }}
              className="rounded-full flex items-center justify-center transition-all"
              style={{ width: 52, height: 52, background: 'rgba(239,68,68,0.3)', border: '1px solid rgba(239,68,68,0.45)' }}
            >
              <Power size={20} color="#f87171" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── ARENA VIEW (3D + tabs) ───────────────────────────────────────────────
  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: '100dvh', background: '#0a0a0a', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* BoardroomCountdown overlay */}
      <BoardroomCountdown />

      {/* Top bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: '#1f1f1f', background: '#0a0a0a', paddingTop: 'max(8px, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: '#fff' }}>
            <span style={{ color: '#000', fontWeight: 900, fontSize: 9 }}>VA</span>
          </div>
          <span className="text-white text-xs font-bold tracking-widest uppercase" style={{ fontFamily: 'monospace' }}>
            Viewpoint Arena
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1a1a1a', color: '#6b7280', border: '1px solid #2a2a2a' }}>
            {roomId.slice(0, 6).toUpperCase()}
          </span>
          <div className="flex items-center gap-1">
            <span style={{ color: '#10b981', fontSize: 7 }}>●</span>
            <span className="font-mono text-[10px]" style={{ color: '#4b5563' }}>{allParticipants.length}</span>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 min-h-0 relative overflow-hidden">

        {/* 3D Canvas — always mounted, hidden behind other tabs for perf */}
        <div className="absolute inset-0" style={{ visibility: activeTab === '3d' ? 'visible' : 'hidden' }}>
          <ViewpointCanvas />

          {/* Follow / explore badge */}
          {!freeExplore && followingParticipant && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                <div
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                  style={{ background: followingParticipant.color }}
                >
                  {followingParticipant.name[0]}
                </div>
                <span className="text-white text-[11px] font-mono">Following <span className="font-bold">{followingParticipant.name}</span></span>
                <button
                  onClick={() => { setFollowingRemoteUser(null); setFreeExplore(true); }}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
                >
                  Explore
                </button>
              </div>
            </div>
          )}

          {freeExplore && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}>
                <span className="text-white/50 text-[11px] font-mono">Free look</span>
                <button
                  onClick={() => {
                    const hostId = sessionHostId ?? remoteParticipantList[0]?.userId ?? null;
                    if (hostId && hostId !== localUserId) { setFollowingRemoteUser(hostId); setFreeExplore(false); }
                  }}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
                >
                  Re-attach
                </button>
              </div>
            </div>
          )}

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="px-3 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.4)' }}>
              <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>pinch zoom · drag rotate</span>
            </div>
          </div>
        </div>

        {/* Insights tab */}
        {activeTab === 'insights' && (
          <div ref={feedRef} className="absolute inset-0 overflow-y-auto px-4 py-4 space-y-3">
            {insightCards.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#111', border: '1px solid #2a2a2a' }}>
                  <span style={{ fontSize: 20 }}>✦</span>
                </div>
                <div>
                  <p className="text-white text-sm font-semibold mb-1">No insights yet</p>
                  <p className="font-mono text-xs" style={{ color: '#4b5563' }}>AI agents will post here during the session</p>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#10b981', fontSize: 7 }}>●</span>
                  <span className="font-mono text-[10px]" style={{ color: '#374151' }}>Connected</span>
                </div>
              </div>
            ) : (
              insightCards.map((card: InsightCard) => {
                const s = TYPE_STYLES[card.type] ?? { border: 'rgba(255,255,255,0.1)', text: '#9ca3af', dot: '#4b5563' };
                return (
                  <div key={card.id} className="rounded-2xl p-4" style={{ background: '#111', border: `1px solid ${s.border}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot, display: 'inline-block' }} />
                      <span className="text-[10px] font-bold font-mono uppercase tracking-wide" style={{ color: s.text }}>{card.type}</span>
                      <span className="ml-auto font-mono text-[9px]" style={{ color: '#374151' }}>{card.agentId}</span>
                    </div>
                    <p className="text-sm font-semibold mb-1.5 leading-snug" style={{ color: '#f3f4f6' }}>{card.title}</p>
                    <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>{card.description}</p>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* People tab */}
        {activeTab === 'people' && (
          <div className="absolute inset-0 overflow-y-auto px-4 py-4 space-y-2">
            {allParticipants.map(p => (
              <div key={p.userId} className="flex items-center gap-3 rounded-xl px-3 py-3" style={{ background: '#111', border: '1px solid #1f1f1f' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: p.color }}>
                  {p.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#f3f4f6' }}>
                    {p.name}
                    {p.isYou && <span className="ml-1.5 text-[9px] font-mono" style={{ color: '#374151' }}>YOU</span>}
                  </p>
                  <p className="text-[10px] font-mono" style={{ color: '#374151' }}>
                    {p.isYou ? 'Mobile' : p.userId === sessionHostId ? 'Host' : 'Desktop'}
                  </p>
                </div>
                {!p.isYou && (
                  <button
                    onClick={() => { setFollowingRemoteUser(p.userId); setFreeExplore(false); setActiveTab('3d'); }}
                    className="text-[9px] font-mono px-2 py-1 rounded-lg shrink-0"
                    style={{
                      background: followingRemoteUserId === p.userId ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                      color: followingRemoteUserId === p.userId ? '#10b981' : '#6b7280',
                      border: followingRemoteUserId === p.userId ? '1px solid rgba(16,185,129,0.3)' : '1px solid #2a2a2a',
                    }}
                  >
                    {followingRemoteUserId === p.userId ? 'Following' : 'Follow'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div
        className="flex-shrink-0 flex border-t"
        style={{ borderColor: '#1f1f1f', background: '#0a0a0a', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {([
          { id: '3d' as Tab,       label: '3D View',  emoji: '⬡' },
          { id: 'insights' as Tab, label: 'Insights', emoji: '✦', badge: insightCards.length || undefined },
          { id: 'people' as Tab,   label: 'People',   emoji: '●', badge: allParticipants.length },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5 relative transition-colors"
            style={{ color: activeTab === t.id ? '#fff' : '#4b5563' }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>{t.emoji}</span>
            <span className="text-[9px] font-mono uppercase tracking-wider mt-0.5">{t.label}</span>
            {t.badge ? (
              <span
                className="absolute top-1.5 right-[25%] w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center"
                style={{ background: '#10b981', color: '#000' }}
              >
                {t.badge > 9 ? '9+' : t.badge}
              </span>
            ) : null}
            {activeTab === t.id && (
              <div className="absolute top-0 left-3 right-3 h-0.5 rounded-full" style={{ background: '#fff' }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MobileRoomView;
