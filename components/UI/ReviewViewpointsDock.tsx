import React, { useState } from 'react';
import { Camera, MapPin, ChevronDown, HelpCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useActiveReviewStore } from '../../lib/activeReviewStore';
import ReviewExplainer from './ReviewExplainer';
import ReviewPanelContent from './ReviewPanelContent';

// Lives in the bottom dock (where Visual Aids used to be). Two states:
//   collapsed (default) — compact pill: title + counts
//   expanded — pops upward with the shared ReviewPanelContent editor
const ReviewViewpointsDock: React.FC = () => {
  const config = useActiveReviewStore((s) => s.config);
  const [open, setOpen] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);

  if (!config) return null;
  const { viewpoints, pins, title } = config;
  if (viewpoints.length === 0 && pins.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-2 pointer-events-auto relative">
      <button
        onClick={() => setShowExplainer(true)}
        className="text-[10px] font-mono uppercase text-gray-400 tracking-widest mb-1 bg-white/40 px-2 py-0.5 rounded backdrop-blur-sm shadow-sm hover:bg-white/80 hover:text-black transition-colors flex items-center gap-1"
        title="What is this?"
      >
        Review
        <HelpCircle size={10} className="text-gray-400" />
      </button>

      <div className="flex items-center gap-1 bg-white/90 backdrop-blur-md p-1.5 px-3 rounded-md border border-gray-200 shadow-sm h-[44px] max-w-[280px]">
        <Camera size={14} className="text-emerald-500 shrink-0" />
        <span className="text-[11px] font-bold text-gray-800 truncate max-w-[120px]">{title}</span>
        <div className="w-px h-6 bg-gray-200" />
        <div className="flex items-center gap-1 text-[10px] font-mono text-gray-500 tabular-nums" title="Viewpoints">
          <Camera size={11} className="text-gray-400" />
          {viewpoints.length}
        </div>
        <div className="flex items-center gap-1 text-[10px] font-mono text-gray-500 tabular-nums" title="Pins">
          <MapPin size={11} className="text-gray-400" />
          {pins.length}
        </div>
        <div className="w-px h-6 bg-gray-200" />
        <button
          onClick={() => setOpen((o) => !o)}
          title={open ? 'Collapse' : 'Expand'}
          className="px-1 py-0.5 rounded text-gray-500 hover:text-black hover:bg-gray-100 transition-colors"
        >
          <ChevronDown size={14} className={clsx('transition-transform', open ? 'rotate-180' : '')} />
        </button>
      </div>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-[340px] bg-white/97 backdrop-blur-md rounded-lg border border-gray-200 shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/70 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-[9px] font-mono uppercase tracking-widest text-gray-400">Active Review</div>
              <div className="text-xs font-bold text-gray-900 truncate">{title}</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-700 shrink-0"
              title="Collapse"
            >
              <ChevronDown size={14} className="rotate-180" />
            </button>
          </div>
          <ReviewPanelContent theme="light" />
        </div>
      )}

      {showExplainer && <ReviewExplainer onClose={() => setShowExplainer(false)} />}
    </div>
  );
};

export default ReviewViewpointsDock;
