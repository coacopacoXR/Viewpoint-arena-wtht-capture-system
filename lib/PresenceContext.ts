import { createContext, useContext } from 'react';
import type { UsePartyPresenceReturn } from './usePartyPresence';

const noop = () => {};
/** A broadcast that could not be sent, because there is no room to send it to. */
const notSent = () => false;

export const PresenceContext = createContext<UsePartyPresenceReturn>({
  localUserId: '',
  remoteParticipants: { current: new Map() },
  remoteLasers: { current: new Map<string, import('./usePartyPresence').RemoteLaserState>() },
  remoteParticipantList: [],
  broadcastPresence: noop,
  setSameRoom: noop,
  broadcastPresenterChange: noop,
  broadcastInsightCard: noop,
  broadcastLeaderChange: noop,
  broadcastBoardroomCountdown: noop,
  broadcastArenaEntry: noop,
  broadcastLaserMove: noop,
  broadcastPrivacyMode: noop,
  broadcastLeaderTakeover: noop,
  broadcastSceneUpdate: notSent,
  broadcastSetModelEditors: notSent,
  broadcastReviewConfig: () => false,
  broadcastMeetingEnd: noop,
  broadcastTakeoverSync: noop,
  broadcastHostTransfer: noop,
  broadcastPresenterRequest: noop,
  broadcastPresenterRequestDenied: noop,
  broadcastTakeoverAttempt: noop,
  broadcastCommentAdd: noop,
  broadcastCommentUpdate: noop,
  broadcastCommentDelete: noop,
  broadcastCommentResolve: noop,
  broadcastChatMessage: noop,
  broadcastXRPresence: noop,
  broadcastWebRTCSignal: noop,
  registerWebRTCSignalHandler: () => () => {},
});

export const usePresence = () => useContext(PresenceContext);
