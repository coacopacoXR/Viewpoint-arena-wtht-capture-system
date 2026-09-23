The room's layout pass — the user picked a sketch ("Option B") and this batch
builds it. It is ONE pass over the desktop room screen, because every part
moves the same few pixels.

Be economical: read the files named, not the whole repo. Do NOT run
`docker`, and do NOT run any `git` write command (`commit`, `add`, `push`,
`checkout`, `reset`, `stash`). Do not edit anything under `docs/`. Claude
reviews the diff and checks the result with screenshots in a real browser.

## Scope
Desktop arena only: `components/UI/Interface.tsx` (the `!isBoardroomMode`
branch), `components/UI/ReviewViewpointsDock.tsx`,
`components/UI/ReviewPanelContent.tsx` (only the manager trigger),
`components/UI/FollowersBadge.tsx` (only its placement), and
`pages/RoomPage.tsx` (only if the manager column needs it). NOT the boardroom
(`components/UI/Boardroom/`), NOT the phone (`MobileRoomView.tsx`), NOT the
model tree / session sync column on the left.

Read `components/UI/Interface.tsx` first, whole. Its regions, by the comments
in the file: "Right Header Area" (the top-right button row: XR, Mic, Speaker,
Same room, Privacy, Share, Boardroom (host), Participants, End Session
(host)), "RIGHT PANEL: Mode Switcher + Content", "BOTTOM-LEFT TOGGLES",
"Bottom Controls Panel (Centered Dock)" (Playback controls + OP.STATUS, View
modes, Deictic features, the Active Review pane), the follow pill
(`FollowingBadge`) and `JoinRequests` near the end.

## The target layout (Option B) — build exactly this

### 1. Bottom: a short call bar
One centred bar (same visual vocabulary as today's dock: `bg-white/90
backdrop-blur-md border border-gray-200 rounded-md shadow-sm p-1.5`):

`[Mic] [Speaker] [Same room]  |  [Free] [Lead] [AI] [Split]  |  [End session / Leave]`

- Mic, Speaker, Same room MOVE here from the top-right row. Keep every bit of
  their existing behaviour and state styling (mic red when off, orange when
  blocked, their titles/tooltips, the same-room semantics). In the bar they
  are **icon buttons** (the `Button` component at the top of Interface, or
  the same size), with the label in `title` — the bar has to fit.
- The four view buttons stay as they are (they already live in the dock),
  including the "View Configuration" explainer link above them and the
  `FollowersBadge` + auto-release note above that.
- **End session** (host) moves here from the top-right row: same handler,
  red power icon. **Non-hosts** get a **Leave** button in the same slot that
  navigates to `/` with react-router's `useNavigate` (the room page already
  cleans up its sockets on unmount — check `pages/RoomPage.tsx` to confirm,
  and say so in the report).
- **Removed entirely:** the Play/Pause button, the Reset button and the
  OP.STATUS readout (the "Left: Playback Controls" block). Do not remove
  `isPlaying` from the store — the agent simulation still reads it, and its
  default must keep the simulation running as it does today. Remove only the
  UI and any imports that become unused.

### 2. Beside the call bar: the review pill and Manage
To the right of the call bar, in the same bottom row:
- `ReviewViewpointsDock` (the "Review" pill, unchanged behaviour; it renders
  nothing when there is no review, as today).
- A **Manage** button, **host only**, ALWAYS present for the host — not only
  when the review has pins/comments/viewpoints, which is today's accident:
  the only trigger lives inside `ReviewPanelContent`, which only renders
  when the review pill has content. Style it like today's trigger (emerald:
  `bg-emerald-50 border-emerald-200 text-emerald-700`, `ClipboardList`
  icon). It calls `useActiveReviewStore.getState().setManagerMode(true)`.
  Remove the old trigger from `ReviewPanelContent` so there is ONE entry
  point. Check `components/UI/ManagerPanel.tsx` renders sensibly when there
  is no review config (it reads `config?.…` — confirm nothing crashes with
  `config === null`, and if something does, make it render an empty state).

### 3. Top: one bar for pointing and room controls
One centred bar at the top of the canvas area, same vocabulary:

`Highlight [Part|Model]  [Pointer ▾]  |  [People N] [Share] [Privacy] [Boardroom] [XR]`

- **Highlight granularity** moves here from the dock's "Deictic Features"
  block, unchanged behaviour, still visible (the user uses it constantly).
- **Pointer ▾** is a small menu button that opens a popover holding the two
  other deictic toggles from that block — **Finger pointer** and **Hover
  dwell** — with their existing on/off state and handlers, plus a "What are
  these?" link that opens the existing deictic explainer
  (`setShowDeicticExplainer(true)`). The Pointer button shows a small dot
  when either toggle is on, so an active pointer is never hidden. Close the
  popover on outside click and on Escape.
- **People** (the existing Participants toggle, with the participant count),
  **Share**, **Privacy**, **Boardroom** (host only, as today) and the **XR**
  button move here from the top-right row, same behaviour. Compact: icon +
  short label is fine at ≥1440px wide, icon-only (label in `title`) below.
- The "Deictic Features" block in the dock goes away (its contents moved).
- The top-right row is gone. What used to hang underneath it — the
  recording indicator, the headphones hint, the temporarily-disengaged
  indicator — stays at the top right, directly under where the row was, so
  it does not overlap the side panel's top (see 4).

### 4. Right: the side panel owns its side
The right panel ("RIGHT PANEL: Mode Switcher + Content") becomes a
**full-height column**: `top-0 bottom-0 right-0`, `w-[340px]`, white
background, `border-l border-gray-200`, no rounded outer corners, no floating
margin. Its content is unchanged (Capture / Comments / Chat tabs, the dark
live transcript at its foot). The collapse toggle stays and collapses it to a
slim rail (`w-12`, still full height) with the existing collapsed indicators.
When `managerMode` is on it is hidden, as today — the manager column in
`RoomPage` takes the same right edge, so the two never show together.

### 5. The canvas area in between
The top bar, the bottom row, the follow pill and the join requests must all
centre on the **free canvas area**, i.e. between the left column and the side
panel, not on the whole window. Do it with one wrapper per bar:
`absolute left-[300px] right-[<panel width + 24px>] flex justify-center`
(right offset follows `isRightPanelCollapsed`), rather than
`left-1/2 -translate-x-1/2` on the window.
- `FollowingBadge` (the follower's "Following Paco … Free view" pill) sits
  directly **below the top bar**, centred the same way. Today it overlaps the
  mic button — that must not happen anywhere.
- `JoinRequests` (host) also sits below the top bar; when both it and the
  follow pill show, stack them (join requests first) instead of overlapping.
- Bottom-left AGENTS OFF / DATA FLOW stay bottom-left. The old
  `bottom-[97px] [@media(min-width:1360px)]:bottom-6` lift existed because the
  wide dock collided with them; with the short bar, work out whether it is
  still needed at 1280px width and keep or simplify it accordingly — the
  rule is simply that nothing overlaps at 1280×800.

### Must fit
At **1280×800** with the side panel open, nothing may overlap: top bar, the
left column, side panel, bottom row, bottom-left buttons, follow pill, join
requests. At 1600×900 it should look calm, not stretched. If the bottom row
cannot fit at 1280, the review pill hides its title first (the counts stay).

## What must not regress
- Every control keeps its handler and its state styling; this is a move, not
  a rewrite. Grep for each handler you move and confirm it is still wired.
- Boardroom mode, the phone view, split view overlay, the model tree column.
- `managerMode` still hides the side panel, and closing the manager view
  brings the side panel back.
- Existing tests in `components/UI/__tests__/` (e.g. the review dock and
  manager panel tests). If one asserted the old trigger inside
  `ReviewPanelContent`, move the assertion to the new Manage button rather
  than deleting it.
- `scripts/check-public-env.mjs`'s `KNOWN` map stays empty.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no loosened tsconfig. If a
  test fails, fix the code, not the assertion (except the one move above).

## Tests to add (`components/UI/__tests__/`)
- The Manage button renders for the host with NO review config, does not
  render for a non-host, and calls `setManagerMode(true)`.
- The Pointer menu: opening it shows Finger and Hover; toggling Finger calls
  the existing finger-pointer toggle; the dot appears when one is on.
- The Play/Pause/OP.STATUS controls are gone (no element with title
  "Play/Pause").
Look at existing tests in that folder for how the store, presence and WebRTC
contexts are mocked, and copy that pattern. If mounting all of `Interface`
is impractical in jsdom, extract the new pieces (`CallBar`, `TopBar`,
`PointerMenu`, `ManageButton`) into their own components under
`components/UI/room/` and test those — that is the preferred shape anyway,
since Interface.tsx is over 1100 lines.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npx vitest run components/UI
npm run build
npm run check:env
```

## Report
- Files changed / added, one line each.
- For every control that moved: where it was, where it is now, and the
  handler it is wired to.
- What you decided about the bottom-left 1360px lift, and why.
- Anything you deliberately did NOT do, and why.
