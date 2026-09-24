import { create } from 'zustand';
import { ViewMode, RepresentationMode, PointOfInterest, AgentState, AgentStyle, ChatMessage, InsightCard, AgentBehaviorState, SceneNode, ObjectState, Requirement, KBEntry, InsightType, SpatialComment, CommentMode, ModelType, RightPanelMode, BoardroomLayout, LiveChatMessage } from './types';
import { Vector3 } from 'three';
import { flushSessionToTracker } from './lib/trackerBridge';
import { useReviewSetupStore } from './lib/reviewSetupStore';
import { usePointingTimelineStore } from './lib/pointingTimelineStore';
import type { SceneModelEntry } from './lib/scene/sceneEntries';
import {
  applySceneUpdate,
  emptyScene,
  sceneModelLabel,
  type ModelEditors,
  type RoomScene,
  type SceneModel,
  type SceneUpdate,
} from './lib/scene/roomScene';

/**
 * The names of every part anybody pointed at during this meeting, by node id.
 *
 * Read at meeting-end rather than tracked as cards arrive, because a card's
 * `componentReference` is a node id and the tree node's NAME is not on the card —
 * and the pointing timeline is the one place that already holds both together.
 * Later segments win, so a part renamed by a second model importing over the
 * first is recorded as the room last called it.
 */
function pointedAtPartNames(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const segment of usePointingTimelineStore.getState().segments) {
    if (segment.partId && segment.partName) names[segment.partId] = segment.partName;
  }
  return names;
}

const INITIAL_AGENTS: AgentState[] = [
  { id: '1', name: 'SYS.OP', role: 'PRESENTER', color: '#ff4400', behavior: 'IDLE', currentPoiId: null, attentionLevel: 0 },
  { id: '2', name: 'ENG.UNIT', role: 'REVIEWER', color: '#0066ff', behavior: 'IDLE', currentPoiId: null, attentionLevel: 0 },
  { id: '3', name: 'DES.LEAD', role: 'OBSERVER', color: '#666666', behavior: 'IDLE', currentPoiId: null, attentionLevel: 0 },
  { id: '4', name: 'VR.USER', role: 'OBSERVER', color: '#8b5cf6', behavior: 'IDLE', currentPoiId: null, attentionLevel: 0 },
];

const INITIAL_WEIGHTS: Record<string, number> = {
  '1': 5,
  '2': 5,
  '3': 5,
  '4': 5
};

// --- MOCK KNOWLEDGE BASE ---
const KB_DB: KBEntry[] = [
    { id: 'kb1', category: 'RISK', triggerKeyword: 'clearance', recommendation: "Historical Action: Check tolerance stack-up analysis (Ref: Project Titan)." },
    { id: 'kb2', category: 'RISK', triggerKeyword: 'interference', recommendation: "Recommendation: Implement interference check in CAD assembly level 2." },
    { id: 'kb3', category: 'RATIONALE', triggerKeyword: 'stiffness', recommendation: "Standard: Use ribbing pattern C for injection molded chassis." },
    { id: 'kb4', category: 'ACTION', triggerKeyword: 'material', recommendation: "Action: Verify material availability with procurement lead (Lead Time > 4 wks)." },
];

// --- SCENE DEFINITION ---
export const SYNTH_SCENE_TREE: SceneNode = {
  id: 'assembly', name: 'Synth Assembly', type: 'GROUP', children: [
    { id: 'chassis_grp', name: 'Chassis Module', type: 'GROUP', children: [
        { id: 'main_body', name: 'Unibody Case', type: 'MESH' },
        { id: 'branding', name: 'Logo Plate', type: 'MESH' }
    ]},
    { id: 'interface', name: 'User Interface', type: 'GROUP', children: [
        { id: 'screen_grp', name: 'Display Unit', type: 'GROUP', children: [
            { id: 'screen_glass', name: 'OLED Panel', type: 'MESH' },
            { id: 'screen_ui', name: 'GUI Layer', type: 'MESH' }
        ]},
        { id: 'controls', name: 'Control Surface', type: 'GROUP', children: [
            { id: 'knobs_grp', name: 'Rotary Encoders', type: 'GROUP', children: [
                { id: 'knob-vol', name: 'Master Volume', type: 'PART' },
                { id: 'knob-filter', name: 'Filter Cutoff', type: 'PART' },
                { id: 'knob-res', name: 'Resonance', type: 'PART' }
            ]},
            { id: 'keybed', name: 'Keybed Assembly', type: 'GROUP' }
        ]}
    ]}
  ]
};

// --- BICYCLE SCENE TREE (Import Demo) ---
export const BICYCLE_SCENE_TREE: SceneNode = {
  id: 'bicycle_assembly', name: 'Urban Commuter Bicycle', type: 'GROUP', children: [
    { id: 'frame_grp', name: 'Frame Assembly', type: 'GROUP', children: [
        { id: 'main_frame', name: 'Main Frame', type: 'MESH' },
        { id: 'top_tube', name: 'Top Tube', type: 'MESH' },
        { id: 'down_tube', name: 'Down Tube', type: 'MESH' },
        { id: 'seat_tube', name: 'Seat Tube', type: 'MESH' },
        { id: 'chain_stays', name: 'Chain Stays', type: 'MESH' },
        { id: 'seat_stays', name: 'Seat Stays', type: 'MESH' },
        { id: 'head_tube', name: 'Head Tube', type: 'MESH' },
        { id: 'bottom_bracket', name: 'Bottom Bracket Shell', type: 'PART' }
    ]},
    { id: 'front_assembly', name: 'Front Assembly', type: 'GROUP', children: [
        { id: 'fork_grp', name: 'Fork Assembly', type: 'GROUP', children: [
            { id: 'fork_crown', name: 'Fork Crown', type: 'MESH' },
            { id: 'fork_blades', name: 'Fork Blades', type: 'MESH' },
            { id: 'fork_dropouts', name: 'Fork Dropouts', type: 'PART' }
        ]},
        { id: 'headset', name: 'Headset Bearings', type: 'PART' },
        { id: 'stem', name: 'Stem', type: 'MESH' },
        { id: 'handlebar', name: 'Handlebar', type: 'MESH' },
        { id: 'grips', name: 'Handlebar Grips', type: 'PART' },
        { id: 'front_brake_lever', name: 'Front Brake Lever', type: 'PART' }
    ]},
    { id: 'wheel_front', name: 'Front Wheel', type: 'GROUP', children: [
        { id: 'hub_front', name: 'Front Hub', type: 'PART' },
        { id: 'spokes_front', name: 'Front Spokes', type: 'MESH' },
        { id: 'rim_front', name: 'Front Rim', type: 'MESH' },
        { id: 'tire_front', name: 'Front Tire', type: 'MESH' }
    ]},
    { id: 'wheel_rear', name: 'Rear Wheel', type: 'GROUP', children: [
        { id: 'hub_rear', name: 'Rear Hub', type: 'PART' },
        { id: 'spokes_rear', name: 'Rear Spokes', type: 'MESH' },
        { id: 'rim_rear', name: 'Rear Rim', type: 'MESH' },
        { id: 'tire_rear', name: 'Rear Tire', type: 'MESH' },
        { id: 'cassette', name: 'Rear Cassette', type: 'PART' }
    ]},
    { id: 'drivetrain', name: 'Drivetrain', type: 'GROUP', children: [
        { id: 'crankset', name: 'Crankset', type: 'GROUP', children: [
            { id: 'crank_arms', name: 'Crank Arms', type: 'MESH' },
            { id: 'chainring', name: 'Chainring', type: 'MESH' },
            { id: 'pedals', name: 'Pedals', type: 'PART' }
        ]},
        { id: 'chain', name: 'Chain', type: 'MESH' },
        { id: 'derailleur_rear', name: 'Rear Derailleur', type: 'PART' }
    ]},
    { id: 'braking_system', name: 'Braking System', type: 'GROUP', children: [
        { id: 'brake_front', name: 'Front Disc Brake', type: 'GROUP', children: [
            { id: 'caliper_front', name: 'Front Caliper', type: 'PART' },
            { id: 'rotor_front', name: 'Front Rotor', type: 'MESH' }
        ]},
        { id: 'brake_rear', name: 'Rear Disc Brake', type: 'GROUP', children: [
            { id: 'caliper_rear', name: 'Rear Caliper', type: 'PART' },
            { id: 'rotor_rear', name: 'Rear Rotor', type: 'MESH' }
        ]},
        { id: 'brake_cables', name: 'Hydraulic Lines', type: 'MESH' }
    ]},
    { id: 'cockpit', name: 'Cockpit', type: 'GROUP', children: [
        { id: 'saddle', name: 'Saddle', type: 'MESH' },
        { id: 'seatpost', name: 'Seatpost', type: 'MESH' },
        { id: 'seatpost_clamp', name: 'Seatpost Clamp', type: 'PART' }
    ]},
    { id: 'accessories', name: 'Accessories', type: 'GROUP', children: [
        { id: 'bell', name: 'Bell', type: 'PART' },
        { id: 'reflectors', name: 'Reflectors', type: 'PART' },
        { id: 'kickstand', name: 'Kickstand', type: 'PART' }
    ]}
  ]
};

export const HEADPHONES_SCENE_TREE: SceneNode = {
  id: 'headphones_assembly', name: 'Sennheiser Momentum 4', type: 'GROUP', children: [
    { id: 'left_cup', name: 'Left Ear Cup', type: 'GROUP', children: [
        { id: 'left_driver', name: 'Left Driver Unit', type: 'PART' },
        { id: 'left_cushion', name: 'Left Ear Cushion', type: 'MESH' }
    ]},
    { id: 'right_cup', name: 'Right Ear Cup', type: 'GROUP', children: [
        { id: 'right_driver', name: 'Right Driver Unit', type: 'PART' },
        { id: 'right_cushion', name: 'Right Ear Cushion', type: 'MESH' }
    ]},
    { id: 'headband', name: 'Headband', type: 'GROUP', children: [
        { id: 'headband_pad', name: 'Headband Padding', type: 'MESH' },
        { id: 'headband_frame', name: 'Headband Frame', type: 'MESH' }
    ]},
    { id: 'controls', name: 'Controls', type: 'GROUP', children: [
        { id: 'usb_c_port', name: 'USB-C Port', type: 'PART' },
        { id: 'power_button', name: 'Power Button', type: 'PART' },
        { id: 'volume_control', name: 'Volume Control', type: 'PART' }
    ]}
  ]
};

// For backwards compatibility
export const SCENE_TREE = SYNTH_SCENE_TREE;

// Helper to init object states
const initObjectStates = (node: SceneNode, states: Record<string, ObjectState> = {}) => {
    states[node.id] = { id: node.id, visible: true, selected: false, expanded: true };
    if (node.children) {
        node.children.forEach(child => initObjectStates(child, states));
    }
    return states;
};

// Helper to count parts in a scene tree. Exported for the import status line,
// which says how many parts a file turned into.
export const countParts = (node: SceneNode): number => {
    let count = node.type === 'PART' || node.type === 'MESH' ? 1 : 0;
    if (node.children) {
        node.children.forEach(child => {
            count += countParts(child);
        });
    }
    return count;
};

// Seed POIs from a scene tree so agents always have targets to inspect, even
// for models whose 3D component doesn't call registerPOI (bicycle, headphones,
// fresh imports before mesh traversal runs). Positions default to origin;
// per-mesh components later upsert real world positions via registerPOI.
const derivePoisFromSceneTree = (node: SceneNode, out: PointOfInterest[] = []): PointOfInterest[] => {
    const isLeaf = !node.children || node.children.length === 0;
    if (isLeaf) {
        out.push({ id: node.id, position: new Vector3(0, 0, 0), label: node.name, type: 'GENERAL' });
    }
    node.children?.forEach(child => derivePoisFromSceneTree(child, out));
    return out;
};

// ─── The room's scene ───────────────────────────────────────────────────────
//
// A room shows a LIST of models, not one: the product under review, a mating
// part, a competitor's version, and the revisions of each. What follows is the
// bookkeeping that turns that list — which the room server owns and relays as
// SCENE_STATE — into something the tree, the renderer and the laser can use.

/** The parsed half of one scene model, keyed in `sceneEntries` by SceneModel.id. */
export type { SceneModelEntry } from './lib/scene/sceneEntries';

/**
 * A revision comparison in progress, and what to put back when it ends.
 *
 * Compare is a scene operation, not a local view: everybody in the room sees
 * the same two revisions side by side, because a comparison one person can see
 * and the person they are talking to cannot is not a comparison. That means
 * entering it changes shared visibility and offsets, so leaving it has to undo
 * exactly what it changed — which is what `restore` is for.
 */
export interface SceneCompare {
    line: string;
    olderId: string;
    newerId: string;
    restore: Array<{ id: string; visible: boolean; offset: [number, number, number] }>;
}

/** The root the scene models hang off in the combined tree. */
export const SCENE_ROOT_ID = 'scene-root';

/**
 * Whether a model shows on THIS screen.
 *
 * Two different things decide it, and keeping them apart is the whole point:
 * `model.visible` is shared — the room agreed it, the server holds it, and
 * changing it changes everybody's screen. `localModelVisibility` is not: hiding
 * a model so you can see the one behind it is your business, and somebody who is
 * not allowed to change the room's models must still be able to do it. A local
 * override wins while it exists, which is why the eye on a model row can mean
 * either thing depending on who is clicking it.
 */
export function sceneModelVisible(
    model: SceneModel,
    localModelVisibility: Record<string, boolean>,
): boolean {
    return localModelVisibility[model.id] ?? model.visible;
}

/** The width of one model in scene units, which is what placement needs. */
export function sceneEntryWidth(entry: SceneModelEntry): number {
    return entry.size.x * entry.baseScale * entry.scale;
}

/**
 * One top-level tree group per scene model, named "Bracket · Rev B".
 *
 * Each model's own root node keeps its id — that is the id its geometry carries
 * in userData.modelId, so picking the model in the 3D view and selecting its row
 * in the tree have to be the same id — and takes the line-and-revision label
 * instead of the file's root group name, which is whatever the exporter called
 * it and is usually "Scene" or the part number.
 *
 * Models whose bytes have not been parsed yet are simply absent: the tree shows
 * their row from `scene.models` with a "loading" state, and the geometry arrives
 * when the download does.
 */
function combinedSceneTree(scene: RoomScene, entries: Record<string, SceneModelEntry>): SceneNode | null {
    const children: SceneNode[] = [];
    for (const model of scene.models) {
        const entry = entries[model.id];
        if (entry) children.push({ ...entry.sceneTree, name: sceneModelLabel(model) });
    }
    if (children.length === 0) return null;
    return { id: SCENE_ROOT_ID, name: 'Scene', type: 'GROUP', children };
}

/**
 * Object states for a tree, keeping what is already there.
 *
 * Adding a model to a scene used to mean rebuilding every node's state, which
 * collapsed the tree the room had opened and un-hid the parts somebody had
 * hidden — the second model arriving would have wiped what the first one's
 * walkthrough had set up. So states for ids that still exist are carried over
 * and only new ids are initialised. Ids that are gone are dropped, because a
 * state for a mesh that is no longer in the scene is how a hidden part comes
 * back invisible after the model it belonged to was removed and re-added.
 */
function mergeObjectStates(
    existing: Record<string, ObjectState>,
    tree: SceneNode | null,
): Record<string, ObjectState> {
    if (!tree) return existing;
    const next: Record<string, ObjectState> = {};
    const walk = (node: SceneNode) => {
        next[node.id] = existing[node.id] ?? { id: node.id, visible: true, selected: false, expanded: true };
        node.children?.forEach(walk);
    };
    walk(tree);
    return next;
}

/**
 * Wiped when the scene is replaced rather than added to — "Replace everything",
 * which is the import flow's fresh start and behaves the way importing a model
 * always did. Adding a model next to the current one, or a revision of it, does
 * NOT do this: the meeting is still about the same product, so its comments,
 * transcript and cards stay.
 */
const FRESH_SCENE_RESET: Partial<AppState> = {
    comments: [],
    chatHistory: [],
    insightCards: [],
    activeAgentId: null,
    leaderId: null,
    splitScreenTarget: null,
    isMeetingEnded: false,
    time: 0,
    commentMode: 'none',
    pendingCommentPosition: null,
    pendingCommentNodeId: null,
    pendingCommentNodeName: null,
    drawingCanvas: null,
    capturedScreenshot: null,
    drawingInteractionActive: false,
    compare: null,
    localModelVisibility: {},
};

/** Which built-in shows when the scene holds no models of its own. */
const DEFAULT_BUILT_IN: ModelType = 'headphones';

/** The model type the rest of the app reads, derived from the scene. */
function activeModelTypeFor(scene: RoomScene): ModelType {
    if (scene.models.length > 0) return 'imported';
    return scene.builtIn ?? DEFAULT_BUILT_IN;
}

/** Drop the records for models the scene no longer holds. */
function pruneToScene<T>(record: Record<string, T>, scene: RoomScene): Record<string, T> {
    const next: Record<string, T> = {};
    for (const model of scene.models) {
        const value = record[model.id];
        if (value !== undefined) next[model.id] = value;
    }
    return next;
}

/**
 * The four fields that follow from the scene: which model type the app is in,
 * the combined tree, and the node states and agent targets derived from it.
 */
function derivedFromScene(
    scene: RoomScene,
    state: AppState,
    entries: Record<string, SceneModelEntry>,
    fresh: boolean,
) {
    const activeModelType = activeModelTypeFor(scene);
    const importedSceneTree = combinedSceneTree(scene, entries);
    const tree = getCurrentSceneTree(
        activeModelType,
        importedSceneTree,
        state.bicycleSceneTree,
        state.headphonesSceneTree,
    );
    return {
        activeModelType,
        importedSceneTree,
        objectStates: fresh ? initObjectStates(tree) : mergeObjectStates(state.objectStates, tree),
        pois: derivePoisFromSceneTree(tree),
    };
}

/**
 * Make `scene` the scene, and everything that follows from it follow.
 *
 * One function because three callers need exactly the same bookkeeping — a
 * SCENE_STATE from the room server, a curation being opened, and a local
 * prediction of an operation this client just sent — and a divergence between
 * them is the kind of bug that shows up as one participant's tree being out of
 * step with everybody else's.
 */
function adoptScene(scene: RoomScene, state: AppState, fresh: boolean): Partial<AppState> {
    const entries = pruneToScene(state.sceneEntries, scene);
    const last = scene.models[scene.models.length - 1];
    // Keep pointing at whatever the scale slider was on while it is still in the
    // scene, so a model arriving does not move the slider somebody is dragging.
    const activeSceneModelId = scene.models.some((model) => model.id === state.activeSceneModelId)
        ? state.activeSceneModelId
        : last
          ? last.id
          : null;
    return {
        scene,
        sceneEntries: entries,
        localModelVisibility: pruneToScene(state.localModelVisibility, scene),
        expandedSceneModels: pruneToScene(state.expandedSceneModels, scene),
        activeSceneModelId,
        isImporting: false,
        ...(fresh ? FRESH_SCENE_RESET : {}),
        ...derivedFromScene(scene, state, entries, fresh),
    };
}


interface AppState {
  viewMode: ViewMode;
  representationMode: RepresentationMode;
  showFrustums: boolean;
  showGaze: boolean;
  showTrails: boolean;
  isPlaying: boolean;
  isMeetingEnded: boolean;
  time: number;

  // Collaboration State
  agents: AgentState[];
  agentStyle: AgentStyle;
  agentWeights: Record<string, number>;
  pois: PointOfInterest[];
  activeAgentId: string | null;

  // Advanced Collaboration Features
  leaderId: string | 'USER' | null;
  followingRemoteUserId: string | null; // camera + agents locked to a remote participant
  // True while the user is dragging their own view *without* leaving the
  // follow: the camera stops tracking the leader for the length of the drag
  // plus FOLLOW_RESUME_DELAY_MS, then eases back. Still counts as following.
  followNudged: boolean;
  // Split screen can follow either an AI agent or a real participant.
  // Discriminated by `kind` so the renderer knows which lookup path to use.
  splitScreenTarget:
    | { kind: 'agent'; id: string }
    | { kind: 'user'; userId: string }
    | null;
  userInteractionPoint: Vector3;
  isLaserActive: boolean;
  laserHighlightGranularity: 'model' | 'part';
  // When true, the laser auto-engages while the user dwells on a model part
  // with the mouse (passive "hover pointing").
  hoverPointingEnabled: boolean;
  hideAgents: boolean;

  // Follow Request System
  followRequest: { agentId: string; timestamp: number } | null;

  // Privacy Mode
  isPrivacyMode: boolean;

  // Followed Agent (for participant list)
  followedAgentId: string | null;

  // Temporary disengage from agent following
  temporarilyDisengagedFromAgentId: string | null;

  // Conversation & AI
  chatHistory: ChatMessage[];
  liveChat: LiveChatMessage[];
  insightCards: InsightCard[];
  mobileLaserNDC: [number, number] | null;
  requirements: Requirement[];
  knowledgeBase: KBEntry[];

  // Scene Graph State
  objectStates: Record<string, ObjectState>;

  // --- Models: the room's scene ---
  /** Which model the app renders. Derived from `scene` — see activeModelTypeFor. */
  activeModelType: ModelType;
  isImporting: boolean;
  /**
   * What is on screen, shared by the room. The room server holds the truth and
   * relays it whole as SCENE_STATE; this copy is what the renderer and the tree
   * read. Changing it locally is only ever a prediction of what the server will
   * relay back — see applyLocalSceneUpdate.
   */
  scene: RoomScene;
  /** Who may change the models. Enforced by the room server; the UI reads it to disable what would be refused. */
  modelEditors: ModelEditors;
  /** Parsed geometry per SceneModel.id. Absent until the file has been fetched and parsed. */
  sceneEntries: Record<string, SceneModelEntry>;
  /** Per-model visibility for THIS screen only. Overrides SceneModel.visible while present. */
  localModelVisibility: Record<string, boolean>;
  /** The model the scale slider and the import status refer to. */
  activeSceneModelId: string | null;
  /** Which model rows are open in the tree. Kept out of objectStates: a row's expansion is not a node's. */
  expandedSceneModels: Record<string, boolean>;
  compare: SceneCompare | null;
  /** A SCENE_REFUSED the room server sent this client, in words. Shown once in the model tree. */
  sceneRefusal: string | null;
  /**
   * The scene models as one tree, one top-level group per model. Derived from
   * `scene` and `sceneEntries`; keeps its old name because the consumers —
   * RecordingContext, DialogueEngine, SpatialComments — resolve a node id to the
   * name it should be read out as, and that is exactly what this is for.
   */
  importedSceneTree: SceneNode | null;

  // Built-in models' real scene trees, populated when the GLB loads.
  // Until then, getCurrentSceneTree falls back to the hand-written constants.
  bicycleSceneTree: SceneNode | null;
  headphonesSceneTree: SceneNode | null;

  // Curator-set transform applied to whatever model is loaded. Lives here
  // (not in the imported* group) so it applies to presets too. Synced from
  // the active review config's asset.transform when a curation loads.
  modelTransform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
  };
  setModelTransform: (t: { position: [number, number, number]; rotation: [number, number, number]; scale: number }) => void;

  // --- NEW: Comments System ---
  comments: SpatialComment[];
  commentMode: CommentMode;
  pendingCommentPosition: { x: number; y: number; z: number } | null;
  pendingCommentNodeId: string | null;
  pendingCommentNodeName: string | null;
  currentUser: string;
  currentUserColor: string;

  // --- NEW: Drawing State ---
  drawingCanvas: string | null; // Base64 of current drawing
  capturedScreenshot: string | null; // Base64 of captured 3D view for drawing overlay
  drawingInteractionActive: boolean;
  showDrawingCanvas: boolean; // Whether the drawing canvas overlay is visible

  // --- NEW: Panel Mode ---
  rightPanelMode: RightPanelMode;

  // --- NEW: Comments Display State ---
  commentsExpandedInScene: boolean; // Toggle all comments expanded in 3D

  // --- NEW: Import Status Messages ---
  importError: string | null;
  importSuccess: string | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setRepresentationMode: (mode: RepresentationMode) => void;
  toggleFrustums: () => void;
  toggleGaze: () => void;
  toggleTrails: () => void;
  togglePlay: () => void;
  /** `participantCount` is the number of real people; agents are not participants. */
  endMeeting: (ended: boolean, participantCount?: number) => void;
  setTime: (time: number) => void;
  resetTime: () => void;

  registerPOI: (poi: PointOfInterest) => void;
  setActiveAgent: (id: string | null) => void;
  setLeader: (id: string | 'USER' | null) => void;
  setFollowingRemoteUser: (userId: string | null) => void;
  setFollowNudged: (nudged: boolean) => void;
  setSplitScreenTarget: (target: AppState['splitScreenTarget']) => void;
  setUserInteractionPoint: (pos: Vector3) => void;
  setLaserActive: (active: boolean) => void;
  setLaserHighlightGranularity: (g: 'model' | 'part') => void;
  setHoverPointingEnabled: (enabled: boolean) => void;
  toggleHideAgents: () => void;
  setFollowRequest: (req: { agentId: string; timestamp: number } | null) => void;
  togglePrivacyMode: () => void;
  setFollowedAgent: (id: string | null) => void;
  temporarilyDisengageFromAgent: () => void;
  resumeFollowingAgent: () => void;
  clearTemporaryDisengage: () => void;

  setAgentStyle: (style: AgentStyle) => void;
  setAgentWeight: (id: string, weight: number) => void;

  updateAgentStatus: (id: string, behavior: AgentBehaviorState, poiId: string | null) => void;
  addChatMessage: (msg: ChatMessage) => void;
  addLiveChatMessage: (msg: LiveChatMessage) => void;
  addInsightCard: (card: InsightCard) => void;
  setMobileLaserNDC: (ndc: [number, number] | null) => void;
  updateInsightType: (id: string, newType: InsightType) => void;
  updateInsight: (id: string, updates: Partial<InsightCard>) => void;
  setRequirements: (reqs: Requirement[]) => void;

  // Scene Graph Actions
  toggleNodeVisibility: (id: string) => void;
  toggleNodeExpanded: (id: string) => void;
  selectNode: (id: string | null) => void;

  // --- Model Import Actions ---
  setActiveModelType: (type: ModelType) => void;
  setIsImporting: (importing: boolean) => void;
  /**
   * Adopt a scene — from SCENE_STATE, or from a curation being opened.
   * `fresh` also wipes the meeting's content, which is what replacing the whole
   * scene means and what adding to it does not.
   */
  setRoomScene: (scene: RoomScene, options?: { fresh?: boolean }) => void;
  setModelEditors: (editors: ModelEditors) => void;
  /** Apply one operation to the local copy, the way the room server would. */
  applyLocalSceneUpdate: (update: SceneUpdate, options?: { fresh?: boolean }) => void;
  /** Record a model's parsed geometry. Idempotent: the loader may offer it twice. */
  upsertSceneModel: (entry: SceneModelEntry) => void;
  /** Drop parsed geometry for models the scene no longer holds. */
  pruneSceneEntries: () => void;
  setSceneModelScale: (id: string, scale: number) => void;
  /** Hide or show a model on THIS screen only — never sent to the room. */
  setLocalModelVisibility: (id: string, visible: boolean) => void;
  setActiveSceneModel: (id: string | null) => void;
  toggleSceneModelExpanded: (id: string) => void;
  setSceneCompare: (compare: SceneCompare | null) => void;
  setSceneRefusal: (message: string | null) => void;
  setBuiltInSceneTree: (type: 'bicycle' | 'headphones', tree: SceneNode) => void;

  // --- NEW: Comment Actions ---
  setAllComments: (comments: SpatialComment[]) => void;
  setCommentMode: (mode: CommentMode) => void;
  setPendingComment: (position: { x: number; y: number; z: number } | null, nodeId: string | null, nodeName: string | null) => void;
  addComment: (comment: SpatialComment) => void;
  updateComment: (id: string, updates: Partial<SpatialComment>) => void;
  deleteComment: (id: string) => void;
  resolveComment: (id: string) => void;
  setDrawingCanvas: (data: string | null) => void;
  setCapturedScreenshot: (data: string | null) => void;
  setDrawingInteractionActive: (active: boolean) => void;
  setShowDrawingCanvas: (show: boolean) => void;
  // Non-serializable: live reference so handleSave can capture the current GL frame.
  _glCapture: (() => string | null) | null;
  setGlCapture: (fn: (() => string | null) | null) => void;

  // --- NEW: Panel Mode Action ---
  setRightPanelMode: (mode: RightPanelMode) => void;

  // --- NEW: Comments Display Actions ---
  toggleCommentsExpandedInScene: () => void;
  setCommentScreenOffset: (id: string, offset: { x: number; y: number }) => void;
  toggleCommentExpanded: (id: string) => void;

  // --- NEW: Import Status Actions ---
  /** What the model tree's status area says: a failure, or what just succeeded. */
  setImportStatus: (error: string | null, success: string | null) => void;
  clearImportStatus: () => void;

  // --- BOARDROOM MODE ---
  boardroomPendingEntry: boolean; // countdown is running, waiting to enter
  isBoardroomMode: boolean;
  boardroomLayout: BoardroomLayout;
  boardroomInteractionEnabled: boolean;
  boardroomLayoutLocked: boolean;
  boardroomPresenterAgentId: string | 'USER' | null;
  boardroomTranscriptPermission: boolean;
  boardroomLeaderId: string | null; // real person leading (userId)
  takeoverModeEnabled: boolean;
  takeoverApprovedUserIds: string[];

  triggerBoardroomEntry: () => void;
  cancelBoardroomEntry: () => void;
  toggleBoardroomMode: () => void;
  setBoardroomLayout: (layout: BoardroomLayout) => void;
  toggleBoardroomInteraction: () => void;
  toggleBoardroomLayoutLocked: () => void;
  setBoardroomPresenter: (id: string | 'USER' | null) => void;
  toggleBoardroomTranscriptPermission: () => void;
  setBoardroomLeaderId: (userId: string | null) => void;
  setTakeoverModeEnabled: (v: boolean) => void;
  toggleTakeoverApproval: (userId: string) => void;
  setTakeoverApprovedUserIds: (ids: string[]) => void;
  setPrivacyMode: (enabled: boolean) => void;

  // Local-only boardroom presenter detach (drag to look around, auto-resume after 3s)
  boardroomPresenterDetachedId: string | null;
  detachBoardroomPresenter: (presenterId: string) => void;
  resumeBoardroomPresenter: () => void;

  // Presenter request (non-host requests; host sees notification)
  pendingPresenterRequest: { fromUserId: string; fromName: string } | null;
  setPendingPresenterRequest: (req: { fromUserId: string; fromName: string } | null) => void;

  // Requestor's local view of their pending/denied presenter request
  presenterRequestStatus: 'pending' | 'denied' | null;
  setPresenterRequestStatus: (status: 'pending' | 'denied' | null) => void;

  // --- SESSION HOST ---
  sessionHostId: string | null; // Zoom-style host: first to join, controls view transitions
  setSessionHostId: (id: string | null) => void;

  // --- THE DESIGN REVIEW THIS ROOM IS HOLDING ---
  /**
   * review_curations.id when this room was opened from a design review, and null
   * for an ad-hoc session nobody curated.
   *
   * Not derived from the URL. A room id and a review id are the same STRING, but
   * only one of them has a row behind it, and the difference is what decides
   * whether a meeting is recorded against a review or stands alone — so it is set
   * by pages/RoomPage.tsx at the moment it actually loads a curation, and cleared
   * when the room unmounts.
   */
  activeReviewId: string | null;
  setActiveReviewId: (id: string | null) => void;
}


export const useStore = create<AppState>((set, get) => ({
  viewMode: ViewMode.FREE,
  representationMode: RepresentationMode.FULL,
  showFrustums: false,
  showGaze: false,
  showTrails: false,
  isPlaying: true,
  isMeetingEnded: false,
  time: 0,
  agents: INITIAL_AGENTS,
  agentStyle: AgentStyle.BOX,
  agentWeights: INITIAL_WEIGHTS,
  pois: derivePoisFromSceneTree(HEADPHONES_SCENE_TREE),
  activeAgentId: null,
  leaderId: null,
  followingRemoteUserId: null,
  followNudged: false,
  splitScreenTarget: null,
  userInteractionPoint: new Vector3(),
  isLaserActive: false,
  laserHighlightGranularity: 'part',
  hoverPointingEnabled: false,
  // Agents OFF by default. The four scripted agents (SYS.OP, ENG.UNIT,
  // DES.LEAD, VR.USER) are demo furniture: in a real review they stand next
  // to actual participants and are mistaken for them. The AGENTS toggle in
  // the room brings them back for a demo.
  hideAgents: true,
  followRequest: null,
  isPrivacyMode: false,
  followedAgentId: null,
  temporarilyDisengagedFromAgentId: null,
  chatHistory: [],
  liveChat: [],
  mobileLaserNDC: null,
  insightCards: [],
  requirements: [],
  knowledgeBase: KB_DB,
  objectStates: initObjectStates(HEADPHONES_SCENE_TREE),

  // --- Models: the room's scene ---
  activeModelType: 'headphones',
  modelTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
  isImporting: false,
  scene: emptyScene(),
  modelEditors: 'host',
  sceneEntries: {},
  localModelVisibility: {},
  activeSceneModelId: null,
  expandedSceneModels: {},
  compare: null,
  sceneRefusal: null,
  importedSceneTree: null,
  bicycleSceneTree: null,
  headphonesSceneTree: null,

  // --- NEW: Comments System ---
  comments: [],
  commentMode: 'none',
  pendingCommentPosition: null,
  pendingCommentNodeId: null,
  pendingCommentNodeName: null,
  currentUser: (() => { try { const s = localStorage.getItem('vp_user'); return s ? (JSON.parse(s).name || 'Guest') : 'Guest'; } catch { return 'Guest'; } })(),
  currentUserColor: (() => { try { const s = localStorage.getItem('vp_user'); return s ? (JSON.parse(s).color || '#10b981') : '#10b981'; } catch { return '#10b981'; } })(),

  // --- NEW: Drawing State ---
  drawingCanvas: null,
  capturedScreenshot: null,
  drawingInteractionActive: false,
  showDrawingCanvas: false,

  // --- NEW: Panel Mode ---
  rightPanelMode: 'meeting',

  // --- NEW: Comments Display State ---
  commentsExpandedInScene: false,

  // --- NEW: Import Status Messages ---
  importError: null,
  importSuccess: null,

  setViewMode: (mode) => set({ viewMode: mode }),
  setRepresentationMode: (mode) => set({ representationMode: mode }),
  toggleFrustums: () => set((state) => ({ showFrustums: !state.showFrustums })),
  toggleGaze: () => set((state) => ({ showGaze: !state.showGaze })),
  toggleTrails: () => set((state) => ({ showTrails: !state.showTrails })),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  endMeeting: (ended, participantCount) => {
    if (ended) {
      const { insightCards, agents, activeModelType, hideAgents, scene, activeReviewId } = get();
      const roomId = window.location.pathname.split('/room/')[1] ?? 'local';
      const reviewDraft = useReviewSetupStore.getState().draft;
      flushSessionToTracker({
        roomId,
        insightCards,
        // Real people, passed in by the caller (which knows the presence
        // list). The old `agents.length` recorded four demo agents as
        // attendees of every meeting; with agents hidden it would have
        // recorded four people who were never there.
        participantCount: participantCount ?? (hideAgents ? 1 : agents.length),
        modelName: activeModelType ?? null,
        labels: reviewDraft?.labels ?? {},
        // The design review this room is holding, or null for an ad-hoc session.
        // Deliberately NOT the draft's reviewId: the draft is persisted, so a
        // stale one from the review somebody curated an hour ago would otherwise
        // attach this meeting to that review.
        reviewId: activeReviewId,
        // What was on screen, so the meeting and its cards can be recorded
        // against revisions rather than against "the model".
        onScreen: scene.models,
        partNames: pointedAtPartNames(),
      });
    }
    set({ isMeetingEnded: ended, isPlaying: !ended });
  },
  setTime: (time) => set({ time }),
  resetTime: () => set({ time: 0, chatHistory: [], insightCards: [] }),
  
  registerPOI: (poi) => set((state) => {
    const existingIdx = state.pois.findIndex(p => p.id === poi.id);
    if (existingIdx === -1) return { pois: [...state.pois, poi] };
    // Upsert so per-mesh components can overwrite seeded origin positions
    // with the real world-space center once meshes mount.
    const next = state.pois.slice();
    next[existingIdx] = poi;
    return { pois: next };
  }),
  setActiveAgent: (id) => set({ activeAgentId: id }),
  // A nudge belongs to the follow it happened during, so every change of who
  // leads clears it — otherwise a stale nudge would freeze the next follow.
  setLeader: (id) => set({ leaderId: id, followingRemoteUserId: null, followNudged: false }),
  // Follow a remote user: locks camera and makes agents follow too
  setFollowingRemoteUser: (userId) => set(
    userId
      ? { followingRemoteUserId: userId, leaderId: 'USER', viewMode: ViewMode.FREE, activeAgentId: null, followNudged: false }
      : { followingRemoteUserId: null, leaderId: null, followNudged: false }
  ),
  setFollowNudged: (followNudged) => set({ followNudged }),
  setSplitScreenTarget: (target) => set({ splitScreenTarget: target }),
  setUserInteractionPoint: (pos) => set({ userInteractionPoint: pos }),
  setLaserActive: (active) => set({ isLaserActive: active }),
  setLaserHighlightGranularity: (g) => set({ laserHighlightGranularity: g }),
  setHoverPointingEnabled: (hoverPointingEnabled) => set({ hoverPointingEnabled }),
  toggleHideAgents: () => set(state => ({ hideAgents: !state.hideAgents })),
  setFollowRequest: (req) => set({ followRequest: req }),
  togglePrivacyMode: () => set((state) => ({ isPrivacyMode: !state.isPrivacyMode })),
  setFollowedAgent: (id) => set({ followedAgentId: id }),

  // Temporarily disengage from POV following - stores current agent and switches to FREE mode
  temporarilyDisengageFromAgent: () => set((state) => {
    if (state.viewMode === ViewMode.POV_AGENT && state.activeAgentId) {
      return {
        temporarilyDisengagedFromAgentId: state.activeAgentId,
        viewMode: ViewMode.FREE
      };
    }
    return state;
  }),

  // Resume following the temporarily disengaged agent
  resumeFollowingAgent: () => set((state) => {
    if (state.temporarilyDisengagedFromAgentId) {
      return {
        activeAgentId: state.temporarilyDisengagedFromAgentId,
        viewMode: ViewMode.POV_AGENT,
        temporarilyDisengagedFromAgentId: null
      };
    }
    return state;
  }),

  // Clear temporary disengage state without resuming
  clearTemporaryDisengage: () => set({ temporarilyDisengagedFromAgentId: null }),
  
  setAgentStyle: (style) => set({ agentStyle: style }),
  setAgentWeight: (id, weight) => set((state) => ({
    agentWeights: { ...state.agentWeights, [id]: weight }
  })),
  
  updateAgentStatus: (id, behavior, poiId) => set((state) => ({
    agents: state.agents.map(a => a.id === id ? { ...a, behavior, currentPoiId: poiId } : a)
  })),
  
  addChatMessage: (msg) => set((state) => ({
    chatHistory: [...state.chatHistory, msg].slice(-50)
  })),

  addLiveChatMessage: (msg) => set((state) => ({
    liveChat: [...state.liveChat, msg].slice(-200)
  })),

  setMobileLaserNDC: (ndc) => set({ mobileLaserNDC: ndc }),

  setRequirements: (reqs) => set({ requirements: reqs }),

  addInsightCard: (card) => set((state) => {
    if (state.insightCards.some(c => c.id === card.id)) return state; // deduplicate
    return { insightCards: [card, ...state.insightCards].slice(0, 15) };
  }),

  updateInsightType: (id, newType) => set((state) => ({
    insightCards: state.insightCards.map(c => c.id === id ? { ...c, type: newType } : c)
  })),

  updateInsight: (id, updates) => set((state) => ({
    insightCards: state.insightCards.map(c => c.id === id ? { ...c, ...updates } : c)
  })),

  // Scene Graph Actions
  toggleNodeVisibility: (id) => set((state) => ({
      objectStates: {
          ...state.objectStates,
          [id]: { ...state.objectStates[id], visible: !state.objectStates[id].visible }
      }
  })),
  toggleNodeExpanded: (id) => set((state) => ({
      objectStates: {
          ...state.objectStates,
          [id]: { ...state.objectStates[id], expanded: !state.objectStates[id].expanded }
      }
  })),
  selectNode: (id) => set((state) => {
      const newStates = { ...state.objectStates };
      Object.keys(newStates).forEach(key => {
          newStates[key] = { ...newStates[key], selected: false };
      });
      if (id && newStates[id]) {
          newStates[id] = { ...newStates[id], selected: true };
      }
      return { objectStates: newStates };
  }),

  // --- NEW: Model Import Actions ---
  setModelTransform: (modelTransform) => set({ modelTransform }),

  setActiveModelType: (type) => set((state) => {
      // 'imported' is not something a caller picks: it is what the scene reads
      // as when it holds models, and there is nothing to show when it does not.
      // Choosing a built-in clears the list, which is what switching models has
      // always meant — the preset replaces what was there.
      if (type === 'imported') return state;
      // Only a REAL model change wipes the meeting's content. This used to
      // clear unconditionally, and the room re-applies the model on every
      // REVIEW_CONFIG sync — so committing a pin (which updates the review)
      // erased every comment, chat line and insight card on the other
      // participants' screens moments after they arrived. Found live
      // 2026-09-23 while testing commit-as-comment.
      const sameModel = state.activeModelType === type;
      return adoptScene({ models: [], builtIn: type }, state, !sameModel);
  }),

  setIsImporting: (importing) => set({ isImporting: importing }),

  setRoomScene: (scene, options) => set((state) => adoptScene(scene, state, options?.fresh ?? false)),

  applyLocalSceneUpdate: (update, options) => {
      const state = get();
      const next = applySceneUpdate(state.scene, update);
      // The reducer returned the same object, so there is nothing to adopt —
      // unless the caller asked for a fresh start, which is a change to the
      // MEETING even when it is not a change to the list.
      if (next === state.scene && !options?.fresh) return;
      state.setRoomScene(next, options);
  },

  setModelEditors: (modelEditors) => set({ modelEditors }),

  upsertSceneModel: (entry) => set((state) => {
      const previous = state.sceneEntries[entry.id];
      // The same geometry can be offered twice — an import parses the file to
      // measure it, and the loader parses whatever the scene says is missing.
      // Keep the scale the user dialled in rather than resetting it under them.
      const merged: SceneModelEntry = previous ? { ...entry, scale: previous.scale } : entry;
      const entries = { ...state.sceneEntries, [entry.id]: merged };
      return {
          sceneEntries: entries,
          activeSceneModelId: state.activeSceneModelId ?? entry.id,
          ...derivedFromScene(state.scene, state, entries, false),
      };
  }),

  pruneSceneEntries: () => set((state) => {
      const entries = pruneToScene(state.sceneEntries, state.scene);
      if (Object.keys(entries).length === Object.keys(state.sceneEntries).length) return state;
      return { sceneEntries: entries, ...derivedFromScene(state.scene, state, entries, false) };
  }),

  setSceneModelScale: (id, scale) => set((state) => {
      const entry = state.sceneEntries[id];
      if (!entry || entry.scale === scale) return state;
      return { sceneEntries: { ...state.sceneEntries, [id]: { ...entry, scale } } };
  }),

  setLocalModelVisibility: (id, visible) => set((state) => ({
      localModelVisibility: { ...state.localModelVisibility, [id]: visible },
  })),

  setActiveSceneModel: (id) => set({ activeSceneModelId: id }),

  toggleSceneModelExpanded: (id) => set((state) => ({
      expandedSceneModels: { ...state.expandedSceneModels, [id]: !state.expandedSceneModels[id] },
  })),

  setSceneCompare: (compare) => set({ compare }),

  setSceneRefusal: (message) => set({ sceneRefusal: message }),

  setImportStatus: (importError, importSuccess) => set({ importError, importSuccess }),

  setBuiltInSceneTree: (type, tree) => set({
    [type === 'bicycle' ? 'bicycleSceneTree' : 'headphonesSceneTree']: tree,
    objectStates: initObjectStates(tree),
    pois: derivePoisFromSceneTree(tree),
  }),

  // --- NEW: Comment Actions ---
  setAllComments: (comments) => set({ comments }),
  setCommentMode: (mode) => set({ commentMode: mode }),

  setPendingComment: (position, nodeId, nodeName) => set({
      pendingCommentPosition: position,
      pendingCommentNodeId: nodeId,
      pendingCommentNodeName: nodeName
  }),

  addComment: (comment) => set((state) => ({
      comments: [...state.comments, comment]
  })),

  updateComment: (id, updates) => set((state) => ({
      comments: state.comments.map(c => c.id === id ? { ...c, ...updates } : c)
  })),

  deleteComment: (id) => set((state) => ({
      comments: state.comments.filter(c => c.id !== id)
  })),

  resolveComment: (id) => set((state) => ({
      comments: state.comments.map(c => c.id === id ? { ...c, resolved: true } : c)
  })),

  setDrawingCanvas: (data) => set({ drawingCanvas: data }),
  setCapturedScreenshot: (data) => set({ capturedScreenshot: data }),
  setDrawingInteractionActive: (active) => set({ drawingInteractionActive: active }),
  setShowDrawingCanvas: (show) => set({ showDrawingCanvas: show }),
  _glCapture: null,
  setGlCapture: (fn) => set({ _glCapture: fn }),

  // --- NEW: Panel Mode Action ---
  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),

  // --- NEW: Comments Display Actions ---
  toggleCommentsExpandedInScene: () => set((state) => ({
      commentsExpandedInScene: !state.commentsExpandedInScene
  })),

  setCommentScreenOffset: (id, offset) => set((state) => ({
      comments: state.comments.map(c => c.id === id ? { ...c, screenOffset: offset } : c)
  })),

  toggleCommentExpanded: (id) => set((state) => ({
      comments: state.comments.map(c => c.id === id ? { ...c, expanded: !c.expanded } : c)
  })),

  // --- NEW: Import Status Actions ---
  clearImportStatus: () => set({ importError: null, importSuccess: null }),

  // --- SESSION HOST ---
  sessionHostId: null,

  // --- THE DESIGN REVIEW THIS ROOM IS HOLDING ---
  activeReviewId: null,
  setActiveReviewId: (activeReviewId) => set({ activeReviewId }),

  // --- BOARDROOM MODE ---
  boardroomPendingEntry: false,
  boardroomPresenterDetachedId: null,
  pendingPresenterRequest: null,
  presenterRequestStatus: null,
  isBoardroomMode: false,
  boardroomLayout: 'focus' as BoardroomLayout,
  boardroomInteractionEnabled: false,
  boardroomLayoutLocked: false,
  boardroomPresenterAgentId: null,
  boardroomTranscriptPermission: true,
  boardroomLeaderId: null,
  takeoverModeEnabled: false,
  takeoverApprovedUserIds: [],

  triggerBoardroomEntry: () => set({ boardroomPendingEntry: true }),
  cancelBoardroomEntry: () => set({ boardroomPendingEntry: false }),

  toggleBoardroomMode: () => set((state) => {
    if (!state.isBoardroomMode) {
      return {
        isBoardroomMode: true,
        boardroomPendingEntry: false,
        viewMode: ViewMode.FREE,
        activeAgentId: null,
        temporarilyDisengagedFromAgentId: null,
        // Host is presenter by default; BoardroomPresenterSync will set followingRemoteUserId for non-hosts.
        // Late joiners overwrite this from BOARDROOM_STATE's authoritative leaderId.
        boardroomLeaderId: state.sessionHostId,
        boardroomPresenterDetachedId: null,
        // Clean slate for boardroom policy each entry — host re-enables explicitly
        takeoverModeEnabled: false,
        takeoverApprovedUserIds: [],
        pendingPresenterRequest: null,
        presenterRequestStatus: null,
      };
    }
    return {
      isBoardroomMode: false,
      boardroomPendingEntry: false,
      boardroomLeaderId: null,
      followingRemoteUserId: null,
      viewMode: ViewMode.FREE,
      activeAgentId: null,
      temporarilyDisengagedFromAgentId: null,
      boardroomPresenterDetachedId: null,
      takeoverModeEnabled: false,
      takeoverApprovedUserIds: [],
      pendingPresenterRequest: null,
      presenterRequestStatus: null,
    };
  }),
  setBoardroomLayout: (layout) => set({ boardroomLayout: layout }),
  toggleBoardroomInteraction: () => set((state) => ({ boardroomInteractionEnabled: !state.boardroomInteractionEnabled })),
  toggleBoardroomLayoutLocked: () => set((state) => ({ boardroomLayoutLocked: !state.boardroomLayoutLocked })),
  setBoardroomPresenter: (id) => set({
    boardroomPresenterAgentId: id,
    activeAgentId: (id && id !== 'USER') ? id : null,
    viewMode: (id && id !== 'USER') ? ViewMode.POV_AGENT : ViewMode.FREE,
    // Always clear detach state — prevents stale resume timer overwriting the new pin
    temporarilyDisengagedFromAgentId: null,
  }),
  toggleBoardroomTranscriptPermission: () => set((state) => ({ boardroomTranscriptPermission: !state.boardroomTranscriptPermission })),
  setBoardroomLeaderId: (userId) => set({ boardroomLeaderId: userId }),
  setTakeoverModeEnabled: (v) => set({ takeoverModeEnabled: v }),
  toggleTakeoverApproval: (userId) => set((state) => {
    const ids = state.takeoverApprovedUserIds;
    return {
      takeoverApprovedUserIds: ids.includes(userId)
        ? ids.filter(id => id !== userId)
        : [...ids, userId],
    };
  }),
  setTakeoverApprovedUserIds: (ids) => set({ takeoverApprovedUserIds: ids }),
  setPrivacyMode: (enabled) => set({ isPrivacyMode: enabled }),
  setSessionHostId: (id) => set({ sessionHostId: id }),
  detachBoardroomPresenter: (presenterId) => set({
    boardroomPresenterDetachedId: presenterId,
    followingRemoteUserId: null,
    leaderId: null,
  }),
  resumeBoardroomPresenter: () => set({ boardroomPresenterDetachedId: null }),
  setPendingPresenterRequest: (req) => set({ pendingPresenterRequest: req }),
  setPresenterRequestStatus: (status) => set({ presenterRequestStatus: status }),

}));

// Helper to get current scene tree
export const getCurrentSceneTree = (
  modelType: ModelType,
  importedTree?: SceneNode | null,
  bicycleTree?: SceneNode | null,
  headphonesTree?: SceneNode | null
): SceneNode => {
  if (modelType === 'imported' && importedTree) {
    return importedTree;
  }
  if (modelType === 'bicycle' && bicycleTree) {
    return bicycleTree;
  }
  if (modelType === 'headphones' && headphonesTree) {
    return headphonesTree;
  }
  return modelType === 'bicycle' ? BICYCLE_SCENE_TREE : modelType === 'headphones' ? HEADPHONES_SCENE_TREE : SYNTH_SCENE_TREE;
};
