The camera and the follow model. The user tested the room and reported, in
their words:

> "when you go back to the free view (also happens in mobile) it feels a
> little weird, like when you wanna rotate around the central object it
> doesn't really rotate around the central object but more like you rotate
> around yourself"

> "whoever is on leader mode knows who is following and the moment everyone
> disengaged, then it goes back to free view. If you disengaged by navigating
> yourself (not pressing the free view button) that doesn't count as actually
> disengaging. BTW that eventual disengagement doesn't work well, it conflicts
> with the current view."

> "Perhaps it can go in free view on the background and after 2 seconds of
> idle time goes back to the view of the leader, but the user needs to think
> that they are not in free view, or at least that they are only temporarily
> and after idle time it goes back to following unless they press the free
> view button"

Claude has already diagnosed the code; the causes and the design are below.
Implement them. Be economical: read the files named, not the whole repo. Do
NOT run `docker`, and do NOT run any `git` write command (`commit`, `add`,
`push`, `checkout`, `reset`, `stash`). Do not edit anything under `docs/`.

## Background you need (verified by Claude)

- `components/Scene/ViewpointCanvas.tsx`, `SceneRenderer`: one
  `<OrbitControls>` (ref `controlsRef`) drives the camera. The `useFrame`
  loop, when following a remote person (`followingRemoteUserId`), lerps
  `controls.target` to `remote.lookAt`.
- `PresenceBroadcaster` (same file) broadcasts `lookAt = position + forward`,
  i.e. a point **one unit in front of the camera**. So after following, the
  orbit pivot is left 1 unit in front of your own eye. Rotating then spins you
  on the spot, and zoom is stuck because `minDistance={1}`. Same for the agent
  POV branch (`targetVec = pos + forward`). **This is the A1 bug.**
- Mobile (`components/UI/MobileRoomView.tsx`) renders the same
  `ViewpointCanvas`, so a fix in `SceneRenderer` covers mobile.
- While following a remote person OUTSIDE the boardroom, a drag does nothing
  special: the `useFrame` loop keeps lerping toward the leader while
  OrbitControls moves the camera, so the two fight. **This is the "conflicts
  with the current view" bug.** (Inside the boardroom there is already a
  detach/idle-resume path — `boardroomPresenterDetachedId` — leave that
  mechanism as it is.)
- `store.ts`: `leaderId === 'USER' && !followingRemoteUserId` means "I am
  leading". `followingRemoteUserId !== null` means "I am following that
  person" (note `setFollowingRemoteUser(id)` also sets `leaderId: 'USER'`).
  `setLeader(null)` clears both.
- `lib/usePartyPresence.ts`: `LEADER_CHANGE` with a userId makes every other
  client follow that user; with `null` it makes every client stop following.
  `broadcastPresence` sends `PRESENCE` with a `ParticipantPresence` payload
  (type in `party/room.server.ts` line 3). The room server stores and relays
  that payload as-is, and replays it in `ROSTER` for late joiners.
  `syncList()` (~268) builds `remoteParticipantList` and is only called when a
  participant is NEW.
- Nobody tells the leader who is following. There is no such field anywhere.

## Part A1 — the orbit pivot

1. Add a pure helper `lib/orbitPivot.ts`:
   `computeOrbitPivot(camPos, forward, modelCenter, minDist = 1.5, maxDist = 15): THREE.Vector3`
   — returns a point ON the camera's line of sight (`camPos + forward * d`),
   where `d` is the distance of `modelCenter` along that line
   (`dot(modelCenter - camPos, forward)`), clamped to `[minDist, maxDist]`.
   If `modelCenter` is null use the world origin. Because the point is on the
   line of sight, moving the orbit target there does not change what the user
   sees — no visible jump — but rotation now pivots at the model's depth.
2. The model centre: the scene objects tagged `userData.modelId` (see
   `computeModelCenterNDC` at the top of `components/Scene/UserLaser.tsx`,
   which does exactly this bounding-box traversal). Put a shared
   `getModelCenter(scene): THREE.Vector3 | null` next to `computeOrbitPivot`
   and make UserLaser use it too, rather than duplicating the traversal.
3. In `SceneRenderer`, a `repivot()` that sets `controls.target` to
   `computeOrbitPivot(camera.position, cameraForward, getModelCenter(scene))`
   and calls `controls.update()`. Call it at exactly these moments, and no
   others (camera jumps to pins in `ReviewArtifacts` set the target on purpose
   and must not be overridden):
   - when `followingRemoteUserId` changes from a value to `null` (effect with a
     previous-value ref);
   - when `viewMode` changes from `POV_AGENT` or `AI_GUIDED` (or any mode whose
     frame branch drives `controls.target`) to `FREE`;
   - when a nudge starts (Part A2 below) and when
     `temporarilyDisengageFromAgent()` is triggered in
     `handleCanvasInteractionStart`.

## Part A2 — following, nudging, and leaving

### A2.1 A nudge is not leaving
1. `store.ts`: add `followNudged: boolean` (default false) and
   `setFollowNudged(v: boolean)`. `setFollowingRemoteUser` and `setLeader`
   must reset it to false.
2. Add `lib/followTiming.ts` exporting
   `export const FOLLOW_RESUME_DELAY_MS = 2000;` with a one-line comment that
   the user wants to tune this by feel. Replace the local
   `IDLE_RESUME_DELAY = 3000` in ViewpointCanvas with it, so the arena nudge,
   the boardroom detach and the agent-POV disengage all use ONE number.
3. `handleCanvasInteractionStart`: if `followingRemoteUserId` is set and NOT
   in boardroom mode → `setFollowNudged(true)`, clear any pending resume
   timer, `repivot()`. Do not touch `followingRemoteUserId`.
4. `handleCanvasInteractionEnd`: if nudged → start the resume timer; when it
   fires, `setFollowNudged(false)`. A new interaction start cancels it.
5. `useFrame`: the `followingRemoteUserId` branch must not drive the camera
   while nudged. Read the flag without causing re-renders per frame (a ref kept
   in sync, or `useStore.getState()` inside the frame).
6. The snap-back must be an ease, not a jump. The existing per-frame lerp is
   an exponential ease-out, but it is frame-rate dependent. Make that branch
   frame-rate independent: `alpha = 1 - Math.exp(-k * delta)` using the
   `delta` argument of `useFrame`, with `k` chosen so that at 60 fps it
   matches today's 0.06 per frame (k ≈ 3.7). Apply the same alpha to position
   and target.
7. Only the Free View button leaves (desktop dock button in `Interface.tsx`
   ~991, and on mobile the existing "Explore" button). Both already clear
   `followingRemoteUserId` via `setLeader(null)` / `setFollowingRemoteUser(null)`.

### A2.2 The leader sees who is following
1. `ParticipantPresence` (in `party/room.server.ts`) gets two optional fields:
   `followingUserId?: string | null` and `followNudged?: boolean`. Optional,
   so an old client's payload is still valid.
2. `broadcastPresence` in `lib/usePartyPresence.ts` fills them from
   `useStore.getState()` (`followingRemoteUserId`, `followNudged`) — inside the
   function, so every caller (including mobile's 5 s ping) sends them without
   changing its call site.
3. The `remoteParticipantList` entries carry `followingUserId` and
   `followNudged` too, and the PRESENCE handler must call `syncList()` when
   either of those changed for that participant, not only when the participant
   is new. Update the list item type wherever it is declared
   (`lib/PresenceContext.ts` / `usePartyPresence.ts`).
4. New component `components/UI/FollowersBadge.tsx`, rendered by
   `Interface.tsx` just above the bottom-centre view-mode button row (desktop,
   arena only, not in the boardroom). It shows the people whose
   `followingUserId === localUserId`:
   - nothing when nobody follows you;
   - otherwise a compact pill, e.g. `Leading · 2 following` when you are
     leading, `2 following you` when you are not (e.g. mobile users
     auto-follow the host), followed by the names as small coloured initials
     (use each participant's `color`), with the full name in a `title`
     tooltip; a follower whose `followNudged` is true is shown dimmed with
     "looking around" in its tooltip.
   Match the visual vocabulary of the surrounding dock (white/90, backdrop
   blur, gray-200 border, font-mono 10px uppercase labels).
5. Update the stale leader copy in Interface (~350): "All agents are currently
   following your viewport formation." → say who is following, or "Nobody is
   following yet." when nobody is.

### A2.3 The last follower leaving returns the leader to free view
1. While I am leading (`leaderId === 'USER' && !followingRemoteUserId`, not in
   boardroom), watch the follower count. When it goes from **≥ 1 to 0**, call
   `setLeader(null)` and `broadcastLeaderChange(null)`, and show a short
   non-blocking note for ~4 s near the dock: "Nobody is following any more —
   back to free view." Put this logic in a small hook
   (`lib/useLeaderAutoRelease.ts`) with the transition detection in a pure
   function that can be unit tested.
2. It must NOT fire when I start leading and nobody has joined in yet (count
   starts at 0 and stays 0) — only on the ≥1 → 0 transition.
3. A follower who is nudged still counts as following (their
   `followingUserId` is unchanged), so a nudge can never trigger this.
4. A follower who disconnects (LEAVE) drops out of the list and does count as
   leaving. That is intended.

### A2.4 The follower sees they are still following
When following someone on desktop (not in the boardroom), show a small pill at
the top centre of the canvas:
- normally: `Following <name>` with a `Free view` button in the pill;
- while nudged: `Following <name> — moving on your own · snapping back`.
The `Free view` button does what the dock's Free View button does. On mobile,
the existing follow badge in `MobileRoomView.tsx` (~359-376) gets the same
nudged wording; keep its existing "Explore" button.

### A2.5 Three detach bugs to fix on the way
Today a FOLLOWER can end the session for everyone:
1. `handleLeaderToggle` (Interface ~213): when I am following (not leading),
   clicking it calls `broadcastLeaderChange(null)`, which makes EVERY client
   stop following. Fix: a follower only detaches locally
   (`setFollowingRemoteUser(null)`); only the leader stopping broadcasts
   `null`.
2. The participant list button (Interface ~694-697): clicking the person you
   follow calls `broadcastLeaderChange(null)`. Same fix: local only.
3. The dock's Free View button (~991): when I am LEADING it must also
   `broadcastLeaderChange(null)` (otherwise followers keep following someone
   who has stopped leading); when I am following it stays local.

## What must not regress
- The boardroom's presenter follow/detach/takeover behaviour.
- Agent POV following and its disengage/resume.
- Camera jumps to review pins (`components/Scene/ReviewArtifacts.tsx`).
- Split view, laser and drawing modes (controls are disabled during those).
- An old client without the new presence fields must not crash a new one:
  treat missing fields as "not following".
- `scripts/check-public-env.mjs`'s `KNOWN` map stays empty.
- No `any` in new code, no `eslint-disable`, no `@ts-ignore`, no loosened
  tsconfig. If an existing test fails, fix the code, not the assertion.

## Tests to add
- `lib/__tests__/orbitPivot.test.ts`: the pivot lies on the line of sight;
  it is at the model's depth; it is clamped to minDist when the model is
  behind or at the camera; null model centre uses the origin.
- `lib/__tests__/leaderAutoRelease.test.ts`: 0→0 does not release;
  2→1 does not; 1→0 does; 0→1→0 does; not leading → never releases.
- A store test that `setFollowingRemoteUser` and `setLeader` reset
  `followNudged`.
- A test for the presence list: a PRESENCE for a known participant whose
  `followingUserId` changed updates `remoteParticipantList`. Look at
  `lib/__tests__/sameRoomPresence.test.ts` — it tests exactly this kind of
  flag through `usePartyPresence` — and copy its setup.
- `components/UI/__tests__/FollowersBadge.test.tsx`: renders nothing with no
  followers; shows count and names with two; nudged follower is marked.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npx vitest run lib/__tests__ components/UI/__tests__
npm run build
```

## Report
- Files changed / added, one line each.
- Where exactly `repivot()` is called, with line numbers.
- Anything you deliberately did NOT do, and why.
- Anything in the design above that turned out wrong once you read the code.
