# Connector Adapters — Interfaces & Implementations

Every category follows the same shape: a `types.ts` with the interface, one
file per implementation, and a shared `*.contract.test.ts` (see
`04-testing-and-ci.md`) that every implementation — ours or a corp's custom
one — must pass.

## 1. PLM (`lib/connectors/plm/`)

```ts
// lib/connectors/plm/types.ts
export interface PLMDocumentRef { id: string; workspaceId?: string; elementId?: string; }

export interface PLMAdapter {
  /** OAuth/SSO entry point — redirect URL or auth-start handler name. */
  authStartPath: string;
  listDocuments(auth: PLMAuthContext): Promise<PLMDocumentRef[]>;
  getElement(auth: PLMAuthContext, ref: PLMDocumentRef): Promise<PLMElement>;
  exportGeometry(auth: PLMAuthContext, ref: PLMDocumentRef, format: 'gltf'): Promise<Blob>;
  /** Resolves a deep-link launched FROM the PLM system into a room context. */
  resolveLaunchContext(query: Record<string, string>): Promise<{ roomHint: string; doc: PLMDocumentRef } | null>;
}
```

- **Onshape** — reference implementation. Already correct: OAuth2, HttpOnly
  cookies (`api/_lib/onshape.ts`), secrets server-only. Work here is mostly
  *reorganizing* `api/onshape/*` behind the interface, not rewriting logic.
- **Teamcenter** — **must be rewritten**. Today `lib/teamcenterIntegration.ts`
  calls Teamcenter directly from the browser with a username/password read
  from `VITE_TC_*` env (bundle-visible) or `localStorage` (plaintext). New
  shape: `api/teamcenter/login.ts`, `api/teamcenter/tasks.ts`,
  `api/teamcenter/change-notices.ts` mirror the Onshape session-cookie
  pattern; `lib/connectors/plm/teamcenter.ts` is the thin client the browser
  actually calls (no credentials in its arguments).
- **Custom/generic** — document the contract in this file's companion
  `docs/adapters/plm.md` (write during Phase 3, see task breakdown) so a corp
  with e.g. Windchill or Aras can implement it without reading app internals.

`resolveLaunchContext` is the mechanism for "fire it up from PLM": the PLM
system opens `https://<host>/room?plmSource=onshape&plmDoc=<id>&token=<short-lived>`,
the app resolves that into a room + preloaded model before rendering.

## 2. AI Capture (`lib/connectors/capture/`)

Adopted directly from `local-capture-plan.md` §"Provider abstraction," with
one change: config comes from `viewpoint.config.ts`/`.env`, not a
`localStorage`-backed Settings panel (a *dev-only* override panel writing to
`localStorage` is fine for local iteration, but must be visibly labeled
non-production and never the source of truth in a real deployment).

```ts
// lib/connectors/capture/types.ts
export interface TranscriptChunk { speakerId: string; text: string; startMs: number; endMs: number; }
export interface SlideContext { agendaIdx: number; slideTitle: string; hoveredPartName?: string; laserTargetPartName?: string; }

export interface CaptureProvider {
  extractInsights(transcript: TranscriptChunk[], context: SlideContext): Promise<InsightCard[]>;
}
export interface TranscriptionProvider {
  startStream(onPartial: (text: string, speakerId: string) => void): Promise<StreamHandle>;
}
```

Implementations, in build order (matches Phase 4 of the task breakdown):

| Implementation | Notes |
|---|---|
| `MockProvider` | Current `DialogueEngine.tsx` behavior, extracted behind the interface with **no behavior change**. Default everywhere until an org opts in. |
| `LocalCaptureProvider` | Talks to the self-hosted `capture-service` over WebSocket. The production path for privacy-conscious orgs. |
| `OllamaDirectProvider` | Browser → Ollama directly, LAN-only, no transcription (bring-your-own-transcript or text-only mode). Weaker but zero extra infra. |
| `OpenAIProvider` / `AnthropicProvider` | For orgs that permit cloud AI. Straightforward SDK calls, API key server-side only (proxy through a Vercel function — never call these directly from the browser with a key). |

`DialogueEngine.tsx` is 1106 lines and currently *is* both the mock provider
and the UI wiring. Extracting `MockProvider` must be preceded by
characterization tests that pin current output for a fixed set of inputs, so
the extraction is provably behavior-preserving — see `04-testing-and-ci.md`.

## 3. TURN / Realtime Relay (`lib/connectors/turn/`)

```ts
// lib/connectors/turn/types.ts
export interface TurnAdapter {
  getIceServers(): Promise<RTCIceServer[]>;
}
```

- **Cloudflare** — reference implementation, already near-ideal
  (`api/turn-credentials.ts`): server-side token exchange, short TTL, secrets
  never leave the server. Refactor: read `tokenIdEnv`/`apiTokenEnv` names from
  config instead of hardcoded `process.env.CF_TURN_*`, otherwise unchanged.
- **Self-hosted coturn** — new, for the air-gapped docker-compose deployment
  (`local-capture-plan.md` already lists this as a compose alternative). Same
  interface, points at the org's own coturn container instead of Cloudflare's
  API.

## 4. Notifications / External Sync (`lib/connectors/notify/`)

Generalizes the existing Teams/SharePoint/Teamcenter push code *and* the
unbuilt Jira/Linear/Asana/Notion/email idea from `ACTION_TRACKER_ROADMAP.md`
into one interface:

```ts
// lib/connectors/notify/types.ts
export interface NotificationSinkAdapter {
  id: string; // 'teams' | 'sharepoint' | 'teamcenter' | 'jira' | 'email' | ...
  postSession(session: TrackerSession, items: TrackerItem[]): Promise<{ ok: boolean; error?: string }>;
  postItem(item: TrackerItem): Promise<{ ok: boolean; error?: string }>;
}
```

- **Teams** — move server-side: `api/notify/teams.ts` holds the webhook URL
  (`webhookUrlEnv`), browser calls the Vercel function instead of Teams
  directly. Card-building logic in `lib/teamsIntegration.ts` moves largely
  unchanged into `lib/connectors/notify/teams.ts`, just called from the server.
- **SharePoint** — **documented exception**: it uses MSAL browser-delegated
  auth (the signed-in user's own SharePoint permissions), which is legitimately
  a client-side flow by design (Microsoft's model, not ours to change). Keep
  client-side, but audit `lib/sharepointIntegration.ts`'s MSAL cache config
  for the standard MSAL hardening settings (token cache location, no ROPC).
- **Teamcenter push** — same server-side move as PLM §1's Teamcenter fix;
  `pushActionsToTeamcenter`/`pushRisksToTeamcenter` logic relocates to
  `api/teamcenter/*` and is exposed through this same
  `NotificationSinkAdapter` interface for consistency.
- **Jira / Linear / Asana / Notion / email (Resend)** — net-new, from the
  action-tracker roadmap's original idea, now scoped as adapters. Lower
  priority than fixing the two existing security issues; see task breakdown
  Phase 3 vs. "nice to have, not blocking OSS release."

## 5. 3D Model Import (`lib/connectors/modelImport/`)

```ts
// lib/connectors/modelImport/types.ts
export interface ModelImportAdapter {
  translate(ref: PLMDocumentRef, format: 'gltf'): Promise<{ url: string } | { blob: Blob }>;
}
```

- **Onshape** — reference implementation, generalizing the existing
  `api/onshape/translate*.ts` GLTF export pipeline.
- **Generic upload** — a corp with a PLM we don't support yet can still use
  the app by uploading a `.glb`/`.gltf` directly (`utils/modelLoader.ts`
  already loads arbitrary GLTF — this adapter just formalizes "no PLM
  connector, manual upload" as a first-class, documented mode rather than an
  accident of the loader being generic).

## 6. Data persistence — not a new adapter, just a config swap

`lib/supabase.ts` already works against self-hosted Postgres +
Supabase-compatible stack (the schema in `docs/supabase-schema.sql` is
explicitly written vendor-neutral). No interface needed — document the swap
procedure (point `db.urlEnv`/`db.anonKeyEnv` at a self-hosted instance) in
`06-deployment-and-installation.md` instead of building an abstraction for
something that's already portable.
