# Open-Source & Enterprise-Readiness Plan — Overview

> Branch: `planning/oss-enterprise-readiness`. This directory is a **plan, not code**.
> Nothing under `docs/plan/` should be treated as implemented until the corresponding
> ticket in [`08-task-breakdown.md`](./08-task-breakdown.md) is closed.

## 1. Goal

Turn Viewpoint Arena from a working single-deployment research prototype into a
repo that a large organization's IT/engineering team can:

1. **Clone and open-source-audit safely** — no secrets in history, a real license,
   clean provenance on every asset.
2. **Re-point at their own infrastructure** by editing one local, git-ignored
   config file — their PLM (Onshape, Teamcenter, or a custom system), their AI
   provider (self-hosted Ollama, OpenAI, Anthropic, or none), their TURN/relay,
   their database, their notification targets (Teams, SharePoint, Jira, email...).
3. **Launch a review session directly from their PLM** (a document/assembly in
   Onshape or Teamcenter opens straight into a Viewpoint Arena room scoped to
   that model).
4. **Get a real AI capture pipeline**, not the current simulation — meetings
   produce actual Risk/Action/Rationale cards extracted from what was actually
   said, with a fully self-hosted option so no audio/transcript ever leaves
   their network.

Point 4 already has a detailed design: [`docs/local-capture-plan.md`](../local-capture-plan.md).
This plan **extends** it rather than replacing it — see §3.

## 2. Guiding principles (apply to every ticket)

- **Secrets never reach the browser.** If a credential is needed, the call that
  uses it happens server-side (Vercel function, PartyKit server, or the
  self-hosted `capture-service`). The current Teamcenter integration violates
  this (plaintext password in `localStorage`, and potentially in the client
  bundle via `VITE_TC_PASSWORD` — Vite inlines every `VITE_`-prefixed var into
  the shipped JS). Fixing this is Phase 3 in the task breakdown, not optional
  polish.
- **Every external system sits behind an adapter interface.** PLM, AI capture,
  TURN/relay, notifications, and 3D import each get a small TypeScript
  interface with one or more implementations. A corp that wants to plug in a
  system we didn't build (say, Windchill instead of Teamcenter) implements the
  interface and never touches core app code.
- **Local dev works with zero external accounts.** Every adapter category has a
  `Mock`/default implementation. `npm run dev` after `npm install` must work
  out of the box — this is also what makes CI possible without secrets.
- **One master config file is the single source of truth for *which* adapters
  are active and *how* they're wired** — not the secret values themselves,
  which stay in `.env` / the org's secret manager. See
  [`01-architecture-and-master-config.md`](./01-architecture-and-master-config.md).
- **Every adapter interface ships a contract test.** A corp writing a custom
  PLM adapter runs the same test suite we run against Onshape to self-certify
  their implementation. See [`04-testing-and-ci.md`](./04-testing-and-ci.md).
- **Docs are the product for an OSS repo.** A missing LICENSE, a README that
  doesn't explain self-hosting, or an unclear contract for writing a new
  adapter is a shipped defect, same as a bug.

## 3. Relationship to existing docs in `docs/`

| Doc | Status | How this plan treats it |
|---|---|---|
| `local-capture-plan.md` | Detailed, unimplemented design for the real AI capture pipeline (STT + LLM, docker-compose, `CaptureProvider`/`TranscriptionProvider` interfaces) | **Primary input.** Its architecture and phased estimate are adopted almost as-is in Phase 4 of the task breakdown. Two changes: (a) provider config moves from its proposed `localStorage` Settings panel to the master config file, consistent with every other adapter; (b) it becomes one adapter category among several, not a special case. |
| `ACTION_TRACKER_ROADMAP.md` | Partially implemented — the `InsightCard`/`TrackerItem` data model and Supabase persistence it recommends already exist (`store.ts`, `lib/supabase.ts`, `docs/supabase-schema.sql`). Its "external sync" idea (Jira/Linear/Asana/Notion/email) is **not** built; only Teams, SharePoint, and Teamcenter push exist today. | Its unbuilt "external sync" concept is generalized into the `NotificationSinkAdapter` category in [`02-connector-adapters.md`](./02-connector-adapters.md), which also covers the three sinks that already exist. |
| `MULTIPLAYER_ROADMAP.md` | Superseded — recommends PartyKit for realtime sync, which is already the live implementation. Its Daily.co suggestion for video was **not** taken; the repo uses raw WebRTC + Cloudflare Realtime TURN instead. | Historical reference only, no action needed. |

Executing agents should skim these three for context but treat `docs/plan/*` as
authoritative when they conflict.

## 4. How to use this plan (for orchestrating agents / cheaper models)

Read in this order:

1. `01-architecture-and-master-config.md` — the target shape everything else builds toward.
2. `02-connector-adapters.md` — the interface contracts, one section per adapter category.
3. `03-security-and-secrets.md` — non-negotiable rules, plus the specific fixes required.
4. `04-testing-and-ci.md` — how every ticket proves itself done.
5. `05-observability-and-metrics.md` — what to instrument and why.
6. `06-deployment-and-installation.md` — the two supported deployment modes.
7. `07-oss-hygiene-and-licensing.md` — what must be true before the repo goes public (**read this one now — it contains a blocking legal-risk finding**).
8. `08-task-breakdown.md` — the actual execution tickets, ordered, each self-contained (files touched, interface signatures, acceptance criteria, required tests, dependencies on earlier tickets).

A ticket is **done** only when: it compiles (`npm run typecheck`), passes lint,
has the tests specified in its "Required tests" section passing in CI, and — if
it touches an adapter interface — passes that interface's contract test suite.
No ticket is done because an agent asserts it is; CI is the judge.

## 5. Explicit non-goals for v1

- Multi-tenant SaaS (one deployment = one org, matching every integration's
  current design — Onshape OAuth, Supabase project, etc. are all single-tenant).
- Mobile native apps.
- Automated speech-recognition-accuracy benchmarking in CI (no labeled dataset
  exists; documented as a manual periodic QA task instead — see
  `05-observability-and-metrics.md`).
- Migrating away from Vercel/PartyKit/Supabase as the default cloud path — they
  stay the fast-start option; self-hosting is additive, not a replacement.
