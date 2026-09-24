// The amber strip: what the top bar becomes while somebody has Edit on.
//
// docs/plan/14-rooms-models-admin-ai.md batch BH. It replaces the room's top bar
// rather than sitting beside it, and that is the point of the colour as much as of
// the swap: while Edit is on the room is not being run, it is being prepared. The
// pointer, share, privacy and boardroom controls are all things that would change
// the meeting for five other people, and none of them is what this person is here
// to do.
//
// Three tools and one exit:
//   Move / Rotate / Scale — drei's TransformControls modes, applied to the model
//     the tree has selected. The gizmo itself is components/Scene/ReviewModelGizmo,
//     inside the canvas; this is only the switch.
//   Save this view — the camera where it is, as a viewpoint of the review.
//   Done — gives the edit lock up. The room hears about it and capture resumes.
//
// Only the person editing ever sees this. Everybody else in the room sees
// "Paco is editing the review" instead — see ReviewEditingBanner.

import React from 'react';
import { Camera, Check, Move3D, RotateCcw, Scale } from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../../store';
import { usePresence } from '../../lib/PresenceContext';
import { useActiveReviewStore } from '../../lib/activeReviewStore';
import type { ReviewGizmoMode } from '../../types';

const TOOLS: Array<{ mode: Exclude<ReviewGizmoMode, null>; label: string; icon: React.ReactNode; title: string }> = [
  { mode: 'translate', label: 'Move',   icon: <Move3D size={14} />,    title: 'Move the selected model' },
  { mode: 'rotate',    label: 'Rotate', icon: <RotateCcw size={14} />, title: 'Rotate the selected model' },
  { mode: 'scale',     label: 'Scale',  icon: <Scale size={14} />,     title: 'Resize the selected model' },
];

const EditingStrip: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const gizmoMode = useStore((s) => s.reviewGizmoMode);
  const setGizmoMode = useStore((s) => s.setReviewGizmoMode);
  const activeSceneModelId = useStore((s) => s.activeSceneModelId);
  const viewpointCount = useActiveReviewStore((s) => s.config?.viewpoints.length ?? 0);
  const { broadcastReviewConfig } = usePresence();

  /**
   * The camera as it is, as a viewpoint of the review.
   *
   * Named "View N" rather than asking first: the sketch the user approved has the
   * name be the thing the Views tab renames, and a modal in the middle of a
   * preparation pass is a interruption for something the next tab is better at.
   * A camera pose the canvas would not give up — no renderer yet, a browser that
   * will not hand over its pixels — is a silent no-op rather than a viewpoint at
   * the origin, because a view that jumps somewhere nobody was is worse than a
   * button that appears not to have worked.
   */
  const saveThisView = () => {
    const capture = useStore.getState()._viewCapture?.();
    if (!capture) return;
    const next = useActiveReviewStore.getState().addViewpoint({
      label: `View ${viewpointCount + 1}`,
      position: capture.position,
      lookAt: capture.lookAt,
      thumbnail: capture.thumbnail,
    });
    if (next) broadcastReviewConfig(next);
  };

  // A tool with nothing selected has nothing to act on. Disabled rather than
  // hidden, so the strip does not change shape as the tree's selection moves.
  const toolsEnabled = activeSceneModelId !== null;

  return (
    <div className="flex items-center gap-1.5 bg-amber-400 border border-amber-500 rounded-md shadow-sm p-1.5 pointer-events-auto">
      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-950 px-1.5 shrink-0">
        Editing the review — changes are saved and seen by everyone
      </span>

      <div className="w-px h-7 bg-amber-600/40 mx-0.5 shrink-0" />

      {TOOLS.map((tool) => (
        <button
          key={tool.mode}
          onClick={() => setGizmoMode(gizmoMode === tool.mode ? null : tool.mode)}
          disabled={!toolsEnabled}
          title={toolsEnabled ? tool.title : 'Select a model in the tree first'}
          className={clsx(
            'h-9 px-2 shrink-0 flex items-center gap-1.5 rounded-sm border transition-all',
            gizmoMode === tool.mode
              ? 'bg-black text-white border-black'
              : 'bg-white/80 text-amber-950 border-amber-600/30 hover:border-amber-900/50',
            !toolsEnabled && 'opacity-40 cursor-not-allowed',
          )}
        >
          {tool.icon}
          <span className="hidden [@media(min-width:1500px)]:inline text-[10px] font-bold uppercase tracking-wide">
            {tool.label}
          </span>
        </button>
      ))}

      <div className="w-px h-7 bg-amber-600/40 mx-0.5 shrink-0" />

      <button
        onClick={saveThisView}
        title="Add the current camera as a viewpoint of the review"
        className="h-9 px-2 shrink-0 flex items-center gap-1.5 rounded-sm border bg-white/80 text-amber-950 border-amber-600/30 hover:border-amber-900/50 transition-all"
      >
        <Camera size={14} />
        <span className="hidden [@media(min-width:1300px)]:inline text-[10px] font-bold uppercase tracking-wide">
          Save this view
        </span>
      </button>

      <button
        onClick={onDone}
        title="Finish editing and go back to the meeting"
        className="h-9 px-3 shrink-0 ml-auto flex items-center gap-1.5 rounded-sm bg-black text-white border border-black hover:bg-gray-800 transition-all"
      >
        <Check size={14} />
        <span className="text-[10px] font-bold uppercase tracking-wide">Done</span>
      </button>
    </div>
  );
};

export default EditingStrip;
