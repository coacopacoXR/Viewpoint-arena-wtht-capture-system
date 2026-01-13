import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore, SCENE_TREE } from '../../store';
import { InsightType, InsightDetails, SceneNode, DecisionRole, ChatMessage } from '../../types';

// ============================================================================
// ADVANCED DIALOGUE GENERATION ENGINE
// ============================================================================
// This engine produces contextually-aware, multi-layered conversations that
// simulate realistic design review discussions with traceable reasoning chains.
// ============================================================================

// --- PERSONALITY PROFILES FOR AGENTS ---
interface PersonalityProfile {
    id: string;
    name: string;
    expertise: string[];
    communicationStyle: 'analytical' | 'collaborative' | 'questioning' | 'decisive';
    riskTolerance: 'low' | 'medium' | 'high';
    focusAreas: string[];
    phrasePatterns: {
        opening: string[];
        reasoning: string[];
        conclusion: string[];
        challenge: string[];
        agreement: string[];
    };
}

const AGENT_PERSONALITIES: Record<string, PersonalityProfile> = {
    '1': {
        id: '1',
        name: 'SYS.OP',
        expertise: ['system integration', 'manufacturing', 'tolerance analysis'],
        communicationStyle: 'analytical',
        riskTolerance: 'low',
        focusAreas: ['clearances', 'assembly sequence', 'tooling'],
        phrasePatterns: {
            opening: [
                "From a systems perspective,",
                "Looking at the integration requirements,",
                "Considering the assembly flow,",
                "Based on my analysis of"
            ],
            reasoning: [
                "This is important because",
                "The underlying concern here is",
                "What drives this observation is",
                "The root cause appears to be"
            ],
            conclusion: [
                "Therefore, I recommend",
                "This leads me to suggest",
                "My assessment indicates we should",
                "Based on this analysis, the action is"
            ],
            challenge: [
                "However, we need to consider",
                "One critical factor we're missing is",
                "I'd push back slightly on that because",
                "Let me offer a counterpoint:"
            ],
            agreement: [
                "That aligns with my findings on",
                "Exactly, and building on that,",
                "I concur, and would add that",
                "That's consistent with what I'm seeing in"
            ]
        }
    },
    '2': {
        id: '2',
        name: 'ENG.UNIT',
        expertise: ['structural analysis', 'material science', 'FEA simulation'],
        communicationStyle: 'questioning',
        riskTolerance: 'medium',
        focusAreas: ['stress distribution', 'material properties', 'failure modes'],
        phrasePatterns: {
            opening: [
                "From an engineering standpoint,",
                "If we look at the structural aspects,",
                "The technical data suggests that",
                "Running through the calculations,"
            ],
            reasoning: [
                "The physics behind this is",
                "What's happening mechanically is",
                "The stress analysis reveals that",
                "Looking at the force vectors,"
            ],
            conclusion: [
                "We need to validate this with",
                "I'd recommend running",
                "The data points us toward",
                "This requires verification through"
            ],
            challenge: [
                "But have we considered the",
                "What about the edge case where",
                "I'm concerned about the scenario where",
                "My simulations show a different outcome when"
            ],
            agreement: [
                "The numbers support that assessment,",
                "My FEA results confirm",
                "That matches the empirical data showing",
                "The structural analysis aligns with"
            ]
        }
    },
    '3': {
        id: '3',
        name: 'DES.LEAD',
        expertise: ['design intent', 'user experience', 'aesthetics', 'ergonomics'],
        communicationStyle: 'collaborative',
        riskTolerance: 'high',
        focusAreas: ['user interaction', 'visual design', 'brand alignment'],
        phrasePatterns: {
            opening: [
                "From a design perspective,",
                "Thinking about the user experience,",
                "Considering the design intent,",
                "Looking at how this serves the user,"
            ],
            reasoning: [
                "The design rationale here was to",
                "We chose this approach because",
                "The thinking behind this decision was",
                "This serves the user need for"
            ],
            conclusion: [
                "Let's find a solution that balances",
                "We should explore alternatives that",
                "I propose we iterate on",
                "The design direction should move toward"
            ],
            challenge: [
                "But how does this impact the user when",
                "I'm worried about the perception of",
                "From a usability standpoint,",
                "The brand guidelines suggest we reconsider"
            ],
            agreement: [
                "That preserves the design intent while",
                "Good, that maintains the user experience and",
                "That solution elegantly addresses",
                "I appreciate how that balances aesthetics with"
            ]
        }
    }
};

// --- REASONING CHAIN TEMPLATES ---
interface ReasoningChain {
    trigger: string;           // What initiates this reasoning
    observation: string;       // What is observed
    hypothesis: string;        // Initial theory
    analysis: string;          // Deeper analysis
    implication: string;       // What it means
    recommendation: string;    // What to do
    confidence: number;        // 0-1 confidence level
}

interface ConversationContext {
    componentId: string;
    componentName: string;
    step: number;
    recentTopics: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    hasUserInteraction: boolean;
    previousSpeakers: string[];
    activeDiscussion: string | null;
    reasoningDepth: number;
    decisionsMade: string[];
}

// --- EXPANDED PHRASE LIBRARY WITH REASONING TEMPLATES ---
interface EnhancedPhraseTemplate {
    text: string;
    type: 'neutral' | 'risk' | 'rationale' | 'action' | 'visibility' | 'social' | 'questioning' | 'synthesis';
    summary?: string;
    reasoningChain?: Partial<ReasoningChain>;
    requiresFollowUp?: boolean;
    followUpTopics?: string[];
    technicalDepth: 'shallow' | 'medium' | 'deep';
    emotionalTone: 'neutral' | 'concerned' | 'confident' | 'curious' | 'assertive';
}

// Deep technical dialogue library
const PHRASE_LIBRARY: EnhancedPhraseTemplate[] = [
    // ============================================================================
    // OBSERVATION PHASE - Initial Discoveries
    // ============================================================================
    {
        text: "I'm seeing some interesting geometry on the {poi}. The draft angles appear to vary from 1.5 to 3 degrees across the surface.",
        type: 'neutral',
        technicalDepth: 'medium',
        emotionalTone: 'curious',
        followUpTopics: ['draft angle', 'molding', 'surface finish']
    },
    {
        text: "Running my eye along the {poi}, I notice the curvature transitions aren't quite G2 continuous at the edge blend.",
        type: 'neutral',
        technicalDepth: 'deep',
        emotionalTone: 'neutral',
        summary: "Surface Continuity"
    },
    {
        text: "The {poi} mounting interface shows a 0.3mm step that wasn't in the last revision. Was this intentional?",
        type: 'questioning',
        technicalDepth: 'medium',
        emotionalTone: 'curious',
        requiresFollowUp: true
    },
    {
        text: "Looking at the cross-section of {poi}, the wall thickness profile seems optimized for flow length rather than structural performance.",
        type: 'neutral',
        technicalDepth: 'deep',
        emotionalTone: 'neutral'
    },
    {
        text: "I'm measuring the {poi} envelope. We're at 127.3mm which gives us 2.7mm margin to the package boundary.",
        type: 'neutral',
        technicalDepth: 'medium',
        emotionalTone: 'neutral'
    },

    // ============================================================================
    // RISK IDENTIFICATION - Concerns with Reasoning
    // ============================================================================
    {
        text: "I need to flag a concern on the {poi}. The wall thickness transitions from 2.8mm to 1.2mm over 15mm. That's a 57% reduction which historically causes sink marks in our PP grades.",
        type: 'risk',
        summary: "Sink Mark Risk",
        technicalDepth: 'deep',
        emotionalTone: 'concerned',
        reasoningChain: {
            trigger: 'wall thickness variation',
            observation: 'rapid thickness transition',
            hypothesis: 'may cause cosmetic defects',
            analysis: 'ratio exceeds 40% guideline',
            implication: 'visible sink on A-surface',
            confidence: 0.85
        }
    },
    {
        text: "The undercut geometry on the {poi} is more aggressive than we've previously tooled. We're looking at a 12-degree undercut which will require either a lifter or a side action. Cost implication could be significant.",
        type: 'risk',
        summary: "Tooling Complexity",
        technicalDepth: 'deep',
        emotionalTone: 'concerned',
        reasoningChain: {
            trigger: 'undercut angle',
            observation: '12-degree undercut detected',
            hypothesis: 'standard ejection not possible',
            analysis: 'requires complex tool action',
            implication: 'increased tooling cost and lead time',
            confidence: 0.92
        }
    },
    {
        text: "I'm worried about the {poi} clearance to the adjacent sub-assembly. We're at 0.35mm which is below our 0.5mm minimum for thermal expansion. When this heats up in operation, we could see interference.",
        type: 'risk',
        summary: "Thermal Interference Risk",
        technicalDepth: 'deep',
        emotionalTone: 'concerned',
        reasoningChain: {
            trigger: 'clearance measurement',
            observation: '0.35mm gap detected',
            hypothesis: 'thermal expansion may cause contact',
            analysis: 'CTE calculation shows 0.22mm growth at max temp',
            implication: 'possible interference and wear',
            confidence: 0.78
        }
    },
    {
        text: "The {poi} rib pattern looks susceptible to knit line formation. The flow front will meet at approximately 70% fill, which is our danger zone for weld line strength.",
        type: 'risk',
        summary: "Structural Weld Lines",
        technicalDepth: 'deep',
        emotionalTone: 'concerned',
        reasoningChain: {
            trigger: 'rib geometry analysis',
            observation: 'flow path convergence point',
            hypothesis: 'knit lines will form at ribs',
            analysis: 'fill simulation indicates 70% fill merge',
            implication: 'reduced rib strength by 20-40%',
            confidence: 0.82
        }
    },
    {
        text: "The snap-fit on the {poi} has a 45-degree entry angle but only 30-degree retention. That's below our 1.5:1 ratio guideline for secure retention without permanent deformation.",
        type: 'risk',
        summary: "Snap-Fit Retention",
        technicalDepth: 'deep',
        emotionalTone: 'assertive'
    },

    // ============================================================================
    // RATIONALE - Design Intent Explanation with Chains
    // ============================================================================
    {
        text: "Let me explain the thinking behind the {poi} profile. We went with this rib pattern specifically to achieve a 15Hz natural frequency target, which keeps us above the excitation range of the motor vibration.",
        type: 'rationale',
        summary: "Vibration Design",
        technicalDepth: 'deep',
        emotionalTone: 'confident',
        reasoningChain: {
            trigger: 'rib pattern question',
            observation: 'specific rib spacing and height',
            hypothesis: 'designed for stiffness target',
            analysis: 'modal analysis showed 15Hz achievable',
            implication: 'no resonance with motor at 8Hz',
            confidence: 0.95
        }
    },
    {
        text: "The fillet radius on the {poi} was deliberately oversized to 2.5mm. This serves dual purpose: it improves flow during injection by 15% and reduces stress concentration at the corner by a factor of 3.",
        type: 'rationale',
        summary: "Multi-Function Geometry",
        technicalDepth: 'deep',
        emotionalTone: 'confident',
        reasoningChain: {
            trigger: 'fillet size question',
            observation: '2.5mm radius larger than typical',
            hypothesis: 'intentional for multiple benefits',
            analysis: 'moldflow and FEA both improved',
            implication: 'optimized for manufacturing and performance',
            confidence: 0.90
        }
    },
    {
        text: "The {poi} uses a living hinge design rated for 500K cycles. We validated this with accelerated testing at 3x frequency and the Nylon 6/6 showed no crack propagation after 1.5M cycles.",
        type: 'rationale',
        summary: "Durability Validation",
        technicalDepth: 'deep',
        emotionalTone: 'confident'
    },
    {
        text: "This texture on the {poi} is MT-11020 at 0.025mm depth. It's specified to hide flow lines and sink while maintaining grip coefficient above 0.4 for wet hands.",
        type: 'rationale',
        summary: "Texture Specification",
        technicalDepth: 'medium',
        emotionalTone: 'confident'
    },
    {
        text: "The reason we offset the {poi} by 0.15mm from center is to compensate for the expected shrinkage differential. Left and right sides cool at different rates, so this pre-compensation keeps the final part symmetric.",
        type: 'rationale',
        summary: "Shrinkage Compensation",
        technicalDepth: 'deep',
        emotionalTone: 'confident'
    },

    // ============================================================================
    // ACTION - Decisions and Tasks with Clear Owners
    // ============================================================================
    {
        text: "Based on this discussion, I'm going to action a moldflow analysis on the {poi} with specific attention to the weld line locations. We need to know if they coincide with high-stress regions.",
        type: 'action',
        summary: "Moldflow Analysis",
        technicalDepth: 'medium',
        emotionalTone: 'assertive'
    },
    {
        text: "Let's lock this down. I propose we freeze the {poi} geometry pending the tolerance stack-up verification. Design team to provide updated GD&T by EOD Thursday.",
        type: 'action',
        summary: "Design Freeze",
        technicalDepth: 'medium',
        emotionalTone: 'assertive'
    },
    {
        text: "We need supplier input on the {poi} texture feasibility. I'll reach out to our tooling partner to validate they can achieve MT-11020 on this geometry with the specified draft.",
        type: 'action',
        summary: "Supplier Validation",
        technicalDepth: 'medium',
        emotionalTone: 'neutral'
    },
    {
        text: "I'm calling for a tolerance review meeting on the {poi}. The stack-up shows we're at 87% of tolerance which is tighter than I'm comfortable with for volume production.",
        type: 'action',
        summary: "Tolerance Review",
        technicalDepth: 'medium',
        emotionalTone: 'concerned'
    },
    {
        text: "Let me add a checkpoint here. Before we proceed with the {poi} tooling release, we need sign-off from manufacturing engineering on the assembly sequence feasibility.",
        type: 'action',
        summary: "Manufacturing Approval",
        technicalDepth: 'medium',
        emotionalTone: 'assertive'
    },

    // ============================================================================
    // QUESTIONING - Prompting Deeper Analysis
    // ============================================================================
    {
        text: "Can someone walk me through the load path on the {poi}? I want to understand how forces transfer from the user interface through to the mounting points.",
        type: 'questioning',
        technicalDepth: 'deep',
        emotionalTone: 'curious',
        requiresFollowUp: true
    },
    {
        text: "What's our fallback if the {poi} doesn't meet the stiffness target? Do we have a secondary design concept we can pivot to?",
        type: 'questioning',
        technicalDepth: 'medium',
        emotionalTone: 'curious',
        requiresFollowUp: true
    },
    {
        text: "Has anyone validated the {poi} assembly sequence in the AR environment? I want to make sure our technicians can actually reach the fastener locations.",
        type: 'questioning',
        technicalDepth: 'medium',
        emotionalTone: 'curious',
        requiresFollowUp: true
    },

    // ============================================================================
    // SYNTHESIS - Bringing Ideas Together
    // ============================================================================
    {
        text: "So if I'm synthesizing the discussion on {poi}: we have a potential sink mark issue that could be addressed by either increasing wall thickness or adding ribs, but both options affect tooling cost. We need to quantify which path is more economical.",
        type: 'synthesis',
        summary: "Trade-off Analysis",
        technicalDepth: 'deep',
        emotionalTone: 'neutral'
    },
    {
        text: "Let me connect the dots on {poi}. The clearance issue, the thermal expansion concern, and the assembly sequence all point to the same root cause: we need to revisit the mounting boss locations.",
        type: 'synthesis',
        summary: "Root Cause Identified",
        technicalDepth: 'deep',
        emotionalTone: 'confident'
    },

    // ============================================================================
    // VISIBILITY & SOCIAL - Collaboration
    // ============================================================================
    {
        text: "I'm having trouble seeing the detail on the {poi}. Can we rotate to get a better angle on the interface region?",
        type: 'visibility',
        technicalDepth: 'shallow',
        emotionalTone: 'neutral'
    },
    {
        text: "Following your pointer to the {poi}. Good call highlighting that area.",
        type: 'social',
        technicalDepth: 'shallow',
        emotionalTone: 'neutral'
    },
    {
        text: "Let me move to your position so we're both looking at the {poi} from the same reference.",
        type: 'social',
        technicalDepth: 'shallow',
        emotionalTone: 'neutral'
    }
];

// --- USER CONTEXT RESPONSE TEMPLATES ---
const USER_CONTEXT_TEMPLATES = [
    "Good eye on the {poi}. Now that you've highlighted it, I can see",
    "Thanks for pointing out the {poi}. Building on your observation,",
    "You've identified a key area on the {poi}. Let me add that",
    "Following your focus on {poi}, I'd note that",
    "The {poi} you've selected is interesting because",
    "That's a critical detail on the {poi}. From my analysis,"
];

// --- REASONING DEPTH ENHANCERS ---
const REASONING_CONNECTORS = [
    "This matters because",
    "The implication here is that",
    "What this tells us is",
    "Connecting this to our requirements,",
    "In the context of our production goals,",
    "From a manufacturability standpoint, this means"
];

const EVIDENCE_STATEMENTS = [
    "Our historical data shows",
    "Based on similar projects,",
    "The supplier feedback indicated",
    "Testing has demonstrated that",
    "Industry standards suggest",
    "Our simulation results confirm"
];

// --- INSIGHT GENERATION ---
const ASSIGNEES = [
    "Alex Chen (Lead)",
    "Sarah J. (Ergo)",
    "Design Team A",
    "Mfg. Engineering",
    "Validation Lab",
    "Marcus T. (DFM)",
    "Quality Assurance"
];

const MITIGATIONS = [
    "Increase local wall thickness by 15%",
    "Add flow leaders to improve fill balance",
    "Modify rib geometry to shift weld lines",
    "Increase draft angle to 2 degrees minimum",
    "Add gas-assist channels for thick sections",
    "Conduct DOE on process parameters",
    "Evaluate alternative material grade"
];

const DRIVERS = [
    "Weight Optimization",
    "Cost Reduction Target",
    "Assembly Efficiency",
    "Durability Requirement",
    "Aesthetic Specification",
    "Regulatory Compliance",
    "User Ergonomics"
];

const TRADEOFFS = [
    "Weight vs. Stiffness (3:1 ratio targeted)",
    "Cost vs. Surface Finish Quality",
    "Cycle Time vs. Part Quality",
    "Tool Complexity vs. Part Count",
    "Material Cost vs. Processing Window"
];

const getRandomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Generate structured details based on role and type
const generateDetails = (
    type: InsightType,
    targetId: string,
    targetLabel: string,
    decisionState: "NONE" | "INTERMEDIATE" | "FINAL",
    template: EnhancedPhraseTemplate
): InsightDetails => {
    const base: InsightDetails = {
        priority: template.reasoningChain?.confidence
            ? (template.reasoningChain.confidence > 0.85 ? 'Critical' : template.reasoningChain.confidence > 0.7 ? 'High' : 'Medium')
            : (Math.random() > 0.7 ? 'High' : 'Medium'),
        status: 'Open',
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
            impact: template.reasoningChain?.implication || "Potential production impact",
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

    if (type === 'ACTION') {
        return {
            ...base,
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

// --- CONVERSATION CONTEXT TRACKER ---
class ConversationContextManager {
    private contexts: Map<string, ConversationContext> = new Map();

    getContext(componentId: string, componentName: string): ConversationContext {
        if (!this.contexts.has(componentId)) {
            this.contexts.set(componentId, {
                componentId,
                componentName,
                step: 0,
                recentTopics: [],
                riskLevel: 'low',
                hasUserInteraction: false,
                previousSpeakers: [],
                activeDiscussion: null,
                reasoningDepth: 0,
                decisionsMade: []
            });
        }
        return this.contexts.get(componentId)!;
    }

    advanceContext(componentId: string, agentId: string, topic?: string) {
        const ctx = this.contexts.get(componentId);
        if (ctx) {
            ctx.step++;
            ctx.previousSpeakers.push(agentId);
            if (ctx.previousSpeakers.length > 5) ctx.previousSpeakers.shift();
            if (topic) {
                ctx.recentTopics.push(topic);
                if (ctx.recentTopics.length > 3) ctx.recentTopics.shift();
            }
        }
    }

    setRiskLevel(componentId: string, level: 'low' | 'medium' | 'high' | 'critical') {
        const ctx = this.contexts.get(componentId);
        if (ctx) ctx.riskLevel = level;
    }

    setUserInteraction(componentId: string, value: boolean) {
        const ctx = this.contexts.get(componentId);
        if (ctx) ctx.hasUserInteraction = value;
    }

    addDecision(componentId: string, decision: string) {
        const ctx = this.contexts.get(componentId);
        if (ctx) ctx.decisionsMade.push(decision);
    }
}

// --- MAIN COMPONENT ---
const DialogueEngine: React.FC = () => {
    const agents = useStore(state => state.agents);
    const pois = useStore(state => state.pois);
    const isPlaying = useStore(state => state.isPlaying);
    const addChatMessage = useStore(state => state.addChatMessage);
    const addInsightCard = useStore(state => state.addInsightCard);
    const requirements = useStore(state => state.requirements);
    const chatHistory = useStore(state => state.chatHistory);

    const lastSpeakTime = useRef<Record<string, number>>({});
    const messageBuffer = useRef<string[]>([]);
    const contextManager = useRef(new ConversationContextManager());

    // Decision state per component
    const poiDecisionState = useRef<Record<string, "NONE" | "INTERMEDIATE" | "FINAL">>({});

    // Build enhanced dialogue with personality and reasoning chains
    const buildEnhancedDialogue = (
        agentId: string,
        targetLabel: string,
        template: EnhancedPhraseTemplate,
        context: ConversationContext,
        isUserDriven: boolean
    ): string => {
        const personality = AGENT_PERSONALITIES[agentId] || AGENT_PERSONALITIES['1'];
        let dialogue = template.text.replace(/{poi}/g, targetLabel);

        // Add personality-driven opening for deeper analysis
        if (template.technicalDepth === 'deep' && Math.random() > 0.5) {
            const opening = getRandomElement(personality.phrasePatterns.opening);
            dialogue = `${opening} ${dialogue.charAt(0).toLowerCase()}${dialogue.slice(1)}`;
        }

        // Add reasoning connector for risk and rationale types
        if ((template.type === 'risk' || template.type === 'rationale') && template.reasoningChain && Math.random() > 0.4) {
            const connector = getRandomElement(REASONING_CONNECTORS);
            const evidence = getRandomElement(EVIDENCE_STATEMENTS);

            if (template.reasoningChain.implication) {
                dialogue += ` ${connector} ${template.reasoningChain.implication.toLowerCase()}.`;
            }
            if (template.reasoningChain.confidence && template.reasoningChain.confidence > 0.8 && Math.random() > 0.5) {
                dialogue += ` ${evidence} this is a high-confidence assessment.`;
            }
        }

        // Add context-aware prefix for user-driven interactions
        if (isUserDriven) {
            const prefixTemplate = getRandomElement(USER_CONTEXT_TEMPLATES);
            const prefix = prefixTemplate.replace(/{poi}/g, targetLabel);
            dialogue = `${prefix} ${dialogue.charAt(0).toLowerCase()}${dialogue.slice(1)}`;
        }

        // Add follow-up indication
        if (template.requiresFollowUp && Math.random() > 0.7) {
            dialogue += " We should discuss this further.";
        }

        return dialogue;
    };

    useFrame(() => {
        if (!isPlaying) return;

        agents.forEach(agent => {
            const now = Date.now();
            const last = lastSpeakTime.current[agent.id] || 0;
            const isInspecting = agent.behavior === 'INSPECTING' && agent.currentPoiId;

            // Variable timing based on conversation depth
            const baseInterval = 3500;
            const randomInterval = Math.random() * 5000;

            if (now - last > (baseInterval + randomInterval)) {
                if (Math.random() > 0.45) {
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

        // Get or create conversation context
        const context = contextManager.current.getContext(targetId, targetLabel);
        contextManager.current.advanceContext(targetId, agentId);

        if (isUserDriven) {
            contextManager.current.setUserInteraction(targetId, true);
        }

        // --- INTELLIGENT PHASE SELECTION ---
        let candidates = PHRASE_LIBRARY;
        const step = context.step;

        // Phase 0-2: Observation & Discovery
        if (step < 3) {
            candidates = PHRASE_LIBRARY.filter(t =>
                t.type === 'neutral' || t.type === 'visibility' || t.type === 'questioning'
            );
        }
        // Phase 3-6: Analysis & Risk Identification
        else if (step < 7) {
            candidates = PHRASE_LIBRARY.filter(t =>
                t.type === 'risk' || t.type === 'rationale' || t.type === 'questioning'
            );
        }
        // Phase 7-10: Deep Dive & Synthesis
        else if (step < 11) {
            candidates = PHRASE_LIBRARY.filter(t =>
                t.type === 'rationale' || t.type === 'synthesis' || t.type === 'risk'
            );
        }
        // Phase 11+: Decision & Action
        else {
            candidates = PHRASE_LIBRARY.filter(t =>
                t.type === 'action' || t.type === 'synthesis' || t.type === 'rationale'
            );
        }

        // Bias toward deeper content for user-driven interactions
        if (isUserDriven) {
            candidates = candidates.filter(t => t.technicalDepth !== 'shallow');
            if (candidates.length === 0) {
                candidates = PHRASE_LIBRARY.filter(t => t.type !== 'social' && t.type !== 'visibility');
            }
        }

        // Fallback
        if (candidates.length === 0) candidates = PHRASE_LIBRARY;

        const template = getRandomElement(candidates);
        const text = buildEnhancedDialogue(agentId, targetLabel, template, context, isUserDriven);

        // Update risk level if risk detected
        if (template.type === 'risk') {
            contextManager.current.setRiskLevel(targetId, 'high');
        }

        const messageId = Math.random().toString(36).substr(2, 9);
        addChatMessage({ id: messageId, agentId, text, timestamp: Date.now() });
        messageBuffer.current.push(messageId);
        if (messageBuffer.current.length > 5) messageBuffer.current.shift();

        // Insight capture logic
        if (template.type === 'action' || template.type === 'risk' || template.type === 'rationale' || template.type === 'synthesis' || isUserDriven) {
            const shouldCapture = isUserDriven || Math.random() > 0.5;

            if (shouldCapture) {
                setTimeout(() => {
                    let type: InsightType = 'ACTION';
                    if (template.type === 'risk') type = 'RISK';
                    if (template.type === 'rationale' || template.type === 'synthesis') type = 'RATIONALE';

                    const currentDecState = poiDecisionState.current[targetId] || "NONE";
                    const details = generateDetails(type, targetId, targetLabel, currentDecState, template);

                    // Update Decision State
                    if (type === 'ACTION') {
                        if (currentDecState === "NONE") poiDecisionState.current[targetId] = "INTERMEDIATE";
                        else poiDecisionState.current[targetId] = "FINAL";
                        contextManager.current.addDecision(targetId, template.summary || "Decision");
                    }

                    const sourceIds = [...messageBuffer.current];
                    const affectedReqs: string[] = [];
                    if ((type === 'RISK' || type === 'ACTION') && Math.random() > 0.4) {
                        affectedReqs.push(requirements[Math.floor(Math.random() * requirements.length)].id);
                    }

                    addInsightCard({
                        id: Math.random().toString(36).substr(2, 9),
                        agentId,
                        type,
                        title: isUserDriven ? `User Focus: ${targetLabel}` : (template.summary || "Design Analysis"),
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
