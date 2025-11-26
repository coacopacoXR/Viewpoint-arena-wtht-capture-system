import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore, SCENE_TREE } from '../../store';
import { InsightType, InsightDetails, SceneNode, DecisionRole } from '../../types';

// --- MODULAR PHRASE LIBRARY (Detailed Design Context) ---
interface PhraseTemplate {
  text: string;
  type: 'neutral' | 'risk' | 'rationale' | 'action' | 'visibility' | 'social';
  summary?: string; 
}

// Tuned for Detailed Design Review (Geometry, Tolerances, Mfg)
const PHRASE_LIBRARY: PhraseTemplate[] = [
  // NEUTRAL (Observations / Measurements)
  { text: "Verifying the draft angle on the {poi} surface.", type: 'neutral' },
  { text: "Checking the surface continuity G2 curvature on the {poi}.", type: 'neutral' },
  { text: "Measuring the gap tolerance around the {poi} perimeter.", type: 'neutral' },
  { text: "Inspecting the {poi} parting line location.", type: 'neutral' },
  { text: "Looking at the sub-assembly mounting points for the {poi}.", type: 'neutral' },

  // RISK (Concerns - Triggers)
  { text: "The wall thickness on the {poi} looks uneven – might be risky for sink marks.", type: 'risk', summary: "Sink Mark Risk" },
  { text: "This undercut on the {poi} will require a complex slider action in the tool.", type: 'risk', summary: "Tooling Complexity" },
  { text: "The clearance around the {poi} is below the 0.5mm safety margin.", type: 'risk', summary: "Interference Risk" },
  { text: "Thermal expansion of the {poi} might cause stress cracking here.", type: 'risk', summary: "Thermal Stress" },
  { text: "Assembly access to the {poi} is blocked by the chassis rib.", type: 'risk', summary: "Assembly Access" },

  // RATIONALE (Intent)
  { text: "The {poi} uses this profile to maximize stiffness-to-weight ratio.", type: 'rationale', summary: "Stiffness Optimization" },
  { text: "The underside of the {poi} is ribbed to prevent warping.", type: 'rationale', summary: "Warp Prevention" },
  { text: "We added this fillet to the {poi} to improve flow during injection.", type: 'rationale', summary: "Molding Flow" },
  { text: "This snap-fit on the {poi} is designed for tool-less disassembly.", type: 'rationale', summary: "Serviceability" },

  // ACTION (Decisions / Tasks)
  { text: "We need to run a moldflow analysis on the {poi}.", type: 'action', summary: "Moldflow Analysis" },
  { text: "Update the tolerance stack-up calculation for the {poi}.", type: 'action', summary: "Tolerance Stack-up" },
  { text: "Let's increase the rib thickness on the {poi} by 10%.", type: 'action', summary: "Rib Reinforcement" },
  { text: "Verify the supplier capability for this {poi} texture.", type: 'action', summary: "Supplier Check" },
  { text: "Freeze the geometry on the {poi} for tooling release.", type: 'action', summary: "Freeze Design" },

  // SOCIAL / VISIBILITY
  { text: "I'm losing context on the {poi}, can we rotate view?", type: 'visibility' },
  { text: "Following your lead to the {poi}.", type: 'social' },
  { text: "Agreed, zooming in on the {poi} now.", type: 'social' },
];

const USER_CONTEXT_TEMPLATES = [
    "Regarding your selection of the {poi}: ",
    "Since you're highlighting the {poi}, I'd add: ",
    "Looking at the {poi} you pointed out... ",
    "On the topic of that {poi}: ",
    "Focusing on the {poi} as requested: "
];

const ASSIGNEES = ["Alex Chen (Lead)", "Sarah J. (Ergo)", "Design Team A", "Mfg. Engineering", "Validation Lab"];
const MITIGATIONS = ["Increase wall thickness", "Change material", "Add support ribs", "Conduct FEA", "Review tolerance stack"];
const DRIVERS = ["Cost Reduction", "Ergonomics", "Assembly Speed", "Structural Integrity"];
const TRADEOFFS = ["Weight vs. Stiffness", "Cost vs. Finish", "Complexity vs. Time"];

const getRandomElement = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

// Generate structured details based on role and type
const generateDetails = (type: InsightType, targetId: string, targetLabel: string, decisionState: "NONE" | "INTERMEDIATE" | "FINAL"): InsightDetails => {
    const base: InsightDetails = {
        priority: (Math.random() > 0.7 ? 'High' : 'Medium') as any,
        status: 'Open' as any,
        assignee: getRandomElement(ASSIGNEES),
        dueDate: new Date(Date.now() + Math.random() * 604800000).toISOString().split('T')[0],
        designStage: "DETAILED_DESIGN",
        componentReference: targetLabel,
        decisionRole: undefined
    };

    if (type === 'RISK') {
        return {
            ...base,
            priority: 'Critical',
            decisionRole: 'TRIGGER',
            impact: "Tooling Delay",
            mitigationStrategy: getRandomElement(MITIGATIONS)
        };
    }

    if (type === 'RATIONALE') {
        return {
            ...base,
            decisionRole: 'RATIONALE',
            designDriver: getRandomElement(DRIVERS),
            tradeoffAnalysis: getRandomElement(TRADEOFFS)
        };
    }

    // ACTION (Intermediate vs Final)
    if (type === 'ACTION') {
        return {
            ...base,
            // If it's the first decision, it's intermediate. Subsequent are Final.
            decisionRole: decisionState === 'NONE' ? 'INTERMEDIATE_DECISION' : 'FINAL_DECISION',
            department: "Mechanical Eng"
        };
    }

    return base;
};

const findNodeName = (id: string, node: SceneNode): string | null => {
    if (node.id === id) return node.name;
    if (node.children) {
        for (const child of node.children) {
            const found = findNodeName(id, child);
            if (found) return found;
        }
    }
    return null;
};

const DialogueEngine: React.FC = () => {
  const agents = useStore(state => state.agents);
  const pois = useStore(state => state.pois);
  const isPlaying = useStore(state => state.isPlaying);
  const addChatMessage = useStore(state => state.addChatMessage);
  const addInsightCard = useStore(state => state.addInsightCard);
  const requirements = useStore(state => state.requirements);
  const knowledgeBase = useStore(state => state.knowledgeBase);
  
  const lastSpeakTime = useRef<Record<string, number>>({});
  const messageBuffer = useRef<string[]>([]);
  
  // Track conversation progress per component to bias flow
  const poiConversationStep = useRef<Record<string, number>>({});
  // Track decision state per component
  const poiDecisionState = useRef<Record<string, "NONE" | "INTERMEDIATE" | "FINAL">>({});

  useFrame(() => {
    if (!isPlaying) return;

    agents.forEach(agent => {
        const now = Date.now();
        const last = lastSpeakTime.current[agent.id] || 0;
        const isInspecting = agent.behavior === 'INSPECTING' && agent.currentPoiId;
        
        if (now - last > (4000 + Math.random() * 6000)) {
            if (Math.random() > 0.5) { 
                if (isInspecting) {
                     const poi = pois.find(p => p.id === agent.currentPoiId);
                     if (poi) {
                        generateDialogue(agent.id, poi.label, poi.id);
                        lastSpeakTime.current[agent.id] = now;
                     }
                }
            }
        }
    });
  });

  const generateDialogue = (agentId: string, poiLabel: string, poiId: string) => {
      const objectStates = useStore.getState().objectStates;
      const userSelectedId = Object.keys(objectStates).find(key => objectStates[key].selected);
      
      let targetLabel = poiLabel;
      let targetId = poiId;
      let isUserDriven = false;

      if (userSelectedId) {
          const name = findNodeName(userSelectedId, SCENE_TREE);
          if (name) {
              targetLabel = name;
              targetId = userSelectedId;
              isUserDriven = true;
          }
      }

      // --- FLOW BIAS LOGIC ---
      // We advance the "step" for this component to simulate a natural conversation arc
      const step = poiConversationStep.current[targetId] ?? 0;
      poiConversationStep.current[targetId] = step + 1;

      let candidates = PHRASE_LIBRARY;
      
      // Step 0-1: Exploration (Neutral / Visibility)
      if (step < 2) {
          candidates = PHRASE_LIBRARY.filter(t => t.type === 'neutral' || t.type === 'visibility');
      } 
      // Step 2-4: Analysis (Risk / Rationale)
      else if (step < 5) {
          candidates = PHRASE_LIBRARY.filter(t => t.type === 'risk' || t.type === 'rationale');
      } 
      // Step 5+: Conclusion (Action / Rationale)
      else {
          candidates = PHRASE_LIBRARY.filter(t => t.type === 'action' || t.type === 'rationale');
      }

      if (isUserDriven) {
           candidates = PHRASE_LIBRARY.filter(t => t.type !== 'neutral' && t.type !== 'social');
      }
      
      if (!candidates.length) candidates = PHRASE_LIBRARY;

      const template = candidates[Math.floor(Math.random() * candidates.length)];
      let text = template.text.replace(/{poi}/g, targetLabel);
      
      if (isUserDriven) {
          const prefixTemplate = USER_CONTEXT_TEMPLATES[Math.floor(Math.random() * USER_CONTEXT_TEMPLATES.length)];
          const prefix = prefixTemplate.replace(/{poi}/g, targetLabel);
          text = `${prefix}${text}`;
      }
      
      const messageId = Math.random().toString(36).substr(2, 9);
      addChatMessage({ id: messageId, agentId, text, timestamp: Date.now() });
      messageBuffer.current.push(messageId);
      if (messageBuffer.current.length > 3) messageBuffer.current.shift();

      if (template.type === 'action' || template.type === 'risk' || template.type === 'rationale' || isUserDriven) {
          const shouldCapture = isUserDriven || Math.random() > 0.6; 

          if (shouldCapture) {
            setTimeout(() => {
                let type: InsightType = 'ACTION';
                if (template.type === 'risk') type = 'RISK';
                if (template.type === 'rationale') type = 'RATIONALE';
                if (isUserDriven && template.type === 'neutral') type = 'RATIONALE';

                // Determine Decision Role state
                const currentDecState = poiDecisionState.current[targetId] || "NONE";
                
                const details = generateDetails(type, targetId, targetLabel, currentDecState);
                
                // Update State if Action
                if (type === 'ACTION') {
                    if (currentDecState === "NONE") poiDecisionState.current[targetId] = "INTERMEDIATE";
                    else poiDecisionState.current[targetId] = "FINAL";
                }

                const sourceIds = [...messageBuffer.current];
                const affectedReqs: string[] = [];
                if (type === 'RISK' || type === 'ACTION') {
                    if (Math.random() > 0.5) affectedReqs.push(requirements[Math.floor(Math.random() * requirements.length)].id);
                }

                addInsightCard({
                    id: Math.random().toString(36).substr(2, 9),
                    agentId,
                    type,
                    title: isUserDriven ? `User Focus: ${targetLabel}` : (template.summary || "Design Insight"),
                    description: text,
                    timestamp: Date.now(),
                    relatedPoiId: targetId,
                    sourceMessageIds: sourceIds,
                    details,
                    affectedRequirementIds: affectedReqs
                });
            }, 500); 
          }
      }
  };

  return null;
};

export default DialogueEngine;