import React from 'react';
import {
  Camera, MapPin, AlertTriangle, Info, ShieldAlert,
  ChevronLeft, ChevronRight, FileText, Image as ImageIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useActiveReviewStore } from '../../lib/activeReviewStore';
import { usePresence } from '../../lib/PresenceContext';
import type { PinSeverity } from '../../lib/reviewSetupStore';

const PIN_COLOR: Record<PinSeverity, string> = {
  info: '#3b82f6',
  concern: '#f59e0b',
  blocker: '#ef4444',
};

const PIN_ICON: Record<PinSeverity, React.ReactNode> = {
  info: <Info size={11} />,
  concern: <AlertTriangle size={11} />,
  blocker: <ShieldAlert size={11} />,
};

const PreReviewBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
    <span className="w-1 h-1 bg-emerald-500 rounded-full" /> Pre-Review
  </span>
);

const AnnotationBadge: React.FC<{ kind: 'visual' | 'text' }> = ({ kind }) => (
  <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
    {kind === 'visual' ? <ImageIcon size={9} /> : <FileText size={9} />}
    {kind === 'visual' ? 'Visual' : 'Text'}
  </span>
);

interface Props {
  // When true, renders against a dark backdrop (used inside the boardroom
  // floating panel). When false, renders against the lighter chrome used by
  // the bottom-dock expansion.
  theme?: 'light' | 'dark';
}

// Editor view for an active review — viewpoint navigator + pins-as-comments
// stream. Reused by ReviewViewpointsDock (light) and the boardroom Review
// floating panel (dark). Returns null when no review config is active.
const ReviewPanelContent: React.FC<Props> = ({ theme = 'light' }) => {
  const config = useActiveReviewStore((s) => s.config);
  const activeIdx = useActiveReviewStore((s) => s.activeViewpointIdx);
  const nextVp = useActiveReviewStore((s) => s.nextViewpoint);
  const prevVp = useActiveReviewStore((s) => s.prevViewpoint);
  const jumpAtIdx = useActiveReviewStore((s) => s.jumpToViewpointAtIdx);
  const updateViewpoint = useActiveReviewStore((s) => s.updateViewpoint);
  const updatePin = useActiveReviewStore((s) => s.updatePin);
  const { broadcastReviewConfig } = usePresence();

  if (!config) return null;
  const { viewpoints, pins } = config;
  if (viewpoints.length === 0 && pins.length === 0) {
    return (
      <div className="p-4 text-center text-[11px] italic" style={{ color: theme === 'dark' ? 'rgba(255,255,255,0.4)' : '#9ca3af' }}>
        No curated viewpoints or pins
      </div>
    );
  }

  const currentVp = viewpoints[Math.max(0, Math.min(activeIdx, viewpoints.length - 1))];

  const sync = (next: ReturnType<typeof updateViewpoint>) => {
    if (next) broadcastReviewConfig(next);
  };

  // Theme-aware classes
  const t = theme === 'dark'
    ? {
        panelBg: 'bg-transparent',
        sectionBorder: 'border-white/10',
        labelEmpty: 'text-white/60',
        titleText: 'text-white',
        notesBg: 'bg-white/5 border-white/10 focus:border-emerald-400/60 text-white/85',
        noteText: 'text-white/85',
        dimText: 'text-white/40',
        navBtnBg: 'bg-white/10 text-white/85 hover:bg-white/20',
        navDot: 'bg-white/30',
        pinCardBg: 'bg-white/5',
        commentLabelBg: 'bg-transparent',
      }
    : {
        panelBg: 'bg-transparent',
        sectionBorder: 'border-gray-100',
        labelEmpty: 'text-gray-500',
        titleText: 'text-gray-900',
        notesBg: 'bg-gray-50 border-gray-200 focus:border-emerald-400/60 text-gray-700',
        noteText: 'text-gray-700',
        dimText: 'text-gray-400',
        navBtnBg: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        navDot: 'bg-gray-300',
        pinCardBg: 'bg-white',
        commentLabelBg: 'bg-transparent',
      };

  return (
    <div className={t.panelBg}>
      {/* Viewpoint navigator */}
      {currentVp && (
        <div className={clsx('p-3 border-b', t.sectionBorder)}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <PreReviewBadge />
              <AnnotationBadge kind="visual" />
            </div>
            <div className={clsx('text-[10px] font-mono tabular-nums', t.dimText)}>
              {activeIdx + 1} / {viewpoints.length}
            </div>
          </div>

          <button
            onClick={() => jumpAtIdx(activeIdx)}
            className={clsx('block w-full aspect-video rounded overflow-hidden border transition-colors group',
              theme === 'dark' ? 'bg-black border-white/10 hover:border-emerald-400/60' : 'bg-gray-100 border-gray-200 hover:border-emerald-400/60'
            )}
            title="Jump to this viewpoint"
          >
            {currentVp.thumbnail ? (
              <img src={currentVp.thumbnail} alt="" className="w-full h-full object-cover group-hover:opacity-95" />
            ) : (
              <div className={clsx('w-full h-full flex items-center justify-center', t.dimText)}>
                <Camera size={20} />
              </div>
            )}
          </button>

          <input
            value={currentVp.label}
            onChange={(e) => sync(updateViewpoint(currentVp.id, { label: e.target.value }))}
            placeholder="Viewpoint title"
            className={clsx('w-full mt-2 bg-transparent text-sm font-bold outline-none border-b border-transparent focus:border-emerald-400/60 transition-colors', t.titleText)}
          />
          <textarea
            value={currentVp.notes ?? ''}
            onChange={(e) => sync(updateViewpoint(currentVp.id, { notes: e.target.value }))}
            placeholder="Add notes about this view…"
            className={clsx('w-full mt-2 h-14 text-xs rounded p-2 border outline-none resize-none transition-colors', t.notesBg)}
          />

          <div className="mt-2 flex items-center justify-between gap-1">
            <button
              onClick={prevVp}
              disabled={viewpoints.length < 2}
              className={clsx('flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-colors', t.navBtnBg)}
            >
              <ChevronLeft size={12} /> Prev
            </button>

            <div className="flex items-center gap-1 overflow-x-auto max-w-[140px]">
              {viewpoints.map((_, i) => (
                <button
                  key={i}
                  onClick={() => jumpAtIdx(i)}
                  title={`Viewpoint ${i + 1}`}
                  className={clsx(
                    'w-1.5 h-1.5 rounded-full shrink-0 transition-all',
                    i === activeIdx ? 'bg-emerald-500 scale-125' : t.navDot
                  )}
                />
              ))}
            </div>

            <button
              onClick={nextVp}
              disabled={viewpoints.length < 2}
              className={clsx('flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-colors', t.navBtnBg)}
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Pins-as-comments stream */}
      {pins.length > 0 && (
        <div className="p-3 flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
          <div className={clsx('text-[9px] font-bold uppercase tracking-widest flex items-center gap-1', t.dimText)}>
            <MapPin size={10} /> Pins ({pins.length}) · text-only comments
          </div>
          {pins.map((p) => (
            <div
              key={p.id}
              className={clsx('rounded border p-2 flex flex-col gap-1.5', t.pinCardBg)}
              style={{ borderColor: `${PIN_COLOR[p.severity]}55` }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <PreReviewBadge />
                  <AnnotationBadge kind="text" />
                </div>
                <span
                  className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
                  style={{ background: PIN_COLOR[p.severity] }}
                >
                  {PIN_ICON[p.severity]} {p.severity}
                </span>
              </div>
              <input
                value={p.label}
                onChange={(e) => sync(updatePin(p.id, { label: e.target.value }))}
                placeholder="Pin label"
                className={clsx('w-full bg-transparent text-xs font-bold outline-none border-b border-transparent focus:border-emerald-400/60 transition-colors', t.titleText)}
              />
              {p.partName && (
                <div className={clsx('text-[9px] font-mono', t.dimText)}>on {p.partName}</div>
              )}
              <textarea
                value={p.notes ?? ''}
                onChange={(e) => sync(updatePin(p.id, { notes: e.target.value }))}
                placeholder="Comment…"
                className={clsx('w-full h-12 text-[11px] rounded p-1.5 border outline-none resize-none transition-colors', t.notesBg)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReviewPanelContent;
