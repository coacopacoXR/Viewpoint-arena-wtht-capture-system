// RecordingContext — one recorder, two views.
//
// Batch V of the grounded-capture plan. The recording controls lived inside
// PostMeetingSummary (ManagerPanel), which replaced the room sidebar — the
// person recording could not watch the LIVE TRANSCRIPT panel. The controls
// now live in the transcript tab AND in the Manager Workspace, both reading
// from a single RecordingProvider mounted in RoomPage.
//
// What this provider owns:
//   * the single useMeetingRecorder instance (two would record and upload
//     twice — the thing this batch must not do);
//   * the useLiveTranscript hook that feeds the LIVE TRANSCRIPT panel;
//   * the LocalCaptureProvider used for both live chunks and the final
//     captureRecording() call;
//   * the elapsed timer, the summarise/retry flow, and the outcome state.
//
// What it exposes: { state, elapsedMs, outcome, summarising, start, stop,
// retry, liveLines, canRecord }. Consumers are pure presentation.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useWebRTCContext } from './WebRTCContext';
import { usePresence } from './PresenceContext';
import { useStore } from '../store';
import { useActiveReviewStore } from './activeReviewStore';
import { useConnectorConfig } from './config/ConfigContext';
import { useMeetingRecorder } from './useMeetingRecorder';
import { useLiveTranscript } from './useLiveTranscript';
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
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecordingContext(): RecordingContextValue | null {
  return useContext(RecordingContext);
}

export const RecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { localStream, remoteStreams } = useWebRTCContext();
  const { localUserId } = usePresence();
  const sessionHostId = useStore((s) => s.sessionHostId);
  const addInsightCard = useStore((s) => s.addInsightCard);
  const reviewConfig = useActiveReviewStore((s) => s.config);
  const agendaIdx = useActiveReviewStore((s) => s.agendaIdx);
  const captureProvider = useConnectorConfig().capture;
  const chatHistory = useStore((s) => s.chatHistory);

  const isHost = sessionHostId === localUserId || sessionHostId === null;
  const canRecord = isHost && captureProvider === 'local';

  const provider = useMemo(() => new LocalCaptureProvider(), []);

  const [recordingStartMs, setRecordingStartMs] = useState(0);
  const [shownRecordingStart, setShownRecordingStart] = useState(0);

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
  });

  const { state, start, stop } = useMeetingRecorder({
    localStream,
    remoteStreams,
    onLiveChunk: recordingStartMs > 0 ? onLiveChunk : undefined,
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
      for (const card of cards) addInsightCard(card);
      setOutcome({ added: cards.length });
    } catch (err) {
      setOutcome({
        message: err instanceof Error ? err.message : 'The summary request failed.',
      });
    } finally {
      setSummarising(false);
    }
  }, [provider, reviewConfig, agendaIdx, addInsightCard]);

  const handleStart = useCallback(async (): Promise<void> => {
    setOutcome(null);
    const startedAt = Date.now();
    setRecordingStartMs(startedAt);
    setShownRecordingStart(startedAt);
    try {
      await start();
    } catch (err) {
      setRecordingStartMs(0);
      setOutcome({
        message: err instanceof Error ? err.message : 'Recording could not be started.',
      });
    }
  }, [start]);

  const handleStop = useCallback(async (): Promise<void> => {
    try {
      const audio = await stop();
      finishLiveTranscript();
      setRecording(audio);
      setRecordingStartMs(0);
      await summarise(audio);
    } catch (err) {
      finishLiveTranscript();
      setRecordingStartMs(0);
      setOutcome({
        message: err instanceof Error ? err.message : 'Recording could not be stopped.',
      });
    }
  }, [stop, finishLiveTranscript, summarise]);

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
    }),
    [state, elapsedMs, outcome, summarising, handleStart, handleStop, handleRetry, liveLines, canRecord],
  );

  return (
    <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>
  );
};
