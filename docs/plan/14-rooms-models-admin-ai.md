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

## Batches, in order

| Batch | Work |
|---|---|
| BA | `modelStorage` connector + upload/download API + hashing; models no longer in base64 JSON or the socket; room state holds the on-screen revisions; migration of existing base64 models into storage. |
| BB | Scene with several models (show/hide, placement next to), revisions (Rev A/B, Compare), who-may-change-models enforced by the room server. |
| BC | Rooms as the lasting unit (schema: rooms, model_revisions, meetings), existing curations migrated; tracker items carry room + revision; tracker shows continuity. |
| BD | Admin foundation: service-role access for the api, admin role, first-account-is-admin; People section. |
| BE | Rooms and Models sections. |
| BF | Settings store (encrypted), AI section, provider routing for the three jobs, Test connection, OpenAI-compatible and your-own-service contracts. |

Each lands verified on the running install, as before.
