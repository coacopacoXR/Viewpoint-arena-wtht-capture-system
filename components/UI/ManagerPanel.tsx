import React, { useEffect, useMemo, useState } from 'react';
import {
  X, AlertTriangle, CheckCircle2, Lightbulb, Check, XCircle, Pencil,
  ClipboardList, StickyNote, ChevronDown, ChevronLeft, ChevronRight,
  Mic, MessageSquare, MessageCircle, Layers, Camera,
  Info, ShieldAlert, Square, RefreshCw, Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../../store';
import { useActiveReviewStore } from '../../lib/activeReviewStore';
import { usePresence } from '../../lib/PresenceContext';
import { useConnectorConfig } from '../../lib/config/ConfigContext';
import { useWebRTCContext } from '../../lib/WebRTCContext';
import { useMeetingRecorder } from '../../lib/useMeetingRecorder';
import { LocalCaptureProvider, meetingSlideContext } from '../../lib/connectors/capture/local';
import InsightDetailModal from './InsightDetailModal';
import ConversationPanel from './ConversationPanel';
import CommentsPanel from './CommentsPanel';
import ChatPanel from './ChatPanel';
import ReviewPanelContent from './ReviewPanelContent';
import type { InsightCard } from '../../types';
import type { PinSeverity } from '../../lib/reviewSetupStore';

// Split-screen meeting workspace for the host. Top: persistent slide-context
// hero anchored to the active agenda slide, then — only when the deployment
// selected capture.provider 'local' — the post-meeting recording controls.
// Below: tabbed surfaces for action triage, follow-up notes, curated
// viewpoint/pin editing, capture transcript, comments, and chat. Absorbs the
// right side-panel entirely.

type TabId = 'actions' | 'notes' | 'curated' | 'capture' | 'comments' | 'chat';

const TYPE_META: Record<InsightCard['type'], { label: string; color: string; icon: React.ReactNode }> = {
  RISK:      { label: 'Risk',      color: '#ef4444', icon: <AlertTriangle size={12} /> },
  ACTION:    { label: 'Action',    color: '#3b82f6', icon: <CheckCircle2 size={12} /> },
  RATIONALE: { label: 'Rationale', color: '#f59e0b', icon: <Lightbulb size={12} /> },
};

const STATUS_PILL: Record<InsightCard['details']['status'], string> = {
  Open:        'bg-gray-100 text-gray-700 border-gray-300',
  'In Review': 'bg-amber-50 text-amber-700 border-amber-300',
  Approved:    'bg-emerald-50 text-emerald-700 border-emerald-300',
  Rejected:    'bg-red-50 text-red-700 border-red-300',
};

const PIN_COLOR: Record<PinSeverity, string> = {
  info: '#3b82f6',
  concern: '#f59e0b',
  blocker: '#ef4444',
};

const PIN_ICON: Record<PinSeverity, React.ReactNode> = {
  info: <Info size={10} />,
  concern: <AlertTriangle size={10} />,
  blocker: <ShieldAlert size={10} />,
};

const ManagerPanel: React.FC = () => {
  const setManagerMode = useActiveReviewStore((s) => s.setManagerMode);
  const config = useActiveReviewStore((s) => s.config);
  const insightCards = useStore((s) => s.insightCards);
  const comments = useStore((s) => s.comments);
  const liveChat = useStore((s) => s.liveChat);
  // Only the 'local' provider records and uploads audio. Every other provider
  // leaves this panel exactly as it was, which is why the section below is
  // conditional rather than rendered-but-disabled.
  const captureProvider = useConnectorConfig().capture;

  const [tab, setTab] = useState<TabId>('actions');
  const [lastSeenChat, setLastSeenChat] = useState(0);

  React.useEffect(() => {
    if (tab === 'chat') setLastSeenChat(liveChat.length);
  }, [tab, liveChat.length]);

  const openActions = insightCards.filter(
    (c) => c.details.status === 'Open' || c.details.status === 'In Review',
  ).length;
  const unresolvedComments = comments.filter((c) => !c.resolved).length;
  const unreadChat = tab === 'chat' ? 0 : Math.max(0, liveChat.length - lastSeenChat);

  return (
    <div className="w-full h-full flex flex-col bg-[#fafafa] text-gray-800 font-sans overflow-hidden border-l border-gray-200">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <header className="relative flex items-center justify-between px-4 py-2.5 shrink-0 bg-gradient-to-r from-[#0f172a] via-[#134e4a] to-[#0f172a] text-white border-b border-emerald-900/40">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
            <ClipboardList size={12} className="text-emerald-300" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/90">Manager Workspace</div>
            {config?.title && (
              <div className="text-[11px] text-white/70 truncate leading-tight">{config.title}</div>
            )}
          </div>
        </div>
        <button
          onClick={() => setManagerMode(false)}
          className="text-white/50 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
          title="Close manager view"
        >
          <X size={16} />
        </button>
      </header>

      {/* ─── Persistent slide-context hero ──────────────────────────────────── */}
      <SlideHero />

      {/* ─── Post-meeting recording (capture.provider 'local' only) ─────────── */}
      {captureProvider === 'local' && <PostMeetingSummary />}

      {/* ─── Tab bar ────────────────────────────────────────────────────────── */}
      <nav className="flex border-b border-gray-200 bg-white shrink-0 overflow-x-auto custom-scrollbar">
        <TabButton id="actions"  current={tab} onSelect={setTab} icon={<CheckCircle2 size={12} />} badge={openActions}>Actions</TabButton>
        <TabButton id="notes"    current={tab} onSelect={setTab} icon={<StickyNote size={12} />}>Notes</TabButton>
        <TabButton id="curated"  current={tab} onSelect={setTab} icon={<Camera size={12} />}>Curated</TabButton>
        <span className="w-px self-center h-5 bg-gray-200 shrink-0" />
        <TabButton id="capture"  current={tab} onSelect={setTab} icon={<Mic size={12} />}>Capture</TabButton>
        <TabButton id="comments" current={tab} onSelect={setTab} icon={<MessageSquare size={12} />} badge={unresolvedComments} badgeColor="blue">Comments</TabButton>
        <TabButton id="chat"     current={tab} onSelect={setTab} icon={<MessageCircle size={12} />} badge={unreadChat} badgeColor="green">Chat</TabButton>
      </nav>

      {/* ─── Tab content ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-white">
        {tab === 'actions'  && <ActionsTab />}
        {tab === 'notes'    && <NotesTab />}
        {tab === 'curated'  && (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <ReviewPanelContent theme="light" embedded />
          </div>
        )}
        {tab === 'capture'  && <div className="flex-1 min-h-0 overflow-hidden"><ConversationPanel /></div>}
        {tab === 'comments' && <div className="flex-1 min-h-0 overflow-hidden"><CommentsPanel /></div>}
        {tab === 'chat'     && <div className="flex-1 min-h-0 overflow-hidden"><ChatPanel /></div>}
      </div>
    </div>
  );
};

// ─── Persistent slide-context hero ─────────────────────────────────────────

const SlideHero: React.FC = () => {
  const config = useActiveReviewStore((s) => s.config);
  const agendaIdx = useActiveReviewStore((s) => s.agendaIdx);
  const nextSlide = useActiveReviewStore((s) => s.nextSlide);
  const prevSlide = useActiveReviewStore((s) => s.prevSlide);
  const jumpToSlide = useActiveReviewStore((s) => s.jumpToSlide);
  const jumpToViewpoint = useActiveReviewStore((s) => s.jumpToViewpoint);

  if (!config || config.agenda.length === 0) {
    return (
      <div className="px-4 py-3 bg-gradient-to-b from-white to-gray-50 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-gray-400">
          <Layers size={11} /> No slides in this review
        </div>
      </div>
    );
  }

  const slide = config.agenda[Math.max(0, Math.min(agendaIdx, config.agenda.length - 1))];
  const linkedVps = slide.viewpointIds
    .map((vid) => config.viewpoints.find((v) => v.id === vid))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
  const linkedPins = slide.pinIds
    .map((pid) => config.pins.find((p) => p.id === pid))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <section className="relative shrink-0 bg-gradient-to-b from-emerald-50/80 via-white to-white border-b border-gray-200">
      {/* Top row: slide counter + nav buttons */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
          <Layers size={11} className="text-emerald-600" />
          Slide {agendaIdx + 1} <span className="text-emerald-400">/</span> {config.agenda.length}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={prevSlide}
            disabled={config.agenda.length < 2}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous slide"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={nextSlide}
            disabled={config.agenda.length < 2}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next slide"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Title + notes */}
      <div className="px-4 pb-2">
        <div className="text-[15px] font-bold text-gray-900 leading-tight truncate">
          {slide.title || 'Untitled slide'}
        </div>
        {slide.notes && (
          <div className="text-[11px] text-gray-500 italic line-clamp-2 mt-0.5 leading-snug">
            {slide.notes}
          </div>
        )}
      </div>

      {/* Attached viewpoints + pins */}
      {(linkedVps.length > 0 || linkedPins.length > 0) && (
        <div className="px-4 pb-2.5 flex flex-wrap gap-1.5">
          {linkedVps.map((v) => (
            <button
              key={v.id}
              onClick={() => jumpToViewpoint(v.id)}
              className="group flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-white border border-emerald-200 hover:border-emerald-400 hover:shadow-sm transition-all"
              title={`Jump camera to ${v.label}`}
            >
              {v.thumbnail ? (
                <img src={v.thumbnail} alt="" className="w-6 h-4 object-cover rounded-full" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Camera size={9} className="text-emerald-600" />
                </span>
              )}
              <span className="text-[10px] font-bold text-emerald-800 group-hover:text-emerald-900 truncate max-w-[110px]">
                {v.label}
              </span>
            </button>
          ))}
          {linkedPins.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold"
              style={{
                background: `${PIN_COLOR[p.severity]}15`,
                borderColor: `${PIN_COLOR[p.severity]}60`,
                color: PIN_COLOR[p.severity],
              }}
            >
              {PIN_ICON[p.severity]}
              <span className="truncate max-w-[110px]">{p.label}</span>
            </span>
          ))}
        </div>
      )}

      {/* Dot navigator */}
      <div className="px-4 pb-3 flex items-center justify-center gap-1">
        {config.agenda.map((_, i) => (
          <button
            key={i}
            onClick={() => jumpToSlide(i)}
            title={`Slide ${i + 1}`}
            className={clsx(
              'rounded-full transition-all shrink-0',
              i === agendaIdx
                ? 'w-4 h-1.5 bg-emerald-500'
                : 'w-1.5 h-1.5 bg-gray-300 hover:bg-gray-400'
            )}
          />
        ))}
      </div>
    </section>
  );
};

// ─── Post-meeting summary (local capture only) ──────────────────────────────

/** mm:ss, the shape a host reads off a wall clock mid-review. */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

type SummaryOutcome = { added: number } | { message: string };

// Records the meeting, uploads the recording when the host stops it, and puts
// the returned cards in the store so they land in the Actions tab beside every
// other insight.
//
// Three things this component is careful about:
//   * it NEVER starts recording on its own — a review is sensitive audio and
//     the host decides when the tape rolls;
//   * a failed upload keeps the Blob, so "Retry" re-sends the same recording
//     instead of asking five engineers to have the meeting again;
//   * it renders only under capture.provider 'local', so a mock or cloud
//     deployment sees no recording UI at all.
const PostMeetingSummary: React.FC = () => {
  const { localStream, remoteStreams } = useWebRTCContext();
  const { state, start, stop } = useMeetingRecorder({ localStream, remoteStreams });
  const addInsightCard = useStore((s) => s.addInsightCard);
  const reviewConfig = useActiveReviewStore((s) => s.config);
  const agendaIdx = useActiveReviewStore((s) => s.agendaIdx);

  // Holds no credential: the shared secret is added by the same-origin proxy.
  const provider = useMemo(() => new LocalCaptureProvider(), []);

  const [summarising, setSummarising] = useState(false);
  const [outcome, setOutcome] = useState<SummaryOutcome | null>(null);
  const [recording, setRecording] = useState<Blob | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (state !== 'recording') return;
    const startedAt = Date.now();
    setElapsedMs(0);
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  // Batch mode has one context for the whole recording: the slide the host is
  // on now, or the review title when there is no agenda. Both already exist in
  // the store, so nothing new is persisted for this.
  const summarise = async (audio: Blob): Promise<void> => {
    setSummarising(true);
    setOutcome(null);
    try {
      const cards = await provider.captureRecording(
        audio,
        meetingSlideContext(reviewConfig, agendaIdx),
      );
      for (const card of cards) addInsightCard(card);
      setOutcome({ added: cards.length });
    } catch (err) {
      setOutcome({
        message: err instanceof Error ? err.message : 'The summary request failed.',
      });
    } finally {
      setSummarising(false);
    }
  };

  const handleStart = async (): Promise<void> => {
    setOutcome(null);
    try {
      await start();
    } catch (err) {
      setOutcome({
        message: err instanceof Error ? err.message : 'Recording could not be started.',
      });
    }
  };

  const handleStop = async (): Promise<void> => {
    try {
      const audio = await stop();
      setRecording(audio);
      await summarise(audio);
    } catch (err) {
      setOutcome({
        message: err instanceof Error ? err.message : 'Recording could not be stopped.',
      });
    }
  };

  return (
    <section className="shrink-0 border-b border-gray-200 bg-white px-4 py-2.5">
      <div className="flex items-center gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 shrink-0">
          Post-meeting summary
        </h2>
        <span className="text-[9px] font-mono text-gray-300 shrink-0">local capture</span>
        <div className="flex-1 min-w-0" />

        {state === 'recording' && (
          <>
            <span
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 border border-red-300 text-[10px] font-bold uppercase tracking-wider text-red-600 shrink-0"
              role="status"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Recording {formatElapsed(elapsedMs)}
            </span>
            <button
              onClick={() => void handleStop()}
              disabled={summarising}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Square size={10} /> Stop &amp; summarise
            </button>
          </>
        )}

        {state === 'idle' && (
          <button
            onClick={() => void handleStart()}
            disabled={summarising}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Mic size={11} /> Start recording
          </button>
        )}

        {state === 'unsupported' && (
          <span className="text-[10px] text-gray-400 italic truncate">
            This browser cannot record audio.
          </span>
        )}
      </div>

      {summarising && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gray-500">
          <Loader2 size={11} className="animate-spin" /> Summarising…
        </div>
      )}

      {!summarising && outcome !== null && 'added' in outcome && (
        <div className="mt-1.5 text-[10px] font-bold text-emerald-700">
          {outcome.added} insight{outcome.added === 1 ? '' : 's'} added
        </div>
      )}

      {!summarising && outcome !== null && !('added' in outcome) && (
        <div className="mt-1.5 flex items-start gap-2">
          <p className="flex-1 min-w-0 text-[10px] text-red-600 leading-snug break-words">
            {outcome.message}
          </p>
          {recording !== null && (
            <button
              onClick={() => void summarise(recording)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 transition-colors shrink-0"
              title="Re-send the same recording"
            >
              <RefreshCw size={10} /> Retry
            </button>
          )}
        </div>
      )}
    </section>
  );
};

// ─── Tab button ─────────────────────────────────────────────────────────────

const TabButton: React.FC<{
  id: TabId;
  current: TabId;
  onSelect: (id: TabId) => void;
  icon: React.ReactNode;
  badge?: number;
  badgeColor?: 'emerald' | 'blue' | 'green';
  children: React.ReactNode;
}> = ({ id, current, onSelect, icon, badge, badgeColor = 'emerald', children }) => {
  const active = id === current;
  const badgeBg = badgeColor === 'blue' ? 'bg-blue-500' : badgeColor === 'green' ? 'bg-green-500' : 'bg-emerald-500';
  return (
    <button
      onClick={() => onSelect(id)}
      className={clsx(
        'shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors relative border-b-2',
        active
          ? 'text-gray-900 border-emerald-500 bg-emerald-50/50'
          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-transparent'
      )}
    >
      <span className={clsx(active ? 'text-emerald-600' : 'text-gray-400')}>{icon}</span>
      {children}
      {badge !== undefined && badge > 0 && (
        <span className={clsx('ml-0.5 min-w-[16px] h-4 px-1 rounded-full text-[8px] flex items-center justify-center font-bold text-white', badgeBg)}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
};

// ─── Actions tab ────────────────────────────────────────────────────────────

const ActionsTab: React.FC = () => {
  const insightCards = useStore((s) => s.insightCards);
  const updateInsight = useStore((s) => s.updateInsight);
  const [editingCard, setEditingCard] = useState<InsightCard | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'decided'>('all');

  const filteredCards = insightCards.filter((c) => {
    if (filter === 'open') return c.details.status === 'Open' || c.details.status === 'In Review';
    if (filter === 'decided') return c.details.status === 'Approved' || c.details.status === 'Rejected';
    return true;
  });

  const setStatus = (cardId: string, status: InsightCard['details']['status']) => {
    const card = insightCards.find((c) => c.id === cardId);
    if (!card) return;
    updateInsight(cardId, { details: { ...card.details, status } });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 py-2 flex items-center justify-between border-b border-gray-100 shrink-0 bg-gray-50/50">
        <div className="text-[10px] font-mono text-gray-400">
          {insightCards.length} card{insightCards.length === 1 ? '' : 's'}
        </div>
        <div className="flex items-center gap-0.5 text-[10px] font-bold uppercase">
          {(['all', 'open', 'decided'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-2 py-0.5 rounded transition-colors',
                filter === f
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'text-gray-400 hover:text-gray-700'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
        {filteredCards.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-[11px] italic">
            {insightCards.length === 0
              ? 'No action cards yet — the AI will generate them as the meeting progresses.'
              : 'No cards match this filter.'}
          </div>
        )}
        {filteredCards.map((card) => {
          const meta = TYPE_META[card.type];
          return (
            <div key={card.id} className="rounded-md border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all">
              <div className="px-3 py-2 flex items-start gap-2">
                <span
                  className="mt-0.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-white shrink-0"
                  style={{ background: meta.color }}
                >
                  {meta.icon} {meta.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-bold text-gray-900 truncate">{card.title}</div>
                  <div className="text-[11px] text-gray-600 line-clamp-2 leading-snug mt-0.5">{card.description}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={clsx('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border', STATUS_PILL[card.details.status])}>
                      {card.details.status}
                    </span>
                    {card.details.assignee && (
                      <span className="text-[10px] text-gray-500 truncate">→ {card.details.assignee}</span>
                    )}
                    {card.details.priority && (
                      <span className="text-[9px] font-mono text-gray-400">{card.details.priority}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-3 pb-2 flex items-center gap-1">
                <button
                  onClick={() => setStatus(card.id, 'Approved')}
                  disabled={card.details.status === 'Approved'}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-emerald-200"
                >
                  <Check size={11} /> Approve
                </button>
                <button
                  onClick={() => setStatus(card.id, 'Rejected')}
                  disabled={card.details.status === 'Rejected'}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-red-50 hover:bg-red-100 text-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-red-200"
                >
                  <XCircle size={11} /> Reject
                </button>
                <button
                  onClick={() => setEditingCard(card)}
                  className="flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors border border-gray-200"
                  title="Open full editor"
                >
                  <Pencil size={11} /> Edit
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {editingCard && (
        <InsightDetailModal card={editingCard} onClose={() => setEditingCard(null)} />
      )}
    </div>
  );
};

// ─── Notes tab (per-slide follow-ups + session notes) ───────────────────────

const NotesTab: React.FC = () => {
  const config = useActiveReviewStore((s) => s.config);
  const agendaIdx = useActiveReviewStore((s) => s.agendaIdx);
  const updateAgendaItem = useActiveReviewStore((s) => s.updateAgendaItem);
  const sessionNotes = useActiveReviewStore((s) => s.sessionNotes);
  const setSessionNotes = useActiveReviewStore((s) => s.setSessionNotes);
  const { broadcastReviewConfig } = usePresence();

  const updateSlideFollowUp = (itemId: string, followUp: string) => {
    const next = updateAgendaItem(itemId, { followUp });
    if (next) broadcastReviewConfig(next);
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      {/* Slide follow-ups */}
      <section className="border-b border-gray-100">
        <div className="px-4 py-2.5 flex items-center gap-2 sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 z-10">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Slide Follow-ups</h2>
          <span className="text-[10px] font-mono text-gray-400">({config?.agenda.length ?? 0})</span>
        </div>
        <div className="px-3 py-2 flex flex-col gap-1.5">
          {(!config || config.agenda.length === 0) && (
            <div className="text-center py-6 text-gray-400 text-[11px] italic">
              No slides in this review.
            </div>
          )}
          {config?.agenda.map((item, idx) => (
            <SlideFollowUpCard
              key={item.id}
              idx={idx}
              item={item}
              highlighted={idx === agendaIdx}
              onChange={(text) => updateSlideFollowUp(item.id, text)}
            />
          ))}
        </div>
      </section>

      {/* Session notes */}
      <section>
        <div className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-100">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Session Notes</h2>
        </div>
        <div className="px-3 py-3">
          <textarea
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            placeholder="Running log — open items, decisions, parking lot…"
            className="w-full h-48 bg-gray-50 text-[12px] rounded p-3 border border-gray-200 outline-none focus:border-emerald-400 placeholder:text-gray-400 resize-none leading-relaxed text-gray-800"
          />
        </div>
      </section>
    </div>
  );
};

const SlideFollowUpCard: React.FC<{
  idx: number;
  item: { id: string; title: string; followUp?: string };
  highlighted: boolean;
  onChange: (text: string) => void;
}> = ({ idx, item, highlighted, onChange }) => {
  const [open, setOpen] = useState(Boolean(item.followUp) || highlighted);
  React.useEffect(() => {
    if (highlighted) setOpen(true);
  }, [highlighted]);
  return (
    <div className={clsx(
      'rounded border transition-all',
      highlighted
        ? 'border-emerald-300 bg-emerald-50/40 shadow-[0_0_0_3px_rgba(16,185,129,0.08)]'
        : 'border-gray-200 bg-white'
    )}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors"
      >
        <span className={clsx(
          'text-[9px] font-mono tabular-nums w-6 text-left',
          highlighted ? 'text-emerald-600 font-bold' : 'text-gray-400',
        )}>
          {String(idx + 1).padStart(2, '0')}
        </span>
        <span className="flex-1 text-[12px] font-bold text-gray-800 text-left truncate">{item.title || 'Untitled slide'}</span>
        {highlighted && (
          <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500 text-white">
            Live
          </span>
        )}
        {item.followUp && !highlighted && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
            • Noted
          </span>
        )}
        <ChevronDown size={13} className={clsx('text-gray-400 transition-transform', open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <textarea
            value={item.followUp ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Follow-up for this slide — decisions, owners, open questions…"
            className="w-full h-20 bg-white text-[11px] rounded p-2 border border-gray-200 outline-none focus:border-emerald-400 placeholder:text-gray-400 resize-none leading-snug text-gray-800"
          />
        </div>
      )}
    </div>
  );
};

export default ManagerPanel;
