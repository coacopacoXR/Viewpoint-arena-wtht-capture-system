import { create } from 'zustand';
import type { ReviewDraft, ReviewViewpoint, ReviewPin } from './reviewSetupStore';
import type { SpatialComment, Requirement } from '../types';
import type { TeamMember } from './people';
import { useStore } from '../store';
import { forgetReviewScene, showReviewScene } from './scene/showCurationModel';

// Build a live SpatialComment from a curated pin at commit time. The comment
// is authored by whoever presses the button (not the curator), attached to the
// same node the pin was placed on, and uses the pin's notes — or its label
// when there are no notes, or "label — notes" when both are present.
export function pinToLiveComment(
  pin: ReviewPin,
  author: string,
  authorColor: string,
): SpatialComment {
  const content = pin.notes?.trim()
    ? (pin.label.trim() ? `${pin.label.trim()} — ${pin.notes.trim()}` : pin.notes.trim())
    : (pin.label.trim() || 'Pinned comment');
  return {
    id: Math.random().toString(36).substr(2, 9),
    type: 'text',
    content,
    author,
    authorColor,
    timestamp: Date.now(),
    position: { x: pin.worldPos[0], y: pin.worldPos[1], z: pin.worldPos[2] },
    attachedToNodeId: pin.meshIndex ?? pin.modelId ?? '',
    attachedToNodeName: pin.partName ?? pin.label,
    assignees: [],
    resolved: false,
    linkedToMeeting: false,
  };
}

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

// Push the review's requirements onto the main store so InsightDetailModal,
// DialogueEngine, and MeetingSummary resolve affectedRequirementIds from the
// active review instead of a global constant. Empty when there is no review.
function syncMainRequirements(config: ReviewDraft | null) {
  const main = useStore.getState();
  main.setRequirements(config?.requirements ?? []);
}

// Make sure the World renders the curation's model. World reads
// `activeModelType` from the main store, so loading a curation that
// specifies e.g. 'bicycle' has to push that onto the main store too —
// otherwise the room loads with whatever default (`headphones`) was
// already there. An imported file becomes a scene holding the review's
// models; see lib/scene/showCurationModel, which the review setup page also
// calls so that both paths build the same scene.
function syncMainModel(config: ReviewDraft | null) {
  if (!config) return;
  const { setActiveModelType, setModelTransform } = useStore.getState();
  const a = config.asset;
  // Push the curator's transform onto the main store (used by World's group
  // wrapper). Identity if none was set.
  setModelTransform(a?.transform ?? { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 });
  if (!a?.modelType) return;
  if (a.modelType === 'imported') {
    // The whole review rather than only the model its curation row names: a
    // design review that has been through three revisions opens on the third,
    // with the first two present and hidden so Compare can still reach them
    // (docs/plan/14 batch BC). A review with no stored revisions — every one
    // written before model_revisions existed — gets exactly the one-model scene
    // it got before, synchronously, because the async half of showReviewScene
    // starts after the scene is already set and only ever adds to it.
    void showReviewScene(config.reviewId, a, 'activeReviewStore');
    return;
  }
  setActiveModelType(a.modelType);
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

  addRequirement: (req: Omit<Requirement, 'id'>) => ReviewDraft | null;
  updateRequirement: (id: string, patch: Partial<Requirement>) => ReviewDraft | null;
  removeRequirement: (id: string) => ReviewDraft | null;

  addTeamMember: (member: Omit<TeamMember, 'id'>) => ReviewDraft | null;
  updateTeamMember: (id: string, patch: Partial<TeamMember>) => ReviewDraft | null;
  removeTeamMember: (id: string) => ReviewDraft | null;
  reorderTeam: (fromIdx: number, toIdx: number) => ReviewDraft | null;

  // Called by CommentsPanel when the user edits a pre-review comment.
  // Translates the comment patch back into a viewpoint/pin patch and returns
  // the updated draft so the caller can re-broadcast it.
  applyCommentEdit: (commentId: string, patch: Partial<SpatialComment>) => ReviewDraft | null;

  // Commit a curated pin as a live SpatialComment. Returns the created comment
  // and the updated config (so the caller can broadcast REVIEW_CONFIG), or null
  // when there is no config or the pin is unknown/already committed.
  commitPinAsComment: (pinId: string, author: string, authorColor: string) => { comment: SpatialComment; config: ReviewDraft } | null;

  // Clear the committedCommentId on whichever pin holds it. Called when a
  // comment is deleted (locally or via COMMENT_DELETE) so the pin can be
  // committed again.
  clearCommittedCommentId: (commentId: string) => ReviewDraft | null;

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
    const previous = get().config;
    // Leaving a review, or moving to a different one, forgets that its scene was
    // already rebuilt from history — so opening it again in this page session
    // opens it properly rather than showing the single model its curation row
    // names. See forgetReviewScene.
    if (previous && previous.reviewId !== config?.reviewId) {
      forgetReviewScene(previous.reviewId);
    }
    set({
      config,
      activeViewpointIdx: Math.min(get().activeViewpointIdx, Math.max(0, (config?.viewpoints.length ?? 1) - 1)),
    });
    syncMainComments(config);
    syncMainModel(config);
    syncMainRequirements(config);
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

  commitPinAsComment: (pinId, author, authorColor) => {
    const cfg = get().config;
    if (!cfg) return null;
    const pin = cfg.pins.find((p) => p.id === pinId);
    if (!pin) return null;
    // Idempotent: a pin that already produced a comment cannot produce another
    // until the first one is deleted (which clears committedCommentId).
    if (pin.committedCommentId) return null;
    const comment = pinToLiveComment(pin, author, authorColor);
    const next: ReviewDraft = {
      ...cfg,
      pins: cfg.pins.map((p) => p.id === pinId ? { ...p, committedCommentId: comment.id } : p),
      updatedAt: Date.now(),
    };
    set({ config: next });
    // The live comment is added to the main store by the caller (alongside
    // broadcastCommentAdd), so every client sees it. We only update the
    // config here — the caller owns the comment side-effect.
    return { comment, config: next };
  },

  clearCommittedCommentId: (commentId) => {
    const cfg = get().config;
    if (!cfg) return null;
    const pin = cfg.pins.find((p) => p.committedCommentId === commentId);
    if (!pin) return null;
    const next: ReviewDraft = {
      ...cfg,
      pins: cfg.pins.map((p) => p.id === pin.id ? { ...p, committedCommentId: undefined } : p),
      updatedAt: Date.now(),
    };
    set({ config: next });
    return next;
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

  addRequirement: (req) => {
    const cfg = get().config;
    if (!cfg) return null;
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const code = req.code.trim() || `REQ-${id.slice(0, 4).toUpperCase()}`;
    const next: ReviewDraft = {
      ...cfg,
      requirements: [...cfg.requirements, { ...req, id, code }],
      updatedAt: Date.now(),
    };
    set({ config: next });
    syncMainRequirements(next);
    return next;
  },

  updateRequirement: (id, patch) => {
    const cfg = get().config;
    if (!cfg) return null;
    const cleaned = patch.code !== undefined
      ? { ...patch, code: patch.code.trim() || cfg.requirements.find((r) => r.id === id)?.code || '' }
      : patch;
    const next: ReviewDraft = {
      ...cfg,
      requirements: cfg.requirements.map((r) => r.id === id ? { ...r, ...cleaned } : r),
      updatedAt: Date.now(),
    };
    set({ config: next });
    syncMainRequirements(next);
    return next;
  },

  removeRequirement: (id) => {
    const cfg = get().config;
    if (!cfg) return null;
    const next: ReviewDraft = {
      ...cfg,
      requirements: cfg.requirements.filter((r) => r.id !== id),
      updatedAt: Date.now(),
    };
    set({ config: next });
    syncMainRequirements(next);
    return next;
  },

  addTeamMember: (member) => {
    const cfg = get().config;
    if (!cfg) return null;
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const next: ReviewDraft = {
      ...cfg,
      team: [...cfg.team, { ...member, id }],
      updatedAt: Date.now(),
    };
    set({ config: next });
    return next;
  },

  updateTeamMember: (id, patch) => {
    const cfg = get().config;
    if (!cfg) return null;
    const next: ReviewDraft = {
      ...cfg,
      team: cfg.team.map((m) => m.id === id ? { ...m, ...patch } : m),
      updatedAt: Date.now(),
    };
    set({ config: next });
    return next;
  },

  removeTeamMember: (id) => {
    const cfg = get().config;
    if (!cfg) return null;
    const next: ReviewDraft = {
      ...cfg,
      team: cfg.team.filter((m) => m.id !== id),
      updatedAt: Date.now(),
    };
    set({ config: next });
    return next;
  },

  reorderTeam: (fromIdx, toIdx) => {
    const cfg = get().config;
    if (!cfg) return null;
    const arr = [...cfg.team];
    if (fromIdx < 0 || fromIdx >= arr.length || toIdx < 0 || toIdx >= arr.length) return cfg;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    const next: ReviewDraft = { ...cfg, team: arr, updatedAt: Date.now() };
    set({ config: next });
    return next;
  },

  setManagerMode: (managerMode) => set({ managerMode }),
  setSessionNotes: (sessionNotes) => set({ sessionNotes }),
}));
