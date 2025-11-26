import React from 'react';
import { 
  Play, Pause, RefreshCw, Eye, EyeOff, 
  Video, User, Map, Activity, Flame, Footprints,
  SplitSquareHorizontal, Sparkles, Users, ArrowRight, Box,
  CheckCircle2, Power, Layers
} from 'lucide-react';
import { useStore } from '../../store';
import { ViewMode, AgentStyle } from '../../types';
import { clsx } from 'clsx';
import ConversationPanel from './ConversationPanel';
import SceneTree from './SceneTree';
import MeetingSummary from './MeetingSummary';

const Button: React.FC<{ 
  active?: boolean; 
  onClick: () => void; 
  children: React.ReactNode;
  className?: string;
  title?: string;
}> = ({ active, onClick, children, className, title }) => (
  <button
    onClick={onClick}
    title={title}
    className={clsx(
      "w-10 h-10 flex items-center justify-center rounded-sm transition-all duration-200 pointer-events-auto border",
      active 
        ? "bg-black text-white border-black shadow-inner" 
        : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-black hover:shadow-sm",
      className
    )}
  >
    {children}
  </button>
);

const Interface: React.FC = () => {
  const {
    viewMode, setViewMode,
    showFrustums, toggleFrustums,
    showGaze, toggleGaze,
    showTrails, toggleTrails,
    isPlaying, togglePlay,
    resetTime, time,
    activeAgentId, setActiveAgent,
    leaderId, setLeader,
    splitScreenTargetId, setSplitScreenTarget,
    agents,
    agentStyle, setAgentStyle,
    agentWeights, setAgentWeight,
    endMeeting
  } = useStore();

  const handleSplitToggle = () => {
      if (viewMode === ViewMode.SPLIT_SCREEN) {
          setViewMode(ViewMode.FREE);
      } else {
          setViewMode(ViewMode.SPLIT_SCREEN);
          if (!splitScreenTargetId && agents.length > 0) {
              setSplitScreenTarget(agents[0].id);
          }
      }
  };

  const handleLeaderToggle = () => {
      if (leaderId) {
          setLeader(null);
      } else {
          setLeader('USER'); 
      }
  };
  
  const toggleAgentStyle = () => {
      const styles = [AgentStyle.BOX, AgentStyle.CAPSULE, AgentStyle.ROBOT];
      const next = styles[(styles.indexOf(agentStyle) + 1) % styles.length];
      setAgentStyle(next);
  };

  const showAIControls = viewMode === ViewMode.AI_GUIDED;

  return (
    <div className="w-full h-full p-6 relative">
      
      <MeetingSummary />

      {/* Header / Meta / Tree */}
      <div className="flex flex-col items-start pointer-events-none z-20 absolute top-6 left-6 max-h-[90vh]">
          <header className="flex flex-col gap-1 mb-2 shrink-0">
            <h1 className="font-bold tracking-tight text-lg text-neutral-900 flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full transition-colors ${isPlaying ? 'bg-orange-500 animate-pulse' : 'bg-gray-400'}`}></div>
                VIEWPOINT ARENA
            </h1>
            <div className="font-mono text-xs text-neutral-500 uppercase tracking-wide">
                Design Review Sim // {Math.floor(time * 10) / 10}s
            </div>
          </header>
          
          {/* Scene Tree Integration */}
          <SceneTree />

          {/* SYNC / LEADER CONTROLS (Moved under Tree) */}
          <div className="mt-4 pointer-events-auto animate-in slide-in-from-left-4 fade-in duration-500">
                <div className="text-[10px] font-mono uppercase text-gray-400 tracking-widest mb-1 bg-white/40 px-2 py-0.5 rounded backdrop-blur-sm shadow-sm w-fit">
                    Session Sync
                </div>
                <button 
                    onClick={handleLeaderToggle}
                    className={clsx(
                        "w-64 px-3 py-2 rounded text-xs font-mono flex items-center justify-between shadow-sm border transition-all duration-300 group",
                        leaderId 
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-indigo-200" 
                            : "bg-white/90 backdrop-blur text-gray-600 border-gray-200 hover:border-gray-400"
                    )}
                >
                    <div className="flex items-center gap-2">
                        <Users size={14} className={leaderId ? "text-white" : "text-gray-400 group-hover:text-gray-600"} />
                        <span className="font-bold">{leaderId ? "SYNC ACTIVE: LEADING" : "SYNC INACTIVE"}</span>
                    </div>
                    <div className={clsx(
                        "w-2 h-2 rounded-full",
                        leaderId ? "bg-white animate-pulse" : "bg-gray-300"
                    )}></div>
                </button>
                {leaderId && (
                    <div className="w-64 mt-1 px-2 py-1.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] text-indigo-800 leading-tight">
                        You are the session leader. All agents are currently following your viewport formation.
                    </div>
                )}
          </div>
      </div>

      {/* Right Header Area (Agent Status / End Meeting) */}
      <div className="absolute top-6 right-6 flex flex-col items-end gap-2 pointer-events-auto z-20">
           
           <button 
                onClick={() => endMeeting(true)}
                className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide bg-black text-white border border-black shadow-md hover:bg-gray-800 transition-colors flex items-center gap-2 mb-2"
            >
                <Power size={12} className="text-red-500" /> End Session
           </button>

           {activeAgentId && viewMode === ViewMode.POV_AGENT && (
               <div className="bg-black text-white px-3 py-1.5 rounded text-xs font-mono flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-right-4">
                  <User size={12} />
                  POSSESSING: {agents.find(a => a.id === activeAgentId)?.name}
                  <button onClick={() => { setActiveAgent(null); setViewMode(ViewMode.FREE); }} className="ml-2 hover:text-gray-300">✕</button>
               </div>
           )}
           
           {/* Leader Button Removed from here */}
      </div>

      {/* RIGHT PANEL: Conversation & Agent List */}
      <ConversationPanel />
      
      {/* OVERLAY: AI View Sliders */}
      {showAIControls && (
         <div className="absolute top-20 right-[340px] z-20 pointer-events-auto w-52 bg-white/90 backdrop-blur-md border border-gray-200 rounded shadow-sm p-3 animate-in slide-in-from-right-4">
             <div className="flex items-center gap-2 mb-3 border-b border-gray-100 pb-2">
                 <Sparkles size={14} className="text-purple-600"/>
                 <span className="text-xs font-bold text-gray-700">AI Camera Weights</span>
             </div>
             <div className="flex flex-col gap-4">
                {agents.map(agent => (
                    <div key={agent.id} className="flex flex-col gap-1">
                        <div className="flex justify-between text-[10px] font-mono text-gray-500 uppercase">
                            <span style={{color: agent.color}}>{agent.name}</span>
                            <span>{agentWeights[agent.id]}</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" 
                            max="10" 
                            step="1" 
                            value={agentWeights[agent.id] || 0} 
                            onChange={(e) => setAgentWeight(agent.id, parseInt(e.target.value))}
                            className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
                        />
                    </div>
                ))}
             </div>
         </div>
      )}

      {/* Bottom Controls Panel (Centered Dock) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-end justify-center pointer-events-none gap-6 z-20"> 
        
        {/* Left: Playback Controls */}
        <div className="flex gap-2 pointer-events-auto bg-white/90 backdrop-blur-md p-1.5 rounded-md border border-gray-200 shadow-sm transition-all hover:shadow-md">
           <Button onClick={togglePlay} active={isPlaying} title="Play/Pause">
             {isPlaying ? <Pause size={16} /> : <Play size={16} />}
           </Button>
           <Button onClick={resetTime} title="Reset">
             <RefreshCw size={16} />
           </Button>
           <div className="w-px h-10 bg-gray-200 mx-1"></div>
           <div className="h-10 flex flex-col justify-center px-3 font-mono text-[10px] text-gray-500 w-24">
              <div className="flex justify-between mb-1">
                <span>OP.STATUS</span>
                <span className={isPlaying ? "text-green-600" : "text-orange-500"}>
                    {isPlaying ? "RUNNING" : "PAUSED"}
                </span>
              </div>
              <div className="w-full bg-gray-200 h-1 rounded-full overflow-hidden">
                <div className={`h-full bg-black transition-all duration-300 ${isPlaying ? 'animate-[shimmer_2s_infinite]' : ''}`} style={{width: isPlaying ? '100%' : '0%'}}></div>
              </div>
           </div>
        </div>

        {/* Center: View Modes */}
        <div className="flex flex-col items-center gap-2 pointer-events-auto">
            <div className="text-[10px] font-mono uppercase text-gray-400 tracking-widest mb-1 bg-white/40 px-2 py-0.5 rounded backdrop-blur-sm shadow-sm">View Configuration</div>
            <div className="flex gap-2 bg-white/90 backdrop-blur-md p-1.5 rounded-md border border-gray-200 shadow-sm transition-all hover:shadow-md">
                <Button 
                    active={viewMode === ViewMode.FREE && !leaderId} 
                    onClick={() => { setViewMode(ViewMode.FREE); setActiveAgent(null); setLeader(null); }}
                    title="Free View"
                >
                    <Activity size={16} />
                </Button>
                <Button 
                    active={leaderId === 'USER'} 
                    onClick={handleLeaderToggle}
                    title="Sync / Leader Mode"
                    className={leaderId ? "text-indigo-600 border-indigo-200" : ""}
                >
                    <Users size={16} />
                </Button>
                <Button 
                    active={viewMode === ViewMode.AI_GUIDED} 
                    onClick={() => { setViewMode(ViewMode.AI_GUIDED); setActiveAgent(null); }}
                    title="AI Guided Focus (Group Gaze)"
                >
                    <Sparkles size={16} />
                </Button>
                <Button 
                    active={viewMode === ViewMode.SPLIT_SCREEN} 
                    onClick={handleSplitToggle}
                    title="Hybrid Split Screen"
                >
                    <SplitSquareHorizontal size={16} />
                </Button>
                <Button 
                    active={viewMode === ViewMode.OVERHEAD} 
                    onClick={() => { setViewMode(ViewMode.OVERHEAD); setActiveAgent(null); }}
                    title="Extended Map"
                >
                    <Map size={16} />
                </Button>
                <Button 
                    active={viewMode === ViewMode.HEATMAP} 
                    onClick={() => { setViewMode(ViewMode.HEATMAP); setActiveAgent(null); }}
                    title="Attention Heatmap"
                >
                    <Flame size={16} />
                </Button>
            </div>
        </div>

        {/* Right: Visibility Toggles */}
        <div className="flex gap-2 pointer-events-auto bg-white/90 backdrop-blur-md p-1.5 rounded-md border border-gray-200 shadow-sm transition-all hover:shadow-md">
             <div className="h-10 flex flex-col justify-center px-2 font-mono text-[10px] text-gray-400 text-right leading-tight">
                <div>VISUAL</div>
                <div>AIDS</div>
             </div>
            <div className="w-px h-10 bg-gray-200 mx-1"></div>
            
            <Button onClick={toggleAgentStyle} title="Cycle Agent Style">
                <Box size={16} className={agentStyle === AgentStyle.BOX ? "fill-black" : ""} />
            </Button>

            <Button active={showFrustums} onClick={toggleFrustums} title="Toggle Frustums">
                <Video size={16} />
            </Button>
            <Button active={showGaze} onClick={toggleGaze} title="Visual Grounding (Gaze)">
                {showGaze ? <Eye size={16} /> : <EyeOff size={16} />}
            </Button>
            <Button active={showTrails} onClick={toggleTrails} title="Movement Trails">
                <Footprints size={16} />
            </Button>
        </div>

      </div>
    </div>
  );
};

export default Interface;