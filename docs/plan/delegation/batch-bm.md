Batch BM: one record per meeting, with its minutes and who attended.

Context: plan 15 (`docs/plan/15-sessions-and-variants.md`, batches BK and BL,
committed) added the session map (`components/review/SessionMap.tsx`). Clicking a
session opens a panel that should show who attended and the meeting's summary.
Today it always says "No summary was stored for this session", and it only knows
a head count. Two things are missing, and one bug sits in front of them.

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/` except
`docs/supabase-schema.sql`.

## 1. The bug: every browser records the meeting (fix first)
`components/UI/room/CallBar.tsx` (and `BoardroomShell.tsx`, `MobileRoomView.tsx`)
call `endMeeting(true, count)` and then `broadcastMeetingEnd()`. Every OTHER
browser in the room receives `MEETING_END` in `lib/usePartyPresence.ts` and ALSO
calls `endMeeting(true)`, and `store.ts`'s `endMeeting` calls
`flushSessionToTracker` whenever `ended` is true. Cards are broadcast to
everybody, so a meeting with three people writes three `tracker_sessions` rows
(S1, S2, S3 on the line) and every card three times.

Fix: only the browser whose person pressed End records the meeting. Receivers
end the meeting on screen (same state change as today) but do not flush. Make it
explicit in the `endMeeting` signature (e.g. an options object
`{ record: boolean }`, or a separate `meetingEndedRemotely()` action); keep every
caller compiling and behaving as today apart from this. Test: a MEETING_END
received does not call `flushSessionToTracker`; the local End does, once.

## 2. Who attended
- Schema (`docs/supabase-schema.sql`, idempotent, next to the BK columns):
  `alter table tracker_sessions add column if not exists attendee_names text[]`.
- The End callers already know the presence list (`remoteParticipantList`); pass
  the names (the local person's name plus each remote participant's display name,
  deduplicated, no empty strings) down to `flushSessionToTracker`, which writes
  them. `participant_count` stays as it is.
- `lib/reviews/linesRepo.ts` reads `attendee_names`; the SessionMap panel shows
  them ("Olga Owner, Ben Editor") where it shows the count today. A session
  recorded before this has none: show the count as today.

## 3. The minutes
`api/capture/summary.ts` (plan 14, BF) turns a transcript and cards into
markdown minutes, but nothing in the app calls it. After the meeting's session
row is written (by the one recording browser from part 1):
- Schema: `alter table tracker_sessions add column if not exists summary text`.
  (`linesRepo` already reads `row['summary']`; update its comment.)
- In the background — never delaying the end of the meeting or the tracker
  write — POST to `/api/capture/summary` with the meeting's transcript (the live
  transcript lines in `chatHistory`, same selection `lib/RecordingContext.tsx`
  uses for `transcriptHint`, as the endpoint's `TranscriptChunk` shape; read the
  endpoint for the exact body and limits), its cards, and the review title. On
  success, update that `tracker_sessions` row's `summary`.
- Skip the call entirely when there is no transcript AND no cards, when privacy
  mode is on (`isPrivacyMode`), or when capture is paused
  (`isCapturePaused()` in the capture gate RecordingContext uses). On any failure,
  leave `summary` null and `console.warn` only the error CODE, never the
  transcript or model output (the endpoint's security header explains why).
- Put the client call in a small module (e.g. `lib/capture/meetingMinutes.ts`)
  with the same JSON/content-type care as `lib/reviews/linesClient.ts`.
- SessionMap panel: render the summary as plain text with line breaks preserved
  (`whitespace-pre-wrap`). No `dangerouslySetInnerHTML`, no new markdown library.
  Long summaries scroll inside the panel (max height), they do not stretch it.

## What must not regress
BK/BL behaviour (lines, seq numbering, carried-over, variants), the BH3
save-on-edit rules, mode none, the tracker page, privacy mode. No `any`, no
`eslint-disable`, no `@ts-ignore`, no new `as unknown as`.
`scripts/check-public-env.mjs` `KNOWN` stays empty.

## Tests
Part 1 as above; names are passed and written (dedup, no empties); the minutes
call happens after the session insert with the right body and writes the summary;
it is skipped for privacy mode / paused capture / nothing to summarise; a failure
leaves summary null and logs no transcript text; the panel shows names and a
summary, and falls back to the count and the "No summary" line; the schema SQL
adds both columns idempotently.

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
