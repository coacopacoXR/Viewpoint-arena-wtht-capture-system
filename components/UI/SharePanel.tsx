import React, { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, QrCode, Link } from 'lucide-react';

interface SharePanelProps {
  roomId: string;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement>;
}

const SharePanel: React.FC<SharePanelProps> = ({ roomId, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'link' | 'qr'>('qr');
  const panelRef = useRef<HTMLDivElement>(null);

  const roomUrl = `${window.location.origin}/room/${roomId}`;

  function handleCopy() {
    navigator.clipboard.writeText(roomUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute top-10 right-0 z-[300] pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-150"
      style={{ width: 280 }}
    >
      <div
        className="rounded-xl shadow-2xl border overflow-hidden"
        style={{ background: '#111', borderColor: 'rgba(255,255,255,0.12)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <span className="text-white text-xs font-bold tracking-wide">Invite to Session</span>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {(['qr', 'link'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors"
              style={{
                color: tab === t ? '#fff' : 'rgba(255,255,255,0.3)',
                borderBottom: tab === t ? '2px solid #fff' : '2px solid transparent',
              }}
            >
              {t === 'qr' ? <QrCode size={11} /> : <Link size={11} />}
              {t === 'qr' ? 'QR Code' : 'Copy Link'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4">
          {tab === 'qr' ? (
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 rounded-lg bg-white">
                <QRCodeSVG
                  value={roomUrl}
                  size={180}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
              </div>
              <p className="text-[10px] font-mono text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Scan to join on mobile
              </p>
              <div
                className="w-full px-3 py-2 rounded-lg text-[9px] font-mono truncate"
                style={{ background: '#1a1a1a', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {roomUrl}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div
                className="w-full px-3 py-2.5 rounded-lg text-[10px] font-mono break-all leading-relaxed"
                style={{ background: '#1a1a1a', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {roomUrl}
              </div>
              <button
                onClick={handleCopy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: copied ? 'rgba(16,185,129,0.2)' : '#fff',
                  color: copied ? '#10b981' : '#000',
                  border: copied ? '1px solid rgba(16,185,129,0.4)' : '1px solid transparent',
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-3">
          <p className="text-[9px] font-mono text-center" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Room · {roomId.slice(0, 8).toUpperCase()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SharePanel;
