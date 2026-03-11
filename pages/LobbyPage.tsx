import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const COLORS = ['#4F8EF7', '#F76B4F', '#4FF7A0', '#F7E24F', '#C44FF7', '#F74FA0'];

function getOrCreateUser() {
  const stored = localStorage.getItem('vp_user');
  if (stored) return JSON.parse(stored);
  const user = {
    name: '',
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
  return user;
}

const LobbyPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // If redirected from a direct room URL, joinRoomId is set
  const joinRoomId: string | undefined = (location.state as any)?.joinRoomId;

  // When joining via a shared link, start with blank name so they must identify themselves
  const stored = joinRoomId ? { name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)] } : getOrCreateUser();

  const [name, setName] = useState<string>(stored.name || '');
  const [color, setColor] = useState<string>(stored.color);
  const [joinCode, setJoinCode] = useState(joinRoomId ?? '');
  const [joinError, setJoinError] = useState('');

  function saveUser(n: string, c: string) {
    localStorage.setItem('vp_user', JSON.stringify({ name: n, color: c }));
  }

  function enterRoom(roomId: string) {
    sessionStorage.setItem('vp_enteredRoom', roomId);
    navigate(`/room/${roomId}`, { state: { fromLobby: true } });
  }

  function handleNewSession() {
    const trimmed = name.trim();
    if (!trimmed) { setJoinError('Enter your name first.'); return; }
    saveUser(trimmed, color);
    enterRoom(crypto.randomUUID());
  }

  function handleJoin() {
    const trimmed = name.trim();
    if (!trimmed) { setJoinError('Enter your name first.'); return; }
    const code = joinCode.trim();
    if (!code) { setJoinError('Enter a room code.'); return; }
    saveUser(trimmed, color);
    enterRoom(code);
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center font-mono">
      <div className="w-full max-w-sm space-y-8 px-6">
        {/* Title */}
        <div>
          <h1 className="text-white text-2xl font-semibold tracking-tight">Viewpoint Arena</h1>
          <p className="text-[#666] text-sm mt-1">
            {joinRoomId ? `You've been invited to a session` : 'Collaborative 3D design review'}
          </p>
        </div>

        {/* Identity */}
        <div className="space-y-3">
          <label className="text-[#999] text-xs uppercase tracking-widest">Your name</label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setJoinError(''); }}
            placeholder="e.g. Alex"
            maxLength={32}
            className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-white rounded px-3 py-2 text-sm outline-none focus:border-[#4F8EF7] placeholder:text-[#444]"
          />

          <div className="flex items-center gap-2">
            <span className="text-[#999] text-xs uppercase tracking-widest">Color</span>
            <div className="flex gap-2 ml-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-5 h-5 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? '#fff' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleNewSession}
            className="w-full bg-[#4F8EF7] hover:bg-[#3a7de0] text-white text-sm font-medium py-2.5 rounded transition-colors"
          >
            New session
          </button>

          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value); setJoinError(''); }}
              placeholder="Room code"
              className="flex-1 bg-[#1A1A1A] border border-[#2A2A2A] text-white rounded px-3 py-2 text-sm outline-none focus:border-[#4F8EF7] placeholder:text-[#444]"
            />
            <button
              onClick={handleJoin}
              className="bg-[#1A1A1A] hover:bg-[#2A2A2A] border border-[#2A2A2A] text-[#ccc] text-sm px-4 py-2 rounded transition-colors"
            >
              Join
            </button>
          </div>

          {joinError && (
            <p className="text-red-400 text-xs">{joinError}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LobbyPage;
