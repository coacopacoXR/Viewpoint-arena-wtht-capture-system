You are executing ticket T4.4 from docs/plan/08-task-breakdown.md:
LocalCaptureProvider (frontend). Record a meeting's audio in the browser, send
it to the self-hosted capture-service at the end, and show the returned insight
cards. Batch only; no live transcript (that is T4.7, do not start it).

Be economical: everything you need is listed below. Read these files, not the
whole repo.

## Read first
- `capture-service/capture_service/main.py` lines 1-40 and the `POST /capture`
  route: multipart form, field `audio` (file) plus optional form fields
  `agendaIdx`, `slideTitle`, `hoveredPartName`, `laserTargetPartName`.
  Success body is exactly `{ "cards": [...] }`. Error bodies carry a `code`.
- `lib/connectors/capture/types.ts` — `CaptureProvider`, `SlideContext`,
  `TranscriptCaptureProvider`.
- `lib/connectors/capture/openai.ts` — the shape to copy for a browser client
  that talks to a same-origin proxy (fetchFn injection, error handling).
- `lib/connectors/capture/parseInsightCards.ts` — `validateExtractionPayload`.
- `api/capture/extract.ts` — the shape to copy for the Vercel proxy (config
  loading via `loadConfig`, content-free error codes).
- `lib/health/probes.ts` — `CAPTURE_AUTH_HEADER`, `CAPTURE_SHARED_SECRET_ENV`.
- `lib/connectors/capture/capture.contract.test.ts` — the contract suite.
- `deploy/nginx/app.conf`, `deploy/app.Dockerfile`, the `app` and
  `capture-service` services in `docker-compose.yml`.
- `lib/WebRTCContext.tsx` (`useWebRTCContext()` gives `localStream` and
  `remoteStreams: Map<string, MediaStream>`), `lib/config/ConfigContext.tsx`
  (`useConnectorConfig().capture` is the provider name), `store.ts`
  (`addInsightCard`), `components/UI/ManagerPanel.tsx`.

## Architecture (decided, do not redesign)

The browser NEVER holds the capture secret and never calls capture-service
directly. It posts to the same-origin URL `POST /api/capture/local`, and one of
two server-side paths adds the `X-Capture-Token` header:

1. **Self-hosted (docker compose)** — nginx in the `app` container proxies
   `/api/capture/local` to capture-service. This is the main path, because the
   self-hosted stack has no API runtime (see the `/api/` 501 block).
2. **Vercel** — `api/capture/local.ts` does the same forwarding.

## 1. Types — `lib/connectors/capture/types.ts`
- Add a third optional capability to `CaptureProvider`:
  `captureRecording?(audio: Blob, context: SlideContext, options?: { signal?: AbortSignal }): Promise<InsightCard[]>`
  with a doc comment in the style of the others (audio in, cards out; the
  provider holds no credential; `[]` when nothing was worth capturing).
- Add `export type RecordingCaptureProvider = Required<Pick<CaptureProvider, 'captureRecording'>>;`
- Fix the existing comment that says LocalCaptureProvider will satisfy
  `TranscriptCaptureProvider`. It will not: capture-service takes audio, not a
  transcript. Update the three-flavour explanation accordingly.
- Additive only. No existing provider changes behaviour.

## 2. Browser client — `lib/connectors/capture/local.ts`
- `export class LocalCaptureProvider` implementing `captureRecording` only.
  Constructor options: `{ endpoint?: string (default '/api/capture/local'), fetchFn?: typeof fetch }`.
- Builds `FormData`: `audio` (filename `meeting.webm` or matching the Blob
  type), `agendaIdx`, `slideTitle`, and the two part names only when defined.
- 2xx: parse JSON, return `validateExtractionPayload(json)`.
- Non-2xx: throw an Error whose message includes the HTTP status and the
  upstream `code` ONLY if it matches `/^[a-z_]{1,64}$/`. Never include any other
  response text. Network failure and abort: descriptive Error, no body text.
- No `healthCheck` here: `/api/health` already probes capture-service
  server-side (`probeCaptureService`). Say so in a comment.

## 3. Vercel proxy — `api/capture/local.ts`
- `POST` only (405 otherwise, with `Allow: POST`). Disable the body parser so
  the multipart body streams through untouched
  (`export const config = { api: { bodyParser: false } }`).
- Read `capture.serviceUrl` via `loadConfig` exactly as extract.ts reads its
  config. Not configured or provider is not `'local'` → 503 `{ error: 'not_configured' }`.
- Forward to `<serviceUrl origin>/capture` with the original `Content-Type`
  header, and `X-Capture-Token` from `process.env[CAPTURE_SHARED_SECRET_ENV]`
  when set. Use a generous timeout (15 minutes) via AbortController.
- 2xx: return the upstream JSON body as is. Otherwise return the upstream
  status (or 502 if unreachable) with `{ error: <code> }`, where code is the
  upstream `code` if it matches `/^[a-z_]{1,64}$/`, else `upstream_error`.
- SECURITY, same rules as extract.ts: no response may contain the secret, its
  env var name, the serviceUrl, or any upstream text other than the validated code.

## 4. Self-hosted nginx
- Add `location = /api/capture/local` ABOVE the `location /api/` block in
  `deploy/nginx/app.conf`:
  - POST only (`limit_except POST { deny all; }`).
  - `resolver 127.0.0.11 valid=30s;` and `set $capture_upstream http://capture-service:8080;`
    then `proxy_pass $capture_upstream/capture;` — resolving at request time
    means nginx still starts when the capture profile is not running.
    Confirm port 8080 and the service name against docker-compose.yml.
  - `proxy_set_header X-Capture-Token "${CAPTURE_SHARED_SECRET}";`
  - `client_max_body_size` large enough for the service's default max upload
    (find it in capture-service config.py), `proxy_request_buffering off;`,
    `proxy_read_timeout 900s; proxy_send_timeout 900s;`.
- Turn the file into an nginx template so the secret is substituted at
  container start, not baked into the image: in `deploy/app.Dockerfile` copy it
  to `/etc/nginx/templates/default.conf.template` instead of conf.d, and set
  `ENV NGINX_ENVSUBST_FILTER=^CAPTURE_` so ONLY `CAPTURE_*` variables are
  substituted (nginx's own `$uri`, `$host` etc. must survive). Remove the
  default conf.d file if the base image would otherwise also serve it.
- In docker-compose.yml, pass `CAPTURE_SHARED_SECRET: ${CAPTURE_SHARED_SECRET:-}`
  to the `app` service's environment. Do not add ports anywhere.
- An empty secret must still produce a valid config (the service treats an
  empty secret as auth disabled).

## 5. Recording hook — `lib/useMeetingRecorder.ts`
- `useMeetingRecorder({ localStream, remoteStreams })` returns
  `{ state: 'idle' | 'recording' | 'unsupported', start(): void, stop(): Promise<Blob> }`.
- Mixes the local stream's audio and every remote stream's audio into one track
  with a single `AudioContext` + `createMediaStreamDestination()`. Remote
  streams that appear while recording are connected too. Video tracks ignored.
- `MediaRecorder` with the first supported of `audio/webm;codecs=opus`,
  `audio/webm`, `audio/ogg;codecs=opus`, else the browser default.
  `'unsupported'` when `MediaRecorder` or `AudioContext` is missing.
- Cleans up on stop and on unmount: stop the recorder, disconnect nodes, close
  the AudioContext. Never stops the WebRTC tracks themselves.
- Keep the mixing and mime selection in small pure helpers so they are testable.

## 6. UI — `components/UI/ManagerPanel.tsx`
- Add a small "Post-meeting summary" section, rendered ONLY when
  `useConnectorConfig().capture === 'local'`. With any other provider the panel
  must render exactly as today.
- Controls: "Start recording" → a clearly visible red "Recording" indicator with
  elapsed time and a "Stop & summarise" button → "Summarising…" while uploading
  → "N insights added" or the error message, with a retry that re-uploads the
  same Blob (do not discard the recording on failure).
- Never start recording automatically.
- Build the SlideContext from existing store state if the active agenda item /
  slide title is readily available there; otherwise `agendaIdx: 0` and the
  review/meeting title. Do not add new store fields for this.
- Returned cards go into the store with `addInsightCard`, so they appear in the
  existing Actions tab. Match the panel's existing styling; no new UI library.

## Tests (vitest) — required
- `local.ts`: form fields sent (including omission of undefined part names),
  validated cards returned, malformed envelope rejected, error message contains
  status + a valid code but NOT arbitrary body text, network failure.
- Contract suite: extend `capture.contract.test.ts` so it recognises the
  recording flavour and runs LocalCaptureProvider (with a fake fetch) through it.
- `api/capture/local.ts`: 405 on GET, 503 when not configured, the token header
  is forwarded when the env var is set and absent when not, the body and content
  type are forwarded, and NO response (success or any error path) contains the
  secret, the env var name, or the serviceUrl. Unreachable upstream → 502.
- Recorder helpers: mime selection and 'unsupported' detection with fakes.
- nginx template: a test that reads `deploy/nginx/app.conf` and asserts the
  capture location exists before `location /api/`, is POST-only, uses a
  variable upstream, and sets `X-Capture-Token` from `${CAPTURE_SHARED_SECRET}`;
  and that no OTHER `${...}` placeholder appears in the file.
- MUTATION CHECK: before finishing, temporarily remove the secret-scrubbing in
  the proxy's error path, confirm a test fails, then restore it. Report which
  test caught it.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
- Do NOT modify anything under `docs/`.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, `.prettierrc`, or `scripts/check-public-env.mjs`.
- The `KNOWN` map in `scripts/check-public-env.mjs` is EMPTY and must stay so.
  No new `VITE_` variable: the secret must never reach the browser bundle.
- No `any`, no `eslint-disable`, no `@ts-ignore`. If a snapshot changes, fix the
  code, do not update the snapshot.
- Do NOT change capture-service (Python). Do NOT touch the mock provider or
  DialogueEngine.
- No `> NUL` redirects.
- At the end run: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`. Then grep `dist/` for
  `CAPTURE_SHARED_SECRET` and `X-Capture-Token` and report the result (neither
  should appear, except the header name is acceptable if and only if it is in
  no browser code path — explain any hit).

## Final output
1. Files created/modified, one line each.
2. How a recording travels from the browser to capture-service in each of the
   two deployments, and where the secret is added.
3. How many tests you added and what each asserts.
4. The mutation check result.
5. The exact results of the five commands and the dist/ grep.
6. Anything you deliberately did NOT do, and why.
