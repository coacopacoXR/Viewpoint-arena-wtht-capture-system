
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { 
    CheckCircle2, AlertTriangle, Lightbulb, FileText, Download, 
    ShieldAlert, Scale, MessageSquare, ArrowRight, LayoutDashboard, List,
    Users, Box, GitCommitHorizontal, CircleDollarSign, Fingerprint, Gavel, 
    Construction, HelpCircle, User, Building2, Zap, Microscope, Eye,
    BarChart2, Search, Activity
} from 'lucide-react';
import { clsx } from 'clsx';
import { InsightType, InsightCard, ChatMessage } from '../../types';
import InsightDetailModal from './InsightDetailModal';

// --- ANALYZER TYPES & LOGIC ---

type ConversationRole = 
    | 'OBSERVATION' 
    | 'COORDINATION' 
    | 'TRIGGER' 
    | 'RATIONALE' 
    | 'CONSTRAINT' 
    | 'DECISION' 
    | 'GENERAL';

const classifyMessage = (text: string): ConversationRole => {
    const t = text.toLowerCase();
    if (t.includes('risk') || t.includes('concern') || t.includes('fail') || t.includes('weak')) return 'TRIGGER';
    if (t.includes('because') || t.includes('designed to') || t.includes('intent') || t.includes('driver')) return 'RATIONALE';
    if (t.includes('verify') || t.includes('check') || t.includes('update') || t.includes('run')) return 'DECISION';
    if (t.includes('cant see') || t.includes('rotate') || t.includes('view') || t.includes('focus')) return 'COORDINATION';
    if (t.includes('cost') || t.includes('supplier') || t.includes('time') || t.includes('limit')) return 'CONSTRAINT';
    if (t.includes('look') || t.includes('measure') || t.includes('inspect')) return 'OBSERVATION';
    return 'GENERAL';
};

const getRoleColor = (role: ConversationRole) => {
    switch (role) {
        case 'TRIGGER': return 'bg-red-400 text-red-900 border-red-200';
        case 'RATIONALE': return 'bg-amber-400 text-amber-900 border-amber-200';
        case 'DECISION': return 'bg-blue-400 text-blue-900 border-blue-200';
        case 'COORDINATION': return 'bg-purple-400 text-purple-900 border-purple-200';
        case 'CONSTRAINT': return 'bg-emerald-400 text-emerald-900 border-emerald-200';
        case 'OBSERVATION': return 'bg-gray-400 text-gray-900 border-gray-200';
        default: return 'bg-gray-200 text-gray-700 border-gray-300';
    }
};

type TriggerCategory = 'DISAGREEMENT' | 'COST' | 'ERGONOMICS' | 'COMPLIANCE' | 'QUALITY' | 'GENERAL';

const getTriggerInfo = (text: string): { type: TriggerCategory, icon: any, label: string, color: string } => {
    const t = text.toLowerCase();
    if (t.includes('disagree') || t.includes('not sure') || t.includes('opinion')) 
        return { type: 'DISAGREEMENT', icon: HelpCircle, label: 'Disagreement', color: 'text-amber-600 bg-amber-50 border-amber-200' };
    if (t.includes('cost') || t.includes('expensive') || t.includes('budget') || t.includes('cheap')) 
        return { type: 'COST', icon: CircleDollarSign, label: 'Cost Constraint', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
    if (t.includes('reach') || t.includes('comfort') || t.includes('fit') || t.includes('user')) 
        return { type: 'ERGONOMICS', icon: Fingerprint, label: 'Ergonomics', color: 'text-purple-600 bg-purple-50 border-purple-200' };
    if (t.includes('standard') || t.includes('iso') || t.includes('req') || t.includes('rule')) 
        return { type: 'COMPLIANCE', icon: Gavel, label: 'Compliance', color: 'text-blue-600 bg-blue-50 border-blue-200' };
    if (t.includes('break') || t.includes('fail') || t.includes('weak') || t.includes('quality')) 
        return { type: 'QUALITY', icon: ShieldAlert, label: 'Quality Risk', color: 'text-red-600 bg-red-50 border-red-200' };
    
    return { type: 'GENERAL', icon: Zap, label: 'General Input', color: 'text-gray-600 bg-gray-50 border-gray-200' };
};

const MeetingSummary: React.FC = () => {
    const insightCards = useStore(state => state.insightCards);
    const requirements = useStore(state => state.requirements);
    const chatHistory = useStore(state => state.chatHistory);
    const isMeetingEnded = useStore(state => state.isMeetingEnded);
    const endMeeting = useStore(state => state.endMeeting);
    const agents = useStore(state => state.agents);
    const time = useStore(state => state.time);
    const updateInsightType = useStore(state => state.updateInsightType);
    const updateInsight = useStore(state => state.updateInsight);

    const [activeTab, setActiveTab] = useState<'DECISIONS' | 'REQUIREMENTS' | 'ASSIGNEES' | 'COMPONENTS' | 'THREADS' | 'ANALYSIS'>('DECISIONS');
    const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
    const [selectedCard, setSelectedCard] = useState<InsightCard | null>(null);
    
    // Assignee View Mode
    const [assigneeMode, setAssigneeMode] = useState<'INDIVIDUAL' | 'DEPARTMENT'>('INDIVIDUAL');

    // Thread View State
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

    // Transcript Scrolling Ref
    const transcriptRef = useRef<HTMLDivElement>(null);

    // --- AUTO SCROLL LOGIC ---
    useEffect(() => {
        if (!hoveredCardId || !transcriptRef.current) return;
        
        const card = insightCards.find(c => c.id === hoveredCardId);
        if (card && card.sourceMessageIds && card.sourceMessageIds.length > 0) {
            const msgId = card.sourceMessageIds[0];
            const el = document.getElementById(`summary-msg-${msgId}`);
            
            if (el) {
                const container = transcriptRef.current;
                const topPos = el.offsetTop;
                const centerOffset = (container.clientHeight / 2) - (el.clientHeight / 2);
                
                container.scrollTo({
                    top: Math.max(0, topPos - centerOffset),
                    behavior: 'smooth'
                });

                el.style.transition = 'background-color 0.2s';
                el.style.backgroundColor = 'rgba(59, 130, 246, 0.2)'; 
                setTimeout(() => {
                    el.style.backgroundColor = '';
                }, 1000);
            }
        }
    }, [hoveredCardId, insightCards]);


    if (!isMeetingEnded) return null;

    // --- DRAG AND DROP HANDLERS ---
    const handleDragStart = (e: React.DragEvent, cardId: string) => {
        e.dataTransfer.setData("cardId", cardId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent, targetType: InsightType) => {
        const cardId = e.dataTransfer.getData("cardId");
        if (cardId) {
            updateInsightType(cardId, targetType);
        }
    };

    const handleAssigneeDrop = (e: React.DragEvent, targetName: string) => {
        const cardId = e.dataTransfer.getData("cardId");
        if (cardId) {
            const card = insightCards.find(c => c.id === cardId);
            if (card) {
                if (assigneeMode === 'INDIVIDUAL') {
                    updateInsight(cardId, { details: { ...card.details, assignee: targetName } });
                } else {
                    updateInsight(cardId, { details: { ...card.details, department: targetName } });
                }
            }
        }
    };

    // Derived State
    const risks = insightCards.filter(c => c.type === 'RISK');
    const actions = insightCards.filter(c => c.type === 'ACTION');
    const rationale = insightCards.filter(c => c.type === 'RATIONALE');

    const highlightedMsgIds = hoveredCardId ? insightCards.find(c => c.id === hoveredCardId)?.sourceMessageIds || [] : [];
    const highlightedReqIds = hoveredCardId ? insightCards.find(c => c.id === hoveredCardId)?.affectedRequirementIds || [] : [];

    // --- GROUPING HELPERS ---

    const getCardsByAssignee = () => {
        const groups: Record<string, InsightCard[]> = {};
        insightCards.forEach(card => {
            const key = assigneeMode === 'INDIVIDUAL' 
                ? (card.details.assignee || 'Unassigned')
                : (card.details.department || 'General');
            if (!groups[key]) groups[key] = [];
            groups[key].push(card);
        });
        return groups;
    };

    const getCardsByComponent = () => {
        const groups: Record<string, InsightCard[]> = {};
        insightCards.forEach(card => {
            const comp = card.details.componentReference || 'General Assembly';
            if (!groups[comp]) groups[comp] = [];
            groups[comp].push(card);
        });
        return groups;
    };

    // --- THREAD RECONSTRUCTION LOGIC ---
    interface DecisionThread {
        id: string; // usually Component Name
        component: string;
        finalDecision: InsightCard | null;
        intermediates: InsightCard[];
        triggerTypes: TriggerCategory[]; // Unique list of trigger types found
        triggerMessages: ChatMessage[]; // The messages that started it
        // Analytics
        allMessages: ChatMessage[];
        patterns: string[];
    }

    const getThreads = (): DecisionThread[] => {
        const groups = getCardsByComponent();
        const threads: DecisionThread[] = [];

        Object.entries(groups).forEach(([component, cards]) => {
            // Sort by time
            const sorted = [...cards].sort((a, b) => a.timestamp - b.timestamp);
            
            if (sorted.length === 0) return;

            const final = sorted[sorted.length - 1];
            const intermediates = sorted.slice(0, sorted.length - 1);

            // Collect triggers from the FIRST card in the chain (origin)
            const firstCard = sorted[0];
            const originMsgs = chatHistory.filter(m => firstCard.sourceMessageIds?.includes(m.id));

            // Analyzer Logic: Collect all messages related to this component (fuzzy match on component name or cards)
            // This reconstructs the "Whole Conversation" not just the card sources.
            const relatedMessages = chatHistory.filter(m => 
                m.text.includes(component) || 
                sorted.some(c => c.sourceMessageIds?.includes(m.id))
            ).sort((a,b) => a.timestamp - b.timestamp);

            // Detect Trigger Types
            const triggersSet = new Set<TriggerCategory>();
            originMsgs.forEach(m => triggersSet.add(getTriggerInfo(m.text).type));

            // Detect Collaboration Patterns
            const patterns: string[] = [];
            const uniqueSpeakers = new Set(relatedMessages.map(m => m.agentId)).size;
            if (uniqueSpeakers > 2) patterns.push("Shared Focus");
            if (relatedMessages.length > 8) patterns.push("Deep Dive");
            if (relatedMessages.some(m => m.text.includes("rotate") || m.text.includes("view"))) patterns.push("View Coord.");
            if (relatedMessages.some(m => m.text.includes("fail") || m.text.includes("risk"))) patterns.push("High Alert");

            threads.push({
                id: component,
                component,
                finalDecision: final,
                intermediates,
                triggerTypes: Array.from(triggersSet),
                triggerMessages: originMsgs,
                allMessages: relatedMessages,
                patterns
            });
        });

        return threads;
    };

    const threads = getThreads();
    const activeThread = selectedThreadId ? threads.find(t => t.id === selectedThreadId) : null;

    return (
        <div className="fixed inset-0 z-50 bg-[#F2F2F2] flex flex-col items-center justify-center p-4 animate-in fade-in duration-300 pointer-events-auto">
            
            {selectedCard && (
                <InsightDetailModal 
                    card={selectedCard}
                    onClose={() => setSelectedCard(null)}
                    agentColor={agents.find(a => a.id === selectedCard.agentId)?.color}
                />
            )}

            <div className="w-full max-w-[95vw] h-[90vh] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
                
                {/* Header */}
                <div className="bg-black text-white p-5 flex justify-between items-center shrink-0">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-xl font-bold tracking-tight flex items-center gap-3">
                            <FileText size={20} />
                            Session Review Board
                        </h1>
                        <div className="text-gray-400 text-xs font-mono flex items-center gap-4">
                            <span>DURATION: {(time / 60).toFixed(1)} MIN</span>
                            <span>DECISIONS: {insightCards.length}</span>
                        </div>
                    </div>
                    
                    <div className="flex bg-white/10 rounded p-1 gap-1">
                         <button onClick={() => setActiveTab('DECISIONS')} className={clsx("px-3 py-1.5 rounded text-xs font-bold uppercase flex items-center gap-2 transition-colors", activeTab === 'DECISIONS' ? "bg-white text-black" : "text-gray-400 hover:text-white")}>
                            <LayoutDashboard size={14} /> Board
                         </button>
                         <button onClick={() => setActiveTab('REQUIREMENTS')} className={clsx("px-3 py-1.5 rounded text-xs font-bold uppercase flex items-center gap-2 transition-colors", activeTab === 'REQUIREMENTS' ? "bg-white text-black" : "text-gray-400 hover:text-white")}>
                            <List size={14} /> Requirements
                         </button>
                         <button onClick={() => setActiveTab('ASSIGNEES')} className={clsx("px-3 py-1.5 rounded text-xs font-bold uppercase flex items-center gap-2 transition-colors", activeTab === 'ASSIGNEES' ? "bg-white text-black" : "text-gray-400 hover:text-white")}>
                            <Users size={14} /> Assignees
                         </button>
                         <button onClick={() => setActiveTab('COMPONENTS')} className={clsx("px-3 py-1.5 rounded text-xs font-bold uppercase flex items-center gap-2 transition-colors", activeTab === 'COMPONENTS' ? "bg-white text-black" : "text-gray-400 hover:text-white")}>
                            <Box size={14} /> Components
                         </button>
                         <button onClick={() => setActiveTab('THREADS')} className={clsx("px-3 py-1.5 rounded text-xs font-bold uppercase flex items-center gap-2 transition-colors", activeTab === 'THREADS' ? "bg-white text-black" : "text-gray-400 hover:text-white")}>
                            <GitCommitHorizontal size={14} /> Rationale Flow
                         </button>
                         <button onClick={() => setActiveTab('ANALYSIS')} className={clsx("px-3 py-1.5 rounded text-xs font-bold uppercase flex items-center gap-2 transition-colors", activeTab === 'ANALYSIS' ? "bg-white text-black" : "text-gray-400 hover:text-white")}>
                            <Microscope size={14} /> Analysis
                         </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="bg-gray-800 text-gray-300 px-4 py-2 rounded font-bold text-xs hover:text-white hover:bg-gray-700 transition-colors flex items-center gap-2">
                            <Download size={14} /> PDF Report
                        </button>
                        <button 
                            onClick={() => endMeeting(false)}
                            className="bg-white text-black px-4 py-2 rounded font-bold text-xs hover:bg-gray-200 transition-colors"
                        >
                            Return to Scene
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    
                    {/* LEFT PANEL CONTENT */}
                    <div className={clsx("flex-1 bg-gray-50/50 relative", (activeTab !== 'THREADS' && activeTab !== 'ANALYSIS') ? "p-6 overflow-y-auto" : "overflow-hidden")}>
                        
                        {/* DECISIONS TAB */}
                        {activeTab === 'DECISIONS' && (
                            <div className="grid grid-cols-3 gap-6 h-full min-h-[500px]">
                                <div className="flex flex-col gap-3 h-full bg-red-50/30 rounded-lg p-2 border border-dashed border-red-200" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, 'RISK')}>
                                    <div className="flex items-center gap-2 text-red-800 font-bold text-sm uppercase px-2 py-1"><ShieldAlert size={16}/> Risks ({risks.length})</div>
                                    {risks.map(card => <SummaryCard key={card.id} card={card} agents={agents} setHover={setHoveredCardId} onClick={() => setSelectedCard(card)} color="bg-white border-red-200 shadow-sm" />)}
                                </div>
                                <div className="flex flex-col gap-3 h-full bg-blue-50/30 rounded-lg p-2 border border-dashed border-blue-200" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, 'ACTION')}>
                                    <div className="flex items-center gap-2 text-blue-800 font-bold text-sm uppercase px-2 py-1"><CheckCircle2 size={16}/> Actions ({actions.length})</div>
                                    {actions.map(card => <SummaryCard key={card.id} card={card} agents={agents} setHover={setHoveredCardId} onClick={() => setSelectedCard(card)} color="bg-white border-blue-200 shadow-sm" />)}
                                </div>
                                <div className="flex flex-col gap-3 h-full bg-amber-50/30 rounded-lg p-2 border border-dashed border-amber-200" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, 'RATIONALE')}>
                                    <div className="flex items-center gap-2 text-amber-800 font-bold text-sm uppercase px-2 py-1"><Lightbulb size={16}/> Rationale ({rationale.length})</div>
                                    {rationale.map(card => <SummaryCard key={card.id} card={card} agents={agents} setHover={setHoveredCardId} onClick={() => setSelectedCard(card)} color="bg-white border-amber-200 shadow-sm" />)}
                                </div>
                            </div>
                        )}

                        {/* REQUIREMENTS TAB */}
                        {activeTab === 'REQUIREMENTS' && (
                             <div className="flex flex-col gap-3">
                                {requirements.map(req => {
                                    const linkedCards = insightCards.filter(c => c.affectedRequirementIds?.includes(req.id));
                                    const isHighlight = highlightedReqIds.includes(req.id);
                                    return (
                                        <div key={req.id} className={clsx("bg-white border p-4 rounded-lg flex items-start justify-between transition-all duration-300", isHighlight ? "ring-2 ring-orange-400 border-orange-400 shadow-lg scale-[1.01]" : "border-gray-200")}>
                                            <div className="flex flex-col gap-1 max-w-2xl">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono font-bold text-orange-600 text-sm">{req.code}</span>
                                                    <span className={clsx("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase", req.status === 'MET' ? "bg-green-100 text-green-700" : req.status === 'AT_RISK' ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700")}>{req.status.replace('_', ' ')}</span>
                                                </div>
                                                <div className="text-sm text-gray-700">{req.description}</div>
                                            </div>
                                            {linkedCards.length > 0 && (
                                                <div className="flex flex-col gap-2 items-end">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase">Linked Decisions</span>
                                                    {linkedCards.map(c => (
                                                        <div key={c.id} onMouseEnter={() => setHoveredCardId(c.id)} onMouseLeave={() => setHoveredCardId(null)} onClick={() => setSelectedCard(c)} className="text-[10px] px-2 py-1 bg-gray-100 rounded border border-gray-200 hover:bg-gray-200 cursor-pointer">{c.title}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* ASSIGNEES TAB */}
                        {activeTab === 'ASSIGNEES' && (
                             <div className="flex flex-col h-full">
                                 <div className="flex justify-center mb-6">
                                     <div className="bg-white border border-gray-300 rounded-lg p-1 flex">
                                         <button onClick={() => setAssigneeMode('INDIVIDUAL')} className={clsx("px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all", assigneeMode === 'INDIVIDUAL' ? "bg-blue-100 text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-800")}><User size={14}/> Individual</button>
                                         <button onClick={() => setAssigneeMode('DEPARTMENT')} className={clsx("px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all", assigneeMode === 'DEPARTMENT' ? "bg-blue-100 text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-800")}><Building2 size={14}/> Department</button>
                                     </div>
                                 </div>
                                 <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                    {Object.entries(getCardsByAssignee()).map(([groupName, cards]) => (
                                        <div key={groupName} className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col overflow-hidden" onDragOver={handleDragOver} onDrop={(e) => handleAssigneeDrop(e, groupName)}>
                                            <div className="bg-gray-50 border-b border-gray-100 p-3 flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs border border-blue-200">{groupName.charAt(0)}</div>
                                                <div className="flex flex-col"><div className="text-sm font-bold text-gray-800">{groupName}</div><div className="text-[10px] text-gray-500 font-mono">{cards.length} Tasks Assigned</div></div>
                                            </div>
                                            <div className="p-2 flex flex-col gap-2 bg-gray-50/50 flex-1 min-h-[100px]">
                                                {cards.map(card => <SummaryCard key={card.id} card={card} agents={agents} setHover={setHoveredCardId} onClick={() => setSelectedCard(card)} color="bg-white border-gray-200 shadow-sm" />)}
                                            </div>
                                        </div>
                                    ))}
                                 </div>
                             </div>
                        )}

                        {/* COMPONENTS TAB */}
                        {activeTab === 'COMPONENTS' && (
                             <div className="flex flex-col gap-4 max-w-4xl mx-auto">
                                {Object.entries(getCardsByComponent()).map(([component, cards]) => {
                                    const riskCount = cards.filter(c => c.type === 'RISK').length;
                                    const actionCount = cards.filter(c => c.type === 'ACTION').length;
                                    return (
                                        <div key={component} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-all">
                                            <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                                                <div className="flex items-center gap-3"><Box size={16} className="text-gray-400" /><span className="font-bold text-sm text-gray-800 font-mono">{component}</span></div>
                                                <div className="flex gap-2">
                                                    {riskCount > 0 && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">{riskCount} Risks</span>}
                                                    {actionCount > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">{actionCount} Actions</span>}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {cards.map(card => (
                                                     <div key={card.id} onClick={() => setSelectedCard(card)} onMouseEnter={() => setHoveredCardId(card.id)} onMouseLeave={() => setHoveredCardId(null)} className="text-xs p-2 bg-gray-50 border border-gray-200 rounded cursor-pointer hover:bg-gray-100 flex items-center justify-between">
                                                        <span>{card.title}</span><span className="text-[9px] text-gray-400 font-mono">{card.type}</span>
                                                     </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                             </div>
                        )}

                        {/* --- RATIONALE FLOW MAP --- */}
                        {activeTab === 'THREADS' && (
                            <div className="flex h-full w-full">
                                {/* OVERVIEW SIDEBAR */}
                                <div className="w-72 border-r border-gray-200 bg-white overflow-y-auto shrink-0 flex flex-col">
                                    <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Flows</div>
                                    </div>
                                    {threads.map(thread => (
                                        <button
                                            key={thread.id}
                                            onClick={() => setSelectedThreadId(thread.id)}
                                            className={clsx(
                                                "p-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors group relative",
                                                selectedThreadId === thread.id ? "bg-blue-50/50 border-r-4 border-r-blue-500" : ""
                                            )}
                                        >
                                            <div className="font-mono text-xs font-bold text-gray-800 mb-1">{thread.component}</div>
                                            <div className="text-[10px] text-gray-500 truncate mb-2">{thread.finalDecision?.title || "No Outcome"}</div>
                                            <div className="flex gap-1 mb-1">
                                                {thread.triggerTypes.map(type => {
                                                    const { icon: Icon, color } = getTriggerInfo(type); 
                                                    return (
                                                        <div key={type} className={clsx("w-4 h-4 rounded-full flex items-center justify-center border", color)}>
                                                            <Icon size={8} />
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* SCHEMATIC CANVAS */}
                                <div className="flex-1 bg-[#F7F7F7] overflow-hidden flex flex-col">
                                    
                                    {/* Main Schematic Area */}
                                    <div className="flex-1 overflow-x-auto overflow-y-hidden p-8 flex items-center">
                                        {activeThread ? (
                                            <div className="flex items-center gap-0">
                                                
                                                {/* 1. CONTEXT NODE */}
                                                <div className="flex items-center">
                                                    <div className="w-64 bg-white border border-gray-300 shadow-sm p-4 rounded-sm flex flex-col relative group">
                                                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Context Scope</div>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Box size={16} className="text-gray-800"/>
                                                            <span className="font-mono font-bold text-sm">{activeThread.component}</span>
                                                        </div>
                                                        <div className="border-t border-gray-100 pt-2 flex flex-col gap-1">
                                                            {requirements.filter(r => activeThread.finalDecision?.affectedRequirementIds?.includes(r.id)).map(r => (
                                                                <div key={r.id} className="text-[9px] bg-orange-50 text-orange-700 px-1 py-0.5 rounded border border-orange-100 font-mono flex items-center gap-1">
                                                                    <Scale size={8} /> {r.code}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="absolute top-1/2 -right-1 w-2 h-2 bg-gray-300 rounded-full z-10"></div>
                                                    </div>
                                                    <div className="w-16 h-px bg-gray-300 relative"></div>
                                                </div>

                                                {/* 2. TRIGGER CLUSTER */}
                                                <div className="flex items-center">
                                                    <div className="flex flex-col gap-2">
                                                        {activeThread.triggerMessages.map((msg, idx) => {
                                                            const info = getTriggerInfo(msg.text);
                                                            const Icon = info.icon;
                                                            return (
                                                                <div key={msg.id} className={clsx("w-60 p-3 rounded-sm border shadow-sm relative group cursor-help", info.color)}>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <div className="flex items-center gap-1 text-[9px] font-bold uppercase">
                                                                            <Icon size={10} /> {info.label}
                                                                        </div>
                                                                        <div className="text-[8px] opacity-60 font-mono">T-{idx+1}</div>
                                                                    </div>
                                                                    <div className="text-[10px] leading-snug italic opacity-90">
                                                                        "{msg.text}"
                                                                    </div>
                                                                    <div className="absolute top-1/2 -left-1 w-2 h-2 bg-current opacity-30 rounded-full"></div>
                                                                    <div className="absolute top-1/2 -right-1 w-2 h-2 bg-current opacity-30 rounded-full"></div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                    <div className="w-16 h-px bg-gray-300 relative">
                                                        <ArrowRight size={14} className="text-gray-400 absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2" />
                                                    </div>
                                                </div>

                                                {/* 3. INTERMEDIATE NODES */}
                                                {activeThread.intermediates.length > 0 && (
                                                    <div className="flex items-center">
                                                        <div className="flex gap-4">
                                                            {activeThread.intermediates.map((card) => (
                                                                <div key={card.id} className="flex items-center">
                                                                    <div 
                                                                        onClick={() => setSelectedCard(card)}
                                                                        className="w-48 bg-white border-2 border-dashed border-gray-300 p-3 rounded-sm hover:border-gray-500 cursor-pointer transition-colors relative"
                                                                    >
                                                                        <div className="text-[9px] font-bold text-gray-400 uppercase mb-1">Intermediate Step</div>
                                                                        <div className="font-bold text-xs text-gray-700 mb-1">{card.title}</div>
                                                                        <div className="text-[9px] text-gray-500 italic truncate">"{card.description}"</div>
                                                                    </div>
                                                                    <div className="w-8 h-px bg-gray-300 relative"></div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* 4. FINAL DECISION */}
                                                <div className="flex items-center">
                                                    {activeThread.finalDecision ? (
                                                        <div 
                                                            onClick={() => setSelectedCard(activeThread.finalDecision!)}
                                                            className={clsx(
                                                                "w-64 p-4 rounded-sm shadow-md border-l-4 cursor-pointer hover:shadow-lg transition-all relative",
                                                                activeThread.finalDecision.type === 'RISK' ? "bg-white border-l-red-500 border-gray-200" :
                                                                activeThread.finalDecision.type === 'ACTION' ? "bg-white border-l-blue-500 border-gray-200" :
                                                                "bg-white border-l-amber-500 border-gray-200"
                                                            )}
                                                        >
                                                            <div className="absolute -top-3 left-3 bg-gray-800 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                                                                Final Decision
                                                            </div>
                                                            <div className="font-bold text-sm text-gray-900 mb-2">{activeThread.finalDecision.title}</div>
                                                            <div className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-2 rounded mb-2">
                                                                "{activeThread.finalDecision.description}"
                                                            </div>
                                                            <div className="absolute top-1/2 -left-1 w-2 h-2 bg-gray-300 rounded-full z-10"></div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-48 h-24 border-2 border-gray-200 border-dashed rounded flex items-center justify-center text-xs text-gray-400 italic">
                                                            Discussion Ongoing...
                                                        </div>
                                                    )}
                                                </div>

                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center w-full h-full text-gray-400 gap-4 opacity-50">
                                                <GitCommitHorizontal size={48} />
                                                <div className="text-sm font-mono">Select a flow to view rationale schematic</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- CONVERSATION ANALYSIS TAB --- */}
                        {activeTab === 'ANALYSIS' && (
                            <div className="flex h-full w-full">
                                {/* OVERVIEW SIDEBAR */}
                                <div className="w-72 border-r border-gray-200 bg-white overflow-y-auto shrink-0 flex flex-col">
                                    <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Select Component</div>
                                    </div>
                                    {threads.map(thread => (
                                        <button
                                            key={thread.id}
                                            onClick={() => setSelectedThreadId(thread.id)}
                                            className={clsx(
                                                "p-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors group relative",
                                                selectedThreadId === thread.id ? "bg-purple-50/50 border-r-4 border-r-purple-500" : ""
                                            )}
                                        >
                                            <div className="font-mono text-xs font-bold text-gray-800 mb-1">{thread.component}</div>
                                            
                                            {/* Pattern Badges */}
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {thread.patterns.map(p => (
                                                    <span key={p} className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100 font-bold">{p}</span>
                                                ))}
                                                {thread.patterns.length === 0 && <span className="text-[9px] text-gray-400 italic">No patterns detected</span>}
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* ANALYSIS CANVAS */}
                                <div className="flex-1 bg-white overflow-hidden flex flex-col">
                                    {activeThread ? (
                                        <div className="flex flex-col h-full">
                                            {/* Top: Stats Header */}
                                            <div className="p-6 border-b border-gray-100 bg-gray-50/30 flex justify-between items-start">
                                                <div>
                                                    <div className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                                                        <Box size={20} className="text-gray-400" />
                                                        {activeThread.component}
                                                    </div>
                                                    <div className="flex gap-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Msg Count</span>
                                                            <span className="text-lg font-mono text-gray-700">{activeThread.allMessages.length}</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Participants</span>
                                                            <span className="text-lg font-mono text-gray-700">{new Set(activeThread.allMessages.map(m => m.agentId)).size}</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Duration</span>
                                                            <span className="text-lg font-mono text-gray-700">{(activeThread.allMessages.length * 1.5).toFixed(0)}s</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Pattern Cards */}
                                                <div className="flex gap-2">
                                                    {activeThread.patterns.map(p => (
                                                        <div key={p} className="bg-purple-50 border border-purple-100 p-3 rounded-lg flex flex-col items-center min-w-[100px]">
                                                            <Activity size={16} className="text-purple-500 mb-1" />
                                                            <div className="text-xs font-bold text-purple-800 uppercase">{p}</div>
                                                            <div className="text-[9px] text-purple-600 opacity-70">Detected</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Center: Timeline Visualization */}
                                            <div className="h-48 border-b border-gray-200 p-4 relative overflow-hidden bg-white shrink-0">
                                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <BarChart2 size={12}/> Interaction Density X-Ray
                                                </div>
                                                
                                                <div className="absolute top-1/2 left-4 right-4 h-px bg-gray-100"></div>
                                                <div className="flex items-center h-24 gap-1 overflow-x-auto custom-scrollbar pb-2 px-2">
                                                    {activeThread.allMessages.map((msg, i) => {
                                                        const role = classifyMessage(msg.text);
                                                        const colorClass = getRoleColor(role); // e.g., "bg-red-400 text-red-900..."
                                                        // Extract just the bg color for the bar
                                                        const bgClass = colorClass.split(' ')[0]; 

                                                        return (
                                                            <div key={msg.id} className="group relative shrink-0 flex flex-col items-center justify-center h-full w-3 hover:w-48 hover:z-10 transition-all duration-300">
                                                                <div className={clsx("w-1.5 h-12 rounded-full opacity-80 group-hover:h-16 group-hover:opacity-100 transition-all", bgClass)}></div>
                                                                
                                                                {/* Hover Detail Card */}
                                                                <div className="absolute bottom-full mb-2 bg-gray-900 text-white p-3 rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 w-64 -translate-x-1/2 left-1/2">
                                                                    <div className="flex items-center justify-between mb-1">
                                                                         <span className="font-bold text-[10px] uppercase text-gray-400">{role}</span>
                                                                         <span className="font-mono text-[9px] text-gray-500">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                                                                    </div>
                                                                    <div className="text-xs leading-snug italic">"{msg.text}"</div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                                
                                                {/* Legend */}
                                                <div className="flex gap-3 justify-end mt-2 opacity-50">
                                                    {['OBSERVATION', 'TRIGGER', 'RATIONALE', 'DECISION'].map(role => (
                                                        <div key={role} className="flex items-center gap-1">
                                                            <div className={clsx("w-2 h-2 rounded-full", getRoleColor(role as any).split(' ')[0])}></div>
                                                            <span className="text-[8px] text-gray-500 font-bold">{role}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Bottom: Coded Transcript */}
                                            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                                                <div className="max-w-3xl mx-auto flex flex-col gap-3">
                                                    {activeThread.allMessages.map(msg => {
                                                        const role = classifyMessage(msg.text);
                                                        const agent = agents.find(a => a.id === msg.agentId);
                                                        const colorClass = getRoleColor(role);
                                                        
                                                        return (
                                                            <div key={msg.id} className="flex gap-4 group">
                                                                <div className="w-24 text-right pt-2">
                                                                    <div className="text-[10px] font-bold font-mono text-gray-500 uppercase">{role}</div>
                                                                </div>
                                                                <div className="relative">
                                                                    <div className="absolute top-3 -left-[5px] w-2 h-2 bg-gray-300 rounded-full border-2 border-white"></div>
                                                                    <div className="absolute top-0 bottom-0 -left-px w-px bg-gray-200 -z-10 group-last:bottom-auto group-last:h-4"></div>
                                                                </div>
                                                                <div className="flex-1 bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col gap-1 hover:shadow-md transition-shadow">
                                                                    <div className="flex items-center gap-2 mb-0.5">
                                                                        <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{backgroundColor: agent?.color}}>{agent?.name[0]}</div>
                                                                        <span className="text-xs font-bold text-gray-700">{agent?.name}</span>
                                                                        <span className="text-[9px] text-gray-400 font-mono ml-auto">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                                                                    </div>
                                                                    <div className="text-sm text-gray-800">
                                                                        {msg.text}
                                                                    </div>
                                                                    {/* Tag Badge */}
                                                                    <div className="mt-1">
                                                                        <span className={clsx("text-[9px] px-1.5 py-0.5 rounded font-bold uppercase inline-block", colorClass)}>
                                                                            {role}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>

                                        </div>
                                    ) : (
                                         <div className="flex flex-col items-center justify-center w-full h-full text-gray-400 gap-4 opacity-50">
                                            <Search size={48} />
                                            <div className="text-sm font-mono">Select a component to analyze conversation dynamics</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>

                    {/* RIGHT PANEL: CONTEXTUAL TRANSCRIPT (Always Visible) */}
                    <div className="w-80 bg-white border-l border-gray-200 flex flex-col shrink-0">
                        <div className="p-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2 text-gray-500 font-bold text-xs uppercase">
                            <MessageSquare size={14} /> Source Context
                        </div>
                        <div 
                            ref={transcriptRef}
                            className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar bg-gray-50/30 relative"
                        >
                            {chatHistory.map(msg => {
                                const agent = agents.find(a => a.id === msg.agentId);
                                const isHighlighted = highlightedMsgIds.includes(msg.id);
                                
                                return (
                                    <div 
                                        key={msg.id}
                                        id={`summary-msg-${msg.id}`}
                                        className={clsx(
                                            "text-xs p-2 rounded transition-all duration-300",
                                            isHighlighted 
                                                ? "bg-white border-l-4 border-blue-500 shadow-md opacity-100 scale-105 my-1" 
                                                : "opacity-50 grayscale"
                                        )}
                                    >
                                        <div className="flex items-center gap-1 mb-1">
                                             <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: agent?.color}}></div>
                                             <span className="font-mono font-bold text-[10px]" style={{color: agent?.color}}>{agent?.name}</span>
                                        </div>
                                        <div className="text-gray-700 leading-snug">{msg.text}</div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

// Sub-component for Draggable Card
const SummaryCard: React.FC<{ 
    card: any, 
    agents: any[], 
    setHover: (id: string | null) => void, 
    onClick: () => void,
    color: string 
}> = ({ card, agents, setHover, onClick, color }) => {
    const agent = agents.find(a => a.id === card.agentId);
    return (
        <div 
            draggable 
            onDragStart={(e) => e.dataTransfer.setData("cardId", card.id)}
            onMouseEnter={() => setHover(card.id)}
            onMouseLeave={() => setHover(null)}
            onClick={onClick}
            className={clsx(
                "p-3 rounded-lg cursor-grab active:cursor-grabbing hover:scale-[1.02] transition-all relative",
                color
            )}
        >
            <div className="font-bold text-gray-800 text-xs mb-1 leading-tight">{card.title}</div>
            <div className="text-[10px] text-gray-500 italic mb-2 line-clamp-2">"{card.description}"</div>
            
            <div className="flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
                <div className="flex items-center gap-1.5">
                     <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shadow-sm" style={{backgroundColor: agent?.color}}>
                        {agent?.name[0]}
                    </div>
                </div>
                
                {card.affectedRequirementIds && card.affectedRequirementIds.length > 0 && (
                     <div className="flex items-center gap-1 text-[9px] text-orange-500 font-bold bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">
                        <Scale size={8} /> REQ LINKED
                     </div>
                )}
            </div>
        </div>
    )
}

export default MeetingSummary;
