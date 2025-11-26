import { create } from 'zustand';
import { ViewMode, RepresentationMode, PointOfInterest, AgentState, AgentStyle, ChatMessage, InsightCard, AgentBehaviorState, SceneNode, ObjectState, Requirement, KBEntry, InsightType } from './types';
import { Vector3 } from 'three';

const INITIAL_AGENTS: AgentState[] = [
  { id: '1', name: 'SYS.OP', role: 'PRESENTER', color: 'red', behavior: 'IDLE', currentPoiId: null, attentionLevel: 0 },
  { id: '2', name: 'ENG.UNIT', role: 'REVIEWER', color: 'blue', behavior: 'IDLE', currentPoiId: null, attentionLevel: 0 },
  { id: '3', name: 'DES.LEAD', role: 'OBSERVER', color: 'gray', behavior: 'IDLE', currentPoiId: null, attentionLevel: 0 },
];

const INITIAL_WEIGHTS: Record<string, number> = {
  '1': 5,
  '2': 5,
  '3': 5
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
export const SCENE_TREE: SceneNode = {
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

  // Heatmap
  heatmapValues: Record<string, number>;

  // Conversation & AI
  chatHistory: ChatMessage[];
  insightCards: InsightCard[];
  requirements: Requirement[];
  knowledgeBase: KBEntry[];

  // Scene Graph State
  objectStates: Record<string, ObjectState>;

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
  heatmapValues: {},
  chatHistory: [],
  insightCards: [],
  requirements: REQUIREMENTS_DB,
  knowledgeBase: KB_DB,
  objectStates: initObjectStates(SCENE_TREE),

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
    // Increase history buffer to 150 to prevent source messages from being deleted too quickly
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
      // Deselect all
      Object.keys(newStates).forEach(key => {
          newStates[key] = { ...newStates[key], selected: false };
      });
      // Select target
      if (id && newStates[id]) {
          newStates[id] = { ...newStates[id], selected: true };
      }
      return { objectStates: newStates };
  })

}));