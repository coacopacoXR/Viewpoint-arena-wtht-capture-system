import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { 
    CheckCircle2, AlertTriangle, Lightbulb, FileText, Download, 
    ShieldAlert, X, Scale, MessageSquare, ArrowRight, LayoutDashboard, List,
    Users, Box, GitCommitHorizontal, Clock, Building2, User
} from 'lucide-react';
import { clsx } from 'clsx';
import { InsightType, InsightCard } from '../../types';
import InsightDetailModal from './InsightDetailModal';

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

    const [activeTab, setActiveTab] = useState<'DECISIONS' | 'REQUIREMENTS' | 'ASSIGNEES' | 'COMPONENTS' | 'THREADS'>('DECISIONS');
    const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
    const [selectedCard, setSelectedCard] = useState<InsightCard | null>(null);
    
    // Assignee View Mode
    const [assigneeMode, setAssigneeMode] = useState<'INDIVIDUAL' | 'DEPARTMENT'>('INDIVIDUAL');

    // Transcript Scrolling Ref
    const transcriptRef = useRef<HTMLDivElement>(null);

    // --- AUTO SCROLL LOGIC ---
    useEffect(() => {
        if (!hoveredCardId || !transcriptRef.current) return;
        
        const card = insightCards.find(c => c.id === hoveredCardId);
        if (card && card.sourceMessageIds && card.sourceMessageIds.length > 0) {
            // Find the first message element in the summary view
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

                // Highlight Effect
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

    // Helper to get highlighted message IDs
    const getHighlightedMessageIds = () => {
        if (!hoveredCardId) return [];
        const card = insightCards.find(c => c.id === hoveredCardId);
        return card?.sourceMessageIds || [];
    };
    
    const highlightedMsgIds = getHighlightedMessageIds();
    
    // Helper to check requirement linkage
    const getHighlightedReqIds = () => {
        if (!hoveredCardId) return [];
        const card = insightCards.find(c => c.id === hoveredCardId);
        return card?.affectedRequirementIds || [];
    };
    const highlightedReqIds = getHighlightedReqIds();

    // --- DATA GROUPING HELPERS ---

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

    // Group cards that were created close together or share context
    const getThreads = () => {
        // Sort cards by timestamp
        const sorted = [...insightCards].sort((a, b) => a.timestamp - b.timestamp);
        return sorted;
    };

    return (
        <div className="fixed inset-0 z-50 bg-[#F2F2F2] flex flex-col items-center justify-center p-4 animate-in fade-in duration-300 pointer-events-auto">
            
            {/* Modal for Editing */}
            {selectedCard && (
                <InsightDetailModal 
                    card={selectedCard}
                    onClose={() => setSelectedCard(null)}
                    agentColor={agents.find(a => a.id === selectedCard.agentId)?.color}
                />
            )}

            {/* --- DASHBOARD CONTAINER --- */}
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
                            <GitCommitHorizontal size={14} /> Threads
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

                {/* --- MAIN CONTENT AREA --- */}
                <div className="flex-1 flex overflow-hidden">
                    
                    {/* LEFT PANEL: VARIES BY TAB */}
                    <div className="flex-1 bg-gray-50/50 p-6 overflow-y-auto border-r border-gray-200 relative">
                        
                        {/* 1. KANBAN BOARD */}
                        {activeTab === 'DECISIONS' && (
                            <div className="grid grid-cols-3 gap-6 h-full min-h-[500px]">
                                {/* RISK COLUMN */}
                                <div 
                                    className="flex flex-col gap-3 h-full bg-red-50/30 rounded-lg p-2 border border-dashed border-red-200"
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, 'RISK')}
                                >
                                    <div className="flex items-center gap-2 text-red-800 font-bold text-sm uppercase px-2 py-1">
                                        <ShieldAlert size={16}/> Risks ({risks.length})
                                    </div>
                                    {risks.map(card => (
                                        <SummaryCard 
                                            key={card.id} 
                                            card={card} 
                                            agents={agents} 
                                            setHover={setHoveredCardId} 
                                            onClick={() => setSelectedCard(card)}
                                            color="bg-white border-red-200 shadow-sm"
                                        />
                                    ))}
                                </div>

                                {/* ACTION COLUMN */}
                                <div 
                                    className="flex flex-col gap-3 h-full bg-blue-50/30 rounded-lg p-2 border border-dashed border-blue-200"
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, 'ACTION')}
                                >
                                    <div className="flex items-center gap-2 text-blue-800 font-bold text-sm uppercase px-2 py-1">
                                        <CheckCircle2 size={16}/> Actions ({actions.length})
                                    </div>
                                    {actions.map(card => (
                                        <SummaryCard 
                                            key={card.id} 
                                            card={card} 
                                            agents={agents} 
                                            setHover={setHoveredCardId}
                                            onClick={() => setSelectedCard(card)}
                                            color="bg-white border-blue-200 shadow-sm" 
                                        />
                                    ))}
                                </div>

                                {/* RATIONALE COLUMN */}
                                <div 
                                    className="flex flex-col gap-3 h-full bg-amber-50/30 rounded-lg p-2 border border-dashed border-amber-200"
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, 'RATIONALE')}
                                >
                                    <div className="flex items-center gap-2 text-amber-800 font-bold text-sm uppercase px-2 py-1">
                                        <Lightbulb size={16}/> Rationale ({rationale.length})
                                    </div>
                                    {rationale.map(card => (
                                        <SummaryCard 
                                            key={card.id} 
                                            card={card} 
                                            agents={agents} 
                                            setHover={setHoveredCardId}
                                            onClick={() => setSelectedCard(card)}
                                            color="bg-white border-amber-200 shadow-sm" 
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 2. REQUIREMENTS MATRIX */}
                        {activeTab === 'REQUIREMENTS' && (
                            <div className="flex flex-col gap-3">
                                <h2 className="text-sm font-bold uppercase text-gray-500 mb-2">Requirements Traceability Matrix</h2>
                                {requirements.map(req => {
                                    const linkedCards = insightCards.filter(c => c.affectedRequirementIds?.includes(req.id));
                                    const isHighlight = highlightedReqIds.includes(req.id);
                                    
                                    return (
                                        <div 
                                            key={req.id} 
                                            className={clsx(
                                                "bg-white border p-4 rounded-lg flex items-start justify-between transition-all duration-300",
                                                isHighlight ? "ring-2 ring-orange-400 border-orange-400 shadow-lg scale-[1.01]" : "border-gray-200"
                                            )}
                                        >
                                            <div className="flex flex-col gap-1 max-w-2xl">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono font-bold text-orange-600 text-sm">{req.code}</span>
                                                    <span className={clsx(
                                                        "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                                                        req.status === 'MET' ? "bg-green-100 text-green-700" :
                                                        req.status === 'AT_RISK' ? "bg-red-100 text-red-700" :
                                                        "bg-yellow-100 text-yellow-700"
                                                    )}>
                                                        {req.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <div className="text-sm text-gray-700">{req.description}</div>
                                            </div>

                                            {/* Linked Evidence */}
                                            {linkedCards.length > 0 && (
                                                <div className="flex flex-col gap-2 items-end">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase">Linked Decisions</span>
                                                    <div className="flex flex-col gap-1">
                                                        {linkedCards.map(c => (
                                                            <div 
                                                                key={c.id} 
                                                                onMouseEnter={() => setHoveredCardId(c.id)}
                                                                onMouseLeave={() => setHoveredCardId(null)}
                                                                onClick={() => setSelectedCard(c)}
                                                                className="text-[10px] px-2 py-1 bg-gray-100 rounded border border-gray-200 hover:bg-gray-200 cursor-pointer"
                                                            >
                                                                {c.title}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* 3. ASSIGNEE VIEW */}
                        {activeTab === 'ASSIGNEES' && (
                             <div className="flex flex-col h-full">
                                 {/* Toggle Header */}
                                 <div className="flex justify-center mb-6">
                                     <div className="bg-white border border-gray-300 rounded-lg p-1 flex">
                                         <button 
                                            onClick={() => setAssigneeMode('INDIVIDUAL')}
                                            className={clsx(
                                                "px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all",
                                                assigneeMode === 'INDIVIDUAL' ? "bg-blue-100 text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                                            )}
                                         >
                                             <User size={14}/> Individual
                                         </button>
                                         <button 
                                            onClick={() => setAssigneeMode('DEPARTMENT')}
                                            className={clsx(
                                                "px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all",
                                                assigneeMode === 'DEPARTMENT' ? "bg-blue-100 text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                                            )}
                                         >
                                             <Building2 size={14}/> Department
                                         </button>
                                     </div>
                                 </div>

                                 <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                    {Object.entries(getCardsByAssignee()).map(([groupName, cards]) => (
                                        <div 
                                            key={groupName} 
                                            className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col overflow-hidden"
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleAssigneeDrop(e, groupName)}
                                        >
                                            <div className="bg-gray-50 border-b border-gray-100 p-3 flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs border border-blue-200">
                                                    {groupName.charAt(0)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="text-sm font-bold text-gray-800">{groupName}</div>
                                                    <div className="text-[10px] text-gray-500 font-mono">{cards.length} Tasks Assigned</div>
                                                </div>
                                            </div>
                                            <div className="p-2 flex flex-col gap-2 bg-gray-50/50 flex-1 min-h-[100px]">
                                                {cards.map(card => (
                                                     <SummaryCard 
                                                        key={card.id} 
                                                        card={card} 
                                                        agents={agents} 
                                                        setHover={setHoveredCardId}
                                                        onClick={() => setSelectedCard(card)}
                                                        color="bg-white border-gray-200 shadow-sm" 
                                                    />
                                                ))}
                                                {cards.length === 0 && (
                                                    <div className="h-full flex items-center justify-center text-[10px] text-gray-400 border-2 border-dashed border-gray-200 rounded">
                                                        Drop here to reassign
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                 </div>
                             </div>
                        )}

                        {/* 4. COMPONENT VIEW */}
                        {activeTab === 'COMPONENTS' && (
                             <div className="flex flex-col gap-4 max-w-4xl mx-auto">
                                {Object.entries(getCardsByComponent()).map(([component, cards]) => {
                                    const riskCount = cards.filter(c => c.type === 'RISK').length;
                                    const actionCount = cards.filter(c => c.type === 'ACTION').length;
                                    
                                    return (
                                        <div key={component} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-all">
                                            <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                                                <div className="flex items-center gap-3">
                                                    <Box size={16} className="text-gray-400" />
                                                    <span className="font-bold text-sm text-gray-800 font-mono">{component}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    {riskCount > 0 && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">{riskCount} Risks</span>}
                                                    {actionCount > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">{actionCount} Actions</span>}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {cards.map(card => (
                                                     <div 
                                                        key={card.id} 
                                                        onClick={() => setSelectedCard(card)}
                                                        onMouseEnter={() => setHoveredCardId(card.id)}
                                                        onMouseLeave={() => setHoveredCardId(null)}
                                                        className="text-xs p-2 bg-gray-50 border border-gray-200 rounded cursor-pointer hover:bg-gray-100 flex items-center justify-between"
                                                     >
                                                        <span>{card.title}</span>
                                                        <span className="text-[9px] text-gray-400 font-mono">{card.type}</span>
                                                     </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                             </div>
                        )}

                        {/* 5. THREAD VIEW (Schematic Flow) */}
                        {activeTab === 'THREADS' && (
                            <div className="max-w-4xl mx-auto py-4">
                                <div className="flex flex-col gap-6">
                                    {getThreads().map(card => {
                                        const sourceMsgs = chatHistory.filter(m => card.sourceMessageIds?.includes(m.id));
                                        const firstMsg = sourceMsgs[0];
                                        const agent = agents.find(a => a.id === card.agentId);
                                        const reqs = requirements.filter(r => card.affectedRequirementIds?.includes(r.id));
                                        
                                        return (
                                            <div key={card.id} className="group relative">
                                                
                                                <div className="flex items-stretch gap-4">
                                                    
                                                    {/* NODE 1: CONTEXT (Component + Reqs) */}
                                                    <div className="w-1/4 flex flex-col items-end justify-center">
                                                        <div className="bg-white border border-gray-300 rounded p-3 shadow-sm text-right w-full relative group-hover:border-black transition-colors">
                                                            <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Context Scope</div>
                                                            <div className="font-mono text-xs font-bold text-gray-800 truncate">{card.details.componentReference || "System"}</div>
                                                            {reqs.length > 0 && (
                                                                <div className="mt-1 flex flex-wrap justify-end gap-1">
                                                                    {reqs.map(r => (
                                                                        <span key={r.id} className="text-[8px] bg-orange-100 text-orange-700 px-1 rounded font-mono">{r.code}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {/* Connector Dot */}
                                                            <div className="absolute top-1/2 -right-1.5 w-3 h-3 bg-white border-2 border-gray-300 rounded-full z-10"></div>
                                                        </div>
                                                    </div>

                                                    {/* CONNECTOR 1 */}
                                                    <div className="flex items-center justify-center w-8 relative">
                                                        <div className="h-0.5 w-full bg-gray-300"></div>
                                                        <ArrowRight size={14} className="text-gray-400 absolute" />
                                                    </div>

                                                    {/* NODE 2: TRIGGER (Conversation) */}
                                                    <div className="w-1/3 flex flex-col justify-center">
                                                        <div className="bg-gray-50 border border-gray-200 rounded p-3 relative group-hover:border-gray-400 transition-colors">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <MessageSquare size={12} className="text-gray-400"/>
                                                                <span className="text-[10px] font-bold text-gray-500 uppercase">Trigger Event</span>
                                                            </div>
                                                            <div className="text-xs text-gray-600 italic leading-snug">
                                                                "{firstMsg ? firstMsg.text.substring(0, 80) + (firstMsg.text.length>80?"...":"") : "Manual Capture"}"
                                                            </div>
                                                            <div className="mt-2 flex items-center gap-1.5">
                                                                <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: agent?.color}}></div>
                                                                <span className="text-[9px] font-mono font-bold text-gray-500">{agent?.name}</span>
                                                            </div>
                                                            {/* Connector Dot */}
                                                            <div className="absolute top-1/2 -right-1.5 w-3 h-3 bg-gray-50 border-2 border-gray-300 rounded-full z-10"></div>
                                                            <div className="absolute top-1/2 -left-1.5 w-3 h-3 bg-gray-50 border-2 border-gray-300 rounded-full z-10"></div>
                                                        </div>
                                                    </div>

                                                    {/* CONNECTOR 2 */}
                                                    <div className="flex items-center justify-center w-8 relative">
                                                        <div className="h-0.5 w-full bg-gray-300"></div>
                                                        <ArrowRight size={14} className="text-gray-400 absolute" />
                                                    </div>

                                                    {/* NODE 3: RESOLUTION (Card) */}
                                                    <div className="flex-1">
                                                         <SummaryCard 
                                                            card={card} 
                                                            agents={agents} 
                                                            setHover={setHoveredCardId}
                                                            onClick={() => setSelectedCard(card)}
                                                            color={clsx(
                                                                "bg-white border-l-4 shadow-sm h-full group-hover:shadow-md transition-all",
                                                                card.type === 'RISK' ? "border-l-red-500 border-gray-200" :
                                                                card.type === 'ACTION' ? "border-l-blue-500 border-gray-200" :
                                                                "border-l-amber-500 border-gray-200"
                                                            )} 
                                                        />
                                                    </div>

                                                </div>
                                            </div>
                                        )
                                    })}
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