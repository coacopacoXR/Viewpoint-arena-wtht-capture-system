# Plan — review workflow: requirements, tracker structure, artifacts, people, sharing

Written 2026-09-22 from five points the user raised after testing the Docker
install. Independent of `09-grounded-capture.md`; both can run in parallel,
except that H (people) touches the same card UI as 09's batch D.

---

## E. Requirements must be editable (curate page and in the meeting)

Today: `REQUIREMENTS_DB` is a hardcoded array in `store.ts` ("Rotary knobs
must withstand 50 N…"), rendered read-only in the room's REQUIREMENTS tab. It
is the same five rows in every review, and nothing can change them.

- Requirements become part of the review: `requirements: Requirement[]` on
  `ReviewDraft` (`lib/reviewSetupStore.ts`), stored in the existing
  `review_curations` jsonb, so they travel with the review and sync live
  through the `REVIEW_CONFIG` broadcast that already exists.
- **Curate page**: a REQUIREMENTS tab beside ASSET / VIEWPOINTS / PINS /
  AGENDA — add, edit (code, description, category, status), reorder, delete.
- **In the meeting**: the REQUIREMENTS tab becomes editable for participants
  (add, edit text, change status MET / PENDING / AT_RISK), written through by
  the host exactly as viewpoints and pins are today.
- A new review starts empty with a "Start from the sample set" button that
  inserts today's five, so the demo still reads well; `REQUIREMENTS_DB` moves
  out of the store into that seed.
- `store.requirements` stays as the runtime view, hydrated from the active
  review instead of the constant. `InsightCard.affectedRequirementIds` keeps
  working, and later (09-D) can be validated against the real ids.

## F. Users define how reviews are organised (not us)

**User decided 2026-09-22:** the structure is theirs. One team groups by
product → variant → phase, another by programme → gate. So the app ships
suggested fields and lets people change them, in the app, with no file edit.

- **Label fields** are configurable records in the bundled database (new table
  `review_label_fields`: `id, name, position, values text[] (empty = free
  text), created_at`). Seeded on first run with Product, Variant, Phase —
  all renameable, removable, and extendable. A settings screen in the tracker
  edits them; anyone can (there are no roles in the app yet).
- Every review (`ReviewDraft`) and every session row carries
  `labels jsonb` = `{ "<fieldId>": "<value>" }`. `tracker_sessions` gains
  `labels jsonb not null default '{}'` (idempotent `alter table`, applied by
  install.sh's schema re-run). Curate page: a LABELS section; the meeting
  passes them through `flushSessionToTracker`.
- Tracker: a **Group by** control choosing up to three fields in any order,
  plus per-field filters; the choice is remembered per browser. A review with
  no value for a field groups under "Unassigned". Deleting a field hides it
  from grouping and leaves the stored values untouched (so it can come back).
- Free-text fields autocomplete from values already used, which keeps them
  consistent without forcing a list.

## G. Commit curation artifacts as comments

Curated pins and viewpoints are preparation; only some deserve to become
part of the meeting record. Make that a per-item action.

- Each pin (and each viewpoint note) in the review panel gets **Commit as
  comment**: creates a `SpatialComment` attached to the pin's node
  (`attachedToNodeId` / `attachedToNodeName` and position already exist on a
  pin), authored by whoever commits it, and broadcast with the existing
  `COMMENT_ADD` message, so it behaves exactly like a comment made live.
- The draft records `committedCommentId` on the pin so the button flips to
  "Committed" and a second press cannot duplicate it; removing the comment
  clears it.
- A "Commit all pins" bulk action on the review panel, clearly secondary.
- Agenda items are not committable (they are structure, not observations).

## H. Real people instead of the hardcoded team list

Today: `TEAM_MEMBERS` in `components/UI/InsightDetailModal.tsx` is a literal
array ("Alex Chen (Lead)", "Sarah J. (Ergo)"…) used for the assignee dropdown.

- Delete the constant. The assignee list is assembled from:
  1. **people in the room now** (presence list: name + colour), and
  2. **the review's team roster**: `team: TeamMember[]`
     (`{ id, name, role?, email? }`) on `ReviewDraft`, edited on the curate
     page (a PEOPLE tab: add, edit, remove), and
  3. **free entry**: typing a name that matches nobody offers "Add <name> to
     the team", which appends to the roster so it is there next time.
- Anyone who joins a meeting and is not in the roster is offered once, after
  the meeting, in the summary: "Add Maria to the team?" — cheap way to build
  the roster from actual attendance.
- The same list feeds tracker item assignees and comment @mentions, so a name
  means the same thing everywhere.
- Storage: the roster lives with the review (jsonb), which keeps the bundled
  database as the only store. A workspace-wide roster is a later step; note it
  and do not build it now.

## I. Sharing that actually works off this machine

Today: `SharePanel` builds `${window.location.origin}/room/${roomId}`. With
the installer's default hostname that is `https://localhost/room/…`, which is
meaningless on a phone, and the QR code encodes exactly that.

Three layers, all needed:

1. **The deployment knows its public address.** `PUBLIC_HOSTNAME` is already
   in `.env`; expose the full public origin through `/api/public-config`
   (`publicUrl`), and have SharePanel prefer it over `window.location.origin`.
   A deployment reached at `https://192.168.1.134/` then shares that.
2. **Honest warning when the link is local-only.** If the resulting URL host
   is `localhost` / `127.0.0.1` / `::1`, the share panel says plainly: "This
   link only works on this computer" and explains the fix (re-run
   `./install.sh` and give the machine's network address, e.g.
   192.168.1.134). Currently it presents a dead link as if it were shareable —
   the QR is worse, because it looks scannable.
3. **The installer helps get it right.** When the hostname answer is
   `localhost`, print what that costs ("only this computer can open the app")
   and offer the detected LAN address instead; on Windows/WSL the detection
   must read the Windows host address, not the WSL one. The self-signed
   certificate already covers an IP (`IP:` SAN), so a phone gets one warning
   and then works.

Out of scope here, but the honest limits to document in `docs/INSTALL.md`:
a phone must be on the same network; a real certificate (Let's Encrypt) and
access from outside the network are separate work; and the app has no sign-in,
so anyone with the link and network access can join.

## J. Agents off by default

Today four scripted agents (SYS.OP, ENG.UNIT, DES.LEAD, VR.USER in
`INITIAL_AGENTS`, `store.ts`) appear in every room: in the 3D scene, the
participants list, the boardroom tiles and the AI-camera weights. They are
demo furniture, and in a real review they are noise — and confusing beside
real participants.

- `hideAgents` defaults to **true** (it is `false` today), so a fresh room has
  only real people. The existing toggle switches them back on for a demo.
- Everything downstream must read correctly with zero agents: the participants
  list, the boardroom layouts, the AI-camera weights panel, POI/attention
  code, and `flushSessionToTracker`'s `participant_count` (real people, not
  agents).
- The mock capture simulation already only runs under capture.provider
  'mock'; leave that as is.

## K. Agent programmer, version 0.1

The agents should do something. 0.1 gives a review a small set of
user-written agents that read what actually happened and answer in the
meeting, using the local model already installed.

- **Definition** (edited on the curate page, stored with the review):
  `agents: ReviewAgent[]` = `{ id, name, colour, role (free text),
  instructions (the prompt), output: 'cards' | 'note' | 'both',
  runs: 'onDemand' | 'onDemand+atEnd' }`. No tools, no autonomy, no
  scheduling engine.
- **Input** when it runs: the meeting transcript so far (speaker-labelled once
  09-B lands), the component tree, the pointing timeline (09-C), the agenda
  item, and the requirements (E). The same material the extractor gets.
- **Execution**: a new `POST /agent` on capture-service — system prompt =
  the agent's instructions plus the house rules (answer only from the
  material; cite the part ids you were given; say "nothing to add" when there
  is nothing), user turn = the material. Runs on the same Ollama model.
  One run at a time per room, a hard cap on input size, and a visible
  "<name> is thinking…" state.
- **Output**: insight cards (typed RISK / RATIONALE / ACTION, attributed to
  the agent, marked AI-generated and dismissible) and/or one note in the
  transcript panel labelled with the agent's name.
- **Trigger**: an "Ask <agent>" button per agent in the room; optionally also
  a run at END SESSION alongside the extraction.
- **Honesty**: agent output is never silently merged with what people said.
  Cards carry the agent as `agentId`; the panel shows an AI badge; nothing an
  agent writes is committed to the tracker without a human approving the card
  (the approve/reject buttons already exist).
- Out of scope for 0.1: agents that speak unprompted, agents that watch every
  utterance in real time, tool use (PLM lookups, web), and per-install agent
  libraries. Note them; do not build them.

---

## Sequencing

| Batch | Work | Size |
|---|---|---|
| Z | I (sharing: publicUrl + warning + installer help) | small, highest annoyance |
| AA | E (editable requirements, curate + meeting) | medium |
| AB | H (people: roster + room participants, drop TEAM_MEMBERS) | medium |
| AC | F (user-defined label fields + tracker grouping, settings screen) | medium-large |
| AD | G (commit pins/viewpoints as comments) | small-medium |
| AE | J (agents off by default) | small |
| AF | K (agent programmer 0.1) | large; after 09-D, which gives it the tree + grounding |

Each batch: Qwen drafts from a written spec, Claude reviews and runs it live
in the Docker install (two browsers, phone-sized viewport for I) before
committing.
