Type debt: replace `any` with real types in the files that carry most of it.

`npm run lint` reports 99 warnings. 86 are `@typescript-eslint/no-explicit-any`.
This batch removes as many of those as can be removed HONESTLY in the files
below. Be economical: work file by file, read each file once. Do NOT run
`docker`, and do NOT run any `git` write command (`commit`, `add`, `push`,
`checkout`, `reset`, `stash`). Do not edit anything under `docs/`.

## Files in scope (warning count in brackets)
- `lib/usePartyPresence.ts` (17)
- `party/room.server.ts` (13)
- `components/UI/MeetingSummary.tsx` (8)
- `pages/RoomPage.tsx` (8)
- `lib/useWebRTC.ts` (7)
- `components/Scene/UserLaser.tsx` (5)
- `lib/onshape.ts` (2), `lib/reviewSetupStore.ts` (2), `utils/modelLoader.ts` (2),
  `pages/ReviewSetupPage.tsx` (2), `components/UI/InsightDetailModal.tsx` (2),
  `lib/sharepointIntegration.ts` (1), `pages/LobbyPage.tsx` (1)

Leave every other file alone, including the R3F scene components not listed.

## How to do it
1. **Use the types that already exist.** `types.ts` has `InsightCard`,
   `AgentState`, comment types and more; `party/room.server.ts` exports
   `ParticipantPresence`; `lib/reviewSetupStore.ts` / `lib/activeReviewStore.ts`
   have the review config shape. Grep before inventing a type. A
   `payload: any` on a message whose payload is an `InsightCard` becomes
   `payload: InsightCard`.
2. **The room server and the client share message shapes.** `party/room.server.ts`
   and `lib/usePartyPresence.ts` each declare a `RoomMessage` union. Where a
   payload type is the same in both, declare it once in the server file
   (which the client already imports types from) and import it in the client.
   Do not merge the two unions themselves — the client's has members the
   server does not relay and vice versa.
3. **Genuinely opaque data gets `unknown`, not a made-up interface.** WebRTC
   signalling data is `RTCSessionDescriptionInit | RTCIceCandidateInit`; an
   XR presence payload the server only relays can be `unknown`. `unknown`
   forces a check at the point of use — add the narrowing check there (a
   type guard or `in` test), do not cast it back with `as any`.
4. **`catch (e: any)`** becomes `catch (e)` with `e instanceof Error ? e.message : String(e)`.
5. **Three.js / R3F intrinsics** where `any` truly cannot be avoided may stay —
   say which ones in the report. Do not add `eslint-disable` for them.

## What you must NOT do
- No `as any`, no `as unknown as X` to silence an error, no `@ts-ignore`,
  no `@ts-expect-error`, no `eslint-disable`, no loosening `tsconfig` or the
  eslint config. Replacing `any` with a cast that lies is worse than the `any`.
- Do not change runtime behaviour. This is a types-only change: if making a
  type honest reveals a real bug (e.g. a field that can be undefined and is
  used unchecked), fix it minimally AND list it in the report as a behaviour
  change, with file and line.
- Do not touch the 12 `react-hooks/exhaustive-deps` warnings. Adding a
  dependency changes when an effect runs; those need a human decision each.
- Do not change message wire formats (field names, shapes) — old and new
  clients talk to the same room server.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint            # report the new warning count
npm run test
npm run build
npm run check:env
```
The full test suite must pass (about 1280 tests).

## Report
- Warning count before (99) and after, and per file.
- Every `any` you left in the scope files and why.
- Any behaviour change (see above), with file and line.
- Anything you deliberately did NOT do, and why.
