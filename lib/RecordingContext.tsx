// RecordingContext — one recorder, two views, per-speaker live transcript.
//
// Batch W of the grounded-capture plan (section B: every participant records
// their own microphone). The recording controls lived inside PostMeetingSummary
// (ManagerPanel), which replaced the room sidebar — the person recording could
// not watch the LIVE TRANSCRIPT panel. The controls now live in the transcript
// tab AND in the Manager Workspace, both reading from a single RecordingProvider
// mounted in RoomPage.
//
// What this provider owns:
//   * the single useMeetingRecorder instance (host only, mixed stream, for
//     extraction — the final POST /capture);
//   * the useOwnMicTranscriber hook (every client, own mic, for the live
//     transcript);
//   * the useLiveTranscript hook that feeds the LIVE TRANSCRIPT panel;
//   * the LocalCaptureProvider used for both live chunks and the final
//     captureRecording() call;
//   * the elapsed timer, the summarise/retry flow, and the outcome state;
//   * the RECORDING_STATE broadcast (host presses Record → every client
//     starts its own mic slicer).
//
// What it exposes: { state, elapsedMs, outcome, summarising, start, stop,
// retry, liveLines, canRecord, recordingState, ownMicStatus, stopSharingMic }.
// Consumers are pure presentation.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useWebRTCContext } from './WebRTCContext';
import { usePresence } from './PresenceContext';
import { useStore } from '../store';
import { useActiveReviewStore } from './activeReviewStore';
import { useConnectorConfig } from './config/ConfigContext';
import { useMeetingRecorder } from './useMeetingRecorder';
import { useLiveTranscript } from './useLiveTranscript';
import { useOwnMicTranscriber, type OwnMicStatus } from './useOwnMicTranscriber';
import {
  subscribeRecordingState,
  broadcastRecordingState,
  type RecordingStatePayload,
} from './usePartyPresence';
import { usePointingTimeline } from './usePointingTimeline';
import { LocalCaptureProvider, meetingSlideContext } from './connectors/capture/local';
import type { ChatMessage } from '../types';

export type SummaryOutcome = { added: number } | { message: string };

export interface RecordingContextValue {
  state: 'idle' | 'recording' | 'unsupported';
  elapsedMs: number;
  outcome: SummaryOutcome | null;
  summarising: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  retry(): Promise<void>;
  liveLines: ChatMessage[];
  canRecord: boolean;
  /** The room's recording state (who started it, when). Null when idle. */
  recordingState: RecordingStatePayload | null;
  /** Why this client is or is not uploading its own mic. */
  ownMicStatus: OwnMicStatus;
  /** Stop sharing this client's mic. Does NOT stop the room recording. */
  stopSharingMic(): void;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecordingContext(): RecordingContextValue | null {
  return useContext(RecordingContext);
}

/** Read the local user's display name from localStorage (same source as usePartyPresence). */
function getLocalUserName(): string {
  try {
    const stored = localStorage.getItem('vp_user');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.name) return parsed.name;
    }
  } catch { /* ignore */ }
  return 'Guest';
}

export const RecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { localStream, remoteStreams, isMicOn } = useWebRTCContext();
  const { localUserId, broadcastInsightCard } = usePresence();
  const sessionHostId = useStore((s) => s.sessionHostId);
  const addInsightCard = useStore((s) => s.addInsightCard);
  const reviewConfig = useActiveReviewStore((s) => s.config);
  const agendaIdx = useActiveReviewStore((s) => s.agendaIdx);
  const captureProvider = useConnectorConfig().capture;
  const chatHistory = useStore((s) => s.chatHistory);

  // Sample the local user's pointing target at 2 Hz while recording.
  usePointingTimeline(localUserId);

  const isHost = sessionHostId === localUserId || sessionHostId === null;
  const canRecord = isHost && captureProvider === 'local';

  const provider = useMemo(() => new LocalCaptureProvider(), []);

  // Subscribe to the room's recording state (broadcast by the host).
  const [recordingState, setRecordingState] = useState<RecordingStatePayload | null>(null);
  useEffect(() => {
    return subscribeRecordingState(setRecordingState);
  }, []);

  const isRecording = recordingState?.recording === true;
  const recordingStartMs = isRecording ? recordingState!.startedAt : 0;
  const [shownRecordingStart, setShownRecordingStart] = useState(0);

  // React to recording start/stop: update shownRecordingStart for the
  // liveLines filter, and reset when recording stops.
  useEffect(() => {
    if (isRecording && recordingStartMs > 0) {
      setShownRecordingStart(recordingStartMs);
    } else if (!isRecording) {
      setShownRecordingStart(0);
    }
  }, [isRecording, recordingStartMs]);

  const localName = useMemo(() => getLocalUserName(), []);

  const liveLines = useMemo(
    () =>
      shownRecordingStart > 0
        ? chatHistory
            .filter((m) => m.id.startsWith(`live-${shownRecordingStart}-`))
            .slice(-4)
        : [],
    [chatHistory, shownRecordingStart],
  );

  const { onLiveChunk, finish: finishLiveTranscript } = useLiveTranscript({
    provider,
    recordingStartMs,
    speakerId: localUserId,
    speakerName: localName,
  });

  // Per-client own-mic slicer. Runs on every client (host included) while
  // the room is recording. Feeds useLiveTranscript's onLiveChunk.
  const { status: ownMicStatus, stopSharing: stopSharingMic } = useOwnMicTranscriber({
    recording: isRecording,
    startedAtMs: recordingStartMs,
    localStream,
    isMicOn,
    onLiveChunk,
  });

  // Host-only mixed recorder for extraction. No onLiveChunk — the live
  // transcript comes from the per-speaker path now.
  const { state, start, stop } = useMeetingRecorder({
    localStream,
    remoteStreams,
  });

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

  const summarise = useCallback(async (audio: Blob): Promise<void> => {
    setSummarising(true);
    setOutcome(null);
    try {
      const cards = await provider.captureRecording(
        audio,
        meetingSlideContext(reviewConfig, agendaIdx),
      );
      for (const card of cards) {
        addInsightCard(card);
        // Send it to the room. Without this the cards from a real recording
        // existed only on the machine that recorded — the simulated agents
        // broadcast theirs, the real capture path never did (reported
        // 2026-09-23). Same message the simulation uses, so receivers need
        // no new handling.
        broadcastInsightCard(card);
      }
      setOutcome({ added: cards.length });
    } catch (err) {
      setOutcome({
        message: err instanceof Error ? err.message : 'The summary request failed.',
      });
    } finally {
      setSummarising(false);
    }
  }, [provider, reviewConfig, agendaIdx, addInsightCard, broadcastInsightCard]);

  const handleStart = useCallback(async (): Promise<void> => {
    setOutcome(null);
    const startedAt = Date.now();
    // Broadcast RECORDING_STATE first so every client (including self) starts
    // its own mic slicer in sync.
    broadcastRecordingState({
      recording: true,
      startedAt,
      byUserId: localUserId,
      byName: localName,
    });
    try {
      await start();
    } catch (err) {
      // Roll back the broadcast so clients stop their slicers.
      broadcastRecordingState({
        recording: false,
        startedAt: 0,
        byUserId: localUserId,
        byName: localName,
      });
      setOutcome({
        message: err instanceof Error ? err.message : 'Recording could not be started.',
      });
    }
  }, [start, localUserId, localName]);

  const handleStop = useCallback(async (): Promise<void> => {
    try {
      const audio = await stop();
      finishLiveTranscript();
      setRecording(audio);
      broadcastRecordingState({
        recording: false,
        startedAt: 0,
        byUserId: localUserId,
        byName: localName,
      });
      await summarise(audio);
    } catch (err) {
      finishLiveTranscript();
      broadcastRecordingState({
        recording: false,
        startedAt: 0,
        byUserId: localUserId,
        byName: localName,
      });
      setOutcome({
        message: err instanceof Error ? err.message : 'Recording could not be stopped.',
      });
    }
  }, [stop, finishLiveTranscript, summarise, localUserId, localName]);

  const handleRetry = useCallback(async (): Promise<void> => {
    if (recording !== null) {
      await summarise(recording);
    }
  }, [recording, summarise]);

  const value = useMemo<RecordingContextValue>(
    () => ({
      state,
      elapsedMs,
      outcome,
      summarising,
      start: handleStart,
      stop: handleStop,
      retry: handleRetry,
      liveLines,
      canRecord,
      recordingState,
      ownMicStatus,
      stopSharingMic,
    }),
    [state, elapsedMs, outcome, summarising, handleStart, handleStop, handleRetry, liveLines, canRecord, recordingState, ownMicStatus, stopSharingMic],
  );

  return (
    <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>
  );
};
