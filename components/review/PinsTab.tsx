// The curation panel's Pins tab: the pin list, with inline rename, severity and
// notes. Shared by the room's Edit panel and — until it is deleted — the old
// curate page (docs/plan/14-rooms-models-admin-ai.md batch BH), so its writes
// arrive as `actions`: the two callers keep the review in different stores.

import React from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, Info, MapPin, ShieldAlert, Trash2 } from 'lucide-react';
import type { PinSeverity, ReviewPin } from '../../lib/reviewSetupStore';
import type { ReviewDraftActions } from './draftActions';

// Exported from here rather than from draftActions because it carries JSX: an
// agenda slide's attachment row renders the same chip for an attached pin, and
// the two must not drift apart in colour or icon.
export const SEVERITY_META: Record<PinSeverity, { label: string; icon: React.ReactNode; color: string }> = {
  info:    { label: 'Info',    icon: <Info size={12} />,         color: '#3b82f6' },
  concern: { label: 'Concern', icon: <AlertTriangle size={12} />, color: '#f59e0b' },
  blocker: { label: 'Blocker', icon: <ShieldAlert size={12} />,  color: '#ef4444' },
};

export const PinsTab: React.FC<{
  pins: ReviewPin[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /**
   * Enters the canvas's pin-drop mode. OPTIONAL, and absent in the room: dropping
   * a pin needs a raycast against the model that only the curate canvas had, and
   * the room's own way of putting a mark on a part is its comment mode. A caller
   * that has no pin-drop mode to offer leaves this out and the tab lists and edits
   * the pins the review already has, rather than offering a button that cannot do
   * what it says.
   */
  onEnterPinMode?: () => void;
  actions: ReviewDraftActions;
}> = ({ pins, selectedId, onSelect, onEnterPinMode, actions }) => {
  return (
    <div className="p-5 flex flex-col gap-3">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Pins flag talking points on a specific part of the model. Each one carries the part name it was placed on and a severity.
      </p>
      {onEnterPinMode && (
        <button
          onClick={onEnterPinMode}
          className="w-full flex items-center justify-center gap-2 p-2 rounded border border-dashed border-white/20 text-xs font-bold uppercase text-amber-300 hover:bg-amber-500/10 hover:border-amber-400/50 transition-colors"
        >
          <MapPin size={14} /> Enter pin-drop mode
        </button>
      )}
      {pins.length === 0 && (
        <div className="text-center py-10 text-gray-500 text-xs italic">
          <MapPin size={28} className="mx-auto mb-2 opacity-30" />
          No pins yet
        </div>
      )}
      {pins.map((p) => {
        const sev = SEVERITY_META[p.severity];
        const selected = p.id === selectedId;
        return (
          <div
            key={p.id}
            onClick={() => onSelect(selected ? null : p.id)}
            className={clsx(
              'rounded border p-2 flex flex-col gap-2 cursor-pointer transition-colors',
              selected ? 'bg-white/10 border-emerald-400/40' : 'bg-white/5 border-white/10 hover:bg-white/8'
            )}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: sev.color }} className="flex items-center">{sev.icon}</span>
              <input
                value={p.label}
                onChange={(e) => actions.updatePin(p.id, { label: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-transparent text-xs font-bold outline-none"
              />
              <button
                onClick={(e) => { e.stopPropagation(); actions.removePin(p.id); }}
                className="text-gray-500 hover:text-red-400"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {p.partName && (
              <div className="text-[10px] font-mono text-gray-500 ml-6">on {p.partName}</div>
            )}
            <div className="flex items-center gap-1 ml-5" onClick={(e) => e.stopPropagation()}>
              {(['info', 'concern', 'blocker'] as PinSeverity[]).map((s) => {
                const m = SEVERITY_META[s];
                const active = p.severity === s;
                return (
                  <button
                    key={s}
                    onClick={() => actions.updatePin(p.id, { severity: s })}
                    className={clsx(
                      'flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors',
                      active ? 'text-white' : 'text-gray-500 hover:text-gray-300',
                    )}
                    style={active ? { background: m.color } : { background: 'rgba(255,255,255,0.04)' }}
                  >
                    {m.icon} {m.label}
                  </button>
                );
              })}
            </div>
            {selected && (
              <textarea
                value={p.notes ?? ''}
                onChange={(e) => actions.updatePin(p.id, { notes: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                placeholder="Notes…"
                className="ml-5 mt-1 w-[calc(100%-1.25rem)] h-16 bg-black/30 text-xs rounded p-2 border border-white/10 outline-none focus:border-emerald-400/40"
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
