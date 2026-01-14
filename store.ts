import { create } from 'zustand';
import { ViewMode, RepresentationMode, PointOfInterest, AgentState, AgentStyle, ChatMessage, InsightCard, AgentBehaviorState, SceneNode, ObjectState, Requirement, KBEntry, InsightType, SpatialComment, CommentMode, ModelType, RightPanelMode } from './types';
import { Vector3 } from 'three';

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

// --- MOCK REQUIREMENTS DB ---
const REQUIREMENTS_DB: Requirement[] = [
    { id: 'r1', code: 'REQ-M-042', description: 'Rotary knobs must withstand 50N shear force.', category: 'MECHANICAL', status: 'MET' },
    { id: 'r2', code: 'REQ-E-101', description: 'Main display assembly must be removable within 60s.', category: 'ELECTRICAL', status: 'PENDING' },
    { id: 'r3', code: 'REQ-U-305', description: 'Primary controls must be reachable from 5th %ile female hand size.', category: 'ERGONOMIC', status: 'AT_RISK' },
    { id: 'r4', code: 'REQ-S-900', description: 'No sharp edges < 0.5mm radius on user interface surfaces.', category: 'SAFETY', status: 'MET' },
    { id: 'r5', code: 'REQ-M-200', description: 'Total unit weight must not exceed 3.2kg.', category: 'MECHANICAL', status: 'PENDING' },
];

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

// --- BICYCLE SCENE TREE (STEP Import Demo) ---
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
  splitScreenTargetId: string | null;
  userInteractionPoint: Vector3;
  isLaserActive: boolean;

  // Follow Request System
  followRequest: { agentId: string; timestamp: number } | null;

  // Privacy Mode
  isPrivacyMode: boolean;

  // Followed Agent (for participant list)
  followedAgentId: string | null;

  // Heatmap
  heatmapValues: Record<string, number>;

  // Conversation & AI
  chatHistory: ChatMessage[];
  insightCards: InsightCard[];
  requirements: Requirement[];
  knowledgeBase: KBEntry[];

  // Scene Graph State
  objectStates: Record<string, ObjectState>;

  // --- NEW: Model Type ---
  activeModelType: ModelType;
  isImporting: boolean;

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

  // --- NEW: Panel Mode ---
  rightPanelMode: RightPanelMode;

  // --- NEW: Comments Display State ---
  commentsExpandedInScene: boolean; // Toggle all comments expanded in 3D

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setRepresentationMode: (mode: RepresentationMode) => void;
  toggleFrustums: () => void;
  toggleGaze: () => void;
  toggleTrails: () => void;
  togglePlay: () => void;
  endMeeting: (ended: boolean) => void;
  setTime: (time: number) => void;
  resetTime: () => void;

  registerPOI: (poi: PointOfInterest) => void;
  setActiveAgent: (id: string | null) => void;
  setLeader: (id: string | 'USER' | null) => void;
  setSplitScreenTarget: (id: string | null) => void;
  setUserInteractionPoint: (pos: Vector3) => void;
  setLaserActive: (active: boolean) => void;
  setFollowRequest: (req: { agentId: string; timestamp: number } | null) => void;
  togglePrivacyMode: () => void;
  setFollowedAgent: (id: string | null) => void;

  setAgentStyle: (style: AgentStyle) => void;
  setAgentWeight: (id: string, weight: number) => void;

  updateAgentStatus: (id: string, behavior: AgentBehaviorState, poiId: string | null) => void;
  updateHeatmap: (poiId: string, amount: number) => void;

  addChatMessage: (msg: ChatMessage) => void;
  addInsightCard: (card: InsightCard) => void;
  updateInsightType: (id: string, newType: InsightType) => void;
  updateInsight: (id: string, updates: Partial<InsightCard>) => void;

  // Scene Graph Actions
  toggleNodeVisibility: (id: string) => void;
  toggleNodeExpanded: (id: string) => void;
  selectNode: (id: string | null) => void;

  // --- NEW: Model Import Actions ---
  setActiveModelType: (type: ModelType) => void;
  importSTEPFile: (fileName: string) => void;
  setIsImporting: (importing: boolean) => void;

  // --- NEW: Comment Actions ---
  setCommentMode: (mode: CommentMode) => void;
  setPendingComment: (position: { x: number; y: number; z: number } | null, nodeId: string | null, nodeName: string | null) => void;
  addComment: (comment: SpatialComment) => void;
  updateComment: (id: string, updates: Partial<SpatialComment>) => void;
  deleteComment: (id: string) => void;
  resolveComment: (id: string) => void;
  setDrawingCanvas: (data: string | null) => void;

  // --- NEW: Panel Mode Action ---
  setRightPanelMode: (mode: RightPanelMode) => void;

  // --- NEW: Comments Display Actions ---
  toggleCommentsExpandedInScene: () => void;
  setCommentScreenOffset: (id: string, offset: { x: number; y: number }) => void;
  toggleCommentExpanded: (id: string) => void;
}

export const useStore = create<AppState>((set) => ({
  viewMode: ViewMode.FREE,
  representationMode: RepresentationMode.FULL,
  showFrustums: true,
  showGaze: true,
  showTrails: false,
  isPlaying: true,
  isMeetingEnded: false,
  time: 0,
  agents: INITIAL_AGENTS,
  agentStyle: AgentStyle.BOX,
  agentWeights: INITIAL_WEIGHTS,
  pois: [],
  activeAgentId: null,
  leaderId: null,
  splitScreenTargetId: null,
  userInteractionPoint: new Vector3(),
  isLaserActive: false,
  followRequest: null,
  isPrivacyMode: false,
  followedAgentId: null,
  heatmapValues: {},
  chatHistory: [],
  insightCards: [],
  requirements: REQUIREMENTS_DB,
  knowledgeBase: KB_DB,
  objectStates: initObjectStates(SYNTH_SCENE_TREE),

  // --- NEW: Model Type ---
  activeModelType: 'synth',
  isImporting: false,

  // --- NEW: Comments System ---
  comments: [],
  commentMode: 'none',
  pendingCommentPosition: null,
  pendingCommentNodeId: null,
  pendingCommentNodeName: null,
  currentUser: 'You',
  currentUserColor: '#10b981',

  // --- NEW: Drawing State ---
  drawingCanvas: null,

  // --- NEW: Panel Mode ---
  rightPanelMode: 'meeting',

  // --- NEW: Comments Display State ---
  commentsExpandedInScene: false,

  setViewMode: (mode) => set({ viewMode: mode }),
  setRepresentationMode: (mode) => set({ representationMode: mode }),
  toggleFrustums: () => set((state) => ({ showFrustums: !state.showFrustums })),
  toggleGaze: () => set((state) => ({ showGaze: !state.showGaze })),
  toggleTrails: () => set((state) => ({ showTrails: !state.showTrails })),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  endMeeting: (ended) => set({ isMeetingEnded: ended, isPlaying: !ended }),
  setTime: (time) => set({ time }),
  resetTime: () => set({ time: 0, heatmapValues: {}, chatHistory: [], insightCards: [] }),
  
  registerPOI: (poi) => set((state) => {
    if (state.pois.find(p => p.id === poi.id)) return state;
    return { pois: [...state.pois, poi] };
  }),
  setActiveAgent: (id) => set({ activeAgentId: id }),
  setLeader: (id) => set({ leaderId: id }),
  setSplitScreenTarget: (id) => set({ splitScreenTargetId: id }),
  setUserInteractionPoint: (pos) => set({ userInteractionPoint: pos }),
  setLaserActive: (active) => set({ isLaserActive: active }),
  setFollowRequest: (req) => set({ followRequest: req }),
  togglePrivacyMode: () => set((state) => ({ isPrivacyMode: !state.isPrivacyMode })),
  setFollowedAgent: (id) => set({ followedAgentId: id }),
  
  setAgentStyle: (style) => set({ agentStyle: style }),
  setAgentWeight: (id, weight) => set((state) => ({
    agentWeights: { ...state.agentWeights, [id]: weight }
  })),
  
  updateAgentStatus: (id, behavior, poiId) => set((state) => ({
    agents: state.agents.map(a => a.id === id ? { ...a, behavior, currentPoiId: poiId } : a)
  })),
  
  updateHeatmap: (id, amount) => set((state) => ({
    heatmapValues: { ...state.heatmapValues, [id]: (state.heatmapValues[id] || 0) + amount }
  })),

  addChatMessage: (msg) => set((state) => ({
    chatHistory: [...state.chatHistory, msg].slice(-150)
  })),
  
  addInsightCard: (card) => set((state) => ({
    insightCards: [card, ...state.insightCards]
  })),

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
  setActiveModelType: (type) => set((state) => {
      const tree = type === 'bicycle' ? BICYCLE_SCENE_TREE : SYNTH_SCENE_TREE;
      return {
          activeModelType: type,
          objectStates: initObjectStates(tree),
          pois: [], // Clear POIs for new model
          comments: [], // Clear comments for new model
          chatHistory: [], // Clear chat for fresh start
          insightCards: [], // Clear insights
          heatmapValues: {}
      };
  }),

  importSTEPFile: (fileName) => set((state) => {
      // Simulate STEP import - in real implementation would parse actual STEP file
      // For demo, we detect if it's a bicycle file and switch to bicycle model
      const isBicycle = fileName.toLowerCase().includes('bicycle') ||
                        fileName.toLowerCase().includes('bike') ||
                        fileName.toLowerCase().includes('cycle');

      // Toggle between models - if currently bicycle, switch to synth and vice versa
      // This allows re-importing to cycle through models for demo
      const newModelType = state.activeModelType === 'bicycle' ? 'synth' : 'bicycle';
      const tree = newModelType === 'bicycle' ? BICYCLE_SCENE_TREE : SYNTH_SCENE_TREE;

      // Clear everything for fresh start with new model
      return {
          activeModelType: newModelType,
          objectStates: initObjectStates(tree),
          pois: [],
          comments: [],
          chatHistory: [],
          insightCards: [],
          heatmapValues: {},
          isImporting: false,
          // Reset any active selections
          activeAgentId: null,
          leaderId: null,
          splitScreenTargetId: null,
          isMeetingEnded: false,
          time: 0,
          // Reset comment mode
          commentMode: 'none',
          pendingCommentPosition: null,
          pendingCommentNodeId: null,
          pendingCommentNodeName: null,
          drawingCanvas: null
      };
  }),

  setIsImporting: (importing) => set({ isImporting: importing }),

  // --- NEW: Comment Actions ---
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
  }))

}));

// Helper to get current scene tree
export const getCurrentSceneTree = (modelType: ModelType): SceneNode => {
    return modelType === 'bicycle' ? BICYCLE_SCENE_TREE : SYNTH_SCENE_TREE;
};