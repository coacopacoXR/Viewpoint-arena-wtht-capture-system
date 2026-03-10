# Action Tracker Roadmap — Viewpoint Arena
> A standalone action tracking system that captures work from design review
> meetings and syncs it to the tools your team already uses.

---

## The core idea

Every design review produces three kinds of outputs today (already in the app):
- **RISK** — something that might go wrong
- **RATIONALE** — a design decision and why it was made
- **ACTION** — something someone needs to do

Right now these live only inside the meeting session and disappear when it ends.
The Action Tracker makes them **persistent, assignable, filterable, and synced**
to the outside world (Jira, Linear, Asana, Notion, email).

---

## What already exists (free starting point)

```typescript
InsightCard {
  id, type ('RISK' | 'RATIONALE' | 'ACTION'),
  title, description, timestamp,
  details: {
    priority ('Critical' | 'High' | 'Medium' | 'Low'),
    status ('Open' | 'In Review' | 'Approved' | 'Rejected'),
    assignee, dueDate, department,
    componentReference,         // which part of the 3D model
    impact, mitigationStrategy, // risk fields
    designDriver, tradeoffAnalysis // rationale fields
  },
  affectedRequirementIds,
  kbRecommendations,
  sourceMessageIds              // links back to the conversation
}
```

This is already a well-structured task item. We're building the shell around it,
not redesigning the data.

---

## Before you start: decisions

| Question | Options | Recommendation |
|---|---|---|
| Persistence layer | localStorage · Supabase · PlanetScale · Turso | **Supabase** — Postgres + realtime + auth + free tier |
| Auth | None · Clerk · Supabase Auth | **Supabase Auth** — already using Supabase, one less dependency |
| Tracker location | Same repo new route · Separate repo | **Same repo, `/tracker` route** — shares types, no duplication |
| External integrations | REST polling · Webhooks · OAuth | **OAuth + REST** for each integration (Jira, Linear, Asana, Notion) |
| Notification delivery | Email only · Email + Slack | **Resend** for email (generous free tier, great DX) |

---

## Data model additions needed

```typescript
// Extend InsightCard for tracker-specific fields
interface TrackerItem extends InsightCard {
  sessionId: string;           // which meeting it came from
  sessionTitle: string;        // human-readable session name
  sessionDate: number;         // timestamp of the meeting

  // Assignee becomes a real user ref (not just a string name)
  assigneeUserId?: string;
  assigneeName?: string;
  assigneeEmail?: string;

  // Workflow
  statusHistory: StatusEvent[];  // full audit trail
  comments: TrackerComment[];    // threaded comments on the item

  // External sync
  externalRefs: ExternalRef[];   // Jira issue, Linear issue, etc.
  lastSyncedAt?: number;
}

interface StatusEvent {
  status: InsightDetails['status'];
  changedBy: string;
  changedAt: number;
  note?: string;
}

interface TrackerComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
}

interface ExternalRef {
  provider: 'jira' | 'linear' | 'asana' | 'notion' | 'github';
  externalId: string;
  url: string;
  syncedAt: number;
}
```

---

## Phase 0 — Tracker route & local persistence
**Goal:** `/tracker` shows all InsightCards from all sessions, persisted in
localStorage (no backend yet). Survives page refresh.

### Tasks
- [ ] Create `/tracker` route in React Router (alongside `/room/:roomId`)
- [ ] `TrackerPage` — full-page dashboard, dark or neutral theme, distinct from the arena
- [ ] Persist `insights` (InsightCards) to `localStorage` keyed by session
      — when a session ends (`endMeeting`), write to localStorage
- [ ] `useTrackerStore` — separate Zustand store for tracker state
      (keeps meeting store clean; tracker runs independently)
- [ ] Three views: **Board** (Kanban by status), **List** (sortable table),
      **Timeline** (grouped by session date)
- [ ] Filters: by type (RISK / RATIONALE / ACTION), priority, assignee, date range
- [ ] Click an item → detail drawer slides in from the right

### Files to create
```
src/pages/TrackerPage.tsx
src/stores/trackerStore.ts            ← separate from meeting store
components/Tracker/BoardView.tsx      ← Kanban columns by status
components/Tracker/ListView.tsx       ← sortable table
components/Tracker/TimelineView.tsx   ← grouped by session
components/Tracker/ItemDrawer.tsx     ← slide-in detail panel
components/Tracker/ItemCard.tsx       ← card used in all views
```

### Done when
After ending a meeting, visiting `/tracker` shows all generated insights in
a Kanban board. Drag a card to change its status. Refresh — data persists.

---

## Phase 1 — Supabase backend + real persistence
**Goal:** data lives in a real database. Multiple people see the same tracker.
Items created in the meeting appear in the tracker in real time.

### Prerequisites
- Create a [Supabase](https://supabase.com) project (free tier)
- `npm install @supabase/supabase-js`
- Create `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### Database schema (Supabase SQL)
```sql
-- Sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz default now(),
  created_by text,
  room_id text unique  -- links to PartyKit room
);

-- Tracker items (mirrors InsightCard + extensions)
create table tracker_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  type text not null check (type in ('RISK','RATIONALE','ACTION')),
  title text not null,
  description text,
  priority text not null default 'Medium',
  status text not null default 'Open',
  assignee_name text,
  assignee_email text,
  due_date date,
  department text,
  component_reference text,
  source_transcript jsonb,      -- snapshot of source messages
  external_refs jsonb default '[]',
  metadata jsonb default '{}',  -- all other InsightDetails fields
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Status history (audit trail)
create table status_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references tracker_items(id) on delete cascade,
  status text not null,
  changed_by text,
  note text,
  created_at timestamptz default now()
);

-- Comments on items
create table item_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references tracker_items(id) on delete cascade,
  author_name text,
  text text not null,
  created_at timestamptz default now()
);
```

### Tasks
- [ ] `lib/supabase.ts` — Supabase client singleton
- [ ] `lib/trackerApi.ts` — typed functions: `createItem`, `updateItem`,
      `listItems`, `addComment`, `updateStatus`
- [ ] Meeting → Tracker bridge: when `endMeeting()` fires, push all
      `InsightCards` to Supabase as `tracker_items` under a new session record
- [ ] **Real-time**: subscribe to `tracker_items` table changes via Supabase
      Realtime — updates appear instantly across all open tracker tabs
- [ ] Replace localStorage in `useTrackerStore` with Supabase queries
- [ ] Optimistic updates — UI updates immediately, Supabase confirms async

### Files touched
```
lib/supabase.ts          ← NEW
lib/trackerApi.ts        ← NEW
src/stores/trackerStore.ts ← swap localStorage for Supabase
store.ts                 ← endMeeting() pushes to Supabase
```

### Done when
End a meeting → open `/tracker` in a second browser tab → items appear within
1 second. Status change in one tab reflects in the other.

---

## Phase 2 — External integrations
**Goal:** push tracker items to the tools your team already lives in.
Pull status updates back automatically. One-click from any item.

### How every integration works (same pattern)
```
User clicks "Send to Teams"
  → OAuth flow (if not yet authorized)
  → Supabase Edge Function creates the item in the target system
  → ExternalRef stored: { provider, externalId, url, syncedAt }
  → Webhook/subscription registered → status changes flow back automatically
```

### OAuth token storage
```sql
create table integration_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider text not null,           -- 'teams' | 'slack' | 'jira' | etc.
  access_token text not null,       -- encrypted at rest (Supabase Vault)
  refresh_token text,
  expires_at timestamptz,
  workspace_info jsonb              -- org name, tenant id, workspace url
);
```

---

### Category A — Communication & meetings

These push **notifications and summaries** into the channels people already watch.
They don't create work items — they alert and inform.

#### Microsoft Teams
Auth: Azure AD OAuth 2.0 (MSAL), scope: `ChannelMessage.Send`, `Chat.ReadWrite`

- [ ] **Meeting recap card**: when a session ends, post an Adaptive Card to a
      designated Teams channel — session title, counts by type/priority,
      link to `/tracker` filtered to that session
- [ ] **Assignment notification**: when a tracker item is assigned to someone,
      send them a Teams chat message with item details + direct link
- [ ] **Critical risk alert**: CRITICAL items trigger an immediate channel post
      with `@mention` of the assignee
- [ ] **Status update card**: when item moves to Approved/Rejected, post a
      compact update card to the channel
- [ ] **Teams Tab (optional Phase 2b)**: embed the `/tracker` page as a Teams
      tab inside a channel — teams never leave Teams to see the backlog
- [ ] Edge Function: `teams-notify/`, `teams-oauth-callback/`
- [ ] Webhook inbound: Teams Outgoing Webhook or Bot Framework for two-way
      commands (`/status [item-id]` in Teams chat → returns current status)

#### Slack
Auth: Slack OAuth 2.0, scopes: `chat:write`, `channels:read`, `users:read`

- [ ] **Session summary**: Block Kit message posted to `#design-reviews`
      (or configurable channel) when meeting ends
- [ ] **Assignment DM**: direct message to assignee's Slack when item assigned
- [ ] **Critical risk**: `@here` post in designated channel for CRITICAL items
- [ ] **Slash command** (`/viewpoint status [id]`): bot responds with item
      details inline in Slack — no context switching needed
- [ ] **Action button in Slack message**: "Mark done" button in the Block Kit
      card → calls Edge Function → updates tracker status + updates the message
- [ ] Edge Function: `slack-notify/`, `slack-events/` (receives button clicks)

#### Google Chat / Google Meet
Auth: Google OAuth 2.0, scope: `chat.messages`, `calendar.events`

- [ ] Post summary card to Google Chat space when meeting ends
- [ ] Create Google Calendar follow-up event for items with due dates
- [ ] Meeting recap linked in Google Meet chat transcript

#### Microsoft Outlook / Exchange
Auth: Microsoft Graph API (same Azure AD app as Teams)

- [ ] Send formatted email summary to all session participants on meeting end
- [ ] Create Outlook calendar task for each ACTION item with a due date
- [ ] Weekly digest email: all open items assigned to you, grouped by priority

---

### Category B — Project management

These create **real work items** in the tools where engineering/design tracks work.
Bidirectional: status changes in either direction sync back.

#### Jira (Atlassian Cloud + Server)
Auth: Atlassian OAuth 2.0 (cloud) or API token (server/Data Center)

- [ ] Create issue in selected project, map `priority` → Jira priority,
      `assignee` → Jira user (by email lookup), `type` → issue type
- [ ] `RISK` → Jira Bug or Risk issue type; `ACTION` → Task; `RATIONALE` → Story
- [ ] Webhook: `jira-webhook/` receives issue transitions → update tracker status
- [ ] Attach source transcript snippet as Jira comment on creation
- [ ] Link back: Jira issue description includes link to 3D session replay

#### Azure DevOps (Microsoft ecosystem)
Auth: Azure AD OAuth 2.0 or PAT (Personal Access Token)

- [ ] Create Work Item (Bug / Task / User Story) in selected Team Project
- [ ] Map `priority` → Priority field; `department` → Area Path
- [ ] `RISK` → Bug; `ACTION` → Task; `RATIONALE` → User Story / Feature
- [ ] Webhook: Azure DevOps Service Hook → `ado-webhook/` → sync status back
- [ ] Attach session link + transcript to work item description
- [ ] Bi-directional: closing/resolving in ADO marks tracker item Approved

#### Linear
Auth: Linear OAuth 2.0

- [ ] Create issue via GraphQL, map priority + assignee + label (`RISK`/`ACTION`)
- [ ] Webhook: `linear-webhook/` → sync status changes back
- [ ] Auto-add to team's current cycle if item is Critical or High

#### Asana
Auth: Asana OAuth 2.0

- [ ] Create task in selected project/section
- [ ] `RISK` → tag as "Risk"; due date forwarded; assignee by email
- [ ] Webhook via Asana Events API → `asana-webhook/` → sync completion back

#### Monday.com
Auth: Monday.com OAuth 2.0

- [ ] Create item in selected board, map columns: Status, Priority, Assignee, Due
- [ ] Webhook: Monday.com automation trigger → `monday-webhook/`
- [ ] `RISK` items auto-assigned to "Risk Register" group if it exists

#### ClickUp
Auth: ClickUp OAuth 2.0

- [ ] Create task in selected list, map priority + assignee + due date
- [ ] Webhook: `clickup-webhook/` → sync status back
- [ ] Custom field: "Session Link" pointing to the Viewpoint Arena session

#### Trello
Auth: Trello OAuth 1.0a (legacy but widely used)

- [ ] Create card in selected board/list
- [ ] Add labels matching `type` and `priority`
- [ ] Webhook via Trello Power-Up → `trello-webhook/`

---

### Category C — Documentation & knowledge

These create **permanent records** — decisions, risks, and rationale captured
in the places where your team writes and reads documentation.

#### Notion
Auth: Notion OAuth

- [ ] Create page in selected Notion database
- [ ] `RATIONALE` items go to a "Design Decisions" database (ADR format)
- [ ] `RISK` items go to a "Risk Register" database
- [ ] `ACTION` items go to a "Tasks" database
- [ ] Sync: poll every 5min (Notion has no webhooks)
- [ ] Auto-generate full ADR (Architecture Decision Record) from RATIONALE items:
      title, context, decision, consequences — pre-filled from InsightDetails

#### Confluence (Atlassian)
Auth: Atlassian OAuth 2.0 (same app as Jira)

- [ ] Create or update a Confluence page for the session summary
- [ ] Append to a "Design Review Log" page — each session adds a new section
- [ ] `RATIONALE` items rendered as structured decision tables
- [ ] Include 3D model screenshot (from `capturedScreenshot`) inline in the page

#### SharePoint / Microsoft 365
Auth: Microsoft Graph API (same Azure AD app as Teams + ADO)

- [ ] Create a SharePoint list item for each tracker item in a designated list
- [ ] Upload session summary as a Word document to a SharePoint document library
- [ ] `RISK` items populate a SharePoint Risk Register list
- [ ] Sync back via SharePoint webhooks → `sharepoint-webhook/`

#### Google Docs / Google Drive
Auth: Google OAuth 2.0

- [ ] Generate a Google Doc session summary on meeting end
- [ ] Append to a running "Design Review Log" doc
- [ ] Share the doc with all session participants automatically

---

### Category D — Engineering & development

These connect design review outputs directly to **code and infrastructure**.

#### GitHub Issues
Auth: GitHub App (preferred) or OAuth

- [ ] Create issue in selected repo, labels from `type` + `priority`
- [ ] `RISK` → label `risk`; `ACTION` → label `enhancement` or `task`
- [ ] Milestone: map to sprint/release if one is active
- [ ] Webhook on issue close → tracker item Approved
- [ ] Link: issue body contains link to session + transcript excerpt

#### GitLab Issues
Auth: GitLab OAuth 2.0

- [ ] Create issue in selected project
- [ ] Map labels, milestone, due date, assignee
- [ ] Webhook on issue state change → sync back

#### Bitbucket Issues (Atlassian)
Auth: Atlassian OAuth 2.0 (same app)

- [ ] Create issue in selected repository
- [ ] Map priority, assignee, kind (`bug` for RISK, `task` for ACTION)

---

### Edge Functions — full list

```
supabase/functions/
  ── oauth/
     oauth-callback/           ← universal handler for all providers
     token-refresh/            ← background cron, refreshes expiring tokens

  ── push/ (item → external system)
     push-to-teams/
     push-to-slack/
     push-to-jira/
     push-to-ado/              ← Azure DevOps
     push-to-linear/
     push-to-asana/
     push-to-monday/
     push-to-clickup/
     push-to-trello/
     push-to-notion/
     push-to-confluence/
     push-to-sharepoint/
     push-to-gdocs/
     push-to-github/
     push-to-gitlab/
     push-to-bitbucket/

  ── webhooks/ (external system → tracker)
     teams-events/             ← Teams Bot Framework events
     slack-events/             ← Slack Events API (button clicks)
     jira-webhook/
     ado-webhook/
     linear-webhook/
     asana-webhook/
     monday-webhook/
     clickup-webhook/
     sharepoint-webhook/
     github-webhook/
     gitlab-webhook/
     bitbucket-webhook/

  ── cron/
     notion-sync/              ← every 5min, polls Notion for status changes
     outlook-tasks-sync/       ← every 15min, syncs Outlook task completion
     due-date-reminders/       ← daily, sends reminders for upcoming due dates
     token-refresh/            ← hourly, refreshes OAuth tokens before expiry
```

---

### UI — Settings page

`/settings/integrations` — one section per category, collapsible:

```
┌─ Communication ──────────────────────────────────────────┐
│  [Microsoft Teams]  ● Connected — Contoso Corp            │
│                     Channel: #design-reviews  [Change]    │
│                     [Disconnect]                          │
│                                                           │
│  [Slack]            ○ Not connected  [Connect]            │
│  [Google Chat]      ○ Not connected  [Connect]            │
│  [Outlook]          ● Connected — you@contoso.com         │
└───────────────────────────────────────────────────────────┘

┌─ Project Management ─────────────────────────────────────┐
│  [Jira]             ● Connected — PROJ board  [Change]    │
│  [Azure DevOps]     ○ Not connected  [Connect]            │
│  [Linear]           ● Connected — Engineering team        │
│  [Asana]            ○ Not connected  [Connect]            │
│  [Monday.com]       ○ Not connected  [Connect]            │
└───────────────────────────────────────────────────────────┘

┌─ Documentation ──────────────────────────────────────────┐
│  [Notion]           ● Connected — Design Workspace        │
│  [Confluence]       ○ Not connected  [Connect]            │
│  [SharePoint]       ● Connected — Contoso SharePoint      │
└───────────────────────────────────────────────────────────┘

┌─ Engineering ────────────────────────────────────────────┐
│  [GitHub]           ● Connected — org/repo  [Change]      │
│  [GitLab]           ○ Not connected  [Connect]            │
└───────────────────────────────────────────────────────────┘
```

Each connected integration shows: workspace/org name, target project/channel,
last synced timestamp, item sync count.

---

### Implementation priority order

Build in this order — each unlocks the most users fastest:

1. **Slack** — easiest API, most teams use it, proves the pattern
2. **Microsoft Teams** — biggest enterprise footprint, high demand
3. **Jira** — most common engineering issue tracker
4. **GitHub Issues** — engineering-heavy teams, simple API
5. **Azure DevOps** — Microsoft ecosystem shops (often same orgs as Teams)
6. **Linear** — modern eng teams, excellent DX
7. **Notion** — product/design teams, ADR use case
8. **Confluence** — enterprise Atlassian shops (same OAuth as Jira)
9. **Asana / Monday / ClickUp** — expand PM coverage
10. **SharePoint / Google Docs / Outlook** — full M365 / Google Workspace

---

### Done when (Phase 2 complete)
- Slack: end a meeting → summary posts to `#design-reviews` within 5s
- Teams: critical risk raised → Adaptive Card appears in Teams channel + DM
- Jira: click "Send to Jira" → issue created, linked, status syncs both ways
- ADO: same flow for Azure DevOps work items
- GitHub: ACTION item → GitHub issue with correct labels
- `/settings/integrations` shows connected status for all providers

---

## Phase 3 — Notifications & workflow automation
**Goal:** the right people get notified at the right time, in the right place,
without anyone having to check the tracker manually.

### Notification channels (in order of implementation)

| Channel | How | When |
|---|---|---|
| Email | Resend | Assigned, due soon, critical risk, weekly digest |
| Microsoft Teams DM | Teams Bot | Assigned, status changed, mentioned |
| Slack DM | Slack Bot | Assigned, status changed, mentioned |
| In-app bell | Supabase Realtime | All events |
| Outlook Calendar | Graph API | Due date set → calendar task created |

### Notification triggers

| Trigger | Who gets notified | Channels |
|---|---|---|
| Item assigned | Assignee | Email + Teams/Slack DM + in-app |
| Item due in 48h, still open | Assignee | Email + Teams/Slack DM |
| CRITICAL RISK raised | All session participants | Email + Teams/Slack channel |
| Status changed | Creator + assignee | In-app |
| Comment added | Assignee + thread participants | In-app + Teams/Slack DM |
| External issue closed (Jira/etc) | Creator | In-app |
| Weekly digest (Monday 9am) | Everyone with open items | Email |

### Tasks
- [ ] `supabase/functions/notify/` — triggered by DB webhooks, routes to
      correct channels based on user preferences
- [ ] User notification preferences: per-event, per-channel toggles
      in `/settings/notifications`
- [ ] Email templates (React Email): assigned, due-soon, critical-risk,
      weekly-digest, session-summary
- [ ] In-app notification bell: `notifications` table, Supabase Realtime,
      mark-all-read, click-to-navigate
- [ ] `supabase/functions/due-date-cron/` — daily at 8am, finds items
      due in 48h, triggers notify function

### Workflow automations (Phase 3b)
- [ ] Auto-escalate: CRITICAL RISK open >24h → notify team lead
- [ ] Auto-close: RATIONALE items auto-move to Approved after 30 days
      (decisions don't stay "open" forever)
- [ ] Auto-create follow-up session: if >5 open CRITICAL items remain after
      a session, suggest scheduling a follow-up review
- [ ] Microsoft Power Automate connector: publish a custom connector so
      enterprise teams can wire Viewpoint Arena into their existing M365 flows

---

## Phase 4 — Analytics & reporting
**Goal:** give the team visibility into patterns across all their design reviews.

### Views to build

**Session summary** (auto-generated when a meeting ends)
- Total items by type and priority
- Average time to close ACTION items
- Most-discussed component (by POI heatmap data + insights)
- Unresolved risks from previous sessions on same model

**Cross-session dashboard**
- Open items by assignee (who is overloaded?)
- Risk trend over time (are we raising fewer CRITICALs as the design matures?)
- Time-to-close by item type and priority
- Integration health (X items pushed to Jira, Y still unsynced)

**Export**
- [ ] Export session to PDF — summary + all items formatted
- [ ] Export to CSV — for import into any other tool
- [ ] Export to Markdown — for engineering docs / ADRs (Architecture Decision Records)

---

## Relationship between all three systems

```
Viewpoint Arena (3D meeting)
───────────────────────────────────────────────────────────────────
3D scene + AI agents + boardroom mode
InsightCard raised during meeting ──► Supabase tracker_items table
endMeeting() fires                ──► Session record + all items pushed
                                               │
                                               ▼
                              Action Tracker  /tracker
                        ──────────────────────────────────
                        Kanban / List / Timeline views
                        Assignee, priority, due date, status
                               │
               ┌───────────────┼──────────────────────┐
               │               │                      │
               ▼               ▼                      ▼
     Communication       Project Mgmt           Documentation
     ─────────────       ────────────           ─────────────
     Teams channel       Jira issue             Notion page
     Slack message       Azure DevOps WI        Confluence page
     Outlook task        Linear issue           SharePoint list
     Google Chat         GitHub issue           Google Doc
                         Asana task
                         Monday item
                         ClickUp task

               Status changes in any external system
                              │
                              ▼
                    Webhook → Edge Function
                              │
                              ▼
                    tracker_items.status updated
                              │
                              ▼
              Supabase Realtime → /tracker updates live
                              │
                              ▼
              Notify assignee (Teams DM / Slack DM / Email)
```

The three systems share:
- `types.ts` — `InsightCard`, `InsightDetails`, `InsightType` (never duplicated)
- Supabase project — one database, one auth, one set of Edge Functions
- Azure AD app — covers Teams + ADO + SharePoint + Outlook (one OAuth consent)
- Atlassian OAuth app — covers Jira + Confluence + Bitbucket (one OAuth consent)
- PartyKit room — tracker items created during a live multiplayer session
  appear in real time in any open `/tracker` tab

---

## How to start a session with Claude on this

```
We're working on Viewpoint Arena's Action Tracker.
Main app: React 19 / React Three Fiber / Zustand / Tailwind / Vite.
Tracker stack: Supabase (Postgres + Realtime + Auth) + Resend (email).
Integrations: OAuth 2.0 per provider + Supabase Edge Functions (Deno).
Full plan: docs/ACTION_TRACKER_ROADMAP.md.

Key existing types in types.ts:
  InsightCard, InsightType ('RISK'|'RATIONALE'|'ACTION'), InsightDetails
  InsightCard IS the tracker item — we extend it, never replace it.

OAuth app groupings:
  Azure AD app   → Teams + Azure DevOps + SharePoint + Outlook (one consent)
  Atlassian app  → Jira + Confluence + Bitbucket (one consent)
  Everything else → separate OAuth app per provider

Today: Phase [0 / 1 / 2 / 3 / 4].
Category: [Communication / Project Mgmt / Documentation / Engineering].
Integration target: [Teams / Slack / Jira / ADO / Linear / GitHub / Notion / ...].
[Any blockers or context here]
```

---

## Dependency install cheatsheet

```bash
# Phase 0 (local only)
# No new deps — just new components

# Phase 1 (Supabase)
npm install @supabase/supabase-js

# Phase 2 (integrations — install as needed)
# No client-side deps needed — OAuth + API calls happen in Supabase Edge Functions

# Phase 3 (notifications)
npm install resend                  # if calling from client-side (not recommended)
# Better: use Supabase Edge Function which has fetch() built in

# Phase 4 (export)
npm install @react-pdf/renderer     # PDF export
```

---

## Key invariants to never break

1. **InsightCard is the source of truth** — tracker items are InsightCards
   with extra fields, not a separate data model. Never duplicate the type.
2. **Tracker works without a meeting** — you can open `/tracker` anytime,
   not just right after a session. It's a standalone backlog.
3. **Meeting works without the tracker** — if Supabase is down or unconfigured,
   the meeting app still runs fully. Tracker sync is fire-and-forget.
4. **OAuth tokens never on the client** — all integration API calls go through
   Supabase Edge Functions. Tokens stay server-side only.
5. **External sync is eventually consistent** — don't block the UI waiting for
   Jira/Linear. Push optimistically, show sync status asynchronously.
