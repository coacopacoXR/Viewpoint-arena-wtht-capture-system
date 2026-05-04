import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { usePresence } from '../../lib/PresenceContext';
import ViewpointCanvas from '../Scene/ViewpointCanvas';
import BoardroomCountdown from './BoardroomCountdown';
import { InsightCard, SpatialComment } from '../../types';
import { MonitorPlay, Radio } from 'lucide-react';

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
    boardroomLeaderId, time, isPrivacyMode,
  } = useStore(useShallow(state => ({
    insightCards: state.insightCards,
    isBoardroomMode: state.isBoardroomMode,
    sessionHostId: state.sessionHostId,
    followingRemoteUserId: state.followingRemoteUserId,
    setFollowingRemoteUser: state.setFollowingRemoteUser,
    boardroomLeaderId: state.boardroomLeaderId,
    time: state.time,
    isPrivacyMode: state.isPrivacyMode,
  })));

  const { remoteParticipantList, broadcastPresence, broadcastCommentAdd, localUserId } = usePresence();

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
    return (
      <div
        className="flex flex-col overflow-hidden"
        style={{ height: '100dvh', background: '#0a0a0a', fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {/* BoardroomCountdown overlay (handles its own visibility via store) */}
        <BoardroomCountdown />

        {/* Boardroom header */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b"
          style={{ borderColor: '#1f1f1f', background: '#0d0d0d' }}
        >
          <div className="flex items-center gap-2.5">
            <MonitorPlay size={13} className="text-white/50" />
            <span className="text-white text-[11px] font-bold tracking-tight uppercase">Boardroom</span>
            <div className="h-3.5 w-px bg-white/10" />
            {!isPrivacyMode && (
              <div className="flex items-center gap-1 text-[9px] font-mono text-green-400">
                <Radio size={8} className="animate-pulse" />
                REC
              </div>
            )}
            <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{formatTime(time)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#1a1a1a', color: '#6b7280', border: '1px solid #2a2a2a' }}>
              {roomId.slice(0, 6).toUpperCase()}
            </span>
            <div className="flex items-center gap-1">
              <span style={{ color: '#10b981', fontSize: 7 }}>●</span>
              <span className="font-mono text-[9px]" style={{ color: '#4b5563' }}>{allParticipants.length} live</span>
            </div>
          </div>
        </div>

        {/* Presenter / shared screen — 3D canvas constrained to ~42% height */}
        <div className="flex-shrink-0 relative" style={{ height: '42dvh' }}>
          <ViewpointCanvas />
          {/* Presenter label */}
          {leaderName && (
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-yellow-300 text-[10px] font-mono font-bold">{leaderName}</span>
                <span className="text-white/40 text-[10px] font-mono">presenting</span>
              </div>
            </div>
          )}
          {/* Shared screen label */}
          <div className="absolute bottom-2 left-2 pointer-events-none">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.6)' }}>
              <span className="font-mono text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>SHARED SCREEN</span>
            </div>
          </div>
        </div>

        {/* Participant strip — horizontal scroll */}
        <div
          className="flex-shrink-0 flex gap-2.5 px-3 py-2.5 overflow-x-auto border-b border-t"
          style={{ borderColor: '#1f1f1f', background: '#0d0d0d' }}
        >
          {allParticipants.map(p => (
            <div key={p.userId} className="flex flex-col items-center gap-1 shrink-0">
              <div
                className="relative rounded-xl overflow-hidden flex items-center justify-center"
                style={{
                  width: 56,
                  height: 42,
                  background: `radial-gradient(ellipse at 50% 20%, ${p.color}22 0%, #111 80%)`,
                  border: boardroomLeaderId === p.userId
                    ? '1.5px solid rgba(251,191,36,0.6)'
                    : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: p.color }}
                >
                  {p.name[0]?.toUpperCase()}
                </div>
                {boardroomLeaderId === p.userId && (
                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-0.5" style={{ background: 'rgba(251,191,36,0.25)' }}>
                    <span className="font-mono text-[7px] text-yellow-300 font-bold">PRES</span>
                  </div>
                )}
                {p.isYou && (
                  <div className="absolute top-0.5 right-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  </div>
                )}
              </div>
              <span className="font-mono text-[8px] max-w-[56px] truncate text-center" style={{ color: '#6b7280' }}>
                {p.isYou ? 'You' : p.name.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>

        {/* Insight cards feed */}
        <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-0">
          {insightCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-6">
              <span style={{ fontSize: 22, opacity: 0.5 }}>✦</span>
              <p className="font-mono text-[11px]" style={{ color: '#374151' }}>Waiting for AI insights…</p>
            </div>
          ) : (
            [...insightCards].reverse().map((card: InsightCard) => {
              const s = TYPE_STYLES[card.type] ?? { border: 'rgba(255,255,255,0.1)', text: '#9ca3af', dot: '#4b5563' };
              return (
                <div key={card.id} className="rounded-xl p-3" style={{ background: '#111', border: `1px solid ${s.border}` }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot, display: 'inline-block' }} />
                    <span className="text-[9px] font-bold font-mono uppercase tracking-wide" style={{ color: s.text }}>{card.type}</span>
                    <span className="ml-auto font-mono text-[8px]" style={{ color: '#374151' }}>{card.agentId}</span>
                  </div>
                  <p className="text-xs font-semibold mb-1 leading-snug" style={{ color: '#f3f4f6' }}>{card.title}</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: '#6b7280' }}>{card.description}</p>
                </div>
              );
            })
          )}
        </div>

        {/* Comment input */}
        <div className="flex-shrink-0 px-3 py-2.5 border-t" style={{ borderColor: '#1f1f1f', background: '#0a0a0a', paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
              placeholder="Comment to room…"
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#f3f4f6' }}
            />
            <button
              onClick={handleSend}
              disabled={!commentText.trim()}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: sent ? 'rgba(16,185,129,0.2)' : commentText.trim() ? '#fff' : '#1a1a1a',
                color: sent ? '#10b981' : commentText.trim() ? '#000' : '#374151',
                border: sent ? '1px solid rgba(16,185,129,0.4)' : '1px solid #2a2a2a',
              }}
            >
              {sent ? '✓' : '↑'}
            </button>
          </div>
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
