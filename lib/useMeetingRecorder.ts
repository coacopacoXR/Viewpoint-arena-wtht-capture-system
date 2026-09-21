// useMeetingRecorder — record a meeting's audio in the browser (T4.4).
//
// Batch mode only, and that is a design constraint rather than a limitation:
// capture-service's POST /capture takes a complete recording and returns
// InsightCards (docs/local-capture-plan.md's "strong suggestion for the first
// iteration"). There is no live partial transcript here; streaming is T4.7.
//
// What this hook owns:
//   * mixing the local microphone and every remote participant into ONE track,
//     so a meeting with five speakers produces one upload and one transcript
//     with all five voices in it;
//   * picking a container/codec pair the browser can actually encode;
//   * handing back a Blob on stop(), and nothing else. Uploading, the
//     SlideContext and the store write belong to the caller.
//
// What it deliberately does NOT own: the WebRTC tracks. Recording is a passive
// observer of streams it does not create, so stopping a recording must never
// mute or end anybody's call.

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'unsupported';

/**
 * Chunks arrive every second instead of once at the end, so a two-hour meeting
 * does not accumulate as a single unbounded encoder buffer.
 */
const RECORDER_TIMESLICE_MS = 1000;

/** The fallback container when MediaRecorder reports no mimeType of its own. */
const DEFAULT_RECORDING_MIME = 'audio/webm';

// ─── Pure helpers (each testable with fakes, no DOM audio required) ─────────

/**
 * The environment feature-detect reads. Structural on purpose: a test passes
 * `{ MediaRecorder: class {}, AudioContext: class {} }` and jsdom, which has
 * neither, exercises the 'unsupported' path for free.
 */
export interface RecordingEnvironment {
  MediaRecorder?: unknown;
  AudioContext?: unknown;
}

/**
 * Can this browser record and mix audio at all?
 *
 * AudioContext is checked alongside MediaRecorder because mixing is not
 * optional here: a MediaRecorder pointed at the microphone alone would capture
 * the host and nobody else, which for a design review is most of the content
 * missing. A browser with one and not the other is reported as unsupported
 * rather than silently recording half the meeting.
 */
export function isRecordingSupported(
  env: RecordingEnvironment = globalThis,
): boolean {
  return (
    typeof env.MediaRecorder === 'function' &&
    typeof env.AudioContext === 'function'
  );
}

/**
 * Preferred containers, best first. Opus in WebM is what every Chromium and
 * Firefox ships; the OGG pair is the older Firefox fallback; and when a browser
 * supports none of them MediaRecorder is constructed with no mimeType and picks
 * its own default, which is still a recording.
 */
export const RECORDING_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
] as const;

/** The first candidate the browser can encode, or undefined for its default. */
export function selectRecordingMimeType(
  isSupported: (mimeType: string) => boolean,
): string | undefined {
  return RECORDING_MIME_CANDIDATES.find((candidate) => isSupported(candidate));
}

/** The slice of AudioContext the mixer uses, so a fake can satisfy it. */
export type MixingAudioContext = Pick<
  AudioContext,
  'createMediaStreamSource' | 'createMediaStreamDestination' | 'close'
>;

export interface MixingGraph {
  /**
   * Adds every audio track of `stream` to the mix. Idempotent per stream, so a
   * caller can re-attach on every render; video tracks are ignored because a
   * MediaStreamAudioSourceNode only ever reads the audio ones.
   */
  attach(stream: MediaStream): void;
  /** The single mixed stream, which is what the MediaRecorder is given. */
  readonly output: MediaStream;
  /** Disconnects every node and closes the AudioContext. Safe to call twice. */
  dispose(): void;
}

/**
 * N streams in, one stream out.
 *
 * One AudioContext and one MediaStreamAudioDestinationNode for the whole
 * recording: a second context would mean a second clock, and mixing two clocks
 * is how recordings drift out of sync over an hour-long meeting.
 */
export function createMixingGraph(
  context: MixingAudioContext,
  initial: Iterable<MediaStream> = [],
): MixingGraph {
  const destination = context.createMediaStreamDestination();
  const nodes = new Map<MediaStream, MediaStreamAudioSourceNode>();

  function attach(stream: MediaStream): void {
    if (nodes.has(stream)) return;
    const node = context.createMediaStreamSource(stream);
    node.connect(destination);
    nodes.set(stream, node);
  }

  for (const stream of initial) attach(stream);

  return {
    attach,
    get output(): MediaStream {
      return destination.stream;
    },
    dispose(): void {
      for (const node of nodes.values()) node.disconnect();
      nodes.clear();
      // Closing twice rejects; a dispose from stop() followed by one from the
      // unmount cleanup must not surface as an unhandled rejection.
      context.close().catch(() => undefined);
    },
  };
}

/**
 * Concatenates the recorder's chunks into the single upload Blob.
 *
 * The type is the one the recorder was constructed with, not a guess from the
 * first chunk: capture-service hands the file to ffmpeg, which sniffs the real
 * format, so this only has to be honest enough not to mislead an operator.
 */
export function assembleRecording(
  chunks: BlobPart[],
  mimeType: string | undefined,
): Blob {
  return new Blob(chunks, { type: mimeType ?? DEFAULT_RECORDING_MIME });
}

// ─── The hook ───────────────────────────────────────────────────────────────

export interface UseMeetingRecorderOptions {
  /** The local participant's stream, or null before the mic is granted. */
  localStream: MediaStream | null;
  /** Every remote participant, keyed by user id. */
  remoteStreams: Map<string, MediaStream>;
}

export interface UseMeetingRecorderReturn {
  readonly state: RecorderState;
  /** Begins recording. No-op when unsupported or already recording. */
  start(): void;
  /**
   * Stops recording and resolves with the whole recording as one Blob.
   * Rejects only when nothing was in progress — the caller keeps the Blob on a
   * failed UPLOAD, so a summary can be retried without re-running the meeting.
   */
  stop(): Promise<Blob>;
}

export function useMeetingRecorder({
  localStream,
  remoteStreams,
}: UseMeetingRecorderOptions): UseMeetingRecorderReturn {
  // Lazy initialiser: the feature-detect reads globals once, and jsdom (where
  // neither exists) gets 'unsupported' without a render-loop flip.
  const [state, setState] = useState<RecorderState>(() =>
    isRecordingSupported() ? 'idle' : 'unsupported',
  );

  const graphRef = useRef<MixingGraph | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeTypeRef = useRef<string | undefined>(undefined);
  const finishRef = useRef<((blob: Blob) => void) | null>(null);

  // Refs rather than closure values so start() and stop() stay stable: a
  // participant who joins mid-recording is picked up by the attach effect below,
  // not by rebuilding the recorder (which would lose everything already mixed).
  const localStreamRef = useRef(localStream);
  const remoteStreamsRef = useRef(remoteStreams);

  useEffect(() => {
    localStreamRef.current = localStream;
    remoteStreamsRef.current = remoteStreams;

    const graph = graphRef.current;
    if (graph === null) return;
    // useWebRTC replaces the Map (not its streams) whenever a peer joins, so
    // this re-runs and attach() is idempotent for the ones already mixed in.
    if (localStream) graph.attach(localStream);
    for (const stream of remoteStreams.values()) graph.attach(stream);
  }, [localStream, remoteStreams]);

  // Unmount cleanup. Stops the recorder and tears the graph down, and pointedly
  // does NOT call track.stop() on anything: these streams belong to useWebRTC,
  // and navigating away from the manager panel must not end the call.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      const graph = graphRef.current;
      recorderRef.current = null;
      graphRef.current = null;
      finishRef.current = null;
      chunksRef.current = [];
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        // stop() on an inactive recorder throws InvalidStateError.
        if (recorder.state !== 'inactive') recorder.stop();
      }
      graph?.dispose();
    };
  }, []);

  // Reads and clears the pending chunks. A stable callback over refs, so
  // start() and stop() can depend on it without being re-created per render.
  const takeBlob = useCallback((): Blob => {
    const blob = assembleRecording(chunksRef.current, mimeTypeRef.current);
    chunksRef.current = [];
    return blob;
  }, []);

  const start = useCallback(() => {
    if (!isRecordingSupported()) return;
    // Never restarts a recording already in flight: that would discard the
    // meeting so far. The UI only offers start() while idle.
    if (recorderRef.current !== null) return;

    const streams: MediaStream[] = [];
    if (localStreamRef.current !== null) streams.push(localStreamRef.current);
    streams.push(...remoteStreamsRef.current.values());

    const graph = createMixingGraph(new AudioContext(), streams);
    const mimeType = selectRecordingMimeType((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    );
    const recorder =
      mimeType === undefined
        ? new MediaRecorder(graph.output)
        : new MediaRecorder(graph.output, { mimeType });

    chunksRef.current = [];
    mimeTypeRef.current = mimeType;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = takeBlob();
      const finish = finishRef.current;
      finishRef.current = null;
      if (finish !== null) finish(blob);
    };

    graphRef.current = graph;
    recorderRef.current = recorder;
    recorder.start(RECORDER_TIMESLICE_MS);
    setState('recording');
  }, [takeBlob]);

  const stop = useCallback(async (): Promise<Blob> => {
    const recorder = recorderRef.current;
    const graph = graphRef.current;
    if (recorder === null || graph === null) {
      throw new Error(
        'useMeetingRecorder: stop() was called with no recording in progress.',
      );
    }
    recorderRef.current = null;
    graphRef.current = null;
    setState('idle');

    const blob = await new Promise<Blob>((resolveBlob) => {
      if (recorder.state === 'inactive') {
        // Already flushed (or never started): resolving from the pending chunks
        // keeps the caller's await from hanging forever.
        resolveBlob(takeBlob());
        return;
      }
      finishRef.current = resolveBlob;
      recorder.stop();
    });

    // Disposed AFTER the recorder has produced its final chunk: closing the
    // AudioContext first would cut the tail off the meeting.
    graph.dispose();
    return blob;
  }, [takeBlob]);

  return { state, start, stop };
}
