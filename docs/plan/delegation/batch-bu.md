Batch BU: what happens when a recording stops — three separate choices.

The user: "the record button, when you start it, you pretty much just can stop it
and generate the decision cards, but I think that should be different. One
should be export txt, another should be generate cards and other would just be
save the transcript alongside the meeting. ... a transcript file of the text,
and if the user wants where people were pointing at."

Today (`lib/RecordingContext.tsx` `handleStop`): Stop → stop the recorder →
`finishLiveTranscript()` → broadcast recording off → `summarise(audio)`, which
sends the audio for card extraction immediately. The live transcript lines are
in the store's `chatHistory` (ids `live-<startedAt>-…`, `speakerName`,
`offsetMs`); pointing segments are in `usePointingTimelineStore`
(`userName`, `partName`, `fromMs`, `toMs`). BM stores `tracker_sessions`
`summary` and `attendee_names` from the ONE browser that records the meeting
(the one whose person pressed End); receivers call `meetingEndedRemotely()`.

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/` except
`docs/supabase-schema.sql`.

## 1. Stop opens a small panel instead of extracting at once
After Stop (same stop/finish/broadcast steps as today, but NOT `summarise`),
the person who stopped it sees an inline panel where the Record control is
(ConversationPanel's live-transcript area — find where `stop` is called from),
titled "Recording stopped · 12:34", with:
- **Generate cards** — runs today's `summarise(audio)` (all its gates:
  capture paused, privacy). Disabled with a reason when capture is paused.
- **Save transcript with this meeting** — a toggle-like button (pressed state
  shown: "Transcript will be saved with this meeting ✓ — Undo"). See §2.
- **Download .txt** — with a checkbox "Include what people pointed at"
  (off by default). See §3.
Any combination, any order, until the panel is dismissed (×) or a new
recording starts. The recorded audio stays in memory for Generate cards as
today (`recording` state); Retry keeps working.
Everyone else in the room sees today's behaviour for recording off (no panel).

## 2. Save the transcript with the meeting
- Schema (idempotent): `alter table tracker_sessions add column if not exists
  transcript jsonb` — an array of `{ t: offsetMs, speaker: name, text }`
  lines, plus, only if pointing was included, `{ t, speaker, pointing: partName,
  untilMs }` entries (same array, sorted by t). Cap: 20 000 entries / 2 MB of
  JSON — beyond that keep the first part and add a final `{ truncated: true }`.
- The choice must reach the browser that will record the meeting (it may be
  someone else — the host who presses End). Send it through the room server as
  a new small message `TRANSCRIPT_KEEP { keep: boolean, includePointing:
  boolean, byName }` that the server stores in memory for the room and relays;
  each client keeps the latest in its store. When the meeting is recorded
  (BM's path in `store.ts` endMeeting → `flushSessionToTracker`), if keep is on,
  the recording browser includes the transcript (built from ITS chatHistory
  and pointing timeline — every client has the same live lines, since they are
  broadcast) in the session insert. Only people who may record (the same check
  the Record button uses) may send TRANSCRIPT_KEEP; the server enforces it.
- Privacy mode on, or capture paused: the Save button is disabled with the
  reason, and nothing is stored.
- Where it is read: the session panel (`components/review/SessionMap.tsx`, and
  therefore the lobby preview) shows "Transcript · 214 lines" with **Download
  .txt** when `transcript` is present. `lib/reviews/linesRepo.ts` reads it only
  for the selected session (not in list queries — it can be big).

## 3. The .txt format (one function, used by both downloads)
`lib/capture/transcriptText.ts` `transcriptToText(lines, { includePointing,
title, date, attendees })`:
```
Door hinge, rev C — 25 Sep 2026
Attendees: Olga Owner, Ben Guest

[00:00:04] Olga Owner: Let's look at the hinge pin.
[00:00:07]   (Olga Owner pointing at: Hinge pin, 00:00:07–00:00:12)
[00:00:15] Ben Guest: It wears after a thousand cycles.
```
UTF-8, `\n` line endings, filename `<review name> — <date> transcript.txt`
sanitised for file systems. Pointing lines only when asked; consecutive
segments by the same person on the same part merged. Download via a Blob +
object URL + a temporary `<a download>` click, revoked after.

## What must not regress
Card extraction when chosen (all gates), the one-record-per-meeting rule,
minutes (BM), privacy mode, mode none, recording for everybody else, the live
transcript view. No `any`, no `eslint-disable`, no `@ts-ignore`, no new
`as unknown as`. `scripts/check-public-env.mjs` `KNOWN` stays empty.

## Tests
Stop no longer extracts by itself; each of the three actions; Generate cards
respects capture pause; TRANSCRIPT_KEEP permission on the server; the recording
browser includes the transcript only when keep is on and not in privacy mode;
the text format (with and without pointing, merged segments, time format,
filename sanitising); the cap/truncation; session panel shows the download only
when present; schema adds the column idempotently.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
Files changed; exact SQL; anything deliberately not done.
