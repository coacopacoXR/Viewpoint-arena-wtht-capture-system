# Plan — rooms that last, models with revisions, one admin console, your own AI

Written 2026-09-24 from the user's notes after trying accounts mode:

> "we need to make a room system where users can actually have rooms with a 3d
> model, and it is always the same, but if there is some revision ... and they
> upload a variation of that 3d model, it shouldn't be a totally different
> room, it should have some continuity, just like it can reflect in the
> tracker."

> "if someone imports a different 3d model, perhaps it should not delete the
> last one, perhaps it can hide it or put it next? ... it might be important to
> sync those 3d models across the network so people are not looking at
> different 3d models. Perhaps the host can enable who is allowed to put up 3d
> models and who isn't."

> "some kind of manager option so you can manage whose accounts are and what
> rooms there are"

> "for the meeting capture and the meeting processing, we should be able to
> have the option to call different APIs ... the built-in qwen ... or even an
> AI that your enterprise might have implemented ... for online APIs with just
> the API key and for custom APIs, it should be an easy set up ... in the same
> view where you manage all the users, assets, team members."

## Where things stand (why this is needed)

- A model lives as **base64 inside `review_curations.asset`** (a JSON column),
  and a model shared live travels **as base64 over the room WebSocket**
  (`MODEL_CHANGE`), capped at 50 MB. Late joiners depend on a server copy of
  that message; big CAD cannot be shared at all.
- Importing **replaces** the model (`setImportedModel`).
- Anyone in a room can change the model.
- The tracker knows a model only as a free-text `model_name` on a session.
- `/admin` manages reviews, label fields and the access log. No people, no
  AI settings. The API container has **no privileged database access**.
- AI capture is chosen in `viewpoint.config.ts` (mock / local / openai /
  anthropic / ollama), a file an operator edits, not a screen.

## The model we are moving to

**Room** — lasting, with one stable link. It is what a review curation is
today, promoted: title, owner, members, its model, its revisions, its
meetings, its tracker items. Existing curations become rooms (same id, so
every existing link keeps working).

**Model and revisions** — a room holds one *model line* (the product under
review) with ordered **revisions** (Rev A, Rev B …). Each revision is a file
stored once and addressed by its SHA-256. Uploading a variation adds a revision
to the SAME room; it never starts a new room.

**Meeting** — each time people meet in the room is a meeting (today's
`tracker_sessions`), recorded against the revision on screen.

**Tracker continuity** — every tracker item records the room and the revision
it was raised on. The tracker can then say "raised on Rev A · still open on Rev
C", filter by room, and show a room's history across revisions.

**Other models in the scene** — importing a *different* model (a mating part,
a competitor's product) adds it to the room's scene list instead of
replacing: shown next to the current one, with show/hide per model. Uploading
a *revision* shows the new revision and hides the previous one, with a
**Compare** toggle to put two revisions side by side.

**Sync** — the room server holds "what is on screen" (revision ids + which are
visible + transforms) as room state. Clients fetch the file by hash from
storage, so everyone renders byte-identical geometry, late joiners included,
and there is no size cap from the socket.

**Who may change models** — a room setting: *host only* (default), *named
people*, or *everyone*. Enforced by the room server, not only by hiding a
button.

## File storage (new connector: `modelStorage`)

| provider | where | for |
|---|---|---|
| `local` (default self-hosted) | a volume on the api container, served by nginx | the Docker install |
| `supabase` | a Supabase Storage bucket | Vercel / hosted Supabase |

Upload goes through the api (checks size, type, permission, computes the
hash); download is a plain URL by hash, cacheable forever.

## One admin console (`/admin`)

Sections: **People** · **Rooms** · **Models** · **AI** · **Labels** ·
**Activity** (the last two exist).

- **Who is an admin:** with accounts/SSO, accounts with the `admin` role
  (the first account created on an install is made admin; admins can promote
  others). With no accounts, today's admin passphrase.
- **People:** list accounts, create/invite, disable, delete, make admin
  (GoTrue admin API, called by the api with a service-role token it signs with
  `JWT_SECRET` — the browser never holds it).
- **Rooms:** every room, owner, members, revisions, last meeting; archive,
  delete, transfer owner, set who may change models.
- **Models:** revisions per room, file size, storage used; delete a revision.

## AI, set up from the screen (`/admin` → AI)

Three jobs, each with its own provider, because a company may transcribe
locally and summarise in the cloud, or the reverse:
**Transcription** (speech → text) · **Cards** (transcript → risks, actions,
rationale) · **Summary** (meeting → minutes).

Providers per job:
- **Built-in** — the bundled Whisper and Qwen on this server (today's local
  capture). The default.
- **OpenAI**, **Anthropic**, **Azure OpenAI**, **Google Gemini** — pick the
  provider, paste the API key, pick a model from a short list.
- **OpenAI-compatible endpoint** — base URL + key + model name. Covers most
  enterprise gateways and self-hosted servers (vLLM, LM Studio, LiteLLM,
  Mistral, Groq, Together, Azure AI Foundry).
- **Your own service** — a URL (+ optional header) that receives our JSON
  (transcript + context) and returns cards in our JSON shape. The contract is
  documented with an example, so an enterprise team can wrap whatever AI it
  already runs.

Every provider has **Test connection**. Keys are stored server-side only,
encrypted at rest with a key the installer generates
(`SETTINGS_ENCRYPTION_KEY`), and are never sent back to the browser (the
screen shows "key set · ends in …7f2a"). Settings made here override
`viewpoint.config.ts`, which stays valid for people who manage config as code.

## Added 2026-09-24 (afternoon), from the user

- **Bug: the Import 3D Model button disappears after importing.** Not
  reproduced yet on the install: a STEP assembly and a 27-part GLB were
  imported by a signed-in host, then parts pointed at and the tree scrolled,
  and the button stayed visible and in place each time. Waiting on the exact
  path (host or guest, which page, window size).
- **Hand-made cards.** "It should be possible for users to add decision cards
  themselves in case they do not want to use AI." The tracker page already
  has Add item after a meeting; the gap is DURING the meeting. A "+ Card"
  action in the room's Capture panel: type (risk / action / rationale),
  title, description, priority, optionally anchored to the part currently
  selected or pointed at. It is broadcast and saved exactly like an AI card,
  marked "added by <name>" rather than by an agent, and editable afterwards.
  Batch **BG**, small.
- **How things are organised.** The user asked what a design review is, what
  a room is, and whether the 3D models or the decision cards are the thing.
  Proposed answer, recorded with the user's naming decision still open:
  - **Design review** is the lasting thing, one per product question. It
    holds what is reviewed (a model line and its revisions), who takes part,
    and the plan (agenda, viewpoints, pins, requirements). It has one link.
  - **Meeting** is one dated occurrence inside a design review. It records
    who attended, which revision was on screen, the transcript, the summary,
    and the cards raised.
  - **Cards** (risks, actions, rationale) belong to the design review. Each
    is raised in a meeting, by AI or by hand, on a revision and optionally a
    part. It stays open across meetings and revisions until it is closed.
  - **The tracker** is every card from every design review, filterable.
  - **Room** is not a separate object: it is the live 3D space where a
    design review's meeting happens (the "Open room" button).
  BC implements this model. Plan wording above uses "room" for the lasting
  thing; if the user confirms "design review" as the name, the screens use
  that and "room" is kept only for the live space.

## Preparing a review inside its room (proposed 2026-09-24, awaiting the user's go)

The user: "we should merge the curate room and the room itself ... and think
through who can do what and how the functionality of curating is presented to
the user in the actual room." Naming confirmed: **Design review** for the
lasting thing; "room" only for the live 3D space.

Proposal, sketched in the "Review in the Room" artifact
(https://claude.ai/artifact/L6BG3WhXjayhRLguSR6Cb1):
- **Four roles per design review**: Owner (creator, and admins), Editor,
  Participant, Guest.
  - Everyone can meet, point and comment.
  - Everyone except guests can add and edit cards.
  - Owners and editors run meetings and edit the review.
  - Only owners manage people or delete the review.
  - Without accounts: the meeting host has the editor's powers, and the admin
    passphrase is the owner.
- **Edit review switch in the room**, for owners and editors:
  - The side panel swaps to the Curate page's tabs (Agenda · Views · Pins ·
    Requirements · Labels · People).
  - An amber editing strip with move, rotate and scale and a Done button.
  - "+ Revision" in the model tree, and "Save this view".
  - Capture pauses while editing.
- "Curate a design review" becomes **New design review**, which opens the room
  with Edit on. The old `/review/:id/setup` address redirects there.
- Others see "Paco is editing the review", not the tools.

Batch **BH**, after BC (it needs membership and roles from BC).

## Batches, in order

| Batch | Work |
|---|---|
| BA | `modelStorage` connector + upload/download API + hashing; models no longer in base64 JSON or the socket; room state holds the on-screen revisions; migration of existing base64 models into storage. |
| BB | Scene with several models (show/hide, placement next to), revisions (Rev A/B, Compare), who-may-change-models enforced by the room server. |
| BC | Rooms as the lasting unit (schema: rooms, model_revisions, meetings), existing curations migrated; tracker items carry room + revision; tracker shows continuity. |
| BD | Admin foundation: service-role access for the api, admin role, first-account-is-admin; People section. |
| BE | Rooms and Models sections. |
| BF | Settings store (encrypted), AI section, provider routing for the three jobs, Test connection, OpenAI-compatible and your-own-service contracts. |
| BG | Hand-made cards in the room's Capture panel. |
| BH | Curation inside the room: roles, Edit review switch, New design review. |

Each lands verified on the running install, as before.
