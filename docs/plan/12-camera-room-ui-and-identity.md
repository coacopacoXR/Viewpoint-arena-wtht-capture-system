# Plan — the camera, the room's furniture, and who you are

Written 2026-09-23 from the user's notes after testing the build, in the
user's own terms, with the reasoning kept rather than compressed into tickets.

**Status (2026-09-23, night):**
- **A1–A4: done.** `d81579d` did A1 and A2; `3a735f7` did A3 and A4.
- **B: done** as Option B (`a43a5bf`).
- **C: not started**, waiting on the user's choice.
- **D:**
  - The Vercel config gap is closed (`6187662`).
  - The spend ceiling is documented in the README rather than built. The
    server code has no database to count spending across instances.
  - CI runs on Node 24 actions (`e3514d7`).
  - Lint warnings are down to 36 (`03adc3c`).
  - Still open: TURN, diarization, T0.1, programmable agents.

See EXECUTION-LOG for the details.

Three separate things got bundled together in one message, and they are
different sizes: a **camera and following model** that needs design, a list of
**room-furniture changes** that are mostly layout, and a **return to accounts**
that reverses a decision made a week ago and deserves its own thinking.

---

## A. The camera and the follow model (design first, then code)

### A1. Free view does not orbit the thing you are looking at
> "when you go back to the free view (also happens in mobile) it feels a
> little weird, like when you wanna rotate around the central object it
> doesn't really rotate around the central object but more like you rotate
> around yourself and it is difficult to freely navigate well"

The symptom is an orbit **target** left where the previous mode put it, so the
controls pivot around the camera's own position rather than the model. It
happens on the way *back* from a followed view, and on mobile. Before writing
anything: reproduce it, find where the target is set when leaving leader mode,
and decide what free view's target should be — the model's bounding-box centre
is the obvious answer, and re-centring on the current selection or pin may be
better. Whatever is chosen, the same rule has to hold on mobile.

### A2. Disengaging from a leader is the wrong shape
> "whoever is on leader mode knows who is following and the moment everyone
> disengaged, then it goes back to free view. If you disengaged by navigating
> yourself (not pressing the free view button) that doesn't count as actually
> disengaging. BTW that eventual disengagement doesn't work well, it conflicts
> with the current view."

Three things, and the third is a bug:

1. **The leader should see who is following.** Names, live.
2. **When the last follower leaves, the leader returns to free view.** Nobody
   is watching, so there is nothing to present to.
3. **Nudging the camera is not leaving.** Only the Free View button means "I
   am out". Today a nudge half-detaches you and fights the incoming view.

The user's own proposal, which is the design unless something better turns up:

> "Perhaps it can go in free view on the background and after 2 seconds of idle
> time goes back to the view of the leader, but the user needs to think that
> they are not in free view, or at least that they are only temporarily and
> after idle time it goes back to following unless they press the free view
> button"

So: a nudge gives you a **temporary** free camera, the UI says you are still
following ("following Paco — moving on your own · snapping back"), and after
~2 s of no input the camera eases back to the leader's view. Pressing Free
View is the only way out. Two details to get right: the snap-back must be an
ease, not a jump, and the 2 s needs to feel right in use rather than on paper.

### A3. Split screen defaults to agents
> "The split screen thing has a default option the agents. I don't want that,
> I want that the default options are the other participants."

The split-view picker should offer the people in the room first. Agents only
appear at all when agents are on (see `b66d77b`); with them off the picker
should never mention them.

### A4. Remove the top-down view and the heatmap
> "I want to remove the top down view and the heatmap thing."

Both are demo-era. Removal, not hiding: the buttons, the view mode, the
heatmap overlay component and whatever state feeds it. Check
`components/Scene/HeatmapOverlay.tsx`, the `ViewMode` enum, and the bottom
dock's view-mode buttons.

---

## B. The room's furniture (layout, mostly)

### B1. The bottom dock is holding the wrong things
> "I want to remove the play stop button, the OP.STATUS running, and move
> there the elements of the call, mic and speaker thing, perhaps also the
> privacy and the participants and share."

The playback transport and the OP.STATUS readout are simulation-era
furniture in the most valuable strip of screen. The call controls belong
there instead. "Perhaps" on privacy/participants/share — the user is thinking
aloud, so lay it out and show them rather than guessing. Note that the
bottom-left AGENTS/DATA FLOW cluster and the 1360px lift from `56ad4ea`
interact with anything that changes this row's width.

### B2. The deictic panel is too big and in the wrong place
> "I want the deictic features panel to be on top and I want it to take less
> space. Perhaps some options can be hidden under a menu."

### B3. The side panel should own its side
> "I want that it takes the whole side and doesn't conflict with the manager
> view when opened."

### B4. The manager view is clumsy, and hard to reach
> "I also feel like that the manager view is a little clumsy and it can only
> be accessed if there are previous comments, but it feels a little weird."

Reaching a workspace only when a comment already exists is a rule nobody
would choose deliberately; it is most likely an accident of where the button
was put. Find out why, then give it an honest entry point.

**DECIDED 2026-09-23 (night): Option B** from the sketch published as the
"Room Layout Options" artifact (https://claude.ai/artifact/LxwpgbWA2vueWeriaFu5bu).
Bottom: a short call bar (mic, speaker, same room · Free/Lead/AI/Split ·
leave) plus a separate host-only **Manage** button beside it. Top: one bar with
Highlight Part/Model and a "Pointer ▾" menu (finger, hover) on the left and
people / share / privacy / boardroom on the right. Right: the side panel runs
the full height with the transcript at its foot. The manager view opens IN
PLACE of the side panel and closing it brings the panel back. Play/stop and
OP.STATUS are removed.

**B1–B4 are one layout pass, not four tickets.** They all move the same few
pixels, and doing them separately means three re-layouts. Worth a sketch the
user can look at before any of it is built.

---

## C. Accounts — and the reversal to be honest about

> "The version we got now is sort of the version of not having accounts but
> there needs to be an account system where you can see what reviews you have
> been a part of and all that."

On 2026-09-23 the decision was the opposite, and it is written into
`11-accounts-and-admin.md` §M, `docs/INSTALL.md` and the shipped UI: *no
accounts*, because "this is software people deploy for themselves, and
accounts are machinery that makes sharing worse". The knock gate, the shared
passwords and the self-asserted names all follow from that.

The new requirement is narrower than "accounts" usually means: **a person
wants to see the reviews they have been part of.** That needs durable
identity, but not necessarily sign-up, passwords, or an identity provider.
Worth putting three options in front of the user before building anything:

1. **A name you keep.** The browser already holds an identity; make it
   deliberate and portable (a recovery link or code) rather than a
   sessionStorage id. No server-side account, and "my reviews" becomes a list
   the deployment keeps against that id.
2. **Real accounts on the deployment.** Email and password, or a magic link.
   Answers "who edited this" properly, and is the thing the user rejected a
   week ago for good reasons that have not changed.
3. **Borrow identity from where the team already is.** SSO / the PLM system /
   Teams. Fits the "complement, don't replace" principle below better than
   either of the others, and costs the most to build.

Nothing here should be started until that choice is made. What was built under
§M is not wasted either way: a front door, a room door and an audit line are
orthogonal to identity.

### The principle the user attached to this, which outranks the feature
> "I want to be careful with this app, I want it to be a very good
> COMPLEMENT, I don't wanna bring people to this app just bc, I want that what
> you can do here is truly complementing the workflow and not changing it."

Worth applying as a test to every item above: does it help the review that
was going to happen anyway, or does it ask the team to move into this tool?
An account system is exactly the kind of feature that quietly asks for the
second, which is why C1–C3 are a decision and not a ticket.

---

## D. Already queued, carried over

Unchanged and still waiting — see `EXECUTION-LOG.md` for the detail:

- **Fully programmable agents** (`10-review-workflow.md` §K) — roadmap,
  nothing decided. The user's words: "I want it to be fully programmable".
- **A spend ceiling for capture.** Per-IP throttling exists in the self-hosted
  stack; there is no limit at all on Vercel and no cap on total spend.
- **`viewpoint.config.ts` on Vercel** — git-ignored and untraceable by the
  bundler, so a git deploy falls back to defaults.
- **TURN relay path unverified**; direct calls are verified.
- **capture-service has no CORS policy**; fine behind compose, not beyond it.
- **No speaker diarization** — one honest `speaker-1` rather than invented
  turns.
- **Type debt**: 99 lint warnings, 0 errors.
- **CI runs actions on the deprecated Node 20 runtime** (warning only).
- **T0.1**: branded `.glb` models swap to a cube at release.

---

## Sequencing

| Batch | Work | Size | Blocked on |
|---|---|---|---|
| AO | A1 free-view orbit target (reproduce, then fix) | small | — |
| AP | A2 follow/disengage model, incl. the leader's follower list | medium | a decision on the 2 s snap-back feel |
| AQ | A3 split-view defaults · A4 remove top-down + heatmap | small | — |
| AR | B1–B4 as one layout pass | medium | a sketch the user approves |
| AS | C identity | large | **the user choosing C1, C2 or C3** |

A and B are independent of each other and of C. The camera work (AO, AP) is
the one the user described as affecting how the app *feels*, so it goes first
unless they say otherwise.

Open questions for the user are the ones marked **blocked on** above; they are
repeated in `NEXT-STEPS.md` so they are not buried here.
