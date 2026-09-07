# Academic Paper — Intent & Research Synthesis

> Status: **intent registered, nothing drafted, venue/scope not decided.**
> This document is the durable record of that intent and the research
> groundwork behind it, so any agent (or session) picking this up doesn't
> depend on conversation memory.

## 1. Intent

The user (Francisco Garcia Rivera) wants to write and publish an academic
paper presenting **Viewpoint Arena** (this repo) as a system that builds on
and "closes the loop" on his PhD thesis, *"Collaborative Technologies in
Engineering Design Reviews"* (University of Skövde, 2026). Stated purpose:
give the open-source release credibility by grounding it in peer-reviewed
research rather than shipping it as an unaccompanied code drop.

This is a **separate workstream from `docs/plan/`** (the open-source /
enterprise-readiness engineering plan) but feeds off the same codebase and
reinforces the same release — see `docs/README.md` for how the two relate.

## 2. Source material

PhD thesis package, compilation format (kappa + 6 papers), located at:

```
G:\My Drive\Work\PhD\Thesis\Thesis Package FGR\Revision\Submission\
```

Contents:
- `RE-REVISED_THESIS_MANUSCRIPT.pdf` — the synthesizing manuscript (kappa)
- `Paper I.` The schematization of XR technologies in the context of collaborative design
- `Paper II.` Improving the efficiency of VR-based ergonomics assessments with digital human models in multi-agent collaborative virtual environments
- `Paper III.` Friction situations in real-world remote design reviews when using CAD and videoconferencing tools
- `Paper IV.` Shared versus Individual Viewpoint Control in Remote Design Review Meetings — Effects on Communication and Collaboration
- `Paper V.` Beyond videoconferencing: How collaborative tools make virtual design reviews work
- `Paper VI.` Guidelines Development for Design Reviews with Advanced Collaboration Tools

Not everything in the thesis is relevant to Viewpoint Arena (per the user,
directly) — see §6 for what's genuinely out of scope.

## 3. Thesis-level narrative

Overarching RQ: *"How can collaborative technologies support more effective
and traceable design reviews (DRs)?"*, split into RQ1 (challenges), RQ2
(technological capabilities that address them), RQ3 (translation to
practice). Mixed-method arc: field observation (III) → controlled lab
experiments (I/II/IV) → richer qualitative lab study (V) → industrial
guideline validation with two automotive companies (VI).

Core finding, repeated at Discussion and Conclusion: three affordances
actually matter — **(1) shared spatial presence** in a common 3D scene,
**(2) in-scene deictic indication** (pointing/sketching), **(3) independent
navigation with an explicit follow/leader mechanism**. Everything else is
implementation detail around these three.

### The hook — thesis Future Work (§6.1), closely paraphrased

> "Future research should deepen the investigation into how DRs are
> documented and how outcomes are operationalized... Research should focus
> on how advanced collaboration tools can be integrated with PLM systems to
> automate the creation of records, facilitate the assignment of tasks, and
> ensure that decisions made are effectively acted upon."

This is not a loose thematic connection — it's a direct, named gap that the
Insights Deck (Risk/Rationale/Action extraction) + the `NotificationSinkAdapter`
PLM-sync layer (see `docs/plan/02-connector-adapters.md` §4) exists to fill.
A paper framed as closing this specific gap is defensible, not a stretch.

A second hook: thesis §5.3 names IP/data-security barriers as having
**limited the depth of direct intervention** in the original studies. The
self-hosted, local-only AI capture pipeline (`docs/local-capture-plan.md`,
`docs/plan/08-task-breakdown.md` Phase 4) is a plausible direct answer to a
limitation the thesis names about itself.

## 4. Per-paper summary (the four directly relevant ones)

**Paper III** — Field study, Swedish automotive company, 15 distributed DRs
over 3 months, CATIA + Teams, presenter-controls-screen structure. Four
recurring friction categories: requesting specific viewpoints, indicating
specific elements, expressing design-change ideas, evaluating ergonomics.
Root cause: access to the shared model is centralized in one operator;
spatial info must be communicated verbally.

**Paper IV** — Controlled lab experiment, N=60 (20 groups of 3: 1 builder +
2 guiders), color-cube puzzle task. Individual Viewpoint Control vs. Shared
Viewpoint Control (10 groups each). No completion-time difference, but
individual control produced far more navigation talk, more speaker changes,
higher camera-angle dispersion; shared control produced short direct
placement commands, near-zero alignment talk. Conclusion: viewpoint
configuration reshapes *how* teams coordinate even when task efficiency is
equal — both modalities are necessary, not interchangeable.

**Paper V** — Qualitative lab study, 9 participants / 3 groups, Gravity
Sketch, asymmetric setup (1 XR + 2 desktop per group), independent nav +
follow + pointing + sketching + digital human models. **Participants were
final-year Product Design Engineering students doing headphone design
projects at the time of the study** — flagged in §6 below as a live
provenance lead for a repo asset. Findings: independent navigation + follow
option let people explore individually while retaining group awareness;
pointing/sketching anchored proposals to geometry; shapes the *rhythm* of
discussion rather than raw efficiency.

**Paper VI** — Participatory workshops with two automotive companies,
guideline cards, validated across both. Five guideline themes, each with an
explicit "technological enabler":

| Theme | Guideline core | Named technological enabler |
|---|---|---|
| 1. Pre-Read &amp; Preparation | Share scene 24–48h ahead, curated with pre-made comments/agenda/POIs | Persistent Scene States, Named Views |
| 2. Attention Management | Alternate "Guided"/"Free" modes; cap concurrent pointers; avatar hiding for clutter | Focus Synchronization Toggle ("bring everyone to me"), Free Viewpoint Navigation, Clutter Management |
| 3. Documentation &amp; Traceability | Capture the *rationale*, not just the action item; anchor remarks to geometry | Contextual Anchoring |
| 4. Integration &amp; Handoff | PLM as single source of truth; ideal = one-click launch from PLM; closed-loop sync to tracker | Direct Launch (from PLM), Direct Sync |
| 5. Modality &amp; Role Distribution | Asymmetric participation — XR for examiners, desktop for observers; avatars preferred over embedded video | Cross-Platform Synchronization, avatar cues over video |

## 5. Feature-to-guideline mapping

**Clean, defensible (paper-citable as-is):**
- **Sync/Leader Mode** ↔ Paper VI Theme 2's "Focus Synchronization Toggle" — near-verbatim match to the industry participants' own phrasing.
- **Hybrid Split-Screen** ↔ Paper IV's individual-vs-shared-viewpoint finding — lets a user choose either of Paper IV's two experimental conditions live, mid-session, rather than being locked into one.
- **Insights Deck** (Risk/Rationale/Action, `componentReference`) ↔ Paper VI Theme 3 directly, including the specific "capture the rationale, not just the action" requirement.
- **PLM launch-context** (`resolveLaunchContext`) ↔ Paper VI Theme 4's "Direct Launch," which the paper quotes industry participants calling a critical wish for future implementation.
- **Agent Styles toggle** (hide/simplify avatars) ↔ Paper VI Theme 2 (clutter/avatar hiding) and Theme 5 (avatars over video).
- **Attention Heatmap / gaze rays / frustums** ↔ operationalizes the thesis's core affordances #1 and #2 as a *visualization* — none of the six papers built this; genuine extension, not a replay.

**Honest stretch — frame as proposed/extended, not confirmed:**
- **AI-Guided Focus** (autonomous "center of attention" camera) — no paper tested an *autonomous* camera; Papers IV/V tested only human-driven follow/independent modes. This is a plausible extrapolation of the follow mechanism, not a thesis-validated finding.
- **Live Transcript / simulated dialogue** (current `DialogueEngine.tsx`) — UI scaffolding, no direct thesis grounding.

## 6. Gaps — the paper's actual new-contribution territory

Not covered by the thesis at all; this is what the paper has to justify on
its own merits, not borrow credibility for:
- **Real AI-driven insight extraction** (LLM/STT pipeline) — none of the six papers touch automated extraction; Theme 3 assumes a human Scribe.
- **Open-source, config-driven multi-vendor adapter architecture** — thesis guidelines are vendor-agnostic in principle but were only tested inside one purpose-built environment per company.
- **Enterprise self-hosting / privacy-preserving local capture** — see the §3 hook re: thesis §5.3's named IP/data-security limitation.
- **AI agents as reviewer stand-ins** — methodologically new; all six papers used only human participants. Needs careful framing (prototyping/demo tool, not a claim about real collaboration dynamics) — do not overclaim this replicates human collaboration findings.

## 7. Open provenance lead — relevant to the OSS-readiness plan

Paper V's participants were doing **headphone design projects** at the time
of that study. This is a plausible source for
`sennheiser_momentum_4_headphones.glb` (flagged as a legal-risk asset in
`docs/plan/07-oss-hygiene-and-licensing.md` §1 and `08-task-breakdown.md`
T0.1, currently defaulting to "replace with an open sample" since rights are
unconfirmed). **Worth checking whether that asset actually traces back to
this coursework** — if so, the university/course context may change what
"confirmed rights" looks like, and T0.1's default action should be revisited
before it executes.

## 8. Papers I & II — relevance

- **Paper I** — conceptual presence-dimension framework (social/physical/self-presence). Useful as background/theoretical citation for the XR-vs-desktop asymmetric design, not a feature-mapping source.
- **Paper II** — ergonomics-focused VR study (digital human models). Thematically adjacent but Viewpoint Arena has no ergonomics/digital-human-model feature. Skip unless that gets added later.

## 9. Open decision — paper type & venue (not yet made)

This is a strategic/personal call, not a technical one — explicitly not
defaulted or decided on the user's behalf. Three candidate directions were
raised and are awaiting the user's steer:

1. **Short software paper (JOSS — Journal of Open Source Software)** — ~1000
   words, peer-reviewed, purpose-built for giving credibility to an
   open-source research tool. Its review criteria (tests, docs, contribution
   guidelines) is exactly what `docs/plan/` already builds toward. Fastest
   path, no new study needed, publishable once Phase 0–1 of the engineering
   plan lands.
2. **Design/HCI vision paper** — fuller (8–10 page) paper for a Design
   Society (ICED/DESIGN) or CSCW/DIS venue. Presents Viewpoint Arena as a
   guideline-driven reference implementation (§5 above) and proposes the
   AI-capture work as future work. More academic weight, no new study
   required, slower review cycle.
3. **Full empirical evaluation** — an actual user study with the working AI
   capture pipeline, evaluated against the thesis's own guidelines/metrics.
   Highest credibility, but needs Phase 4 of the engineering plan (real AI
   capture) finished first, plus participants and a multi-month timeline.

## 10. Next steps

- [ ] User decides paper type/venue direction (§9) — ask again when picked back up, don't default.
- [ ] Resolve the Sennheiser asset provenance lead (§7) — informs `docs/plan` T0.1.
- [ ] Once direction is chosen: draft an outline, map it against §5's table for a "system implements guideline N" section, decide whether prior-work citation needs the papers' actual DOIs/venues (not yet looked up — the thesis package has submitted/under-review manuscripts, some venue names are provisional per the synthesis pass and should be re-verified against final publication status before citing).
