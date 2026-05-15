import React, { useState, useEffect } from 'react';
import {
  Play, Pause, RefreshCw, Eye, EyeOff,
  Video, User, Map, Activity, Flame, Footprints,
  SplitSquareHorizontal, Sparkles, Users, ArrowRight, Box,
  CheckCircle2, Power, Layers, Network, Link, BellRing, X,
  ShieldOff, Shield, Radio, Glasses, MessageSquare, MessageCircle, Mic,
  ChevronDown, ChevronRight, ChevronLeft, PanelRightClose, PanelRight,
  MonitorPlay, Share2, Crosshair, Hand, MousePointer
} from 'lucide-react';
import SharePanel from './SharePanel';
import XRButton from './XRButton';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store';
import { ViewMode, AgentStyle } from '../../types';
import { usePresence } from '../../lib/PresenceContext';
import { useFingerPointerStore } from '../../lib/fingerPointerStore';
import { clsx } from 'clsx';
import ConversationPanel from './ConversationPanel';
import CommentsPanel from './CommentsPanel';
import ChatPanel from './ChatPanel';
import FingerPointerHost from './FingerPointerHost';
import ReviewViewpointsDock from './ReviewViewpointsDock';
import SceneTree from './SceneTree';
import MeetingSummary from './MeetingSummary';
import DataFlowDrawer from './DataFlowDrawer';
import ViewConfigExplainer from './ViewConfigExplainer';
import DeicticFeaturesExplainer from './DeicticFeaturesExplainer';
import DrawingCanvas from './DrawingCanvas';
import BoardroomShell from './Boardroom/BoardroomShell';
import BoardroomCountdown from './BoardroomCountdown';

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

const FingerPointerPill: React.FC = () => {
  const mode = useFingerPointerStore((s) => s.mode);
  const calibration = useFingerPointerStore((s) => s.calibration);
  const enable = useFingerPointerStore((s) => s.enableFingerPointer);
  const disable = useFingerPointerStore((s) => s.disableFingerPointer);
  const recalibrate = useFingerPointerStore((s) => s.startRecalibration);

  const isActive = mode === 'active';
  return (
    <div className="flex items-center gap-1 px-3 py-2 rounded-full border shadow-sm bg-white/90 backdrop-blur border-gray-200">
      <Hand size={14} className={isActive ? 'text-emerald-500' : 'text-gray-400'} />
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mr-1">Finger</span>
      <button
        onClick={isActive ? disable : enable}
        title={isActive ? 'Disable finger pointer' : 'Enable finger pointer'}
        className={clsx(
          'text-[9px] font-bold uppercase px-2 py-0.5 rounded transition-all',
          isActive ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-800'
        )}
      >
        {isActive ? 'On' : 'Off'}
      </button>
      {calibration && (
        <button
          onClick={recalibrate}
          title="Recalibrate corners"
          className="text-[9px] font-bold uppercase px-2 py-0.5 rounded text-gray-400 hover:text-gray-700 transition-all"
        >
          Recal
        </button>
      )}
    </div>
  );
};

const InlineFingerPill: React.FC = () => {
  const mode = useFingerPointerStore((s) => s.mode);
  const calibration = useFingerPointerStore((s) => s.calibration);
  const enable = useFingerPointerStore((s) => s.enableFingerPointer);
  const disable = useFingerPointerStore((s) => s.disableFingerPointer);
  const recalibrate = useFingerPointerStore((s) => s.startRecalibration);
  const isActive = mode === 'active';
  return (
    <div className="flex items-center gap-1 px-2">
      <Hand size={14} className={isActive ? 'text-emerald-500' : 'text-gray-400'} />
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mr-1">Finger</span>
      <button
        onClick={isActive ? disable : enable}
        title={isActive ? 'Disable finger pointer' : 'Enable finger pointer'}
        className={clsx(
          'text-[9px] font-bold uppercase px-2 py-0.5 rounded transition-all',
          isActive ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-800'
        )}
      >
        {isActive ? 'On' : 'Off'}
      </button>
      {calibration && (
        <button
          onClick={recalibrate}
          title="Recalibrate corners"
          className="text-[9px] font-bold uppercase px-2 py-0.5 rounded text-gray-400 hover:text-gray-700 transition-all"
        >
          Recal
        </button>
      )}
    </div>
  );
};

const InlineHoverPill: React.FC = () => {
  const enabled = useStore((s) => s.hoverPointingEnabled);
  const setEnabled = useStore((s) => s.setHoverPointingEnabled);
  return (
    <div className="flex items-center gap-1 px-2">
      <MousePointer size={14} className={enabled ? 'text-emerald-500' : 'text-gray-400'} />
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mr-1">Hover</span>
      <button
        onClick={() => setEnabled(!enabled)}
        title={enabled ? 'Disable hover-to-point' : 'Auto-engage when you dwell on a part'}
        className={clsx(
          'text-[9px] font-bold uppercase px-2 py-0.5 rounded transition-all',
          enabled ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-800'
        )}
      >
        {enabled ? 'On' : 'Off'}
      </button>
    </div>
  );
};

const HoverPointerPill: React.FC = () => {
  const enabled = useStore((s) => s.hoverPointingEnabled);
  const setEnabled = useStore((s) => s.setHoverPointingEnabled);
  return (
    <div className="flex items-center gap-1 px-3 py-2 rounded-full border shadow-sm bg-white/90 backdrop-blur border-gray-200">
      <MousePointer size={14} className={enabled ? 'text-emerald-500' : 'text-gray-400'} />
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mr-1">Hover</span>
      <button
        onClick={() => setEnabled(!enabled)}
        title={enabled ? 'Disable hover-to-point' : 'Auto-engage the laser when you dwell on a part'}
        className={clsx(
          'text-[9px] font-bold uppercase px-2 py-0.5 rounded transition-all',
          enabled ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-800'
        )}
      >
        {enabled ? 'On' : 'Off'}
      </button>
    </div>
  );
};

const Interface: React.FC = () => {
  const {
    viewMode, setViewMode, followingRemoteUserId, setFollowingRemoteUser,
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
    endMeeting,
    followRequest, setFollowRequest,
    isPrivacyMode, togglePrivacyMode,
    followedAgentId, setFollowedAgent,
    rightPanelMode, setRightPanelMode,
    comments,
    commentMode,
    temporarilyDisengagedFromAgentId,
    resumeFollowingAgent,
    showDrawingCanvas,
    setShowDrawingCanvas,
    capturedScreenshot,
    setCapturedScreenshot,
    setDrawingCanvas,
    setCommentMode,
    pendingCommentNodeName,
    setPendingComment,
    setDrawingInteractionActive,
    isBoardroomMode,
    toggleBoardroomMode,
    triggerBoardroomEntry,
    hideAgents,
    toggleHideAgents,
  } = useStore();
  const laserHighlightGranularity = useStore(state => state.laserHighlightGranularity);
  const setLaserHighlightGranularity = useStore(state => state.setLaserHighlightGranularity);

  const { localUserId, remoteParticipantList, broadcastPresenterChange, broadcastLeaderChange, broadcastBoardroomCountdown, broadcastPrivacyMode, broadcastArenaEntry, broadcastMeetingEnd } = usePresence();
  const sessionHostId = useStore(state => state.sessionHostId);
  const isHost = sessionHostId === localUserId || sessionHostId === null; // null = solo session, treat as host
  const { roomId } = useParams<{ roomId: string }>();
  const [showShare, setShowShare] = useState(false);

  const [isDataFlowOpen, setIsDataFlowOpen] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  const [showDeicticExplainer, setShowDeicticExplainer] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);

  // Expandable panel states
  const [isSceneTreeExpanded, setIsSceneTreeExpanded] = useState(true);
  const [isSessionSyncExpanded, setIsSessionSyncExpanded] = useState(true);
  const [isFollowersExpanded, setIsFollowersExpanded] = useState(true);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);

  const unresolvedComments = comments.filter(c => !c.resolved).length;
  const liveChat = useStore(state => state.liveChat);
  const [lastSeenChatCount, setLastSeenChatCount] = useState(0);
  const unreadChat = rightPanelMode === 'chat' ? 0 : Math.max(0, liveChat.length - lastSeenChatCount);

  useEffect(() => {
    if (rightPanelMode === 'chat') setLastSeenChatCount(liveChat.length);
  }, [rightPanelMode, liveChat.length]);

  // Derived state for HUD: Who is following me?
  const myFollowers = agents.filter(a => a.behavior === 'FOLLOWING' || (leaderId === 'USER'));

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
      if (leaderId || followingRemoteUserId) {
          setLeader(null);
          setFollowingRemoteUser(null);
          broadcastLeaderChange(null);
      } else {
          setLeader('USER');
          broadcastLeaderChange(localUserId);
      }
  };
  
  const toggleAgentStyle = () => {
      const styles = [AgentStyle.BOX, AgentStyle.CAPSULE, AgentStyle.ROBOT];
      const next = styles[(styles.indexOf(agentStyle) + 1) % styles.length];
      setAgentStyle(next);
  };

  const handleAcceptFollow = () => {
      if (followRequest) {
          setActiveAgent(followRequest.agentId);
          setViewMode(ViewMode.POV_AGENT);
          setFollowRequest(null);
      }
  };

  const showAIControls = viewMode === ViewMode.AI_GUIDED && !hideAgents;

  return (
    <div className="w-full h-full p-6 relative pointer-events-none">
      {/* Finger pointer prompt/calibration overlay + tracker host */}
      <FingerPointerHost />

      {/* (ReviewViewpointsDock is mounted inside the bottom dock below, not here.) */}

      {/* Drawing Canvas Overlay - Rendered at root level to avoid backdrop-filter containing block issues */}
      {showDrawingCanvas && (
        <DrawingCanvas
          backgroundImage={capturedScreenshot}
          onSave={(dataUrl) => {
            setDrawingCanvas(dataUrl);
            setShowDrawingCanvas(false);
            setCommentMode('none');
            setCapturedScreenshot(null);
          }}
          onCancel={() => {
            setShowDrawingCanvas(false);
            setCommentMode('none');
            setPendingComment(null, null, null);
            setDrawingCanvas(null);
            setDrawingInteractionActive(false);
            setCapturedScreenshot(null);
          }}
        />
      )}

      {/* High Z-Index Overlays - Pointer Events Auto handled inside components */}
      <div className="relative z-[200]">
          <MeetingSummary />
          {showExplainer && <ViewConfigExplainer onClose={() => setShowExplainer(false)} />}
          {showDeicticExplainer && <DeicticFeaturesExplainer onClose={() => setShowDeicticExplainer(false)} />}
      </div>
      
      {/* Drawer Layer */}
      <div className="relative z-[100]">
          <DataFlowDrawer isOpen={isDataFlowOpen} onClose={() => setIsDataFlowOpen(false)} />
      </div>

      {/* ── 3D Arena UI — hidden when Boardroom mode is active ── */}
      {!isBoardroomMode && <>

      {/* Header / Meta / Tree */}
      <div className="flex flex-col items-start pointer-events-none z-[30] absolute top-6 left-6 max-h-[90vh]">
          <header className="flex flex-col gap-1 mb-2 shrink-0">
            <h1 className="font-bold tracking-tight text-lg text-neutral-900 flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full transition-colors ${isPlaying ? 'bg-orange-500 animate-pulse' : 'bg-gray-400'}`}></div>
                VIEWPOINT ARENA
            </h1>
            <div className="font-mono text-xs text-neutral-500 uppercase tracking-wide">
                Design Review Sim // {Math.floor(time * 10) / 10}s
            </div>
          </header>
          
          {/* Scene Tree Integration - Expandable */}
          <div className="mt-2 pointer-events-auto">
            <button
              onClick={() => setIsSceneTreeExpanded(!isSceneTreeExpanded)}
              className="flex items-center gap-2 text-[10px] font-mono uppercase text-gray-500 tracking-widest mb-1 bg-white/60 px-2 py-1 rounded backdrop-blur-sm shadow-sm hover:bg-white/80 transition-colors w-fit"
            >
              {isSceneTreeExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Layers size={10} />
              Model Tree
            </button>
            <div className={clsx(
              "transition-all duration-300 overflow-hidden",
              isSceneTreeExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
            )}>
              <SceneTree />
            </div>
          </div>

          {/* SYNC / LEADER CONTROLS - Expandable — host only */}
          {isHost && <div className="mt-4 pointer-events-auto animate-in slide-in-from-left-4 fade-in duration-500">
            <button
              onClick={() => setIsSessionSyncExpanded(!isSessionSyncExpanded)}
              className="flex items-center gap-2 text-[10px] font-mono uppercase text-gray-500 tracking-widest mb-1 bg-white/60 px-2 py-1 rounded backdrop-blur-sm shadow-sm hover:bg-white/80 transition-colors w-fit"
            >
              {isSessionSyncExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Users size={10} />
              Session Sync
              {(leaderId || followingRemoteUserId) && <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>}
            </button>
            <div className={clsx(
              "transition-all duration-300 overflow-hidden",
              isSessionSyncExpanded ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
            )}>
              <button
                  onClick={handleLeaderToggle}
                  className={clsx(
                      "w-64 px-3 py-2 rounded text-xs font-mono flex items-center justify-between shadow-sm border transition-all duration-300 group",
                      (leaderId || followingRemoteUserId)
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-indigo-200"
                          : "bg-white/90 backdrop-blur text-gray-600 border-gray-200 hover:border-gray-400"
                  )}
              >
                  <div className="flex items-center gap-2">
                      <Users size={14} className={(leaderId || followingRemoteUserId) ? "text-white" : "text-gray-400 group-hover:text-gray-600"} />
                      <span className="font-bold">
                        {followingRemoteUserId
                          ? `FOLLOWING: ${remoteParticipantList.find(p => p.userId === followingRemoteUserId)?.name ?? '...'}`
                          : leaderId ? "SYNC ACTIVE: LEADING" : "SYNC INACTIVE"}
                      </span>
                  </div>
                  <div className={clsx(
                      "w-2 h-2 rounded-full",
                      (leaderId || followingRemoteUserId) ? "bg-white animate-pulse" : "bg-gray-300"
                  )}></div>
              </button>
              {leaderId && !followingRemoteUserId && (
                  <div className="w-64 mt-1 px-2 py-1.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] text-indigo-800 leading-tight">
                      You are the session leader. All agents are currently following your viewport formation.
                  </div>
              )}
              {followingRemoteUserId && (
                  <div className="w-64 mt-1 px-2 py-1.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] text-indigo-800 leading-tight">
                      Following {remoteParticipantList.find(p => p.userId === followingRemoteUserId)?.name ?? 'remote user'}. Click again to detach.
                  </div>
              )}
            </div>
          </div>}

          {/* FOLLOWERS HUD - Expandable */}
          {myFollowers.length > 0 && !leaderId && (
              <div className="mt-4 pointer-events-auto animate-in slide-in-from-left-4 fade-in duration-500">
                <button
                  onClick={() => setIsFollowersExpanded(!isFollowersExpanded)}
                  className="flex items-center gap-2 text-[10px] font-mono uppercase text-gray-500 tracking-widest mb-1 bg-white/60 px-2 py-1 rounded backdrop-blur-sm shadow-sm hover:bg-white/80 transition-colors w-fit"
                >
                  {isFollowersExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <Link size={10} />
                  Linked Viewers
                  <span className="bg-indigo-100 text-indigo-600 px-1.5 rounded text-[9px] font-bold">{myFollowers.length}</span>
                </button>
                <div className={clsx(
                  "transition-all duration-300 overflow-hidden",
                  isFollowersExpanded ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
                )}>
                  <div className="w-64 flex flex-col gap-1">
                      {myFollowers.map(agent => (
                          <div key={agent.id} className="bg-white/80 backdrop-blur border border-gray-200 p-2 rounded flex items-center gap-2 shadow-sm">
                              <div className="relative">
                                  <div className="w-2 h-2 rounded-full animate-pulse" style={{backgroundColor: agent.color}}></div>
                                  <div className="absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-20" style={{backgroundColor: agent.color}}></div>
                              </div>
                              <span className="text-xs font-bold text-gray-700">{agent.name}</span>
                              <span className="text-[9px] text-gray-400 font-mono ml-auto">FOLLOWING</span>
                          </div>
                      ))}
                  </div>
                </div>
              </div>
          )}
      </div>

      {/* REQUEST TOAST (Center Top) */}
      {followRequest && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto flex flex-col items-center animate-in slide-in-from-top-4 fade-in">
              <div className="bg-black/90 text-white backdrop-blur-md px-4 py-3 rounded-lg shadow-2xl flex items-center gap-4 border border-gray-700">
                  <div className="flex items-center gap-2">
                      <BellRing className="text-orange-400 animate-bounce" size={18} />
                      <div className="flex flex-col">
                          <span className="text-xs font-bold uppercase tracking-wide">Request to Follow</span>
                          <span className="text-[10px] text-gray-400 font-mono">
                              {agents.find(a => a.id === followRequest.agentId)?.name} wants to show you something.
                          </span>
                      </div>
                  </div>
                  <div className="h-8 w-px bg-gray-700"></div>
                  <div className="flex gap-2">
                      <button 
                        onClick={handleAcceptFollow}
                        className="px-3 py-1.5 bg-white text-black rounded text-xs font-bold hover:bg-gray-200 transition-colors"
                      >
                          Accept
                      </button>
                      <button 
                        onClick={() => setFollowRequest(null)}
                        className="px-2 py-1.5 text-gray-400 hover:text-white transition-colors"
                      >
                          <X size={14} />
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Right Header Area (Agent Status / End Meeting) */}
      <div className="absolute top-6 right-6 flex flex-col items-end gap-2 pointer-events-auto z-[40]">

           {/* Top buttons row */}
           <div className="flex items-center gap-2 mb-2">
                {/* XR Entry */}
                <XRButton />

                {/* Privacy Mode Toggle */}
                <button
                    onClick={() => { togglePrivacyMode(); broadcastPrivacyMode(!isPrivacyMode); }}
                    className={clsx(
                        "px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide border shadow-md transition-all flex items-center gap-2",
                        isPrivacyMode
                            ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-400"
                    )}
                >
                    {isPrivacyMode ? <ShieldOff size={12} /> : <Shield size={12} />}
                    {isPrivacyMode ? "Privacy On" : "Privacy"}
                </button>

                {/* Share */}
                <div className="relative">
                  <button
                    onClick={() => setShowShare(v => !v)}
                    className={clsx(
                      'px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide border shadow-md transition-all flex items-center gap-2',
                      showShare
                        ? 'bg-gray-800 text-white border-gray-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-400'
                    )}
                  >
                    <Share2 size={12} /> Share
                  </button>
                  {showShare && roomId && (
                    <SharePanel roomId={roomId} onClose={() => setShowShare(false)} />
                  )}
                </div>

                {/* Boardroom Mode Toggle — host only */}
                {isHost && (
                <button
                    onClick={() => {
                        if (isBoardroomMode) {
                            toggleBoardroomMode();
                            broadcastArenaEntry();
                        } else {
                            triggerBoardroomEntry();
                            broadcastBoardroomCountdown();
                        }
                    }}
                    className={clsx(
                        "px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide border shadow-md transition-all flex items-center gap-2",
                        isBoardroomMode
                            ? "bg-black text-white border-black"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-400"
                    )}
                >
                    <MonitorPlay size={12} /> Boardroom
                </button>
                )}

                {/* Participants Toggle */}
                <button
                    onClick={() => setShowParticipants(!showParticipants)}
                    className={clsx(
                        "px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide border shadow-md transition-all flex items-center gap-2",
                        showParticipants
                            ? "bg-black text-white border-black"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-400"
                    )}
                >
                    <Users size={12} /> Participants
                </button>

                {isHost && (
                <button
                    onClick={() => { endMeeting(true); broadcastMeetingEnd(); }}
                    className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide bg-black text-white border border-black shadow-md hover:bg-gray-800 transition-colors flex items-center gap-2"
                >
                    <Power size={12} className="text-red-500" /> End Session
                </button>
                )}
           </div>

           {/* Recording indicator when privacy mode is OFF */}
           {!isPrivacyMode && (
               <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded text-[10px] font-mono flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                  <Radio size={10} className="text-green-500 animate-pulse" />
                  MEETING RECORDED
               </div>
           )}

           {activeAgentId && viewMode === ViewMode.POV_AGENT && (
               <div className="bg-black text-white px-3 py-1.5 rounded text-xs font-mono flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-right-4">
                  <User size={12} />
                  POSSESSING: {agents.find(a => a.id === activeAgentId)?.name}
                  <button onClick={() => { setActiveAgent(null); setViewMode(ViewMode.FREE); }} className="ml-2 hover:text-gray-300">✕</button>
               </div>
           )}

           {/* Temporarily Disengaged Indicator */}
           {temporarilyDisengagedFromAgentId && (
               <div className="bg-orange-500 text-white px-3 py-1.5 rounded text-xs font-mono flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-right-4">
                  <Eye size={12} className="animate-pulse" />
                  <span>PAUSED: {agents.find(a => a.id === temporarilyDisengagedFromAgentId)?.name}</span>
                  <button
                    onClick={resumeFollowingAgent}
                    className="ml-2 bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-[10px] font-bold transition-colors"
                  >
                    Resume
                  </button>
               </div>
           )}
      </div>

      {/* Participants Panel - Positioned to not overlap with right panel */}
      {showParticipants && (
          <div className={clsx(
            "absolute top-28 z-[45] pointer-events-auto w-56 bg-white/95 backdrop-blur-md border border-gray-200 rounded-lg shadow-lg animate-in fade-in slide-in-from-right-4 duration-200 transition-all",
            isRightPanelCollapsed ? "right-20" : "right-[356px]"
          )}>
              <div className="p-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider flex items-center gap-2">
                      <Users size={12} /> Participants
                  </span>
                  <span className="text-[9px] bg-gray-200 text-gray-600 px-1.5 rounded-full font-mono">{(hideAgents ? 0 : agents.length) + remoteParticipantList.length}</span>
              </div>
              <div className="p-2 flex flex-col gap-1 max-h-64 overflow-y-auto custom-scrollbar">
                  {hideAgents && agents.length > 0 && (
                    <div className="px-2 py-1.5 text-[9px] font-mono text-gray-400 flex items-center gap-1.5">
                      <EyeOff size={10} /> AI agents hidden
                    </div>
                  )}
                  {!hideAgents && agents.map(agent => {
                      const isFollowing = followedAgentId === agent.id;
                      const isVR = agent.id === '4';
                      return (
                          <button
                              key={agent.id}
                              onClick={() => {
                                  if (isFollowing) {
                                      setFollowedAgent(null);
                                      setActiveAgent(null);
                                      setViewMode(ViewMode.FREE);
                                      broadcastPresenterChange(null);
                                  } else {
                                      setFollowedAgent(agent.id);
                                      setActiveAgent(agent.id);
                                      setViewMode(ViewMode.POV_AGENT);
                                      broadcastPresenterChange(agent.id);
                                  }
                              }}
                              className={clsx(
                                  "w-full p-2 rounded-lg text-left flex items-center gap-2 transition-all",
                                  isFollowing
                                      ? "bg-black text-white shadow-md"
                                      : "bg-gray-50 hover:bg-gray-100 text-gray-700"
                              )}
                          >
                              <div
                                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold shadow-sm shrink-0"
                                  style={{ backgroundColor: agent.color }}
                              >
                                  {isVR ? <Glasses size={12} /> : agent.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                  <div className="font-mono text-[10px] font-bold flex items-center gap-1 truncate">
                                      {agent.name}
                                      {isVR && (
                                          <span className={clsx(
                                              "text-[7px] px-1 py-0.5 rounded uppercase shrink-0",
                                              isFollowing ? "bg-white/20 text-white" : "bg-purple-100 text-purple-600"
                                          )}>
                                              VR
                                          </span>
                                      )}
                                  </div>
                                  <div className={clsx(
                                      "text-[8px] capitalize truncate",
                                      isFollowing ? "text-gray-300" : "text-gray-400"
                                  )}>
                                      {agent.role.toLowerCase()}
                                  </div>
                              </div>
                              {isFollowing && (
                                  <div className="text-[8px] bg-white/20 px-1.5 py-0.5 rounded font-bold shrink-0">
                                      POV
                                  </div>
                              )}
                          </button>
                      );
                  })}

                  {/* Remote (real) participants */}
                  {remoteParticipantList.length > 0 && (
                      <div className="mt-1 pt-1 border-t border-gray-100">
                          <div className="text-[8px] uppercase text-gray-400 tracking-wider px-1 mb-1">Live</div>
                          {remoteParticipantList.map(p => {
                              const isFollowing = followingRemoteUserId === p.userId;
                              return (
                                  <button
                                      key={p.userId}
                                      onClick={() => {
                                          if (isFollowing) {
                                              setFollowingRemoteUser(null);
                                              broadcastLeaderChange(null);
                                          } else {
                                              // Anti-circular: cannot follow someone who is already following you
                                              if (leaderId === 'USER' && !followingRemoteUserId) return;
                                              setFollowingRemoteUser(p.userId);
                                          }
                                      }}
                                      className={clsx(
                                          "w-full p-2 rounded-lg text-left flex items-center gap-2 transition-all",
                                          isFollowing
                                              ? "bg-black text-white shadow-md"
                                              : "bg-gray-50 hover:bg-gray-100 text-gray-700"
                                      )}
                                  >
                                      <div
                                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold shadow-sm shrink-0"
                                          style={{ backgroundColor: p.color }}
                                      >
                                          {p.name[0]?.toUpperCase() || '?'}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                          <div className="font-mono text-[10px] font-bold truncate">{p.name}</div>
                                          <div className={clsx("text-[8px]", isFollowing ? "text-gray-300" : "text-gray-400")}>human</div>
                                      </div>
                                      {isFollowing
                                          ? <div className="text-[8px] bg-white/20 px-1.5 py-0.5 rounded font-bold shrink-0">POV</div>
                                          : <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Online" />
                                      }
                                  </button>
                              );
                          })}
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* RIGHT PANEL: Mode Switcher + Content */}
      <div className={clsx(
        "absolute right-6 top-20 bottom-20 flex flex-col pointer-events-none z-[40] transition-all duration-300",
        isRightPanelCollapsed ? "w-12" : "w-[320px]"
      )}>
        {/* Collapse Toggle Button */}
        <button
          onClick={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)}
          className="pointer-events-auto mb-2 w-10 h-10 bg-white/90 backdrop-blur-md rounded-lg border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-100 transition-all self-end"
          title={isRightPanelCollapsed ? "Expand panel" : "Collapse panel"}
        >
          {isRightPanelCollapsed ? (
            <PanelRight size={16} className="text-gray-600" />
          ) : (
            <PanelRightClose size={16} className="text-gray-600" />
          )}
        </button>

        {/* Panel Content - Hidden when collapsed */}
        {!isRightPanelCollapsed && (
          <>
            {/* Panel Mode Toggle */}
            <div className="flex mb-2 pointer-events-auto bg-white/90 backdrop-blur-md rounded-lg border border-gray-200 shadow-sm p-1 gap-0.5">
              <button
                onClick={() => setRightPanelMode('meeting')}
                className={clsx(
                  "flex-1 px-2 py-2 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all",
                  rightPanelMode === 'meeting'
                    ? "bg-black text-white"
                    : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <Mic size={11} />
                Capture
              </button>
              <button
                onClick={() => setRightPanelMode('comments')}
                className={clsx(
                  "flex-1 px-2 py-2 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all relative",
                  rightPanelMode === 'comments'
                    ? "bg-black text-white"
                    : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <MessageSquare size={11} />
                Comments
                {unresolvedComments > 0 && (
                  <span className={clsx(
                    "absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold",
                    rightPanelMode === 'comments' ? "bg-white text-black" : "bg-blue-500 text-white"
                  )}>
                    {unresolvedComments}
                  </span>
                )}
              </button>
              <button
                onClick={() => setRightPanelMode('chat')}
                className={clsx(
                  "flex-1 px-2 py-2 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all relative",
                  rightPanelMode === 'chat'
                    ? "bg-black text-white"
                    : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <MessageCircle size={11} />
                Chat
                {unreadChat > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold bg-green-500 text-white">
                    {unreadChat > 9 ? '9+' : unreadChat}
                  </span>
                )}
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 min-h-0 pointer-events-auto bg-white/90 backdrop-blur-md rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              {rightPanelMode === 'meeting' ? (
                <ConversationPanel />
              ) : rightPanelMode === 'comments' ? (
                <CommentsPanel />
              ) : (
                <ChatPanel />
              )}
            </div>
          </>
        )}

        {/* Collapsed indicators */}
        {isRightPanelCollapsed && (
          <div className="flex flex-col gap-2 pointer-events-auto">
            <button
              onClick={() => { setIsRightPanelCollapsed(false); setRightPanelMode('meeting'); }}
              className={clsx(
                "w-10 h-10 bg-white/90 backdrop-blur-md rounded-lg border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-100 transition-all",
                rightPanelMode === 'meeting' && "border-black bg-black text-white hover:bg-gray-800"
              )}
              title="Meeting Capture"
            >
              <Mic size={16} />
            </button>
            <button
              onClick={() => { setIsRightPanelCollapsed(false); setRightPanelMode('comments'); }}
              className={clsx(
                "w-10 h-10 bg-white/90 backdrop-blur-md rounded-lg border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-100 transition-all relative",
                rightPanelMode === 'comments' && "border-black bg-black text-white hover:bg-gray-800"
              )}
              title="Comments"
            >
              <MessageSquare size={16} />
              {unresolvedComments > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold bg-blue-500 text-white">
                  {unresolvedComments}
                </span>
              )}
            </button>
            <button
              onClick={() => { setIsRightPanelCollapsed(false); setRightPanelMode('chat'); }}
              className={clsx(
                "w-10 h-10 bg-white/90 backdrop-blur-md rounded-lg border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-100 transition-all relative",
                rightPanelMode === 'chat' && "border-black bg-black text-white hover:bg-gray-800"
              )}
              title="Chat"
            >
              <MessageCircle size={16} />
              {unreadChat > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold bg-green-500 text-white">
                  {unreadChat > 9 ? '9+' : unreadChat}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Comment Mode Indicator */}
      {(commentMode === 'placing-comment' || commentMode === 'placing-drawing') && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[50] pointer-events-none">
          <div className={`px-6 py-3 rounded-lg shadow-lg animate-pulse ${commentMode === 'placing-drawing' ? 'bg-purple-500/90' : 'bg-blue-500/90'} text-white`}>
            <div className="text-sm font-bold text-center">
              {commentMode === 'placing-comment' && 'Click on the 3D model to place comment'}
              {commentMode === 'placing-drawing' && 'Click on the 3D model to anchor your drawing'}
            </div>
          </div>
        </div>
      )}
      
      {/* OVERLAY: AI View Sliders - Positioned to the left of right panel */}
      {showAIControls && (
         <div className={clsx(
           "absolute top-28 z-[40] pointer-events-auto w-48 bg-white/95 backdrop-blur-md border border-gray-200 rounded-lg shadow-sm p-2.5 animate-in slide-in-from-right-4 transition-all",
           isRightPanelCollapsed ? "right-20" : "right-[356px]"
         )}>
             <div className="flex items-center gap-2 mb-2 border-b border-gray-100 pb-2">
                 <Sparkles size={12} className="text-purple-600"/>
                 <span className="text-[10px] font-bold text-gray-700">AI Camera Weights</span>
             </div>
             <div className="flex flex-col gap-3">
                {agents.map(agent => (
                    <div key={agent.id} className="flex flex-col gap-1">
                        <div className="flex justify-between text-[9px] font-mono text-gray-500 uppercase">
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

      {/* BOTTOM-LEFT TOGGLES */}
      <div className="absolute bottom-6 left-6 z-[40] pointer-events-auto flex flex-col gap-2 items-start">
          <button
            onClick={toggleHideAgents}
            className={clsx(
                "flex items-center gap-2 px-3 py-2 rounded-full border shadow-sm transition-all hover:scale-105",
                hideAgents
                    ? "bg-black text-white border-black"
                    : "bg-white/90 backdrop-blur text-gray-600 border-gray-200 hover:border-gray-400"
            )}
          >
              {hideAgents ? <EyeOff size={14} className="text-orange-400" /> : <Eye size={14} className="text-gray-400" />}
              <span className="text-[10px] font-bold uppercase tracking-wide">
                {hideAgents ? 'Agents Off' : 'Agents On'}
              </span>
          </button>
          <button
            onClick={() => setIsDataFlowOpen(!isDataFlowOpen)}
            className={clsx(
                "flex items-center gap-2 px-3 py-2 rounded-full border shadow-sm transition-all hover:scale-105",
                isDataFlowOpen
                    ? "bg-black text-white border-black"
                    : "bg-white/90 backdrop-blur text-gray-600 border-gray-200 hover:border-gray-400"
            )}
          >
              <Network size={14} className={isDataFlowOpen ? "text-emerald-400" : "text-gray-400"} />
              <span className="text-[10px] font-bold uppercase tracking-wide">Data Flow</span>
          </button>

          {/* Visual aids — relocated here so the bottom dock has room for the review pane */}
          <div className="flex gap-1 bg-white/90 backdrop-blur p-1.5 rounded-full border border-gray-200 shadow-sm">
              <Button onClick={toggleAgentStyle} title="Cycle Agent Style">
                  <Box size={16} className={agentStyle === AgentStyle.BOX ? 'fill-black' : ''} />
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

      {/* Bottom Controls Panel (Centered Dock) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-end justify-center pointer-events-none gap-6 z-[30]"> 
        
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
            <button 
                onClick={() => setShowExplainer(true)}
                className="text-[10px] font-mono uppercase text-gray-400 tracking-widest mb-1 bg-white/40 px-2 py-0.5 rounded backdrop-blur-sm shadow-sm hover:bg-white/80 hover:text-black transition-colors"
            >
                View Configuration
            </button>
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

        {/* Center-Right: Deictic Features */}
        <div className="flex flex-col items-center gap-2 pointer-events-auto">
            <button
                onClick={() => setShowDeicticExplainer(true)}
                className="text-[10px] font-mono uppercase text-gray-400 tracking-widest mb-1 bg-white/40 px-2 py-0.5 rounded backdrop-blur-sm shadow-sm hover:bg-white/80 hover:text-black transition-colors"
            >
                Deictic Features
            </button>
            <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md p-1.5 rounded-md border border-gray-200 shadow-sm transition-all hover:shadow-md">
                {/* Highlight granularity */}
                <div className="flex items-center gap-1 px-2">
                    <Crosshair size={14} className="text-gray-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mr-1">Highlight</span>
                    <button
                        onClick={() => setLaserHighlightGranularity('model')}
                        title="Highlight whole model"
                        className={clsx(
                            'text-[9px] font-bold uppercase px-2 py-0.5 rounded transition-all',
                            laserHighlightGranularity === 'model'
                                ? 'bg-black text-white'
                                : 'text-gray-400 hover:text-gray-700'
                        )}
                    >Model</button>
                    <button
                        onClick={() => setLaserHighlightGranularity('part')}
                        title="Highlight specific part"
                        className={clsx(
                            'text-[9px] font-bold uppercase px-2 py-0.5 rounded transition-all',
                            laserHighlightGranularity === 'part'
                                ? 'bg-black text-white'
                                : 'text-gray-400 hover:text-gray-700'
                        )}
                    >Part</button>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                {/* Finger pointer */}
                <InlineFingerPill />
                <div className="w-px h-8 bg-gray-200" />
                {/* Hover dwell */}
                <InlineHoverPill />
            </div>
        </div>

        {/* Right: Active Review pane (replaces the old Visual Aids panel) */}
        <ReviewViewpointsDock />

      </div>

      </> /* end !isBoardroomMode */}

      {/* Boardroom Mode Overlay — pointer-events-none so transparent area passes events to canvas */}
      {isBoardroomMode && (
        <div className="absolute inset-0 z-[150] pointer-events-none">
          <BoardroomShell />
        </div>
      )}

      {/* Boardroom countdown — shown to all clients */}
      <BoardroomCountdown />

    </div>
  );
};

export default Interface;
