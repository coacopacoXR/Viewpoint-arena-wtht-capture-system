import React from 'react';
import type { UseWebRTCReturn } from './useWebRTC';

const defaultReturn: UseWebRTCReturn = {
  localStream: null,
  remoteStreams: new Map(),
  peerStates: new Map(),
  isMicOn: true,
  isCamOn: true,
  hasPermission: false,
  isStarting: false,
  toggleMic: () => {},
  toggleCam: () => {},
};

export const WebRTCContext = React.createContext<UseWebRTCReturn>(defaultReturn);

export function useWebRTCContext(): UseWebRTCReturn {
  return React.useContext(WebRTCContext);
}
