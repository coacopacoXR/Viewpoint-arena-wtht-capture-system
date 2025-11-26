import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore, SCENE_TREE } from '../../store';
import { InsightType, InsightDetails, SceneNode } from '../../types';

// --- MODULAR PHRASE LIBRARY ---

interface PhraseTemplate {
  text: string;
  type: 'neutral' | 'risk' | 'rationale' | 'action' | 'visibility';
  summary?: string; // Short title for the card
}

const PHRASE_LIBRARY: PhraseTemplate[] = [
  // 1.1 Generic Collaboration
  { text: "Can you bring the view a bit closer to the {poi}?", type: 'neutral' },
  { text: "I’m trying to understand how this part connects to the {poi}.", type: 'neutral' },
  { text: "Could you rotate the model slightly? I want to see the {poi}.", type: 'neutral' },
  { text: "Let’s check the alignment around the {poi}.", type: 'neutral' },
  { text: "I’m not sure I’m seeing the same thing you are on the {poi}.", type: 'neutral' },
  { text: "Hold on, I’m inspecting the {poi} area.", type: 'neutral' },
  { text: "Give me a second, I’m evaluating the geometry here.", type: 'neutral' },
  { text: "Is anyone following what happens under the {poi}?", type: 'neutral' },
  { text: "Can we slow down? I lost context when the model moved.", type: 'visibility' },
  { text: "Someone point at the part you’re talking about.", type: 'neutral' },
  { text: "I think we need to focus on this region for a moment.", type: 'neutral' },

  // 1.2 Object Features (Neutral/Observation)
  { text: "This fillet looks a bit sharper than I expected.", type: 'neutral' },
  { text: "The thickness on the {poi} seems inconsistent.", type: 'neutral' },
  { text: "The mounting point on the {poi} looks offset from the axis.", type: 'neutral' },
  { text: "There’s something strange with the curvature on this surface.", type: 'neutral' },
  { text: "The overall proportion of the {poi} feels slightly off.", type: 'neutral' },
  { text: "The hole pattern here doesn’t match the spec.", type: 'neutral' },
  { text: "The underside looks more complex than necessary.", type: 'neutral' },

  // 1.3 Visibility / Viewpoints
  { text: "From my angle, I can’t fully see that feature.", type: 'visibility' },
  { text: "The lighting makes it hard to judge the depth here.", type: 'visibility' },
  { text: "My viewpoint is occluded; someone might need to reposition.", type: 'visibility' },
  { text: "Can someone highlight the part they’re referring to?", type: 'visibility' },
  { text: "I’m following you, but my view got misaligned.", type: 'visibility' },
  { text: "I see it now, but only when I move to the side.", type: 'visibility' },

  // 1.5 & 2.1 ACTION TRIGGERS
  { text: "We should verify the {poi} clearance later.", type: 'action', summary: "Clearance Verification" },
  { text: "Let’s document this {poi} issue for follow-up.", type: 'action', summary: "Documentation Required" },
  { text: "Someone should double-check those dimensions on the {poi}.", type: 'action', summary: "Dimension Check" },
  { text: "We might need a separate alignment check for the {poi}.", type: 'action', summary: "Alignment Audit" },
  { text: "Let’s add this to our review notes.", type: 'action', summary: "Review Note" },
  
  // 1.5 & 2.2 RATIONALE TRIGGERS
  { text: "I think the idea behind this was to improve {poi} stiffness.", type: 'rationale', summary: "Stiffness Optimization" },
  { text: "This exists because of the load direction on the {poi}.", type: 'rationale', summary: "Load Path Management" },
  { text: "This was probably designed to accommodate the {poi} assembly.", type: 'rationale', summary: "Assembly Accommodation" },
  { text: "It was likely added to support manufacturing requirements.", type: 'rationale', summary: "Mfg. Requirement" },
  { text: "This shape is probably intended to reduce stress concentrations.", type: 'rationale', summary: "Stress Reduction" },
  { text: "I assume the designer added this to improve accessibility.", type: 'rationale', summary: "Accessibility Improvement" },

  // 1.5 & 2.3 CONCERN TRIGGERS (Risk)
  { text: "I’m worried this might interfere with the {poi} assembly.", type: 'risk', summary: "Assembly Interference" },
  { text: "This could cause issues during operation.", type: 'risk', summary: "Operational Risk" },
  { text: "This area on the {poi} looks like a potential failure point.", type: 'risk', summary: "Failure Point" },
  { text: "This seems too thin for repeated loading.", type: 'risk', summary: "Structural Weakness" },
  { text: "This geometry might introduce unwanted friction.", type: 'risk', summary: "Friction Issue" },
  { text: "This bracket looks under-supported.", type: 'risk', summary: "Structural Support" },
];

// Natural prefixes for user interactions
const USER_CONTEXT_TEMPLATES = [
    "Regarding your selection of the {poi}: ",
    "Since you're highlighting the {poi}, I'd add: ",
    "Looking at the {poi} you pointed out... ",
    "On the topic of that {poi}: ",
    "Focusing on the {poi} as requested: "
];

// --- FAKE DATA GENERATORS ---

const ASSIGNEES = ["Alex Chen (Lead)", "Sarah J. (Ergo)", "Design Team A", "Mfg. Engineering", "Validation Lab"];
const MITIGATIONS = ["Increase wall thickness by 2mm", "Change material to AL-6061", "Add support ribs", "Conduct FEA simulation", "Review tolerance stack-up"];
const DRIVERS = ["Cost Reduction", "User Ergonomics", "Assembly Speed", "Structural Integrity", "Aesthetic Continuity"];
const TRADEOFFS = ["Weight vs. Stiffness", "Cost vs. Surface Finish", "Complexity vs. Assembly Time", "Durability vs. Material Cost"];

const getRandomElement = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

const generateDetails = (type: InsightType): InsightDetails => {
    const base = {
        priority: (Math.random() > 0.7 ? 'High' : Math.random() > 0.4 ? 'Medium' : 'Low') as any,
        status: 'Open' as any,
        assignee: getRandomElement(ASSIGNEES),
        // Use ISO String (YYYY-MM-DD) for input type="date" compatibility
        dueDate: new Date(Date.now() + Math.random() * 604800000).toISOString().split('T')[0] 
    };

    if (type === 'RISK') {
        return {
            ...base,
            priority: 'Critical', // Risks are usually higher priority
            impact: Math.random() > 0.5 ? "Component Failure" : "Assembly Stoppage",
            mitigationStrategy: getRandomElement(MITIGATIONS)
        };
    }

    if (type === 'RATIONALE') {
        return {
            ...base,
            designDriver: getRandomElement(DRIVERS),
            alternativesConsidered: "Standard Bracket, Welded Assembly",
            tradeoffAnalysis: getRandomElement(TRADEOFFS)
        };
    }

    // ACTION
    return {
        ...base,
        department: Math.random() > 0.5 ? "Mechanical Engineering" : "Industrial Design"
    };
};

// Helper to find name by ID in recursive tree
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
  
  // Access requirements and KB for linking
  const requirements = useStore(state => state.requirements);
  const knowledgeBase = useStore(state => state.knowledgeBase);
  
  // Initialize cooldowns randomly so they don't all speak at t=0
  const lastSpeakTime = useRef<Record<string, number>>({
    '1': Date.now() - Math.random() * 2000,
    '2': Date.now() - Math.random() * 2000,
    '3': Date.now() - Math.random() * 2000
  });

  // Message Buffer for Aggregation
  // We store the last few message IDs to bundle them when an insight occurs
  const messageBuffer = useRef<string[]>([]);

  useFrame(() => {
    if (!isPlaying) return;

    agents.forEach(agent => {
        if (agent.behavior === 'INSPECTING' && agent.currentPoiId) {
            const now = Date.now();
            const last = lastSpeakTime.current[agent.id] || 0;
            
            // Cooldown: 3-8 seconds (chattier)
            if (now - last > (3000 + Math.random() * 5000)) {
                if (Math.random() > 0.4) { // 60% chance to speak if off cooldown
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
      // --- USER LASER OVERRIDE ---
      // Check if user is currently pointing at something with the laser
      const objectStates = useStore.getState().objectStates;
      const userSelectedId = Object.keys(objectStates).find(key => objectStates[key].selected);
      
      let targetLabel = poiLabel;
      let targetId = poiId;
      let isUserDriven = false;

      if (userSelectedId) {
          // If user is pointing at something, FORCE the agent to talk about it
          const name = findNodeName(userSelectedId, SCENE_TREE);
          if (name) {
              targetLabel = name;
              targetId = userSelectedId;
              isUserDriven = true;
          }
      }

      // Weighted random selection
      const roll = Math.random();
      let candidates = PHRASE_LIBRARY;

      // If user driven, prioritize insights slightly more to acknowledge the "Capture"
      if (isUserDriven || roll <= 0.4) {
          candidates = PHRASE_LIBRARY.filter(t => t.type !== 'neutral' && t.type !== 'visibility');
      } else {
          candidates = PHRASE_LIBRARY.filter(t => t.type === 'neutral' || t.type === 'visibility');
      }

      if (candidates.length === 0) candidates = PHRASE_LIBRARY; 

      const template = candidates[Math.floor(Math.random() * candidates.length)];
      
      // Replace {poi} in the main template
      let text = template.text.replace(/{poi}/g, targetLabel);
      
      if (isUserDriven) {
          // Pick a random user-context prefix
          const prefixTemplate = USER_CONTEXT_TEMPLATES[Math.floor(Math.random() * USER_CONTEXT_TEMPLATES.length)];
          const prefix = prefixTemplate.replace(/{poi}/g, targetLabel);
          text = `${prefix}${text}`;
      }
      
      // Generate a unified ID for the message to link it
      const messageId = Math.random().toString(36).substr(2, 9);

      // 1. Add to Chat Log
      addChatMessage({
          id: messageId,
          agentId,
          text,
          timestamp: Date.now()
      });

      // 2. Update Message Buffer
      messageBuffer.current.push(messageId);
      if (messageBuffer.current.length > 3) {
          messageBuffer.current.shift(); // Keep only last 3
      }

      // 3. Analyze for Insights
      if (template.type === 'action' || template.type === 'risk' || template.type === 'rationale' || isUserDriven) {
          
          // REDUCED FREQUENCY LOGIC
          const shouldCapture = isUserDriven || Math.random() > 0.7;

          if (shouldCapture) {
            setTimeout(() => {
                let type: InsightType = 'ACTION';
                if (template.type === 'risk') type = 'RISK';
                if (template.type === 'rationale') type = 'RATIONALE';
                
                if (isUserDriven && template.type === 'neutral') type = 'RATIONALE';

                const details = generateDetails(type);
                details.componentReference = targetLabel;

                // Aggregate: Use all messages in the buffer as source context
                const sourceIds = [...messageBuffer.current];

                // --- INTELLIGENCE LOOKUP ---
                
                // 1. Link Requirements (Simulation: Pick random requirement if Risk/Action)
                const affectedReqs: string[] = [];
                if (type === 'RISK' || type === 'ACTION') {
                    if (Math.random() > 0.5) {
                        const randReq = requirements[Math.floor(Math.random() * requirements.length)];
                        affectedReqs.push(randReq.id);
                    }
                }

                // 2. Link KB Recommendations (Simulation: Pick random KB if types match)
                const kbRecs: string[] = [];
                const matchingKB = knowledgeBase.filter(k => k.category === type);
                if (matchingKB.length > 0 && Math.random() > 0.5) {
                    const randKb = matchingKB[Math.floor(Math.random() * matchingKB.length)];
                    kbRecs.push(randKb.recommendation);
                }

                addInsightCard({
                    id: Math.random().toString(36).substr(2, 9),
                    agentId,
                    type,
                    title: isUserDriven ? `User Focus: ${targetLabel}` : (template.summary || "Insight"),
                    description: text,
                    timestamp: Date.now(),
                    relatedPoiId: targetId,
                    sourceMessageIds: sourceIds, // Link to CLUSTER of messages
                    details,
                    affectedRequirementIds: affectedReqs,
                    kbRecommendations: kbRecs
                });
                
            }, 500); 
          }
      }
  };

  return null;
};

export default DialogueEngine;