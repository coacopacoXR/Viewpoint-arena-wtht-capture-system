# docs/ — Orientation for AI Agents

This repo (**Viewpoint Arena**) is mid-way through two related but separate
initiatives. Read this first before touching anything under `docs/`.

## What this repo is

A React Three Fiber 3D app simulating multi-user collaborative design
reviews, with AI agents, viewpoint-control modes, and an AI-driven
Risk/Rationale/Action insight system (currently simulated — see
`local-capture-plan.md`). See the root `README.md` for the feature tour.

## The two active workstreams

### 1. Open-source & enterprise-readiness engineering plan — `docs/plan/`

**Goal**: make this repo cloneable by an enterprise IT team, re-pointable at
their own PLM/AI-provider/TURN/DB/notification infrastructure via one master
config file, with a real (not simulated) self-hosted AI capture pipeline.

**Start here**: `docs/plan/00-overview.md` (index + reading order),
`docs/plan/08-task-breakdown.md` (the actual execution tickets),
`docs/plan/NEXT-STEPS.md` (what's pending before autonomous execution starts).

**Status as of 2026-09-04**: plan fully written, nothing executed yet.
Branch: `planning/oss-enterprise-readiness`. Execution will be driven via
Qwen Code CLI, orchestrated by Claude Code, per `NEXT-STEPS.md`.

**Operating rule for whoever executes this plan**: only escalate
personal-preference or UI/UX decisions to the user. Technical decisions with
a clearly better answer (license choice, framework picks, security fixes,
architecture patterns) should be made and executed directly, not held open
as a question. Two decisions already made under this rule and **should not
be re-litigated**: license is Apache-2.0 (`docs/plan/07-oss-hygiene-and-licensing.md`
§3), and the two branded `.glb` assets default to being replaced with an
open sample unless the user has explicitly confirmed redistribution rights
(`docs/plan/08-task-breakdown.md` T0.1) — see the cross-reference in
`docs/paper/README.md` §7 for a live lead on that asset's actual provenance.

### 2. Academic paper — `docs/paper/`

**Goal**: publish a paper presenting this system as building on / closing a
gap explicitly named in the user's PhD thesis, to give the open-source
release research credibility rather than shipping it as an unaccompanied
code drop.

**Start here**: `docs/paper/README.md` — contains the full research
synthesis (thesis narrative, per-paper summaries, feature-to-guideline
mapping, gaps that are the paper's actual new contribution) and the source
material location (a PhD thesis package on the user's Google Drive, outside
this repo).

**Status as of 2026-09-04**: intent registered, research synthesis done,
**venue/paper-type not yet decided** — this is a strategic call left
explicitly to the user, not something to default on. See
`docs/paper/README.md` §9 for the three candidate directions raised.

## How the two relate

The engineering plan is what the paper would describe/cite as the system.
They can proceed independently — the paper doesn't block engineering work,
and engineering work up through Phase 0–1 (tests, docs, contribution
guidelines) is largely what a JOSS-style software paper would need anyway,
if that's the direction chosen. Don't conflate them into one workstream;
they have different audiences, different timelines, and different owners of
the open decisions in each.

## Other docs in this directory

- `local-capture-plan.md` — the original (pre-this-plan) design for the real
  AI capture pipeline. Still the primary technical reference for Phase 4 of
  `docs/plan/08-task-breakdown.md`; the engineering plan extends it rather
  than replacing it.
- `ACTION_TRACKER_ROADMAP.md`, `MULTIPLAYER_ROADMAP.md` — earlier planning
  docs, largely superseded (their recommendations — Supabase, PartyKit — are
  already implemented). Historical reference only; see
  `docs/plan/00-overview.md` §3 for how they were folded in.
- `supabase-schema.sql` — the current DB schema, vendor-neutral by design
  (works against self-hosted Postgres, not just hosted Supabase).
