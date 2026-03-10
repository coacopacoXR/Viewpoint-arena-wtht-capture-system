# Multiplayer Roadmap — Viewpoint Arena
> Bring real people into the session via a shareable link.
> Each phase is self-contained and shippable. Work through them in order.

---

## Before you start: one-time decisions

Answer these before the first coding session so we don't backtrack.

| Question | Options | Recommendation |
|---|---|---|
| Real-time sync layer | PartyKit · Liveblocks · Supabase Realtime | **PartyKit** — simplest, edge-native, free tier generous |
| Webcam / audio | Daily.co · Livekit · Agora | **Daily.co** — best DX, generous free tier (10k min/month), React SDK |
| Routing | React Router · TanStack Router | **React Router v6** — already compatible with Vite |
| Auth / identity | None (guest) · Clerk · Auth0 | **None for now** — random UUID + name prompt on join is enough |
| Hosting | Vercel · Netlify · Cloudflare Pages | **Vercel** — PartyKit deploys alongside it natively |

---

## Phase 0 — Repo & routing scaffolding
**Goal:** app lives at `/room/:roomId`; sharing that URL drops someone into the same session.
**No networking yet — purely local routing.**

### Tasks
- [ ] `npm install react-router-dom`
- [ ] Wrap `App.tsx` in `<BrowserRouter>`
- [ ] Create `/` — `LobbyPage`: two buttons — "New session" (generates `crypto.randomUUID()`, pushes to `/room/:id`) and "Join session" (text input for a room code)
- [ ] Create `/room/:roomId` — renders current `App` content (ViewpointCanvas + Interface)
- [ ] `LobbyPage` stores chosen display name + random color in `localStorage` (persists across refreshes)

### Files touched
```
src/main.tsx            ← add BrowserRouter
src/App.tsx             ← add Routes
src/pages/LobbyPage.tsx ← NEW
src/pages/RoomPage.tsx  ← NEW (wraps existing ViewpointCanvas + Interface)
```

### Done when
Visiting `/room/abc123` loads the 3D scene. Refreshing keeps you in the room. `/` shows the lobby.

---

## Phase 1 — Live presence in the 3D scene (no video)
**Goal:** two people open the same URL and see each other as colored capsule avatars moving in real time.

### Prerequisites
- Create a free [PartyKit](https://partykit.io) account
- `npm install partykit partysocket`

### Architecture
```
Browser A                    PartyKit Server (edge)         Browser B
─────────────────────────    ──────────────────────────    ─────────────────────────
camera pos every 100ms  ──►  broadcast to room members ──►  render as RemoteAgent
receive others' pos     ◄──  on message                ◄──  camera pos every 100ms
```

### Tasks

**PartyKit server** (`party/room.server.ts` — ~40 lines)
- [ ] On connect: add participant to room, broadcast roster
- [ ] On message `PRESENCE`: broadcast `{userId, name, color, position, lookAt, behavior}` to all others
- [ ] On disconnect: broadcast `LEAVE` with userId

**Client hook** (`lib/usePartyPresence.ts`)
- [ ] Connect to PartyKit room on mount using `roomId` from URL
- [ ] Broadcast own camera position + `activeAgentId` every 100ms via `useFrame` callback
- [ ] Maintain `remoteParticipants: Map<userId, ParticipantState>` in a React ref (NOT Zustand — 60fps data, no re-renders)
- [ ] Expose `remoteParticipants` ref to the scene

**RemoteParticipant component** (`components/Scene/RemoteParticipant.tsx`)
- [ ] Reuses existing Agent visual (capsule/box/robot style)
- [ ] Reads position from `remoteParticipants` ref each frame via `useFrame`
- [ ] Shows participant name label (reuse `<Html>` from Agent.tsx)
- [ ] Renders in `World.tsx` alongside AI agents

**Shared state sync** (via PartyKit storage, lower frequency ~1/sec)
- [ ] Comments added/resolved
- [ ] Insights generated
- [ ] Who is boardroom presenter
- [ ] Model visibility (scene tree toggles)

### Files touched
```
party/room.server.ts              ← NEW (PartyKit server)
lib/usePartyPresence.ts           ← NEW
components/Scene/RemoteParticipant.tsx ← NEW
components/Scene/World.tsx        ← render <RemoteParticipant> for each remote user
components/Scene/ViewpointCanvas.tsx   ← broadcast camera pos via useFrame
src/pages/RoomPage.tsx            ← pass roomId to usePartyPresence
```

### Done when
Two browser tabs on the same `/room/:id` show each other's avatars moving in the 3D scene.

---

## Phase 2 — Boardroom webcam tiles
**Goal:** in Boardroom Mode, participant tiles show real webcam feeds instead of silhouettes.

### Prerequisites
- Create a free [Daily.co](https://www.daily.co) account
- `npm install @daily-co/daily-js @daily-co/daily-react`
- Each PartyKit room creates a matching Daily room (via Daily REST API — call from PartyKit server on first connection)

### Architecture
```
PartyKit server
  ├── on first join: POST /api/v1/rooms to Daily → get dailyRoomUrl
  └── broadcasts dailyRoomUrl to all participants

Browser (DailyProvider wraps the app)
  ├── joins Daily room using dailyRoomUrl from PartyKit
  ├── gets video/audio tracks for each participant
  └── BoardroomShell maps Daily participant tracks → ParticipantTile
```

### Tasks

**Daily room creation** (in `party/room.server.ts`)
- [ ] On first participant: create Daily room, store `dailyRoomUrl` in PartyKit storage
- [ ] Broadcast `dailyRoomUrl` to joining participants

**Daily integration** (`lib/useDailyRoom.ts`)
- [ ] `DailyProvider` wraps `RoomPage`
- [ ] Join Daily room using `dailyRoomUrl` received from PartyKit
- [ ] Expose `{ participants, localParticipant, toggleCamera, toggleMic }`
- [ ] Map Daily `sessionId` → our `userId` via a join metadata field

**ParticipantTile update** (`components/UI/Boardroom/ParticipantTile.tsx`)
- [ ] Accept optional `videoTrack?: MediaStreamTrack` prop
- [ ] If `videoTrack` present: render `<video>` element (replace current avatar/silhouette)
- [ ] If no track: keep existing silhouette / avatar rendering
- [ ] Speaking detection: use Daily's `activeSpeaker` event instead of the simulated `speakingAgentId`

**BoardroomShell update**
- [ ] Pull `useDailyRoom()` hook
- [ ] Match Daily participants to agents by userId
- [ ] Pass `videoTrack` to each `ParticipantTile`
- [ ] "YOU" self-tile: use `localParticipant.videoTrack` + wire toggle button to `toggleCamera()`
- [ ] Replace simulated speaking detection with Daily active speaker events

**AI agents in boardroom** (when real people join, AI agents step back)
- [ ] If a real participant joins with role PRESENTER, mute/hide the AI PRESENTER agent
- [ ] AI agents remain if no human has claimed that role (graceful degradation)

### Files touched
```
party/room.server.ts                     ← add Daily room creation
lib/useDailyRoom.ts                      ← NEW
src/pages/RoomPage.tsx                   ← wrap with DailyProvider
components/UI/Boardroom/BoardroomShell.tsx ← wire Daily tracks
components/UI/Boardroom/ParticipantTile.tsx ← add videoTrack prop + <video>
```

### Done when
Two people on the same room URL see each other's webcam in the Boardroom participant strip. Camera toggle works. Speaking indicator highlights the active speaker.

---

## Phase 3 — Shared 3D annotations & model state
**Goal:** comments, drawings, and model tree changes made by one person are instantly visible to all others.

### Tasks
- [ ] `SpatialComment` creates: broadcast via PartyKit, merge into store of all clients
- [ ] Comment resolved: broadcast, all clients update
- [ ] Scene tree visibility toggle: broadcast, all clients update
- [ ] Drawing strokes: broadcast stroke data as the user draws (streaming, not just on save) — use a separate high-freq channel
- [ ] Conflict resolution: last-write-wins is fine for now (comments are additive; visibility is idempotent)
- [ ] Persist room state to PartyKit Durable Object storage so latecomers get current state on join

### Protocol (PartyKit message types)
```typescript
type RoomMessage =
  | { type: 'PRESENCE';    payload: ParticipantPresence }
  | { type: 'COMMENT_ADD'; payload: SpatialComment }
  | { type: 'COMMENT_RESOLVE'; payload: { id: string } }
  | { type: 'SCENE_VISIBILITY'; payload: { nodeId: string; visible: boolean } }
  | { type: 'PRESENTER_CHANGE'; payload: { agentId: string | null } }
  | { type: 'DRAWING_STROKE'; payload: { commentId: string; stroke: string } }
  | { type: 'FULL_STATE';  payload: RoomState }  // sent to new joiners
```

### Done when
User A drops a comment → User B sees it appear in real time. User A toggles a model part off → User B's scene updates immediately.

---

## Phase 4 — Polish & production readiness
**Goal:** app is presentable to clients and reliable under real use.

### Tasks

**Lobby & identity**
- [ ] Lobby page: name input, color picker, "New session" / "Join with code"
- [ ] Session link: one-click copy button, QR code for mobile
- [ ] Participant limit: max 8 (Daily free tier, UX reasons)

**In-session UX**
- [ ] "Waiting for others…" state when alone in the room
- [ ] Participant joined/left toast notifications
- [ ] Host badge (first person to create the room)
- [ ] Host can remove a participant
- [ ] Reconnection handling (PartyKit auto-reconnects; show a banner during disconnect)

**AI agents with real people**
- [ ] Option to disable AI agents when enough real people are in the room (e.g. ≥3 humans)
- [ ] Or: keep AI agents as "background observers" — they still generate insights but don't take up tile space

**Performance**
- [ ] Throttle presence broadcast to 10fps for users who are idle
- [ ] Delta compression: only send position if it changed by >0.01 units
- [ ] Lazy-load Daily SDK (it's ~800KB)

**Security**
- [ ] Room passwords (optional, via PartyKit room metadata)
- [ ] Rate limit presence messages on server side

---

## How to start a session with Claude on this

Paste this at the start of the conversation:

```
We're working on Viewpoint Arena — a React/Three.js 3D design review app.
Stack: React 19, React Three Fiber, Zustand, Tailwind, Vite.
Key files: store.ts (all state), types.ts (all types),
           components/Scene/ViewpointCanvas.tsx (camera logic),
           components/Scene/Agent.tsx (AI agents),
           components/UI/Interface.tsx (3D arena UI),
           components/UI/Boardroom/ (boardroom meeting view).

Today we're working on Phase X of the multiplayer roadmap
(docs/MULTIPLAYER_ROADMAP.md).

Decisions already made:
- Real-time sync: PartyKit
- Webcam/audio: Daily.co
- Routing: React Router v6

[Paste any blockers, errors, or context here]
```

---

## Dependency install cheatsheet

```bash
# Phase 0
npm install react-router-dom

# Phase 1
npm install partykit partysocket
npx partykit init   # creates party/ server directory

# Phase 2
npm install @daily-co/daily-js @daily-co/daily-react

# All phases
npm install uuid
npm install -D @types/uuid
```

---

## Key invariants to never break

1. **ViewpointCanvas always mounted** — never unmount it on mode switches (preserves WebGL context and scene state)
2. **60fps data never touches Zustand** — position broadcasts, video tracks, drawing strokes go through refs or separate context, not `set()`
3. **AI agents always work without a server** — the app must remain fully functional offline/locally; real participants are additive
4. **pointer-events-none on overlays** — any full-screen overlay must be `pointer-events-none` at root; interactive children opt-in with `pointer-events-auto`
