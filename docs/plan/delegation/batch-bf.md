Plan 14, batch BF: choose the AI for each job from the admin console.

Read `docs/plan/14-rooms-models-admin-ai.md` ("AI, set up from the screen")
first. Batch BD (committed) gave the api privileged access: `requireAdmin`
(`api/_lib/adminAuth.ts`) and a service-role token it signs itself
(`api/_lib/serviceRole.ts`), plus the `/admin` page with a section list. This
batch is the BF row. Do NOT touch the 3D scene, `party/`, `store.ts`,
`components/Scene`, `components/UI/SceneTree.tsx` or `lib/scene` — another
batch is editing those now.

Be economical: read the files named. Do NOT run `docker` (except
`docker compose config -q`) and do NOT run any `git` write command. Do not
edit anything under `docs/` except `docs/supabase-schema.sql`. Claude tests
live, with the real built-in models and a fake OpenAI-compatible server.

## Today (verified — read these)
- Browser side: `lib/connectors/capture/` (`local.ts`, `openai.ts`,
  `anthropic.ts`, `ollamaDirect.ts`, `extractClient.ts`, `types.ts`,
  `extractionPrompt.ts`, `parseInsightCards.ts`), chosen from public config
  (`capture.provider`).
- Server side: `api/capture/extract.ts` (transcript → cards via OpenAI or
  Anthropic, strict no-leak error rules — read its header and keep them),
  `api/capture/local.ts` and `transcribe.ts` (proxy audio to capture-service
  via `_proxyShared.ts`).
- In the Docker stack, nginx (`deploy/nginx/app.conf`) sends
  `/api/capture/transcribe` and `/api/capture/local` STRAIGHT to
  capture-service, bypassing the api — so today the api cannot choose a
  provider for audio. capture-service (Python) does Whisper transcription and
  extraction via Ollama (`qwen2.5:7b`).
- Where a meeting summary is produced today, if at all: find it
  (`components/UI/MeetingSummary.tsx`, `lib/useMeetingRecorder.ts`) and
  report. If it is assembled from cards without a model, the summary job
  below is new.

## 1. Settings, stored server-side, secrets encrypted
- Table `app_settings (key text primary key, value jsonb not null,
  secret text, updated_at timestamptz, updated_by text)` in
  `docs/supabase-schema.sql`, idempotent, RLS ENABLED with NO policies — only
  the service role (which bypasses RLS) can read or write it. The anon and
  authenticated keys must get nothing (test the SQL text for that).
- The api talks to it through PostgREST with the service-role token. Server
  URL: `db.serverUrl` (new, optional) falling back to `db.probeUrl`
  (`http://rest:3000/` in the stack); document the field in the schema.
- `lib/ai/secretBox.ts`: AES-256-GCM; key = HKDF-SHA256(`JWT_SECRET`,
  info `'viewpoint-app-settings-v1'`). Stored form `v1:<iv>:<tag>:<ct>`
  (base64url). Decrypting with a different secret fails closed (test).
- `lib/ai/settingsStore.ts`: get/put by key; secrets are write-only — the
  read API returns `{ set: true, last4 }`, never the value.

## 2. The three jobs and their providers
`lib/ai/providers.ts` — one typed description per provider, used by both the
router and the admin form (fields, which jobs it can do, default models):

| provider | jobs | fields |
|---|---|---|
| `builtin` | transcription, cards, summary | none (Whisper + Qwen in this stack) |
| `openai` | transcription, cards, summary | apiKey, model |
| `anthropic` | cards, summary | apiKey, model |
| `azureOpenai` | transcription, cards, summary | endpoint, apiKey, deployment, apiVersion |
| `gemini` | cards, summary | apiKey, model |
| `openaiCompatible` | transcription, cards, summary | baseUrl, apiKey (optional), model |
| `webhook` | transcription, cards, summary | url, headerName (optional), headerValue (secret, optional) |

Model lists: a short default list per provider (current mainstream models),
plus free text. `openaiCompatible` covers vLLM, LM Studio, LiteLLM, Mistral,
Groq, Together and most enterprise gateways — say so in the form's help text.

**The webhook contract** (`lib/ai/webhookContract.ts`, plus a short
`docs/`-free markdown file `api/ai/WEBHOOK.md` with request/response examples
— this one file is allowed):
- cards: POST `{ job: 'cards', transcript: TranscriptChunk[], context:
  { slide?, components? } }` → `{ cards: [...] }` in exactly the shape
  `parseInsightCards` accepts (validate the response through it).
- summary: POST `{ job: 'summary', transcript, cards }` → `{ summary:
  string }` (markdown).
- transcription: POST multipart `audio` → `{ segments: [{ start, end, text
  }] }`.

## 3. One router on the server
`lib/ai/router.ts`: `runJob(job, input)` resolves the provider for that job
(settings from the store → else `viewpoint.config.ts` `capture` → else
`builtin`) and calls it:
- builtin transcription / cards: capture-service (`/transcribe`, and for
  cards a text endpoint — if capture-service only has audio→cards, add a
  small `/extract` endpoint there that takes a transcript and runs the
  existing prompt; Python, with tests in `capture-service/tests/`).
- builtin summary: capture-service `/summarize` (new, same pattern: Ollama
  chat with a summary prompt in `prompt.py`).
- cloud providers: server-side calls with the stored key, the existing
  extraction prompt, and `parseInsightCards` on the answer; keep every rule
  in `api/capture/extract.ts`'s security header (no key, transcript, upstream
  body or model output in any error response).
Endpoints (all behind the access gate like today):
- `POST /api/capture/transcribe` (audio chunk → segments) — now through the
  router.
- `POST /api/capture/extract` (transcript → cards) — through the router.
- `POST /api/capture/local` (whole recording → transcript → cards): router
  transcription then router cards.
- `POST /api/capture/summary` (transcript + cards → markdown) — new.
- nginx: `/api/capture/transcribe` and `/api/capture/local` now go to the api,
  not capture-service; keep their body-size limits, timeouts and the access
  subrequest. Update the deploy tests that pin the old routing.
- The browser keeps calling the same URLs; remove the client-side provider
  switch where the server now decides (the browser must not need to know
  which AI is used). Keep the `mock` provider for tests/demo.

## 4. The admin screen — AI section
In `/admin` (section list from BD), **AI**, available to admins in every
identity mode (in `none` behind the passphrase as today):
- Three cards: **Transcription**, **Cards (risks, actions, rationale)**,
  **Meeting summary**. Each: provider select (only providers that can do that
  job), the provider's fields, secrets as password inputs that show "Key set
  · ends in …7f2a" when stored (leave blank to keep), **Test connection**,
  **Save**.
- Test connection runs a tiny real request through the router with the
  unsaved values (cards: a two-line transcript → expects ≥0 parsed cards and
  no error; transcription: a 1-second silent WAV generated in code; summary:
  two lines) and reports "Works — answered in 1.4 s" or the plain reason.
- `GET/PUT /api/admin/ai` behind `requireAdmin`; `POST /api/admin/ai/test`.
- A line under each card says what is in use now and where it comes from
  ("Built-in Qwen on this server · default" / "OpenAI gpt-4o-mini · set here").

## What must not regress
- A deployment that never opens the AI section behaves exactly as today
  (builtin in the Docker stack; `capture.provider` from config otherwise).
- Live transcript during a meeting and the post-meeting recording both still
  produce cards with the built-in stack (Claude will verify live).
- No key, token or `JWT_SECRET` in the browser bundle, in any API response,
  or in logs. `scripts/check-public-env.mjs` `KNOWN` stays empty.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no new `as unknown as`.

## Tests
- secretBox round trip; wrong secret fails; tamper fails.
- settingsStore never returns a secret value.
- router: resolution order; each provider's request shape with fetch mocked
  (URL, headers, body), and error mapping without leaks; webhook responses
  validated.
- endpoints: admin-only; test-connection happy/sad; summary endpoint.
- nginx/deploy tests for the new routing.
- capture-service: `/extract` and `/summarize` with the fake LLM the tests
  already use.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
docker compose config -q && echo compose-ok
cd capture-service && .venv/Scripts/python.exe -m pytest -q
```

## Report
- Files changed / added; what the summary job was before.
- Anything you deliberately did NOT do, and why.
