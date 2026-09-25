// Capture pauses while ANYBODY has the review's Edit on — the wiring, not the gate.
//
// docs/plan/14-rooms-models-admin-ai.md batch BH. lib/capture/captureGate.test.ts
// pins the gate's own contract; this pins that the room actually drives it and
// that BOTH capture paths obey it, which is the part that can silently rot:
//
//   the live transcript  useOwnMicTranscriber is handed `recording: false`, so the
//                        per-speaker slicer stops and produces no chunk at all.
//                        Stopping the slicer rather than dropping its output is
//                        what "paused" has to mean for a microphone still open —
//                        the minutes are not recorded-then-discarded either.
//   the extractor        summarise() returns before any audio leaves the browser,
//                        and says why instead of producing cards about the
//                        curation conversation.
//
// And the pause is the ROOM's: it is driven by store.reviewEditing, which the room
// server's EDITING_STATE writes on every client, so a participant who never
// touched Edit is paused too. That is the case worth a test of its own, because
// "pause my own capture while I edit" is the obvious wrong reading.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { isCapturePaused, capturePausedBy } from '../capture/captureGate';
import type { SummaryOutcome } from '../RecordingContext';

// ─── Fakes ──────────────────────────────────────────────────────────────────
// Hoisted so the vi.mock factories below can close over them. The store state is
// a mutable holder because a test flips `reviewEditing` mid-mount, which is what
// an EDITING_STATE arriving from the room server does.

interface FakeStoreState {
  sessionHostId: string | null;
  reviewEditing: { userId: string; name: string } | null;
  chatHistory: unknown[];
  activeModelType: string;
  importedSceneTree: null;
  addInsightCard: () => void;
}

const fakes = vi.hoisted(() => ({
  store: {
    current: {
      sessionHostId: 'host-1',
      reviewEditing: null,
      chatHistory: [],
      activeModelType: 'headphones',
      importedSceneTree: null,
      addInsightCard: () => {},
    } as {
      sessionHostId: string | null;
      reviewEditing: { userId: string; name: string } | null;
      chatHistory: unknown[];
      activeModelType: string;
      importedSceneTree: null;
      addInsightCard: () => void;
    },
  },
  recorderStop: vi.fn(),
  micArgs: { current: [] as boolean[] },
  captureRecording: vi.fn(),
  transcribeChunk: vi.fn(),
}));

const { RecordingProvider, useRecordingContext } = await import('../RecordingContext');

vi.mock('../useMeetingRecorder', () => ({
  useMeetingRecorder: () => ({ state: 'recording', start: vi.fn(), stop: fakes.recorderStop }),
}));

vi.mock('../useLiveTranscript', () => ({
  useLiveTranscript: () => ({ onLiveChunk: vi.fn(), finish: vi.fn() }),
}));

// The live-transcript half of the pause is an ARGUMENT, so every call is recorded.
vi.mock('../useOwnMicTranscriber', () => ({
  useOwnMicTranscriber: (props: { recording: boolean }) => {
    fakes.micArgs.current.push(props.recording);
    return { status: 'idle', stopSharing: vi.fn() };
  },
}));

vi.mock('../WebRTCContext', () => ({
  useWebRTCContext: () => ({ localStream: null, remoteStreams: new Map(), isMicOn: true }),
}));

vi.mock('../PresenceContext', () => ({
  usePresence: () => ({ localUserId: 'host-1', broadcastInsightCard: vi.fn() }),
}));

vi.mock('../config/ConfigContext', () => ({
  useConnectorConfig: () => ({ capture: 'local' }),
}));

// The room IS recording throughout: the call keeps running while Edit is on, and
// that is exactly why the pause has to be a separate fact.
vi.mock('../usePartyPresence', () => ({
  subscribeRecordingState: (listener: (s: unknown) => void) => {
    listener({ recording: true, startedAt: 1000, byUserId: 'host-1', byName: 'Alice' });
    return () => {};
  },
  broadcastRecordingState: vi.fn(),
}));

vi.mock('../../store', () => ({
  useStore: (selector: (s: FakeStoreState) => unknown) => selector(fakes.store.current),
  // summarise() builds its grounded context from the room's parts; none is the
  // honest answer for a room with nothing loaded, and since batch BI it is the
  // answer the store's own helper gives rather than one this file has to build out
  // of a tree and a flattener.
  sceneComponents: () => [],
}));

vi.mock('../activeReviewStore', () => ({
  useActiveReviewStore: (selector: (s: { config: null; agendaIdx: number }) => unknown) =>
    selector({ config: null, agendaIdx: 0 }),
}));

vi.mock('../connectors/capture/local', () => {
  class FakeLocalCaptureProvider {
    captureRecording = fakes.captureRecording;
    transcribeChunk = fakes.transcribeChunk;
  }
  return { LocalCaptureProvider: FakeLocalCaptureProvider, meetingSlideContext: vi.fn() };
});

// ─── Mounting ───────────────────────────────────────────────────────────────

interface RecordingApi {
  state: string;
  outcome: SummaryOutcome | null;
  summarising: boolean;
  stop(): Promise<void>;
  retry(): Promise<void>;
}

let ctx: RecordingApi | null = null;

const Probe: React.FC = () => {
  ctx = useRecordingContext() as RecordingApi | null;
  return <span data-testid="state">{ctx?.state ?? 'null'}</span>;
};

// A FRESH element every time. React bails out of re-rendering a subtree handed
// the identical element reference, which is exactly the re-render setEditing needs.
function tree() {
  return (
    <RecordingProvider>
      <Probe />
    </RecordingProvider>
  );
}

let mounted: ReturnType<typeof render> | null = null;

/** Mount, and give `editing()` a way to re-render against new store state. */
function mountProvider() {
  mounted = render(tree());
  return mounted;
}

/**
 * Change who has Edit on, the way an EDITING_STATE from the room server does.
 *
 * The store mock is a selector over a plain object rather than a real zustand
 * store, so nothing subscribes: the re-render that makes the provider read the
 * new value is forced from here.
 */
async function setEditing(editing: { userId: string; name: string } | null) {
  fakes.store.current = { ...fakes.store.current, reviewEditing: editing };
  await act(async () => {
    mounted?.rerender(tree());
  });
}

function lastSlicerRecording(): boolean | undefined {
  const args = fakes.micArgs.current;
  return args.length === 0 ? undefined : args[args.length - 1];
}

describe('RecordingContext — capture pauses while the review is edited', () => {
  beforeEach(() => {
    fakes.store.current = { ...fakes.store.current, reviewEditing: null };
    fakes.micArgs.current = [];
    fakes.recorderStop.mockReset().mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' }));
    fakes.captureRecording.mockReset().mockResolvedValue({ cards: [] });
    fakes.transcribeChunk.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    mounted = null;
  });

  it('drives the gate from the room’s editing state, and releases it on Done', async () => {
    mountProvider();

    expect(isCapturePaused()).toBe(false);

    await setEditing({ userId: 'editor-1', name: 'Paco' });
    expect(isCapturePaused()).toBe(true);
    expect(capturePausedBy()).toBe('Paco');

    await setEditing(null);
    expect(isCapturePaused()).toBe(false);
    expect(capturePausedBy()).toBeNull();
  });

  it('pauses for somebody who is NOT the person editing — the pause is the room’s', async () => {
    // This client is 'host-1'; the person with Edit on is somebody else. Their
    // microphone would otherwise still be transcribing "no, put that slide after
    // the pin" while the editor's own is quiet.
    mountProvider();
    await setEditing({ userId: 'somebody-else', name: 'Maria' });

    expect(isCapturePaused()).toBe(true);
    expect(capturePausedBy()).toBe('Maria');
  });

  it('stops the per-speaker slicer while the room is still recording', async () => {
    mountProvider();

    // Recording, and not paused: the slicer runs.
    expect(lastSlicerRecording()).toBe(true);

    await setEditing({ userId: 'editor-1', name: 'Paco' });

    // Still recording — the call keeps running — but the slicer is told to stop.
    expect(lastSlicerRecording()).toBe(false);
  });

  it('refuses to send the recording for card extraction, and says whose edit is the reason', async () => {
    mountProvider();
    await setEditing({ userId: 'editor-1', name: 'Paco' });

    // Stopping still works, and the person still gets their audio: it is the
    // SENDING that is refused.
    await act(async () => {
      await ctx?.stop();
    });

    expect(fakes.captureRecording).not.toHaveBeenCalled();
    expect(ctx?.outcome).toEqual({ message: 'Capture is paused while Paco edits the review.' });
    expect(ctx?.summarising).toBe(false);
  });

  it('sends the recording once Edit is off, so the pause resumes rather than ends the capture', async () => {
    mountProvider();
    await setEditing({ userId: 'editor-1', name: 'Paco' });
    await act(async () => {
      await ctx?.stop();
    });
    expect(fakes.captureRecording).not.toHaveBeenCalled();

    await setEditing(null);
    await act(async () => {
      await ctx?.retry();
    });

    // The audio was kept, and now it is read.
    expect(fakes.captureRecording).toHaveBeenCalledTimes(1);
  });

  it('captures as usual when nobody is editing — a meeting must not have changed', async () => {
    mountProvider();

    await act(async () => {
      await ctx?.stop();
    });

    expect(isCapturePaused()).toBe(false);
    expect(fakes.captureRecording).toHaveBeenCalledTimes(1);
    expect(ctx?.outcome).not.toEqual({ message: 'Capture is paused while Paco edits the review.' });
  });
});
