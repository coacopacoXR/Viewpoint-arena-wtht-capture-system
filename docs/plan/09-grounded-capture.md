# Plan — grounded capture: who said it, what they pointed at, which part they meant

Written 2026-09-22, after the live transcript (T4.7 first slice) shipped.
Four pieces, in order. Each is a Qwen batch with a live check by Claude.

Today's behaviour, for contrast:
- The **host alone** records. `useMeetingRecorder` mixes the host mic with the
  WebRTC call audio into one stream; clips of it go to Whisper.
- Every transcript line is labelled **"Meeting"**. There is no diarization, so
  a mixed stream cannot say who spoke.
- Cards come from **re-transcribing the whole recording** at stop
  (`POST /capture`), with one `SlideContext` for the entire meeting: the
  agenda slide, plus whatever the host happened to be hovering / pointing at
  **at the moment the recording stopped**.
- The model tree is never sent to the LLM, so "the left ear cup" is just text
  and `componentReference` is whatever the model invents.

---

## A. Record where the transcript is (small)

The recording controls live in the Manager Workspace, which replaces the room
sidebar — the person recording cannot watch the transcript, which is why a
duplicate live box had to be added there.

- Move the controls into the **LIVE TRANSCRIPT** panel
  (`components/UI/ConversationPanel.tsx`): one shared `RecordingControls`
  component (start / stop / elapsed / outcome), host-only, rendered at the top
  of the transcript tab.
- The Manager Workspace keeps the cards and the summary, and drops its copy of
  the live box (the panel is visible from there in split screen).
- Mobile (`MobileRoomView`) gets the same control if the transcript panel
  exists there; otherwise nothing changes.

Done = the host can start, watch words appear, and stop, without opening the
Manager Workspace.

---

## B. Every participant records their own microphone

**The question this answers:** several people talking, each on their own
machine. A mixed stream cannot be split reliably (diarization on far-field
laptop audio is poor and expensive). Each browser already has one clean,
close-mic signal: its own. So each browser transcribes **its own microphone**
and labels the lines with **its own user name** — no diarization needed, and
overlapping speech stays separate because it is captured separately.

- The host presses Record. A new PartyKit message `RECORDING_STATE`
  (`{ recording: boolean, startedAt: number, by: userId }`) tells every
  participant.
- On receiving it, each client runs the existing live chunker **on its own
  mic** (`navigator.mediaDevices.getUserMedia`, the same track the call
  already uses), posts clips to `/api/capture/transcribe`, and broadcasts each
  line as `TRANSCRIPT_LINE` with `speakerName = their display name`,
  `speakerId = their userId`, plus `startedAtMs` (ms since recording start,
  from their own clock).
- Everyone's panel shows the merged, speaker-labelled transcript, ordered by
  `startedAtMs`.
- The **host also keeps the mixed recording** exactly as now, as the fallback
  for extraction (see D) and so a meeting still works when guests refuse the
  microphone.

Consent and privacy, which this changes materially. **User decided
2026-09-22: no per-person prompt — every mic joins automatically, with an
unmissable indicator.** So:
- A participant's mic audio now leaves their machine (to the server the host's
  deployment runs, which is the same server already carrying their call audio).
- While recording, every participant sees a persistent, unmissable indicator
  naming who started it, and a one-click "stop sharing my mic" in it (nobody
  is asked, so leaving must always be one click away). The browser may still
  raise its own microphone permission prompt the first time in a tab — that is
  the browser's, not the app's, and cannot be suppressed.
- A participant who has not granted the browser permission simply contributes
  no lines; the meeting proceeds.
- `TRANSCRIPT_LINE` must be trusted only from the sender: the room server
  stamps `speakerId` from the connection, so one participant cannot post lines
  as another. (Today the payload is relayed as-is — a spoofing hole worth
  closing in the same batch.)

Cost: N speakers means N× the Whisper load. Each client sends at most one 8 s
clip every 8 s, and capture-service transcribes base.en far faster than real
time, but the existing backpressure (drop oldest, gap line) now matters per
client. A room of 6 on one laptop-grade box is the limit to document.

---

## B-bis. Two faults the user hit on 2026-09-23 (fix before C)

1. **The recording indicator only shows on the host's screen.** Everyone else
   has no idea a meeting is being recorded. Section B's `RECORDING_STATE`
   broadcast is what fixes this (in flight as batch W2); until it lands, a
   participant is recorded — through the call audio — with nothing on screen
   saying so. That is the wrong default for a tool that records people, and
   it is a release blocker, not a nicety.

2. **The host sees no live transcript of their own speech.** Cause, found by
   reading the code after the report: `hasLiveAudio()` accepts a track whose
   `readyState !== 'ended'`, but a MUTED track is still "live" — only
   `enabled` is false. Since the mic now starts muted (audio batch, deliberate:
   the call opens on room entry), the recorder mixes the muted call track,
   never falls back to opening its own mic, and Whisper receives silence —
   which the new VAD filter then correctly drops, so not a single line
   appears. Before the mute default, the recorder fell back to its own mic
   and it worked.

   The fix is NOT to record from a muted microphone: mute must mean mute.
   - `hasLiveAudio` requires `track.enabled` as well as a non-ended state;
   - recording while muted shows "Your microphone is muted — unmute to be
     recorded" in the recording controls, and the indicator says the same;
   - a client that is muted uploads nothing (section B already says this for
     other participants; it applies to the host too).

## C. A pointing timeline ("what were they pointing at while they said it")

Everything needed already exists per participant: the laser
(`LASER_MOVE` carries `targetPartName`), the hover highlight, the finger
pointer, and the model tree.

- Add a small recorder (`lib/usePointingTimeline.ts`): while recording, sample
  each participant's current deictic target (laser target part, hovered part,
  finger target) at ~2 Hz, coalesce into **segments**
  `{ userId, partId, partName, source: 'laser'|'hover'|'finger', fromMs, toMs }`,
  and drop segments shorter than ~400 ms (a cursor crossing a part is not a
  reference).
- Each client keeps its own segments and broadcasts them (batched every few
  seconds) so the host holds the whole room's timeline; the host also stores
  its own. Cap the timeline (e.g. 2000 segments, oldest dropped) so a long
  meeting cannot grow without bound.
- **User decided 2026-09-22: show it.** The panel shows a small
  "👉 Left Ear Cup" chip beside a transcript line
  whose time window overlaps a segment from the same speaker. This is also
  the evidence trail: it makes "what did they mean by *this*" answerable
  after the fact.

---

## D. Give the AI the component tree, and let it resolve references

Two kinds of reference have to land on the same thing:
- **deictic** — "this clearance here" while pointing at Left Ear Cushion;
- **verbal** — "the left ear cup", "the headband frame".

Changes:
1. **Extraction input becomes the transcript, not the audio.** Once B exists,
   the speaker-labelled transcript is better than anything re-transcribing a
   mixed recording can produce. Add `POST /extract` to capture-service
   (transcript + context, no audio) mirroring the existing cloud path
   (`api/capture/extract.ts`); keep `POST /capture` for the audio fallback
   when no live transcript was collected (guests declined, or the host
   recorded alone offline).
2. **Send a compact component tree**: id, name, parent, from the store's
   scene tree (`SceneNode`), flattened to at most ~200 entries with their
   path ("Sennheiser Momentum 4 / Left Ear Cup / Left Ear Cushion"). Big
   imported assemblies must be truncated deterministically (breadth-first,
   keep named groups over leaf meshes) and the prompt told it is partial.
3. **Send the pointing timeline** from C, already aligned to transcript times.
4. **Prompt** (`lib/connectors/capture/extractionPrompt.ts` and the Python
   twin in `capture_service/prompt.py`, which are parity-tested):
   - transcript lines carry `speaker` and `t=<ms>`;
   - a "What people were pointing at" section listing segments;
   - the component tree;
   - instruction: `componentReference` MUST be an id from the tree or omitted
     — never invented; prefer the pointed-at part when the utterance is
     deictic and a segment overlaps it, else resolve the spoken name against
     the tree; if unsure, omit.
5. **Validation**: `parseInsightCards` (TS and Python) rejects a
   `componentReference` that is not in the tree it was given, the same way it
   already rejects bad dates and unknown fields. A card that names no part is
   fine; a card naming a part that does not exist is not.
6. The card UI already shows `componentReference`; add "click to select that
   part in the model tree" so a reviewer can jump to it.

Done = say "the clearance on this part is too small" while pointing at Left
Ear Cushion, and the card comes back with that part attached; say "the
headband frame is too heavy" pointing at nothing, and it still resolves.

---

## Sequencing and risk

| Batch | Work | Risk |
|---|---|---|
| V | A (record button in the transcript panel) | low |
| W | B (per-speaker mics, consent, spoofing fix) | medium: permissions, ordering, load |
| X | C (pointing timeline) | low-medium: sampling and bounds |
| Y | D (tree + timeline into the prompt, /extract, validation) | medium: two prompt builders stay in parity; truncation of large trees |

Each batch: Qwen drafts against a written spec, Claude reviews the diff and
runs it live in the Docker install with two browsers (a real mic on one, a
file-fed fake mic on the other) before it is committed.

Open questions for the user are in the chat summary, not here.
