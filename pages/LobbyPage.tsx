import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase, TrackerSession } from '../lib/supabase';
import { useIdentity, saveIdentity, AVATAR_COLORS, UserIdentity } from '../lib/identity';
import { listRecentCurations, deleteCuration, getCurationSummary, type CurationSummary } from '../lib/curationsRepo';
import { Camera, MapPin, Layers, Play, Pencil, Trash2 } from 'lucide-react';

const ROLES = ['Engineer', 'Designer', 'Systems Architect', 'Reviewer', 'Observer'];

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface SessionStats {
  sessions: TrackerSession[];
  totalItems: number;
  openRisks: number;
  pendingActions: number;
}

async function fetchStats(): Promise<SessionStats> {
  const [{ data: sessions }, { data: items }] = await Promise.all([
    supabase.from('tracker_sessions').select('*').order('ended_at', { ascending: false }).limit(4),
    supabase.from('tracker_items').select('type,status'),
  ]);
  return {
    sessions: (sessions ?? []) as TrackerSession[],
    totalItems: items?.length ?? 0,
    openRisks: items?.filter(i => i.type === 'RISK' && i.status !== 'Approved' && i.status !== 'Rejected').length ?? 0,
    pendingActions: items?.filter(i => i.type === 'ACTION' && i.status !== 'Approved' && i.status !== 'Rejected').length ?? 0,
  };
}

// ─── Lobby Page ───────────────────────────────────────────────────────────────

const LobbyPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const joinRoomId: string | undefined = (location.state as any)?.joinRoomId;

  const [identity, setIdentity] = useIdentity();
  const [name, setName] = useState(joinRoomId ? '' : (identity?.name ?? ''));
  const [color, setColor] = useState(identity?.color ?? AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
  const [role, setRole] = useState(identity?.role ?? '');
  const [joinCode, setJoinCode] = useState(joinRoomId ?? '');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [curations, setCurations] = useState<CurationSummary[]>([]);
  const [invitedPreview, setInvitedPreview] = useState<CurationSummary | null | undefined>(
    joinRoomId ? undefined : null,
  );

  useEffect(() => {
    fetchStats().then(s => { setStats(s); setLoadingStats(false); });
  }, []);

  useEffect(() => {
    listRecentCurations(8).then(setCurations);
  }, []);

  // If the user arrived via a room URL, fetch the curation summary so we can
  // show a preview card — they know exactly what they're walking into.
  useEffect(() => {
    if (!joinRoomId) { setInvitedPreview(null); return; }
    getCurationSummary(joinRoomId).then(setInvitedPreview);
  }, [joinRoomId]);

  function resumeCuration(id: string, mode: 'setup' | 'room') {
    const ident = name.trim() ? buildIdentity() : identity;
    if (ident) setIdentity(ident);
    if (mode === 'room') {
      sessionStorage.setItem('vp_enteredRoom', id);
      navigate(`/room/${id}`, { state: { fromLobby: true } });
    } else {
      navigate(`/review/${id}/setup`);
    }
  }

  async function handleDeleteCuration(id: string) {
    if (!confirm('Delete this curation? It will be gone for everyone with the link.')) return;
    const ok = await deleteCuration(id);
    if (ok) setCurations((cs) => cs.filter((c) => c.id !== id));
  }

  function buildIdentity(): UserIdentity {
    return { name: name.trim(), color, role: role || undefined };
  }

  function enterRoom(roomId: string) {
    const id = buildIdentity();
    setIdentity(id);
    sessionStorage.setItem('vp_enteredRoom', roomId);
    navigate(`/room/${roomId}`, { state: { fromLobby: true } });
  }

  function handleNewSession() {
    if (!name.trim()) { setError('Enter your name first.'); return; }
    enterRoom(crypto.randomUUID());
  }

  function handleCurateReview() {
    if (!name.trim()) { setError('Enter your name first.'); return; }
    const id = buildIdentity();
    setIdentity(id);
    const reviewId = crypto.randomUUID();
    navigate(`/review/${reviewId}/setup`);
  }

  function handleJoin() {
    if (!name.trim()) { setError('Enter your name first.'); return; }
    const code = joinCode.trim();
    if (!code) { setError('Enter a room code.'); return; }
    enterRoom(code);
  }

  const isReturning = !!identity?.name && !joinRoomId;

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex font-sans" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Left Panel: Branding + Live Stats ── */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 border-r border-white/5 px-10 py-12">
        {/* Logo */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-black font-black text-sm">VA</span>
            </div>
            <span className="font-mono text-white text-sm font-bold tracking-widest uppercase">Viewpoint Arena</span>
          </div>
          <p className="text-gray-600 text-sm mt-4 leading-relaxed">
            AI-powered collaborative design review. Real-time 3D sessions with automated risk, action, and rationale capture.
          </p>

          {/* Feature list */}
          <div className="mt-8 space-y-3">
            {[
              { icon: '🧊', label: '3D spatial annotations' },
              { icon: '🤖', label: 'Multi-agent AI analysis' },
              { icon: '🔴', label: 'Live risk matrix & tracking' },
              { icon: '💬', label: 'Teams & SharePoint sync' },
              { icon: '⚙️', label: 'Teamcenter PLM push' },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-3">
                <span className="text-base">{f.icon}</span>
                <span className="text-gray-500 text-sm">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live tracker stats */}
        <div>
          <p className="font-mono text-[9px] font-bold text-gray-700 uppercase tracking-widest mb-4">Live Tracker</p>
          {loadingStats ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />)}
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'Items', value: stats.totalItems, color: 'text-white' },
                  { label: 'Open Risks', value: stats.openRisks, color: stats.openRisks > 0 ? 'text-red-400' : 'text-white' },
                  { label: 'Pending', value: stats.pendingActions, color: stats.pendingActions > 0 ? 'text-blue-400' : 'text-white' },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded-xl p-3 text-center">
                    <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] font-mono text-gray-600 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {stats.sessions.map(s => (
                  <button key={s.id} onClick={() => navigate('/tracker')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left group">
                    <span className="text-xs text-gray-400 truncate flex-1 group-hover:text-gray-200 transition-colors">{s.title}</span>
                    <span className="font-mono text-[10px] text-gray-700 ml-2 flex-shrink-0">{fmtShort(s.ended_at)}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => navigate('/tracker')}
                className="mt-3 w-full text-xs font-mono text-gray-600 hover:text-gray-300 transition-colors text-center">
                Open Tracker →
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-700 font-mono">No sessions yet.</p>
          )}
        </div>
      </div>

      {/* ── Right Panel: Identity + Actions ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">

          {/* Welcome message */}
          <div>
            {isReturning ? (
              <>
                <p className="text-gray-600 text-xs font-mono uppercase tracking-widest mb-1">Welcome back</p>
                <h1 className="text-white text-3xl font-bold">{identity?.name}</h1>
                {identity?.role && <p className="text-gray-500 text-sm mt-1">{identity.role}</p>}
              </>
            ) : joinRoomId ? (
              <>
                <p className="text-gray-600 text-xs font-mono uppercase tracking-widest mb-1">You've been invited</p>
                <h1 className="text-white text-2xl font-bold">
                  {invitedPreview ? invitedPreview.title : 'Join a session'}
                </h1>
                {invitedPreview === undefined && (
                  <p className="text-gray-600 text-sm mt-1">Loading preview…</p>
                )}
                {invitedPreview === null && (
                  <p className="text-gray-600 text-sm mt-1">Identify yourself to continue.</p>
                )}
                {invitedPreview && (
                  <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                    {invitedPreview.description && (
                      <p className="text-[12px] text-gray-300 leading-snug line-clamp-2 mb-2">{invitedPreview.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="inline-flex items-center gap-1 text-emerald-300"><Layers size={10} />{invitedPreview.slide_count} slides</span>
                      <span className="inline-flex items-center gap-1 text-gray-400"><Camera size={10} />{invitedPreview.viewpoint_count} viewpoints</span>
                      <span className="inline-flex items-center gap-1 text-gray-400"><MapPin size={10} />{invitedPreview.pin_count} pins</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2">
                      Last updated {fmtShort(invitedPreview.updated_at)} · ID {invitedPreview.id.slice(0, 8)}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <h1 className="text-white text-3xl font-bold">Enter the Arena</h1>
                <p className="text-gray-600 text-sm mt-2">Identify yourself to start or join a session.</p>
              </>
            )}
          </div>

          {/* Identity form */}
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-[10px] font-mono font-bold text-gray-600 uppercase tracking-widest mb-2">Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleNewSession()}
                placeholder="e.g. Alex Chen"
                maxLength={40}
                autoFocus
                className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 placeholder:text-gray-700 transition-colors"
              />
            </div>

            {/* Color */}
            <div>
              <label className="block text-[10px] font-mono font-bold text-gray-600 uppercase tracking-widest mb-2">Avatar colour</label>
              <div className="flex gap-2">
                {AVATAR_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                    style={{ backgroundColor: c, borderColor: color === c ? '#fff' : 'transparent' }} />
                ))}
              </div>
            </div>

            {/* Role (collapsible) */}
            <div>
              <button onClick={() => setShowAdvanced(v => !v)}
                className="text-[10px] font-mono text-gray-600 hover:text-gray-400 uppercase tracking-widest transition-colors">
                {showAdvanced ? '▾' : '▸'} Role (optional)
              </button>
              {showAdvanced && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {ROLES.map(r => (
                    <button key={r} onClick={() => setRole(role === r ? '' : r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors text-left ${role === r ? 'bg-white text-gray-900 border-white' : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30 hover:text-gray-300'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button onClick={handleNewSession}
              className={`w-full text-sm font-bold py-3 rounded-xl transition-colors ${joinCode.trim() ? 'bg-white/10 hover:bg-white/20 text-gray-400 border border-white/10' : 'bg-white hover:bg-gray-100 text-gray-900'}`}>
              {isReturning ? 'New session' : 'Start new session'}
            </button>

            <button onClick={handleCurateReview}
              className="w-full text-sm font-bold py-3 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/20 transition-colors">
              Curate a design review →
            </button>

            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                placeholder="Room code to join…"
                className="flex-1 bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 placeholder:text-gray-700 transition-colors"
              />
              <button onClick={handleJoin}
                className={`text-sm px-5 py-3 rounded-xl transition-colors font-bold ${joinCode.trim() ? 'bg-white hover:bg-gray-100 text-gray-900' : 'bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white border border-white/10'}`}>
                Join
              </button>
            </div>

            {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
          </div>

          {/* Saved curations */}
          <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-gray-600">
                  Saved Reviews{curations.length > 0 ? ` · ${curations.length}` : ''}
                </span>
                <div className="flex-1 h-px bg-white/5" />
              </div>
              {curations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center">
                  <p className="text-[11px] text-gray-500">No saved reviews yet.</p>
                  <p className="text-[10px] text-gray-600 mt-1">
                    Click <span className="text-emerald-400">Curate a design review</span> to start one — it'll save automatically and appear here for anyone you share the link with.
                  </p>
                </div>
              ) : (
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                {curations.map((c) => (
                  <div
                    key={c.id}
                    className="group rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-emerald-500/30 transition-colors"
                  >
                    <button
                      onClick={() => resumeCuration(c.id, 'room')}
                      className="w-full text-left px-3 py-2"
                      title="Open the review room"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white truncate">{c.title || 'Untitled review'}</span>
                        <span className="text-[9px] font-mono text-gray-600 shrink-0">{fmtShort(c.updated_at)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-gray-500">
                        <span className="inline-flex items-center gap-1"><Layers size={9} />{c.slide_count}</span>
                        <span className="inline-flex items-center gap-1"><Camera size={9} />{c.viewpoint_count}</span>
                        <span className="inline-flex items-center gap-1"><MapPin size={9} />{c.pin_count}</span>
                        <span className="ml-auto text-gray-700 font-mono truncate">{c.id.slice(0, 8)}</span>
                      </div>
                    </button>
                    <div className="px-3 pb-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => resumeCuration(c.id, 'room')}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200 text-[10px] font-bold uppercase tracking-wider transition-colors"
                      >
                        <Play size={10} /> Open Room
                      </button>
                      <button
                        onClick={() => resumeCuration(c.id, 'setup')}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/15 text-gray-300 text-[10px] font-bold uppercase tracking-wider transition-colors"
                        title="Resume editing"
                      >
                        <Pencil size={10} /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCuration(c.id)}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-red-500/20 hover:text-red-300 text-gray-500 transition-colors"
                        title="Delete curation"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>

          {/* Divider + Tracker link */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/5" />
            <button onClick={() => navigate('/tracker')}
              className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors whitespace-nowrap">
              Open Tracker ↗
            </button>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* Mobile stats (shown on small screens) */}
          <div className="flex lg:hidden justify-center gap-6 text-center">
            {loadingStats ? null : stats ? (
              <>
                <div><p className="text-white text-xl font-bold">{stats.totalItems}</p><p className="text-gray-600 text-[10px] font-mono">Items</p></div>
                <div><p className="text-red-400 text-xl font-bold">{stats.openRisks}</p><p className="text-gray-600 text-[10px] font-mono">Risks</p></div>
                <div><p className="text-blue-400 text-xl font-bold">{stats.pendingActions}</p><p className="text-gray-600 text-[10px] font-mono">Actions</p></div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LobbyPage;
