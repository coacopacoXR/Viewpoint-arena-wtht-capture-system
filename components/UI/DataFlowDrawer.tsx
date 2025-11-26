
import React, { useState } from 'react';
import { clsx } from 'clsx';
import { 
    Mic, MousePointer2, Eye, Box, Cpu, UserCog, 
    FileText, GitCommitHorizontal, LayoutDashboard, ArrowRight,
    X
} from 'lucide-react';

interface DataFlowDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

// Tooltip Spec Data
const NODE_SPECS: Record<string, { title: string, specs: string[] }> = {
    'SPEECH': { title: "Audio Stream", specs: ["Format: 16kHz PCM", "VAD: Silero", "ASR: Whisper-tiny"] },
    'POINT': { title: "Pointer Events", specs: ["Raycast: Three.js", "Freq: 60Hz", "Target: Mesh ID"] },
    'GAZE': { title: "Attention Ray", specs: ["Vector: Forward Z", "Dwell: >300ms", "Heatmap: Additive"] },
    'CONTEXT': { title: "Active Object", specs: ["Tree Node: ID", "Metadata: Material", "State: Visible"] },
    'CAPTURE': { title: "LLM Analysis", specs: ["Model: Gemini Flash", "Prompt: Zero-shot", "Output: JSON"] },
    'CLASSIFY': { title: "Card Logic", specs: ["Intent: Trigger Words", "Sentiment: Polarity", "Priority: Heuristic"] },
    'GROUP': { title: "Thread Recon", specs: ["Cluster: Temporal", "Link: Component ID", "Chain: Causal"] },
    'OVERSIGHT': { title: "Human Loop", specs: ["Edit: CRUD", "Validate: Manual", "Override: Enabled"] },
    'CARDS': { title: "Insight Card", specs: ["Schema: v2.1", "Persist: Store", "Export: PDF/JSON"] },
    'THREADS': { title: "Rationale Flow", specs: ["Graph: DAG", "Nodes: 3 Types", "Edges: Causal"] },
    'BOARD': { title: "Summary View", specs: ["Layout: Kanban", "Filter: Faceted", "Sort: Priority"] },
};

// Reusable Node Component with Tooltip
const Node: React.FC<{ 
    id: string,
    icon: any, 
    label: string, 
    sub?: string, 
    color?: string,
    className?: string,
    onHover: (id: string | null) => void
}> = ({ id, icon: Icon, label, sub, color = "text-gray-600 border-gray-300", className, onHover }) => (
    <div 
        onMouseEnter={() => onHover(id)}
        onMouseLeave={() => onHover(null)}
        className={clsx(
            "flex flex-col items-center justify-center p-3 rounded-sm border bg-white shadow-sm relative z-10 min-w-[100px] transition-transform hover:scale-105 hover:shadow-md cursor-help pointer-events-auto",
            color,
            className
        )}
    >
        <Icon size={16} className="mb-1 opacity-80" />
        <div className="text-[9px] font-bold uppercase tracking-wider">{label}</div>
        {sub && <div className="text-[8px] font-mono text-gray-400 mt-0.5">{sub}</div>}
    </div>
);

// Animated Connector Line
const Connector: React.FC<{ length?: string, vertical?: boolean, label?: string, dashed?: boolean }> = ({ length = "w-12", vertical = false, label, dashed }) => (
    <div className={clsx(
        "flex items-center justify-center relative",
        vertical ? "flex-col h-12 w-px" : "flex-row h-px " + length
    )}>
        <div className={clsx(
            "bg-gray-300 relative overflow-visible",
            vertical ? "w-px h-full" : "h-px w-full",
            dashed && "opacity-50"
        )} style={{ borderStyle: dashed ? 'dashed' : 'solid' }}>
            <div className={clsx(
                "absolute bg-black rounded-full w-1.5 h-1.5 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                vertical ? "animate-[flow-vert_2s_infinite]" : "animate-[flow-horz_2s_infinite]"
            )}></div>
        </div>
        {label && (
            <div className="absolute -top-4 text-[8px] font-mono text-gray-400 bg-white/50 px-1 backdrop-blur-sm">
                {label}
            </div>
        )}
    </div>
);

const DataFlowDrawer: React.FC<DataFlowDrawerProps> = ({ isOpen, onClose }) => {
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);

    // Get specs for hovered node
    const activeSpec = hoveredNode ? NODE_SPECS[hoveredNode] : null;

    return (
        <>
            {/* Backdrop click to close */}
            {isOpen && <div className="fixed inset-0 z-[110] bg-black/10 backdrop-blur-[1px]" onClick={onClose}></div>}
            
            {/* Drawer Container */}
            <div 
                className={clsx(
                    "fixed bottom-0 left-0 right-0 h-[380px] z-[120] flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.1)] transition-transform duration-500 cubic-bezier(0.22, 1, 0.36, 1) pointer-events-auto",
                    isOpen ? "translate-y-0" : "translate-y-[110%]"
                )}
            >
                {/* TOOLTIP POPUP */}
                {activeSpec && (
                    <div className="absolute -top-24 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur text-white p-3 rounded-lg shadow-xl border border-gray-700 w-64 animate-in fade-in slide-in-from-bottom-2 z-[130]">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{activeSpec.title}</div>
                        <div className="flex flex-col gap-1">
                            {activeSpec.specs.map((spec, i) => (
                                <div key={i} className="text-xs font-mono text-emerald-400 flex items-center gap-2">
                                    <div className="w-1 h-1 bg-white rounded-full"></div> {spec}
                                </div>
                            ))}
                        </div>
                        {/* Little triangle arrow */}
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-black/90 rotate-45 border-r border-b border-gray-700"></div>
                    </div>
                )}

                {/* Panel Background */}
                <div className="absolute inset-0 bg-[#F2F2F2]/98 backdrop-blur-xl border-t border-gray-300 rounded-t-xl shadow-2xl"></div>
                
                {/* Header Content */}
                <div className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white/50 rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <ActivityIcon />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">System Data Architecture</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-[9px] font-mono text-gray-400 hidden md:block">DEBUG_VIEW_MODE // V.2.1.0</div>
                        <button 
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 text-gray-500 hover:text-black transition-colors pointer-events-auto"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Diagram Canvas */}
                <div className="relative z-10 flex-1 overflow-x-auto overflow-y-hidden flex items-center justify-center p-8 custom-scrollbar">
                    
                    <div className="flex items-center gap-0 scale-90 md:scale-100 origin-center min-w-[800px]">
                        
                        {/* STAGE A: INPUTS */}
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2 p-3 border border-dashed border-gray-300 rounded-lg bg-gray-50/50">
                                <div className="text-[9px] font-mono text-gray-400 uppercase mb-1 text-center">Raw Inputs</div>
                                <Node id="SPEECH" icon={Mic} label="Speech" sub="Audio Stream" onHover={setHoveredNode} />
                                <Node id="POINT" icon={MousePointer2} label="Pointing" sub="Vector3" onHover={setHoveredNode} />
                                <Node id="GAZE" icon={Eye} label="Gaze" sub="Attention Ray" onHover={setHoveredNode} />
                                <Node id="CONTEXT" icon={Box} label="Context" sub="Active Object" onHover={setHoveredNode} />
                            </div>
                        </div>

                        <div className="flex flex-col justify-center h-full px-2">
                             <Connector length="w-16" label="Events" />
                        </div>

                        {/* STAGE B: AI SYSTEM */}
                        <div className="flex flex-col items-center">
                            <div className="p-4 bg-white border-2 border-gray-800 shadow-sm rounded-lg relative">
                                <div className="absolute -top-2.5 left-4 bg-gray-800 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                                    AI Core System
                                </div>
                                
                                <div className="flex items-center gap-4">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="text-[8px] font-mono text-gray-400 uppercase">Capture</div>
                                        <Node id="CAPTURE" icon={Cpu} label="LLM Analysis" color="border-gray-200 bg-gray-50" className="w-20 h-20" onHover={setHoveredNode} />
                                    </div>

                                    <ArrowRight size={12} className="text-gray-300" />

                                    <div className="flex flex-col items-center gap-2">
                                        <div className="text-[8px] font-mono text-gray-400 uppercase">Classify</div>
                                        <Node id="CLASSIFY" icon={FileText} label="Card Logic" color="border-gray-200 bg-gray-50" className="w-20 h-20" onHover={setHoveredNode} />
                                    </div>

                                    <ArrowRight size={12} className="text-gray-300" />

                                     <div className="flex flex-col items-center gap-2">
                                        <div className="text-[8px] font-mono text-gray-400 uppercase">Group</div>
                                        <Node id="GROUP" icon={GitCommitHorizontal} label="Threading" color="border-gray-200 bg-gray-50" className="w-20 h-20" onHover={setHoveredNode} />
                                    </div>
                                </div>
                            </div>
                        </div>

                         <div className="flex flex-col justify-center h-full px-2">
                             <Connector length="w-16" label="Drafts" dashed />
                        </div>

                        {/* STAGE C: HUMAN OVERSIGHT */}
                        <div className="flex flex-col items-center gap-2">
                            <Node 
                                id="OVERSIGHT"
                                icon={UserCog} 
                                label="Oversight" 
                                sub="Edit / Validate" 
                                color="border-dashed border-gray-400 bg-transparent opacity-80" 
                                onHover={setHoveredNode}
                            />
                        </div>

                         <div className="flex flex-col justify-center h-full px-2">
                             <Connector length="w-16" label="Publish" />
                        </div>

                        {/* STAGE D: STRUCTURED OUTPUTS */}
                        <div className="flex flex-col gap-2">
                             <div className="flex flex-col gap-2 p-3 border border-gray-200 rounded-lg bg-white shadow-sm">
                                <div className="text-[9px] font-mono text-gray-400 uppercase mb-1 text-center">Structured Data</div>
                                <div className="flex flex-col gap-2">
                                    <Node id="CARDS" icon={FileText} label="Cards" className="w-24 py-2" onHover={setHoveredNode} />
                                    <Node id="THREADS" icon={GitCommitHorizontal} label="Threads" className="w-24 py-2" onHover={setHoveredNode} />
                                    <Node id="BOARD" icon={LayoutDashboard} label="Board" className="w-24 py-2" onHover={setHoveredNode} />
                                </div>
                            </div>
                        </div>

                    </div>

                </div>

                <style>{`
                    @keyframes flow-horz {
                        0% { transform: translate(-20px, -50%); opacity: 0; }
                        50% { opacity: 1; }
                        100% { transform: translate(40px, -50%); opacity: 0; }
                    }
                    @keyframes flow-vert {
                        0% { transform: translate(-50%, -20px); opacity: 0; }
                        50% { opacity: 1; }
                        100% { transform: translate(-50%, 40px); opacity: 0; }
                    }
                `}</style>
            </div>
        </>
    );
};

const ActivityIcon = () => (
    <div className="flex gap-0.5 items-end h-3">
        <div className="w-0.5 bg-emerald-500 animate-[bounce_1s_infinite] h-2"></div>
        <div className="w-0.5 bg-emerald-500 animate-[bounce_1.2s_infinite] h-3"></div>
        <div className="w-0.5 bg-emerald-500 animate-[bounce_0.8s_infinite] h-1.5"></div>
    </div>
);

export default DataFlowDrawer;
