import { create } from 'zustand';
import type { ReviewDraft, ReviewViewpoint, ReviewPin } from './reviewSetupStore';
import type { SpatialComment } from '../types';
import { useStore } from '../store';
import { parseModelFile } from '../utils/modelLoader';

// Room-time view of the curated review. Distinct from the host's local draft:
// this is the config currently in effect in the live session (received from the
// host via PartyKit, or seeded directly by the host on entry).
//
// Pre-curated content is mirrored into the main `comments` store so it surfaces
// in the existing comments module. The review store remains the source of truth
// — we re-synthesize the comments whenever the config changes.

const PRE_VP_PREFIX = 'pre-vp-';
const PRE_PIN_PREFIX = 'pre-pin-';

function viewpointToComment(v: ReviewViewpoint): SpatialComment {
  return {
    id: `${PRE_VP_PREFIX}${v.id}`,
    type: 'drawing', // viewpoints carry a visual annotation (thumbnail)
    content: v.notes ?? '',
    drawingData: v.thumbnail,
    author: 'Curator',
    authorColor: '#10b981',
    timestamp: v.createdAt,
    position: { x: v.position[0], y: v.position[1], z: v.position[2] },
    attachedToNodeId: 'viewpoint',
    attachedToNodeName: v.label || 'Viewpoint',
    assignees: [],
    resolved: false,
    linkedToMeeting: false,
    preReview: true,
    preReviewSourceId: v.id,
    preReviewSourceKind: 'viewpoint',
  };
}

function pinToComment(p: ReviewPin): SpatialComment {
  return {
    id: `${PRE_PIN_PREFIX}${p.id}`,
    type: 'text', // pins are text-only comments
    content: p.notes ?? '',
    author: 'Curator',
    authorColor: '#10b981',
    timestamp: p.createdAt,
    position: { x: p.worldPos[0], y: p.worldPos[1], z: p.worldPos[2] },
    attachedToNodeId: p.modelId ?? 'unknown',
    attachedToNodeName: p.partName ? `${p.label} · ${p.partName}` : p.label,
    assignees: [],
    resolved: false,
    linkedToMeeting: false,
    preReview: true,
    preReviewSourceId: p.id,
    preReviewSourceKind: 'pin',
  };
}

// Replace all pre-review entries in the main comments store with a fresh
// synthesis from the active review config. Live (non-pre-review) comments
// are preserved untouched.
function syncMainComments(config: ReviewDraft | null) {
  const main = useStore.getState();
  const live = main.comments.filter((c) => !c.preReview);
  if (!config) {
    main.setAllComments(live);
    return;
  }
  const synthesized: SpatialComment[] = [
    ...config.viewpoints.map(viewpointToComment),
    ...config.pins.map(pinToComment),
  ];
  main.setAllComments([...live, ...synthesized]);
}

// Make sure the World renders the curation's model. World reads
// `activeModelType` from the main store, so loading a curation that
// specifies e.g. 'bicycle' has to push that onto the main store too —
// otherwise the room loads with whatever default (`headphones`) was
// already there. Imported files require parsing + setImportedModel;
// preset types just need the active type set. Fire-and-forget for the
// async parse — failures are logged but don't block setConfig.
function syncMainModel(config: ReviewDraft | null) {
  if (!config) return;
  const { setActiveModelType, setImportedModel } = useStore.getState();
  const a = config.asset;
  if (!a?.modelType) return;
  if (a.modelType === 'imported') {
    if (!a.importedFileBase64 || !a.importedFileName) {
      // Cloud-hydrated curations strip the base64 blob (see curationsRepo).
      // We can't render the import — leave whatever model was already there
      // so the scene isn't empty, and warn so the issue is visible.
      console.warn('[activeReviewStore] curation uses imported model but the file is not in this payload — keeping current model');
      return;
    }
    const ext = a.importedFileName.split('.').pop()?.toLowerCase() || 'glb';
    const mimeMap: Record<string, string> = {
      glb: 'model/gltf-binary', gltf: 'model/gltf+json',
      obj: 'text/plain', fbx: 'application/octet-stream', stl: 'application/octet-stream',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const bytes = Uint8Array.from(atob(a.importedFileBase64), (c) => c.charCodeAt(0));
    const file = new File([bytes], a.importedFileName, { type: mime });
    parseModelFile(file)
      .then((r) => setImportedModel(r.root, r.sceneTree, r.fileName, r.baseScale, r.basePosition))
      .catch((err) => console.error('[activeReviewStore] failed to parse imported model:', err));
  } else {
    setActiveModelType(a.modelType);
  }
}

interface ActiveReviewState {
  config: ReviewDraft | null;
  jumpTarget: { position: [number, number, number]; lookAt: [number, number, number] } | null;
  activeViewpointIdx: number;
  agendaIdx: number;
  // Host-only split-screen manager workspace (action triage + follow-up notes).
  managerMode: boolean;
  // Free-form session-wide notes the manager keeps during the meeting (local to
  // each participant — the host's copy is what matters; not synced in v1).
  sessionNotes: string;

  setConfig: (c: ReviewDraft | null) => void;
  jumpToViewpoint: (id: string) => void;
  jumpToViewpointAtIdx: (idx: number) => void;
  clearJumpTarget: () => void;

  nextViewpoint: () => void;
  prevViewpoint: () => void;
  setActiveViewpointIdx: (idx: number) => void;

  updateViewpoint: (id: string, patch: Partial<ReviewViewpoint>) => ReviewDraft | null;
  updatePin: (id: string, patch: Partial<ReviewPin>) => ReviewDraft | null;
  updateAgendaItem: (id: string, patch: Partial<import('./reviewSetupStore').AgendaItem>) => ReviewDraft | null;

  // Called by CommentsPanel when the user edits a pre-review comment.
  // Translates the comment patch back into a viewpoint/pin patch and returns
  // the updated draft so the caller can re-broadcast it.
  applyCommentEdit: (commentId: string, patch: Partial<SpatialComment>) => ReviewDraft | null;

  setAgendaIdx: (idx: number) => void;
  nextSlide: () => void;
  prevSlide: () => void;
  jumpToSlide: (idx: number) => void;

  setManagerMode: (open: boolean) => void;
  setSessionNotes: (notes: string) => void;
}

export const useActiveReviewStore = create<ActiveReviewState>((set, get) => ({
  config: null,
  jumpTarget: null,
  activeViewpointIdx: 0,
  agendaIdx: 0,
  managerMode: false,
  sessionNotes: '',

  setConfig: (config) => {
    set({
      config,
      activeViewpointIdx: Math.min(get().activeViewpointIdx, Math.max(0, (config?.viewpoints.length ?? 1) - 1)),
    });
    syncMainComments(config);
    syncMainModel(config);
  },

  jumpToViewpoint: (id) => {
    const cfg = get().config;
    if (!cfg) return;
    const idx = cfg.viewpoints.findIndex((v) => v.id === id);
    if (idx < 0) return;
    const vp = cfg.viewpoints[idx];
    set({ jumpTarget: { position: vp.position, lookAt: vp.lookAt }, activeViewpointIdx: idx });
  },

  jumpToViewpointAtIdx: (idx) => {
    const cfg = get().config;
    if (!cfg || cfg.viewpoints.length === 0) return;
    const safeIdx = Math.max(0, Math.min(cfg.viewpoints.length - 1, idx));
    const vp = cfg.viewpoints[safeIdx];
    set({ jumpTarget: { position: vp.position, lookAt: vp.lookAt }, activeViewpointIdx: safeIdx });
  },

  clearJumpTarget: () => set({ jumpTarget: null }),

  nextViewpoint: () => {
    const { config, activeViewpointIdx } = get();
    if (!config || config.viewpoints.length === 0) return;
    get().jumpToViewpointAtIdx((activeViewpointIdx + 1) % config.viewpoints.length);
  },
  prevViewpoint: () => {
    const { config, activeViewpointIdx } = get();
    if (!config || config.viewpoints.length === 0) return;
    get().jumpToViewpointAtIdx((activeViewpointIdx - 1 + config.viewpoints.length) % config.viewpoints.length);
  },
  setActiveViewpointIdx: (idx) => set({ activeViewpointIdx: idx }),

  updateViewpoint: (id, patch) => {
    const cfg = get().config;
    if (!cfg) return null;
    const next: ReviewDraft = {
      ...cfg,
      viewpoints: cfg.viewpoints.map((v) => v.id === id ? { ...v, ...patch } : v),
      updatedAt: Date.now(),
    };
    set({ config: next });
    syncMainComments(next);
    return next;
  },
  updatePin: (id, patch) => {
    const cfg = get().config;
    if (!cfg) return null;
    const next: ReviewDraft = {
      ...cfg,
      pins: cfg.pins.map((p) => p.id === id ? { ...p, ...patch } : p),
      updatedAt: Date.now(),
    };
    set({ config: next });
    syncMainComments(next);
    return next;
  },

  applyCommentEdit: (commentId, patch) => {
    // Pre-review comments have ids like `pre-vp-<viewpointId>` and
    // `pre-pin-<pinId>`. Map the field changes back to the source entity.
    if (commentId.startsWith(PRE_VP_PREFIX)) {
      const viewpointId = commentId.slice(PRE_VP_PREFIX.length);
      const vpPatch: Partial<ReviewViewpoint> = {};
      if (patch.attachedToNodeName !== undefined) vpPatch.label = patch.attachedToNodeName;
      if (patch.content !== undefined) vpPatch.notes = patch.content;
      return get().updateViewpoint(viewpointId, vpPatch);
    }
    if (commentId.startsWith(PRE_PIN_PREFIX)) {
      const pinId = commentId.slice(PRE_PIN_PREFIX.length);
      const pinPatch: Partial<ReviewPin> = {};
      if (patch.attachedToNodeName !== undefined) {
        // Comment label is "Label · PartName" — only the label half is editable.
        const part = patch.attachedToNodeName.split(' · ')[0] ?? patch.attachedToNodeName;
        pinPatch.label = part;
      }
      if (patch.content !== undefined) pinPatch.notes = patch.content;
      return get().updatePin(pinId, pinPatch);
    }
    return null;
  },

  setAgendaIdx: (agendaIdx) => set({ agendaIdx }),

  jumpToSlide: (idx) => {
    const cfg = get().config;
    if (!cfg || cfg.agenda.length === 0) return;
    const safeIdx = Math.max(0, Math.min(cfg.agenda.length - 1, idx));
    set({ agendaIdx: safeIdx });
    // Auto-jump camera to the first attached viewpoint, if any.
    const firstVpId = cfg.agenda[safeIdx].viewpointIds[0];
    if (firstVpId) get().jumpToViewpoint(firstVpId);
  },

  nextSlide: () => {
    const { config, agendaIdx } = get();
    if (!config || config.agenda.length === 0) return;
    get().jumpToSlide((agendaIdx + 1) % config.agenda.length);
  },

  prevSlide: () => {
    const { config, agendaIdx } = get();
    if (!config || config.agenda.length === 0) return;
    get().jumpToSlide((agendaIdx - 1 + config.agenda.length) % config.agenda.length);
  },

  updateAgendaItem: (id, patch) => {
    const cfg = get().config;
    if (!cfg) return null;
    const next: ReviewDraft = {
      ...cfg,
      agenda: cfg.agenda.map((a) => a.id === id ? { ...a, ...patch } : a),
      updatedAt: Date.now(),
    };
    set({ config: next });
    return next;
  },

  setManagerMode: (managerMode) => set({ managerMode }),
  setSessionNotes: (sessionNotes) => set({ sessionNotes }),
}));
