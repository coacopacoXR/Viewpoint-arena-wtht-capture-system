// The top bar: how you point, and how the room is run.
//
// Highlight granularity stays visible — it is used constantly — while the two
// set-and-forget pointer toggles fold into Pointer ▾. To the right of the
// divider are the room controls that used to be a row in the top-right corner.
// At >=1500px the room controls carry a short label; below that they are
// icon-only (the label moves into `title`) so the bar still fits the free
// canvas at 1280px.

import React from 'react';
import {
  Crosshair, Users, Share2, Shield, ShieldOff, MonitorPlay, Pencil,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../../../store';
import { usePresence } from '../../../lib/PresenceContext';
import SharePanel from '../SharePanel';
import XRButton from '../XRButton';
import PointerMenu from './PointerMenu';

const WIDE_LABEL = 'hidden [@media(min-width:1500px)]:inline';

type Tone = 'idle' | 'on' | 'danger';

const RoomButton: React.FC<{
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  label: string;
  tone?: Tone;
  trailing?: React.ReactNode;
}> = ({ onClick, title, icon, label, tone = 'idle', trailing }) => (
  <button
    onClick={onClick}
    title={title}
    className={clsx(
      'h-9 px-2 shrink-0 flex items-center gap-1.5 rounded-sm border transition-all pointer-events-auto',
      tone === 'on'
        ? 'bg-black text-white border-black'
        : tone === 'danger'
          ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-black'
    )}
  >
    {icon}
    <span className={clsx(WIDE_LABEL, 'text-[10px] font-bold uppercase tracking-wide')}>{label}</span>
    {trailing}
  </button>
);

interface TopBarProps {
  isHost: boolean;
  roomId?: string;
  showShare: boolean;
  onToggleShare: () => void;
  showParticipants: boolean;
  onToggleParticipants: () => void;
  onOpenDeicticExplainer: () => void;
  /**
   * Whether the Edit button belongs on the bar at all.
   *
   * Decided by lib/reviews/roles.ts through lib/reviews/useReviewRole, not here:
   * on a deployment with accounts it is the person's role in THIS review, and on
   * the default install with none it is the meeting host. Hidden rather than
   * disabled, because a control greyed out for somebody who will never have it is
   * a question the room then has to answer — and the room server would refuse the
   * press anyway.
   */
  canEditReview?: boolean;
  /** Ask the room for Edit. The answer arrives as state, not as a return value. */
  onEditReview?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({
  isHost,
  roomId,
  showShare,
  onToggleShare,
  showParticipants,
  onToggleParticipants,
  onOpenDeicticExplainer,
  canEditReview = false,
  onEditReview,
}) => {
  const isPrivacyMode = useStore((s) => s.isPrivacyMode);
  const togglePrivacyMode = useStore((s) => s.togglePrivacyMode);
  const isBoardroomMode = useStore((s) => s.isBoardroomMode);
  const toggleBoardroomMode = useStore((s) => s.toggleBoardroomMode);
  const triggerBoardroomEntry = useStore((s) => s.triggerBoardroomEntry);
  const laserHighlightGranularity = useStore((s) => s.laserHighlightGranularity);
  const setLaserHighlightGranularity = useStore((s) => s.setLaserHighlightGranularity);
  const agents = useStore((s) => s.agents);
  const hideAgents = useStore((s) => s.hideAgents);
  const { remoteParticipantList, broadcastPrivacyMode, broadcastBoardroomCountdown, broadcastArenaEntry } = usePresence();

  // The same count the participants panel shows in its header.
  const peopleCount = (hideAgents ? 0 : agents.length) + remoteParticipantList.length;

  return (
    <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md border border-gray-200 rounded-md shadow-sm p-1.5 pointer-events-auto">
      {/* Into the review's own editing, leftmost because it is the one control here
          that changes the review rather than the meeting. Pressing it ASKS the room:
          if somebody already has Edit, the answer comes back as "Paco is editing —
          ask them, or take over" rather than as a second editor. */}
      {canEditReview && onEditReview && (
        <RoomButton
          onClick={onEditReview}
          title="Edit the review"
          icon={<Pencil size={16} />}
          label="Edit"
        />
      )}

      {/* Highlight granularity */}
      <div className="flex items-center gap-1 px-1.5 shrink-0">
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

      {/* Finger pointer + hover dwell, folded away but never invisible */}
      <PointerMenu onOpenExplainer={onOpenDeicticExplainer} />

      <div className="w-px h-7 bg-gray-200 mx-0.5 shrink-0" />

      {/* People */}
      <RoomButton
        onClick={onToggleParticipants}
        title="Participants"
        icon={<Users size={16} />}
        label="People"
        tone={showParticipants ? 'on' : 'idle'}
        trailing={
          <span className="text-[10px] font-mono tabular-nums opacity-70">{peopleCount}</span>
        }
      />

      {/* Share */}
      <div className="relative shrink-0">
        <RoomButton
          onClick={onToggleShare}
          title="Share"
          icon={<Share2 size={16} />}
          label="Share"
          tone={showShare ? 'on' : 'idle'}
        />
        {showShare && roomId && (
          <SharePanel roomId={roomId} onClose={onToggleShare} />
        )}
      </div>

      {/* Privacy Mode Toggle */}
      <RoomButton
        onClick={() => { togglePrivacyMode(); broadcastPrivacyMode(!isPrivacyMode); }}
        title={isPrivacyMode ? 'Privacy On' : 'Privacy'}
        icon={isPrivacyMode ? <ShieldOff size={16} /> : <Shield size={16} />}
        label={isPrivacyMode ? 'Privacy On' : 'Privacy'}
        tone={isPrivacyMode ? 'danger' : 'idle'}
      />

      {/* Boardroom Mode Toggle — host only */}
      {isHost && (
        <RoomButton
          onClick={() => {
            if (isBoardroomMode) {
              toggleBoardroomMode();
              broadcastArenaEntry();
            } else {
              triggerBoardroomEntry();
              broadcastBoardroomCountdown();
            }
          }}
          title="Boardroom"
          icon={<MonitorPlay size={16} />}
          label="Boardroom"
          tone={isBoardroomMode ? 'on' : 'idle'}
        />
      )}

      {/* XR Entry — renders nothing when the device supports neither AR nor VR */}
      <XRButton />
    </div>
  );
};

export default TopBar;
