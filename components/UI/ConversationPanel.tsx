
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import {
    MessageSquare, Info, SplitSquareHorizontal,
    ChevronRight, ChevronLeft, GripVertical,
    CheckCircle2, AlertTriangle, Lightbulb, Activity, LocateFixed, BookOpen,
    HelpCircle, Check, X, ShieldOff
} from 'lucide-react';
import { clsx } from 'clsx';
import { ViewMode, InsightCard } from '../../types';
import InsightDetailModal from './InsightDetailModal';
import InsightExplainer from './InsightExplainer';

// --- MAIN PANEL ---

const ConversationPanel: React.FC = () => {
  const {
    chatHistory,
    insightCards,
    agents,
    viewMode,
    splitScreenTargetId,
    setSplitScreenTarget,
    requirements,
    isPrivacyMode,
    updateInsight
  } = useStore();

  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedCard, setSelectedCard] = useState<InsightCard | null>(null);
  const [activeTab, setActiveTab] = useState<'LIVE' | 'DOCS'>('LIVE');
  const [showExplainer, setShowExplainer] = useState(false);

  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState(320);
  const [insightPanelRatio, setInsightPanelRatio] = useState(0.65); // Top panel takes 65%
  const [isResizingWidth, setIsResizingWidth] = useState(false);
  const [isResizingHeight, setIsResizingHeight] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle width resize
  const handleWidthMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingWidth(true);
  }, []);

  // Handle height resize between insight and transcript panels
  const handleHeightMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingHeight(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingWidth && panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect();
        const newWidth = rect.right - e.clientX;
        setPanelWidth(Math.max(280, Math.min(600, newWidth)));
      }
      if (isResizingHeight && panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect();
        const relativeY = e.clientY - rect.top;
        const ratio = relativeY / rect.height;
        setInsightPanelRatio(Math.max(0.3, Math.min(0.8, ratio)));
      }
    };

    const handleMouseUp = () => {
      setIsResizingWidth(false);
      setIsResizingHeight(false);
    };

    if (isResizingWidth || isResizingHeight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingWidth, isResizingHeight]);

  // Accept/Reject insight handlers
  const handleAcceptInsight = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateInsight(cardId, { details: { ...insightCards.find(c => c.id === cardId)?.details!, status: 'Approved' } });
  };

  const handleRejectInsight = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateInsight(cardId, { details: { ...insightCards.find(c => c.id === cardId)?.details!, status: 'Rejected' } });
  };
  
  // Hover state for "Source Tracing" (Array of IDs)
  const [hoveredSourceIds, setHoveredSourceIds] = useState<string[]>([]);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Scroll Logic Refs
  const [isSticky, setIsSticky] = useState(true);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSplit = viewMode === ViewMode.SPLIT_SCREEN;

  // Auto-scroll to bottom when Sticky Mode is active and new messages arrive
  useEffect(() => {
      if (isSticky && chatContainerRef.current && activeTab === 'LIVE') {
          const container = chatContainerRef.current;
          container.scrollTo({
              top: container.scrollHeight,
              behavior: 'smooth'
          });
      }
  }, [chatHistory, isSticky, activeTab]);

  // Robust Manual Scroll to specific message
  const scrollToMessage = (msgId: string) => {
      if (!chatContainerRef.current || activeTab !== 'LIVE') return;
      
      // Disable sticky mode when manually targeting a message
      setIsSticky(false);
      if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);

      const el = document.getElementById(`msg-${msgId}`);
      
      if (el) {
          const container = chatContainerRef.current;
          // Calculate position to center the element
          const topPos = el.offsetTop;
          const centerOffset = (container.clientHeight / 2) - (el.clientHeight / 2);
          
          container.scrollTo({
              top: Math.max(0, topPos - centerOffset),
              behavior: 'smooth'
          });

          // Flash highlight effect
          el.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
          setTimeout(() => {
              el.style.backgroundColor = "";
          }, 1500);
      }
  };

  // Handle user scrolling
  const handleScroll = () => {
      if (!chatContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      
      // Check if we are at the bottom (with some tolerance)
      const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 50;

      if (isAtBottom) {
          setIsSticky(true);
          if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
      } else {
          // User scrolled up
          if (isSticky) setIsSticky(false);
          
          // Reset timeout on every scroll event
          if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
          
          // Only start inactivity timer if we are NOT currently hovering an insight card (reading context)
          if (hoveredSourceIds.length === 0) {
            activityTimeoutRef.current = setTimeout(() => {
                setIsSticky(true), 4000;
            }, 4000); // Resume auto-scroll after 4s inactivity
          }
      }
  };

  if (!isExpanded) {
      return (
        <div className="absolute right-0 top-20 bottom-20 w-10 flex flex-col items-center gap-4 pointer-events-auto z-[40]">
            <button 
                onClick={() => setIsExpanded(true)}
                className="w-8 h-12 bg-white border border-gray-300 rounded-l-md shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors"
                title="Open Collaboration Panel"
            >
                <ChevronLeft size={16} className="text-gray-600" />
            </button>
            
            {/* Notification Badges */}
            <div className="flex flex-col gap-2">
                {insightCards.length > 0 && (
                     <div className="w-8 h-8 bg-white rounded-full border border-gray-200 flex items-center justify-center shadow-sm relative">
                        <Info size={14} className="text-blue-600" />
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                            {insightCards.length}
                        </div>
                     </div>
                )}
                 <div className="w-8 h-8 bg-black/80 rounded-full border border-gray-600 flex items-center justify-center shadow-sm">
                    <MessageSquare size={14} className="text-white" />
                 </div>
            </div>
        </div>
      );
  }

  return (
    <>
        {/* MODAL RENDER */}
        {selectedCard && (
            <div className="relative z-[200]">
                 <InsightDetailModal 
                    card={selectedCard} 
                    onClose={() => setSelectedCard(null)}
                    agentColor={agents.find(a => a.id === selectedCard.agentId)?.color}
                />
            </div>
        )}
        
        {/* EXPLAINER RENDER */}
        {showExplainer && <InsightExplainer onClose={() => setShowExplainer(false)} />}

        <div
            ref={panelRef}
            className="absolute right-6 top-20 bottom-20 flex flex-col gap-3 pointer-events-none z-[40] animate-in slide-in-from-right-8 duration-300"
            style={{ width: `${panelWidth}px` }}
        >
            {/* Resize handle - left edge */}
            <div
                onMouseDown={handleWidthMouseDown}
                className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize pointer-events-auto hover:bg-gray-400/50 transition-colors z-50 group"
            >
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-12 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical size={12} className="text-gray-400" />
                </div>
            </div>

            {/* Privacy Mode Banner */}
            {isPrivacyMode && (
                <div className="pointer-events-auto bg-red-900/95 backdrop-blur text-white px-4 py-2 rounded-lg border border-red-700 flex items-center gap-3 shadow-lg animate-in fade-in slide-in-from-top-2">
                    <ShieldOff size={16} className="text-red-400" />
                    <div className="flex-1">
                        <div className="text-[10px] font-bold uppercase tracking-wide">Privacy Mode Active</div>
                        <div className="text-[9px] text-red-300">Transcription & insights paused</div>
                    </div>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                </div>
            )}

            {/* HEADER / TOGGLE */}
            <div className="flex justify-end pointer-events-auto">
                <button
                    onClick={() => setIsExpanded(false)}
                    className="bg-white/80 backdrop-blur border border-gray-200 rounded px-2 py-1 flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:bg-white hover:text-gray-800 transition-colors shadow-sm"
                >
                    COLLAPSE <ChevronRight size={12} />
                </button>
            </div>

            {/* --- SPLIT SCREEN AGENT SELECTOR --- */}
            {isSplit && (
                <div className="pointer-events-auto bg-white/90 backdrop-blur-md p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col gap-2 shrink-0">
                    <h2 className="text-[10px] font-bold uppercase text-gray-500 tracking-wider mb-1 flex items-center gap-2">
                        <SplitSquareHorizontal size={12} />
                        Target Agent
                    </h2>
                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                        {agents.map(agent => {
                            const isSelected = splitScreenTargetId === agent.id;
                            return (
                                <button 
                                    key={agent.id}
                                    onClick={() => setSplitScreenTarget(agent.id)}
                                    className={clsx(
                                        "flex items-center justify-between p-2 rounded border transition-all text-xs group",
                                        isSelected 
                                            ? "bg-black text-white border-black" 
                                            : "bg-white text-gray-700 border-gray-100 hover:bg-gray-50"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: agent.color}}></div>
                                        <span className="font-mono font-bold">{agent.name}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* --- INSIGHTS DECK (AI Analysis) --- */}
            <div
                className="min-h-0 flex flex-col pointer-events-auto bg-white/90 backdrop-blur-md rounded-lg border border-gray-200 shadow-sm overflow-hidden transition-colors"
                style={{ flex: `0 0 ${insightPanelRatio * 100}%` }}
            >
                <div className="p-2 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                    <button
                        onClick={() => setShowExplainer(true)}
                        className="text-[10px] font-bold uppercase text-gray-500 flex items-center gap-2 hover:text-blue-600 transition-colors group"
                        title="View AI System Logic"
                    >
                        <Info size={12} className="group-hover:text-blue-500" />
                        Detected Insights
                        <HelpCircle size={10} className="text-gray-300 group-hover:text-blue-400" />
                    </button>
                    <span className="text-[9px] bg-gray-200 text-gray-600 px-1.5 rounded-full font-mono">
                        {insightCards.filter(c => c.details.status !== 'Rejected').length}
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 custom-scrollbar">
                    {insightCards.filter(c => c.details.status !== 'Rejected').length === 0 && (
                        <div className="text-center p-8 text-gray-400 text-xs italic flex flex-col items-center gap-2">
                            <Info size={20} className="opacity-20" />
                            {isPrivacyMode ? 'Privacy mode active...' : 'Waiting for collaboration signals...'}
                        </div>
                    )}
                    {insightCards.filter(c => c.details.status !== 'Rejected').map(card => {
                        const agent = agents.find(a => a.id === card.agentId);
                        const isApproved = card.details.status === 'Approved';

                        let Icon = Info;
                        let colorClass = "bg-gray-100 text-gray-700";
                        let borderColor = "border-gray-100";

                        if (card.type === 'RISK') { Icon = AlertTriangle; colorClass = "bg-red-50 text-red-600 border-red-100"; borderColor = "border-l-red-400"; }
                        if (card.type === 'ACTION') { Icon = CheckCircle2; colorClass = "bg-blue-50 text-blue-600 border-blue-100"; borderColor = "border-l-blue-400"; }
                        if (card.type === 'RATIONALE') { Icon = Lightbulb; colorClass = "bg-amber-50 text-amber-600 border-amber-100"; borderColor = "border-l-amber-400"; }

                        return (
                            <div
                                key={card.id}
                                onClick={() => setSelectedCard(card)}
                                onMouseEnter={() => {
                                    setHoveredSourceIds(card.sourceMessageIds || []);
                                    setIsSticky(false);
                                    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
                                    if (card.sourceMessageIds && card.sourceMessageIds.length > 0) {
                                        if (activeTab === 'LIVE') scrollToMessage(card.sourceMessageIds[0]);
                                    }
                                }}
                                onMouseLeave={() => {
                                    setHoveredSourceIds([]);
                                    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
                                    activityTimeoutRef.current = setTimeout(() => setIsSticky(true), 4000);
                                }}
                                className={clsx(
                                    "bg-white border-l-4 rounded shadow-sm flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-500 cursor-pointer hover:shadow-md transition-all relative group",
                                    borderColor,
                                    isApproved && "opacity-60"
                                )}
                            >
                                {/* Simplified Card Content */}
                                <div className="p-3 flex flex-col gap-1.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <div className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide flex items-center gap-1 shrink-0", colorClass)}>
                                                <Icon size={10} />
                                                {card.type}
                                            </div>
                                            <span className="text-[9px] text-gray-300 font-mono shrink-0">
                                                {new Date(card.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="text-xs font-semibold text-gray-800 leading-tight">
                                        {card.title}
                                    </div>

                                    <div className="text-[10px] text-gray-500 leading-relaxed line-clamp-2">
                                        {card.description}
                                    </div>

                                    {/* Agent + Accept/Reject Footer */}
                                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-1">
                                        {agent && (
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: agent.color}}></div>
                                                <span className="text-[9px] text-gray-400 font-mono">{agent.name}</span>
                                            </div>
                                        )}

                                        {/* Accept/Reject Buttons */}
                                        <div className="flex items-center gap-1">
                                            {isApproved ? (
                                                <span className="text-[9px] text-green-600 font-bold flex items-center gap-1">
                                                    <Check size={10} /> Accepted
                                                </span>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={(e) => handleAcceptInsight(card.id, e)}
                                                        className="p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                                                        title="Accept"
                                                    >
                                                        <Check size={12} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleRejectInsight(card.id, e)}
                                                        className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                                        title="Reject"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Resize handle between panels */}
            <div
                onMouseDown={handleHeightMouseDown}
                className="h-2 cursor-ns-resize pointer-events-auto flex items-center justify-center hover:bg-gray-200/50 transition-colors rounded group"
            >
                <div className="w-12 h-1 bg-gray-300 rounded-full group-hover:bg-gray-400 transition-colors"></div>
            </div>

            {/* --- LOWER PANEL: TABS (Chat vs Docs) --- */}
            <div className="flex-1 min-h-0 pointer-events-auto bg-black/90 backdrop-blur-md rounded-lg border border-gray-800 shadow-lg overflow-hidden flex flex-col transition-colors duration-300">
                {/* TAB HEADER */}
                <div className="flex border-b border-white/10 bg-black/50">
                    <button 
                        onClick={() => setActiveTab('LIVE')}
                        className={clsx(
                            "flex-1 py-2 text-[10px] font-bold uppercase flex items-center justify-center gap-2 transition-colors",
                            activeTab === 'LIVE' ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
                        )}
                    >
                        <MessageSquare size={10} />
                        Live Transcript
                    </button>
                    <div className="w-px bg-white/10"></div>
                    <button 
                        onClick={() => setActiveTab('DOCS')}
                        className={clsx(
                            "flex-1 py-2 text-[10px] font-bold uppercase flex items-center justify-center gap-2 transition-colors",
                            activeTab === 'DOCS' ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
                        )}
                    >
                        <BookOpen size={10} />
                        Requirements
                    </button>
                </div>

                {/* LIVE CHAT CONTENT */}
                {activeTab === 'LIVE' && (
                    <>
                        <div className="px-2 py-1 border-b border-white/5 flex justify-end">
                             <div className="flex items-center gap-1.5">
                                <span className={clsx("text-[8px] font-mono transition-colors", isSticky ? "text-green-500" : "text-orange-400")}>
                                    {isSticky ? "SCROLL LOCKED" : "HISTORY VIEW"}
                                </span>
                                <div className={clsx("w-1.5 h-1.5 rounded-full", isSticky ? "bg-green-500 animate-pulse" : "bg-orange-400")}></div>
                            </div>
                        </div>
                        <div 
                            ref={chatContainerRef} 
                            onScroll={handleScroll}
                            className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 scroll-smooth custom-scrollbar relative"
                        >
                            {chatHistory.length === 0 && (
                                <div className="text-gray-600 text-[10px] italic p-2">Listening...</div>
                            )}
                            {chatHistory.map(msg => {
                                const agent = agents.find(a => a.id === msg.agentId);
                                // Source Tracing Logic (Multi-message)
                                const isSource = hoveredSourceIds.includes(msg.id);
                                const isDimmed = hoveredSourceIds.length > 0 && !isSource;
                                const hasInsight = insightCards.some(c => c.sourceMessageIds?.includes(msg.id));

                                return (
                                    <div 
                                        id={`msg-${msg.id}`}
                                        key={msg.id} 
                                        className={clsx(
                                            "flex gap-2 items-start animate-in slide-in-from-bottom-1 duration-300 transition-all p-1.5 rounded",
                                            isSource ? "bg-white/10 border-l-2 border-blue-500 pl-2" : "border-l-2 border-transparent",
                                            isDimmed ? "opacity-20 blur-[1px]" : "opacity-100"
                                        )}
                                    >
                                        <div className="font-mono text-[9px] font-bold shrink-0 mt-0.5 opacity-80" style={{color: agent?.color || '#fff'}}>
                                            {agent?.name}
                                        </div>
                                        <div className="flex-1">
                                            <div className={clsx(
                                                "text-[10px] leading-snug font-light transition-colors",
                                                isSource ? "text-white" : "text-gray-300"
                                            )}>
                                                {msg.text}
                                            </div>
                                            {/* Metadata Row */}
                                            {(isSource || hasInsight) && (
                                                <div className="flex items-center gap-2 mt-1">
                                                    {hasInsight && (
                                                        <span className="text-[8px] text-blue-400 bg-blue-500/10 px-1 rounded border border-blue-500/30 flex items-center gap-1">
                                                            <Activity size={8} /> Insight Captured
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="h-2"></div> 
                        </div>
                    </>
                )}

                {/* REQUIREMENTS DOCS CONTENT */}
                {activeTab === 'DOCS' && (
                    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 custom-scrollbar">
                        {requirements.map(req => (
                            <div key={req.id} className="bg-white/5 border border-white/10 p-2 rounded text-gray-300">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-mono text-[9px] font-bold text-orange-400">{req.code}</span>
                                    <span className={clsx(
                                        "text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                                        req.status === 'MET' ? "bg-green-500/20 text-green-400" :
                                        req.status === 'AT_RISK' ? "bg-red-500/20 text-red-400" :
                                        "bg-yellow-500/20 text-yellow-400"
                                    )}>
                                        {req.status.replace('_', ' ')}
                                    </span>
                                </div>
                                <div className="text-[10px] leading-snug">{req.description}</div>
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </div>
    </>
  );
};

export default ConversationPanel;