import { createContext, useContext } from 'react';
import type { UsePartyPresenceReturn } from './usePartyPresence';

const noop = () => {};

export const PresenceContext = createContext<UsePartyPresenceReturn>({
  localUserId: '',
  remoteParticipants: { current: new Map() },
  remoteLasers: { current: new Map() },
  remoteParticipantList: [],
  broadcastPresence: noop,
  broadcastPresenterChange: noop,
  broadcastInsightCard: noop,
  broadcastLeaderChange: noop,
  broadcastBoardroomCountdown: noop,
  broadcastArenaEntry: noop,
  broadcastLaserMove: noop,
  broadcastPrivacyMode: noop,
  broadcastLeaderTakeover: noop,
  broadcastModelChange: noop,
  broadcastMeetingEnd: noop,
  broadcastTakeoverSync: noop,
  broadcastHostTransfer: noop,
  broadcastPresenterRequest: noop,
  broadcastTakeoverAttempt: noop,
  broadcastCommentAdd: noop,
  broadcastCommentUpdate: noop,
  broadcastCommentDelete: noop,
  broadcastCommentResolve: noop,
});

export const usePresence = () => useContext(PresenceContext);
