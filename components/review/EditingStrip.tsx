// The amber strip: what the top bar becomes while somebody has Edit on.
//
// docs/plan/14-rooms-models-admin-ai.md batch BH. It replaces the room's top bar
// rather than sitting beside it, and that is the point of the colour as much as of
// the swap: while Edit is on the room is not being run, it is being prepared. The
// pointer, share, privacy and boardroom controls are all things that would change
// the meeting for five other people, and none of them is what this person is here
// to do.
//
// Three tools, one switch and one exit:
//   Whole model | Part — WHAT the tools are attached to, batch BR. The three tools
//     did not change and are not doubled up: Move is Move either way, and a person
//     who has found the tool they want should not have to find it again to use it on
//     something smaller than a whole product.
//   Move / Rotate / Scale — drei's TransformControls modes, applied to whatever that
//     switch says. The gizmo itself is components/Scene/ReviewModelGizmo, inside the
//     canvas; this is only the switch.
//   Reset part / Reset all parts — the way back, because there is no undo here.
//   Save this view — the camera where it is, as a viewpoint of the review.
//   Done — gives the edit lock up. The room hears about it and capture resumes.
//
// Only the person editing ever sees this. Everybody else in the room sees
// "Paco is editing the review" instead — see ReviewEditingBanner.

import React, { useCallback, useMemo } from 'react';
import { Box, Camera, Check, Move3D, RotateCcw, Scale, Undo2 } from 'lucide-react';
import { clsx } from 'clsx';
import { findSceneNode, selectedNodeId, useStore } from '../../store';
import { usePresence } from '../../lib/PresenceContext';
import { useActiveReviewStore } from '../../lib/activeReviewStore';
import { keepReviewPlacements } from '../../lib/scene/keepPlacements';
import { partTargetFor } from '../../lib/scene/partTransforms';
import type { SceneUpdate } from '../../lib/scene/roomScene';
import type { ReviewGizmoMode } from '../../types';

const TOOLS: Array<{ mode: Exclude<ReviewGizmoMode, null>; label: string; icon: React.ReactNode; modelTitle: string; partTitle: string }> = [
  { mode: 'translate', label: 'Move',   icon: <Move3D size={14} />,    modelTitle: 'Move the selected model',   partTitle: 'Move the selected part' },
  { mode: 'rotate',    label: 'Rotate', icon: <RotateCcw size={14} />, modelTitle: 'Rotate the selected model', partTitle: 'Rotate the selected part' },
  { mode: 'scale',     label: 'Scale',  icon: <Scale size={14} />,     modelTitle: 'Resize the selected model', partTitle: 'Resize the selected part, one axis at a time' },
];

const RESET_PART = 'Reset part puts it back where the file had it';
const RESET_ALL_PARTS = 'Put every part of this model back where the file had it';

const EditingStrip: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const gizmoMode = useStore((s) => s.reviewGizmoMode);
  const setGizmoMode = useStore((s) => s.setReviewGizmoMode);
  const gizmoTarget = useStore((s) => s.reviewGizmoTarget);
  const setGizmoTarget = useStore((s) => s.setReviewGizmoTarget);
  const activeSceneModelId = useStore((s) => s.activeSceneModelId);
  const models = useStore((s) => s.scene.models);
  const sceneEntries = useStore((s) => s.sceneEntries);
  const importedSceneTree = useStore((s) => s.importedSceneTree);
  const selection = useStore((s) => selectedNodeId(s.objectStates));
  const viewpointCount = useActiveReviewStore((s) => s.config?.viewpoints.length ?? 0);
  const { broadcastSceneUpdate, broadcastReviewConfig } = usePresence();
  const applyLocalSceneUpdate = useStore((s) => s.applyLocalSceneUpdate);

  /**
   * Which part of which model the tools would move, or null for "nothing to act on".
   *
   * Only asked in Part mode. In Whole model mode the answer is the model the tree has
   * active, exactly as it has been since batch BH, and computing a part target there
   * too would mean two things deciding what the gizmo is attached to.
   *
   * `rootIdOf` comes from the parsed entries rather than from the scene, because a
   * model's root node id is a fact about its FILE (buildSceneTree mints it) and the
   * scene record does not carry one. A model still downloading answers null, and its
   * rows are not in the tree to select yet, so nothing can be pointing at it.
   */
  const partTarget = useMemo(() => {
    if (gizmoTarget !== 'part') return null;
    return partTargetFor(
      models,
      (modelId) => sceneEntries[modelId]?.sceneTree.id ?? null,
      selection,
    );
  }, [gizmoTarget, models, sceneEntries, selection]);

  const targetModel = useMemo(
    () => models.find((model) => model.id === (partTarget?.modelId ?? null)) ?? null,
    [models, partTarget],
  );
  const partName = partTarget?.nodeId
    ? findSceneNode(importedSceneTree, partTarget.nodeId)?.name ?? partTarget.nodeId
    : null;
  // Whether there is anything for each Reset to undo. Disabled rather than hidden,
  // the strip's rule for every control whose subject comes and goes: a button that
  // appears when there is something to reset teaches what it does, and one that is
  // always there and sometimes does nothing teaches that it is broken.
  const partHasOverride = Boolean(
    partTarget?.nodeId && targetModel?.parts?.[partTarget.nodeId],
  );
  const modelHasParts = Boolean(targetModel && Object.keys(targetModel.parts ?? {}).length > 0);

  /**
   * Send a change to the room, predict it here, and remember it with the review.
   *
   * The third step is the one batch BI added for drags and batch BR needs for resets:
   * the review carries its own copy of every placement, because room storage is the
   * room's and a review outlives it. A reset that reached only the room would have
   * come back the next time the review was opened.
   */
  const send = useCallback((update: SceneUpdate) => {
    broadcastSceneUpdate(update);
    applyLocalSceneUpdate(update);
    keepReviewPlacements(broadcastReviewConfig);
  }, [applyLocalSceneUpdate, broadcastReviewConfig, broadcastSceneUpdate]);

  const resetPart = () => {
    if (!partTarget?.nodeId) return;
    send({ op: 'setPartTransform', id: partTarget.modelId, nodeId: partTarget.nodeId, transform: null });
  };

  const resetAllParts = () => {
    if (!targetModel) return;
    send({ op: 'clearPartTransforms', id: targetModel.id });
  };

  /**
   * The camera as it is, as a viewpoint of the review.
   *
   * Named "View N" rather than asking first: the sketch the user approved has the
   * name be the thing the Views Tab renames, and a modal in the middle of a
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
  const inPartMode = gizmoTarget === 'part';
  const toolsEnabled = inPartMode ? partTarget !== null : activeSceneModelId !== null;
  // A model's own root is not a part, and the tools say so: selecting it in Part mode
  // behaves like Whole model, which is what the batch brief asks for and what the
  // gizmo does with it, so the strip must not promise a bolt and deliver a product.
  const onAPart = Boolean(partTarget?.nodeId);
  const nothingToActOn = inPartMode
    ? 'Click a part in the 3D view or in the model tree first'
    : 'Select a model in the tree first';

  return (
    <div className="flex items-center gap-1.5 bg-amber-400 border border-amber-500 rounded-md shadow-sm p-1.5 pointer-events-auto">
      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-950 px-1.5 shrink-0">
        Editing the review — changes are saved and seen by everyone
      </span>

      <div className="w-px h-7 bg-amber-600/40 mx-0.5 shrink-0" />

      {/* WHAT the tools move. Two buttons in one bordered pair rather than a
          dropdown: it is the first thing somebody has to understand about the
          strip's second half, and a control that shows both of its answers at once
          is the one that needs no explanation. */}
      <div className="flex items-center shrink-0 rounded-sm border border-amber-600/30 overflow-hidden">
        {([
          { target: 'model' as const, label: 'Whole model', title: 'Move, turn and resize the whole model' },
          { target: 'part' as const, label: 'Part', title: 'Move, turn and resize one part of a model' },
        ]).map((option) => (
          <button
            key={option.target}
            data-testid={`gizmo-target-${option.target}`}
            onClick={() => setGizmoTarget(option.target)}
            title={option.title}
            className={clsx(
              'h-9 px-2 flex items-center gap-1 transition-all text-[10px] font-bold uppercase tracking-wide',
              gizmoTarget === option.target
                ? 'bg-black text-white'
                : 'bg-white/80 text-amber-950 hover:bg-white',
            )}
          >
            {option.target === 'part' && <Box size={12} />}
            <span className={option.target === 'model' ? '' : 'hidden [@media(min-width:1400px)]:inline'}>
              {option.label}
            </span>
          </button>
        ))}
      </div>

      {TOOLS.map((tool) => (
        <button
          key={tool.mode}
          onClick={() => setGizmoMode(gizmoMode === tool.mode ? null : tool.mode)}
          disabled={!toolsEnabled}
          title={toolsEnabled ? (onAPart ? tool.partTitle : tool.modelTitle) : nothingToActOn}
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

      {/* WHAT Part mode is pointing at, and the way back. The name is the point of
          showing it at all: a gizmo attached to one flange of a 400-part assembly is
          easy to lose track of, and the tree row it came from may be off screen. */}
      {inPartMode && (
        partTarget === null ? (
          <span className="text-[10px] font-bold text-amber-950/80 px-1.5 shrink-0">
            Click a part to move it.
          </span>
        ) : (
          <span className="flex items-center gap-1.5 shrink-0 px-1.5">
            <span
              data-testid="gizmo-part-name"
              title={partTarget.nodeId
                ? `The gizmo is attached to this part of ${targetModel?.line ?? 'the model'}`
                : 'That is the model’s own root, so the tools move the whole model'}
              className="max-w-[14rem] truncate text-[10px] font-mono font-bold text-amber-950"
            >
              {partName ?? importedSceneTree?.children?.find((c) => c.id === selection)?.name ?? selection}
            </span>

            <button
              onClick={resetPart}
              disabled={!partHasOverride}
              title={partHasOverride ? RESET_PART : 'This part is already where the file had it'}
              className={clsx(
                'h-9 px-2 shrink-0 flex items-center gap-1.5 rounded-sm border transition-all',
                partHasOverride
                  ? 'bg-white/80 text-amber-950 border-amber-600/30 hover:border-amber-900/50'
                  : 'bg-white/40 text-amber-950/50 border-amber-600/20 cursor-not-allowed',
              )}
            >
              <Undo2 size={14} />
              <span className="hidden [@media(min-width:1500px)]:inline text-[10px] font-bold uppercase tracking-wide">
                Reset part
              </span>
            </button>

            <button
              onClick={resetAllParts}
              disabled={!modelHasParts}
              title={modelHasParts ? RESET_ALL_PARTS : 'No part of this model has been moved'}
              className={clsx(
                'h-9 px-2 shrink-0 flex items-center gap-1.5 rounded-sm border transition-all',
                modelHasParts
                  ? 'bg-white/80 text-amber-950 border-amber-600/30 hover:border-amber-900/50'
                  : 'bg-white/40 text-amber-950/50 border-amber-600/20 cursor-not-allowed',
              )}
            >
              <Undo2 size={14} />
              <span className="hidden [@media(min-width:1600px)]:inline text-[10px] font-bold uppercase tracking-wide">
                Reset all parts
              </span>
            </button>
          </span>
        )
      )}

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
