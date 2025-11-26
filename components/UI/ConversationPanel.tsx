
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { 
    MessageSquare, Info, SplitSquareHorizontal, 
    ChevronRight, ChevronLeft, FileText, Database, Link as LinkIcon,
    CheckCircle2, AlertTriangle, Lightbulb, Activity, LocateFixed, BookOpen,
    HelpCircle
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
    requirements
  } = useStore();

  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedCard, setSelectedCard] = useState<InsightCard | null>(null);
  const [activeTab, setActiveTab] = useState<'LIVE' | 'DOCS'>('LIVE');
  const [showExplainer, setShowExplainer] = useState(false);
  
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

        <div className="absolute right-6 top-20 bottom-20 w-80 flex flex-col gap-3 pointer-events-none z-[40] animate-in slide-in-from-right-8 duration-300">
            
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
            <div className="flex-1 min-h-0 flex flex-col pointer-events-auto bg-white/90 backdrop-blur-md rounded-lg border border-gray-200 shadow-sm overflow-hidden transition-colors">
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
                        {insightCards.length}
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-3 custom-scrollbar">
                    {insightCards.length === 0 && (
                        <div className="text-center p-8 text-gray-400 text-xs italic flex flex-col items-center gap-2">
                            <Info size={20} className="opacity-20" />
                            Waiting for collaboration signals...
                        </div>
                    )}
                    {insightCards.map(card => {
                        const agent = agents.find(a => a.id === card.agentId);
                        
                        let Icon = Info;
                        let colorClass = "bg-gray-100 text-gray-700";
                        
                        if (card.type === 'RISK') { Icon = AlertTriangle; colorClass = "bg-red-50 text-red-600 border-red-100"; }
                        if (card.type === 'ACTION') { Icon = CheckCircle2; colorClass = "bg-blue-50 text-blue-600 border-blue-100"; }
                        if (card.type === 'RATIONALE') { Icon = Lightbulb; colorClass = "bg-amber-50 text-amber-600 border-amber-100"; }

                        return (
                            <div 
                                key={card.id} 
                                onClick={() => setSelectedCard(card)}
                                onMouseEnter={() => {
                                    setHoveredSourceIds(card.sourceMessageIds || []);
                                    // Override sticky scroll to focus on source
                                    setIsSticky(false);
                                    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);

                                    if (card.sourceMessageIds && card.sourceMessageIds.length > 0) {
                                        if (activeTab === 'LIVE') scrollToMessage(card.sourceMessageIds[0]);
                                    }
                                }}
                                onMouseLeave={() => {
                                    setHoveredSourceIds([]);
                                    // Start timer to resume live feed
                                    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
                                    activityTimeoutRef.current = setTimeout(() => setIsSticky(true), 4000);
                                }}
                                className="bg-white border border-gray-100 rounded shadow-sm flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-500 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all relative group"
                            >
                                {/* Card Header */}
                                <div className="p-2.5 flex flex-col gap-1.5 border-b border-gray-50">
                                    <div className="flex items-start justify-between">
                                        <div className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide flex items-center gap-1", colorClass)}>
                                            <Icon size={10} />
                                            {card.type}
                                        </div>
                                        
                                        {/* Actions Row (Top Right) */}
                                        <div className="flex items-center gap-1">
                                            {card.sourceMessageIds && card.sourceMessageIds.length > 0 && (
                                                <button 
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        // Scroll to the first message in the cluster
                                                        if (activeTab === 'LIVE') {
                                                            scrollToMessage(card.sourceMessageIds![0]); 
                                                        } else {
                                                            setActiveTab('LIVE');
                                                            setTimeout(() => scrollToMessage(card.sourceMessageIds![0]), 100);
                                                        }
                                                    }}
                                                    className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-600 transition-colors"
                                                    title="Locate Source in Transcript"
                                                >
                                                    <LocateFixed size={12} />
                                                </button>
                                            )}
                                            <span className="text-[9px] text-gray-300 font-mono">
                                                {new Date(card.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="text-xs font-semibold text-gray-800 leading-tight">
                                        {card.title}
                                    </div>
                                    
                                    <div className="text-[10px] text-gray-500 leading-relaxed pl-2 border-l-2 border-gray-100 italic truncate">
                                        "{card.description}"
                                    </div>
                                    
                                    {agent && (
                                        <div className="flex items-center gap-1.5 mt-1 justify-end">
                                            <span className="text-[9px] text-gray-400 font-medium">Detected from</span>
                                            <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: agent.color}}></div>
                                            <span className="text-[9px] text-gray-500 font-mono font-bold">{agent.name}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Action Footer */}
                                <div className="flex divide-x divide-gray-100 bg-gray-50/50">
                                    <button className="flex-1 py-1.5 flex items-center justify-center gap-1 hover:bg-white transition-colors group/btn" title="Add to Meeting Notes">
                                        <FileText size={10} className="text-gray-400 group-hover/btn:text-gray-700" />
                                        <span className="text-[9px] font-bold text-gray-400 group-hover/btn:text-gray-700">Notes</span>
                                    </button>
                                    <button className="flex-1 py-1.5 flex items-center justify-center gap-1 hover:bg-white transition-colors group/btn" title="Add to Knowledge Base">
                                        <Database size={10} className="text-gray-400 group-hover/btn:text-gray-700" />
                                        <span className="text-[9px] font-bold text-gray-400 group-hover/btn:text-gray-700">KB</span>
                                    </button>
                                    <button className="flex-1 py-1.5 flex items-center justify-center gap-1 hover:bg-white transition-colors group/btn" title="Link to PLM">
                                        <LinkIcon size={10} className="text-gray-400 group-hover/btn:text-gray-700" />
                                        <span className="text-[9px] font-bold text-gray-400 group-hover/btn:text-gray-700">PLM</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --- LOWER PANEL: TABS (Chat vs Docs) --- */}
            <div className="h-1/4 pointer-events-auto bg-black/90 backdrop-blur-md rounded-lg border border-gray-800 shadow-lg overflow-hidden flex flex-col transition-colors duration-300">
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
