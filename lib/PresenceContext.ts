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
  broadcastLaserMove: noop,
  broadcastPrivacyMode: noop,
  broadcastLeaderTakeover: noop,
});

export const usePresence = () => useContext(PresenceContext);
