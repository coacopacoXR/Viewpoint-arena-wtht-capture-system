import React, { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Settings, LayoutGrid, Radio, Power, MonitorPlay,
  MessageSquare, X, Monitor, MonitorOff, Layers, ChevronRight, ChevronDown,
  Video, VideoOff, User, Mic2, CheckCircle, XCircle, Share2
} from 'lucide-react';
import SharePanel from '../SharePanel';
import { clsx } from 'clsx';
import { useStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { InsightCard } from '../../../types';
import { usePresence } from '../../../lib/PresenceContext';
import InsightExplainer from '../InsightExplainer';
import MeetingManagerPopover from './MeetingManagerPopover';
import FocusLayout from './layouts/FocusLayout';
import GalleryLayout from './layouts/GalleryLayout';
import ConversationPanel from '../ConversationPanel';
import SceneTree from '../SceneTree';
import CommentsPanel from '../CommentsPanel';
import InsightDetailModal from '../InsightDetailModal';

// Thin collapsable floating panel wrapper used for tree and comments
const FloatingPanel: React.FC<{
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
  width?: number;
}> = ({ title, icon, isOpen, onToggle, style, children, width = 240 }) => (
  <div
    className="absolute z-[100] pointer-events-auto flex flex-col"
    style={style}
  >
    {/* Toggle button */}
    <button
      onClick={onToggle}
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wide border transition-all self-start shadow-md',
        isOpen
          ? 'bg-[#1a1a1a] text-white/70 border-white/20 rounded-b-none'
          : 'bg-[#1a1a1a]/80 text-white/40 border-white/10 hover:text-white/70 hover:border-white/20'
      )}
    >
      {icon}
      {title}
      {isOpen ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
    </button>

    {/* Panel body */}
    {isOpen && (
      <div
        className="bg-[#0f0f0f]/95 backdrop-blur-md border border-t-0 border-white/15 rounded-b rounded-tr shadow-xl overflow-hidden"
        style={{ width }}
      >
        {children}
      </div>
    )}
  </div>
);

const BoardroomShell: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const {
    agents, pois, chatHistory, time, isPrivacyMode,
    toggleBoardroomMode,
    boardroomLayout,
    boardroomInteractionEnabled,
    boardroomTranscriptPermission,
    endMeeting,
    boardroomLeaderId,
    takeoverModeEnabled,
    boardroomPresenterDetachedId,
    resumeBoardroomPresenter,
    pendingPresenterRequest,
    setPendingPresenterRequest,
    sessionHostId,
  } = useStore(useShallow(state => ({
    agents: state.agents,
    pois: state.pois,
    chatHistory: state.chatHistory,
    time: state.time,
    isPrivacyMode: state.isPrivacyMode,
    toggleBoardroomMode: state.toggleBoardroomMode,
    boardroomLayout: state.boardroomLayout,
    boardroomInteractionEnabled: state.boardroomInteractionEnabled,
    boardroomTranscriptPermission: state.boardroomTranscriptPermission,
    endMeeting: state.endMeeting,
    boardroomLeaderId: state.boardroomLeaderId,
    takeoverModeEnabled: state.takeoverModeEnabled,
    boardroomPresenterDetachedId: state.boardroomPresenterDetachedId,
    resumeBoardroomPresenter: state.resumeBoardroomPresenter,
    pendingPresenterRequest: state.pendingPresenterRequest,
    setPendingPresenterRequest: state.setPendingPresenterRequest,
    sessionHostId: state.sessionHostId,
  })));

  const { localUserId, remoteParticipantList, broadcastArenaEntry, broadcastMeetingEnd, broadcastLeaderTakeover, broadcastPresenterRequest } = usePresence();
  const isHost = sessionHostId === localUserId || sessionHostId === null;
  const isPresenter = boardroomLeaderId === localUserId;

  // Presenter label based on the real person driving the camera
  const leaderName = boardroomLeaderId === localUserId
    ? 'You'
    : remoteParticipantList.find(p => p.userId === boardroomLeaderId)?.name ?? null;

  const [showManager, setShowManager] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [showTree, setShowTree] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isWebcamOnly, setIsWebcamOnly] = useState(false);
  const [selectedInsightCard, setSelectedInsightCard] = useState<InsightCard | null>(null);
  const [showInsightExplainer, setShowInsightExplainer] = useState(false);
  const [userWebcamOn, setUserWebcamOn] = useState(true);

  // Track gallery panel width to position floating panels without occluding it
  const [galleryPanelWidth, setGalleryPanelWidth] = useState(320);

  const speakingAgentId = useMemo(() => {
    if (chatHistory.length === 0) return null;
    const last = chatHistory[chatHistory.length - 1];
    const age = (Date.now() / 1000) - last.timestamp;
    return age < 3 ? last.agentId : null;
  }, [chatHistory]);

  const [pinnedAgentId, setPinnedAgentId] = useState<string | null>(null);
  const handlePin = useCallback((agentId: string | null) => setPinnedAgentId(agentId), []);

  // Camera presenter = real person (host or appointed). No AI-driven camera in boardroom.
  const presenterLabel = leaderName;

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Floating panel left edge: after gallery panel in gallery mode
  const floatingLeft = boardroomLayout === 'gallery' && !isWebcamOnly
    ? galleryPanelWidth + 10
    : 8;

  // Floating panel right edge: leave room for transcript if open
  const floatingCommentRight = showTranscript ? 348 : 8;

  // Self (YOU) tile rendered in the participant strip
  const userSelfTile = (
    <div
      className="relative rounded-lg overflow-hidden shrink-0 w-44 h-32 ring-1 ring-white/20 group"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #1a2a1a 0%, #0d0d0d 80%)' }}
    >
      {/* Corner brackets */}
      <div className="absolute top-1.5 left-1.5 w-3 h-3 border-t border-l border-white/20 rounded-tl" />
      <div className="absolute top-1.5 right-1.5 w-3 h-3 border-t border-r border-white/20 rounded-tr" />
      <div className="absolute bottom-6 left-1.5 w-3 h-3 border-b border-l border-white/20 rounded-bl" />
      <div className="absolute bottom-6 right-1.5 w-3 h-3 border-b border-r border-white/20 rounded-br" />

      {/* Content */}
      <div className="flex items-center justify-center h-[calc(100%-28px)] relative">
        {userWebcamOn ? (
          <>
            {/* Scanline for webcam feel */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.035]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,1) 3px, rgba(255,255,255,1) 4px)' }} />
            <div className="w-11 h-11 rounded-full bg-emerald-700 flex items-center justify-center text-white font-bold text-lg shadow-lg" style={{ boxShadow: '0 0 20px rgba(16,185,129,0.4)' }}>
              <User size={20} />
            </div>
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/50 px-1.5 py-0.5 rounded z-20">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[7px] font-mono text-green-400">LIVE</span>
            </div>
          </>
        ) : (
          <>
            <svg viewBox="0 0 100 80" className="w-3/5 max-w-[72px] opacity-20" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="26" r="17" fill="rgba(255,255,255,0.9)" />
              <path d="M10 80 C10 53 28 45 50 45 C72 45 90 53 90 80 Z" fill="rgba(255,255,255,0.7)" />
            </svg>
            <div className="absolute bottom-2 right-2 text-[7px] font-mono text-white/25 bg-black/30 px-1.5 py-0.5 rounded tracking-wider">CAM OFF</div>
          </>
        )}
        {/* Webcam toggle button - shows on hover */}
        <button
          onClick={() => setUserWebcamOn(v => !v)}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 hover:bg-black/90 text-white/80 hover:text-white px-2 py-1 rounded text-[8px] flex items-center gap-1 pointer-events-auto z-30"
          title={userWebcamOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {userWebcamOn ? <VideoOff size={9} /> : <Video size={9} />}
          {userWebcamOn ? 'Cam off' : 'Cam on'}
        </button>
      </div>

      {/* Name bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-2 py-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-white text-[10px] font-mono font-bold truncate">YOU</span>
        </div>
        {boardroomLeaderId === localUserId
          ? <span className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0 bg-yellow-500/30 text-yellow-300">LEADER</span>
          : <span className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0 bg-emerald-500/30 text-emerald-300">HOST</span>
        }
      </div>
    </div>
  );

  const layoutProps = {
    agents, speakingAgentId, pinnedAgentId, pois,
    onPin: handlePin, presenterLabel,
    interactionEnabled: boardroomInteractionEnabled,
    screenSharing,
    userSelfTile,
  };

  return (
    <div className="w-full h-full flex flex-col pointer-events-none">

      {/* Full-Screen Insight Detail Modal */}
      {selectedInsightCard && (
        <InsightDetailModal
          card={selectedInsightCard}
          onClose={() => setSelectedInsightCard(null)}
          agentColor={agents.find(a => a.id === selectedInsightCard.agentId)?.color}
        />
      )}

      {/* Full-Screen Insight Explainer */}
      {showInsightExplainer && (
        <InsightExplainer onClose={() => setShowInsightExplainer(false)} />
      )}

      {/* ── Top bar ── */}
      <div className="bg-[#111] border-b border-white/10 px-4 py-2 flex items-center justify-between shrink-0 pointer-events-auto z-[200]">

        {/* Left */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MonitorPlay size={13} className="text-white/50" />
            <span className="text-white text-[11px] font-bold tracking-tight">BOARDROOM</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          {!isPrivacyMode && (
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-green-400">
              <Radio size={8} className="animate-pulse" />
              REC
            </div>
          )}
          <div className="text-white/35 font-mono text-[9px]">{formatTime(time)}</div>
          {/* Speaking dots */}
          <div className="hidden sm:flex items-center gap-1">
            {agents.map(a => (
              <div
                key={a.id}
                className={clsx(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[8px] text-white font-bold border-2 transition-all duration-200',
                  speakingAgentId === a.id ? 'border-green-400 scale-110' : 'border-white/10'
                )}
                style={{ backgroundColor: a.color }}
                title={a.name}
              >
                {a.name[0]}
              </div>
            ))}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5">

          {/* Share Screen */}
          {!isWebcamOnly && (
            <button
              onClick={() => setScreenSharing(!screenSharing)}
              className={clsx(
                'px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wide border transition-all flex items-center gap-1',
                screenSharing
                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                  : 'bg-white/8 text-white/50 border-white/10 hover:bg-white/15 hover:text-white'
              )}
              title={screenSharing ? 'Stop sharing' : 'Share screen'}
            >
              {screenSharing ? <MonitorOff size={10} /> : <Monitor size={10} />}
              {screenSharing ? 'Stop' : 'Share'}
            </button>
          )}

          {/* Scene Tree */}
          <button
            onClick={() => setShowTree(!showTree)}
            className={clsx(
              'px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wide border transition-all flex items-center gap-1',
              showTree
                ? 'bg-white/15 text-white border-white/25'
                : 'bg-white/8 text-white/50 border-white/10 hover:bg-white/15 hover:text-white'
            )}
            title="Scene Tree"
          >
            <Layers size={10} />
            Tree
          </button>

          {/* Comments */}
          <button
            onClick={() => setShowComments(!showComments)}
            className={clsx(
              'px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wide border transition-all flex items-center gap-1',
              showComments
                ? 'bg-white/15 text-white border-white/25'
                : 'bg-white/8 text-white/50 border-white/10 hover:bg-white/15 hover:text-white'
            )}
            title="Comments"
          >
            <MessageSquare size={10} />
            Comments
          </button>

          {/* Transcript */}
          {boardroomTranscriptPermission && (
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className={clsx(
                'px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wide border transition-all flex items-center gap-1',
                showTranscript
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : 'bg-white/8 text-white/50 border-white/10 hover:bg-white/15 hover:text-white'
              )}
            >
              <MessageSquare size={10} />
              Transcript
            </button>
          )}

          <div className="h-5 w-px bg-white/10 mx-0.5" />

          {/* Share */}
          <div className="relative">
            <button
              onClick={() => setShowShare(v => !v)}
              className={clsx(
                'px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wide border transition-all flex items-center gap-1',
                showShare
                  ? 'bg-white text-black border-white'
                  : 'bg-white/8 text-white/50 border-white/10 hover:bg-white/15 hover:text-white'
              )}
              title="Invite participants"
            >
              <Share2 size={10} />
              Share
            </button>
            {showShare && roomId && (
              <SharePanel roomId={roomId} onClose={() => setShowShare(false)} />
            )}
          </div>

          <div className="h-5 w-px bg-white/10 mx-0.5" />

          {/* Back to 3D Arena — host only */}
          {isHost && (
          <button
            onClick={() => { toggleBoardroomMode(); broadcastArenaEntry(); }}
            className="px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wide bg-white/8 text-white/50 border border-white/10 hover:bg-white/15 hover:text-white transition-all flex items-center gap-1"
          >
            <LayoutGrid size={10} />
            3D Arena
          </button>
          )}

          {/* Manage — popover uses fixed positioning so always on top */}
          <div className="relative">
            <button
              onClick={() => setShowManager(!showManager)}
              className={clsx(
                'px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wide border transition-all flex items-center gap-1',
                showManager
                  ? 'bg-white text-black border-white'
                  : 'bg-white/8 text-white/50 border-white/10 hover:bg-white/15 hover:text-white'
              )}
            >
              <Settings size={10} />
              Manage
            </button>
            {showManager && (
              <MeetingManagerPopover onClose={() => setShowManager(false)} />
            )}
          </div>

          {/* End — host only */}
          {isHost && (
          <button
            onClick={() => { endMeeting(true); broadcastMeetingEnd(); }}
            className="px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wide bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/40 transition-all flex items-center gap-1"
          >
            <Power size={10} />
            End
          </button>
          )}
        </div>
      </div>

      {/* ── Main content area ── */}
      <div className="flex-1 min-h-0 relative">

        {/* Leader presence badge — shown on the 3D shared screen area */}
        {boardroomLeaderId && leaderName && !isWebcamOnly && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[25] pointer-events-none">
            <div className="flex items-center gap-1.5 bg-[#0d0d0d]/80 border border-yellow-500/40 backdrop-blur-sm px-2.5 py-1 rounded-full text-[9px] font-mono">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shrink-0" />
              <span className="text-yellow-300 font-bold">{leaderName}</span>
              <span className="text-white/40">presenting</span>
            </div>
          </div>
        )}

        {/* Active layout */}
        {boardroomLayout === 'focus' && (
          <FocusLayout {...layoutProps} />
        )}
        {boardroomLayout === 'gallery' && (
          <GalleryLayout
            {...layoutProps}
            onPanelWidthChange={setGalleryPanelWidth}
            onWebcamOnlyChange={setIsWebcamOnly}
          />
        )}

        {/* ── Scene Tree floating panel ── */}
        {showTree && !isWebcamOnly && (
          <FloatingPanel
            title="Scene Tree"
            icon={<Layers size={10} />}
            isOpen={showTree}
            onToggle={() => setShowTree(false)}
            width={300}
            style={{ top: 8, left: floatingLeft }}
          >
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
              <SceneTree />
            </div>
          </FloatingPanel>
        )}

        {/* ── Comments floating panel ── */}
        {showComments && !isWebcamOnly && (
          <FloatingPanel
            title="Comments"
            icon={<MessageSquare size={10} />}
            isOpen={showComments}
            onToggle={() => setShowComments(false)}
            width={280}
            style={{ top: 8, right: floatingCommentRight }}
          >
            <div className="max-h-96 overflow-y-auto">
              <CommentsPanel />
            </div>
          </FloatingPanel>
        )}

        {/* ── Transcript popup — slides in from right ── */}
        {showTranscript && boardroomTranscriptPermission && (
          <div
            className="absolute top-0 right-0 bottom-0 z-[50] flex flex-col pointer-events-auto animate-in slide-in-from-right-4 duration-200"
            style={{ width: 340 }}
          >
            <div className="bg-[#0d0d0d]/95 backdrop-blur-md border-l border-white/10 flex flex-col h-full shadow-2xl">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
                <span className="text-white/50 text-[9px] font-mono uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare size={9} />
                  Live Transcript & Insights
                </span>
                <button onClick={() => setShowTranscript(false)} className="text-white/30 hover:text-white transition-colors">
                  <X size={13} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <ConversationPanel />
              </div>
            </div>
          </div>
        )}

        {/* Host: incoming presenter request notification */}
        {isHost && pendingPresenterRequest && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[60] pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3 bg-[#1a1a1a]/95 border border-white/20 backdrop-blur-md px-3 py-2 rounded-lg shadow-xl text-[10px] font-mono">
              <Mic2 size={11} className="text-yellow-400 shrink-0" />
              <span className="text-white/80">
                <span className="text-white font-bold">{pendingPresenterRequest.fromName}</span> wants to present
              </span>
              <button
                onClick={() => { broadcastLeaderTakeover(pendingPresenterRequest.fromUserId); setPendingPresenterRequest(null); }}
                className="flex items-center gap-1 bg-green-500/20 border border-green-500/40 text-green-300 px-2 py-0.5 rounded hover:bg-green-500/40 transition-colors"
              >
                <CheckCircle size={9} /> Allow
              </button>
              <button
                onClick={() => setPendingPresenterRequest(null)}
                className="flex items-center gap-1 bg-white/5 border border-white/15 text-white/40 px-2 py-0.5 rounded hover:bg-white/15 transition-colors"
              >
                <XCircle size={9} /> Deny
              </button>
            </div>
          </div>
        )}

        {/* Non-host: request to present button (only when not in takeover mode and not already presenter) */}
        {!isHost && !isPresenter && !takeoverModeEnabled && (
          <div className="absolute bottom-16 right-3 z-20 pointer-events-auto">
            <button
              onClick={() => {
                const stored = localStorage.getItem('vp_user');
                const name = stored ? JSON.parse(stored).name || 'Guest' : 'Guest';
                broadcastPresenterRequest(localUserId, name);
              }}
              className="flex items-center gap-1.5 bg-[#1a1a1a]/80 border border-white/20 backdrop-blur-sm text-white/60 hover:text-white hover:border-white/40 text-[9px] font-mono px-2.5 py-1.5 rounded-full transition-all"
            >
              <Mic2 size={10} />
              Request to Present
            </button>
          </div>
        )}

        {/* Detachment indicator — shown when user dragged away from presenter cam */}
        {!isWebcamOnly && !screenSharing && boardroomPresenterDetachedId && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-in fade-in duration-200">
            <div className="flex items-center gap-2 bg-orange-500/90 backdrop-blur-sm text-white text-[9px] font-mono px-3 py-1.5 rounded-full shadow-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>FREE LOOK · auto-resume in 3s</span>
              <button
                onClick={resumeBoardroomPresenter}
                className="ml-1 bg-white/20 hover:bg-white/40 px-2 py-0.5 rounded text-[8px] font-bold transition-colors"
              >
                Resume
              </button>
            </div>
          </div>
        )}
        {/* Static hint when following presenter and not detached */}
        {!isWebcamOnly && boardroomLeaderId && !screenSharing && !boardroomPresenterDetachedId && !isPresenter && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="bg-black/35 backdrop-blur-sm text-white/20 text-[8px] font-mono px-3 py-1 rounded-full whitespace-nowrap">
              drag to look around · auto-resumes after 3s
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardroomShell;
