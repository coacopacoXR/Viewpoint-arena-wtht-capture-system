Plan 14, batch BA: store model files properly, and sync them by reference.

Read `docs/plan/14-rooms-models-admin-ai.md` first — especially "Where things
stand", "Sync" and "File storage". This batch is the BA row only: storage and
sync of the model that is on screen. Do NOT build several-models-in-a-scene,
revisions, rooms-as-a-table, admin screens or permissions (BB–BF).

Be economical: read the files named. Do NOT run `docker` (except
`docker compose config -q` at the end) and do NOT run any `git` write command.
Do not edit anything under `docs/` except `docs/supabase-schema.sql` if you
need to. Claude tests all of this live on a running install afterwards.

## Today (verified)
- Import: `components/UI/SceneTree.tsx` parses a file (`utils/modelLoader.ts`
  `parseModelFile`) and calls `broadcastModelChange` with the file as
  **base64**; `lib/usePartyPresence.ts` sends `MODEL_CHANGE { modelType,
  fileBase64, fileName }`; receivers rebuild a `File` and parse it (~the
  `MODEL_CHANGE` handler, with a local `mimeMap`). 50 MB sharing cap in
  SceneTree.
- `party/room.server.ts` ~107 keeps `currentModel` (with the base64!) in
  memory and replays it to each new connection (~233). It is lost on a room
  server restart.
- Curated reviews keep the model as `asset.importedFileBase64` /
  `importedFileName` inside `review_curations.asset` (jsonb):
  `lib/reviewSetupStore.ts`, `pages/ReviewSetupPage.tsx`,
  `lib/activeReviewStore.ts`, `lib/curationsRepo.ts`.
- The api: Vercel-style handlers in `api/`, served in the Docker stack by
  `server/api-server.ts` through `server/vercelShim.ts`. nginx
  (`deploy/nginx/app.conf`) routes `/api/`; its `/api/` location allows 200m.

## 1. The `modelStorage` connector
- `lib/config/schema.ts`: optional `modelStorage`, default `{ provider:
  'local', dir: '/data/models' }`; or `{ provider: 'supabase', bucket:
  string, serviceRoleKeyEnv: envVarName }`. Follow how the other connectors
  are declared, redacted (`redact.ts` exposes only `provider`) and tested.
- `lib/storage/` (server-only): an interface `ModelStore { put(bytes,
  meta) → { hash, size }; get(hash) → stream | null; head(hash) }` and two
  implementations. `local` writes `<dir>/<sha256>` atomically (temp file +
  rename), idempotent (same hash → no rewrite), plus a small
  `<sha256>.json` with `{ fileName, size, contentType, uploadedAt }`.
  `supabase` uses the Storage REST API with the service-role key (server
  only) — unit-test it with a mocked fetch; it will not be run live.
- Hash = SHA-256 of the bytes, hex. It is the file's identity everywhere.

## 2. The API
- `POST /api/models` — raw body (not base64, not JSON), `X-File-Name`
  header; limit 200 MB (read the body streaming, reject over the limit
  without buffering it all first — see how `api/capture/_proxyShared.ts`
  handles its limit); extension must be one of
  `utils/modelFormats.ts`'s supported list; computes the hash, stores,
  returns `{ hash, size, fileName }`. Behind the same access gate the other
  endpoints use (`api/_lib/accessControl.ts` `requestIsUnlocked`).
- `GET /api/models/<hash>` — streams the file with `Content-Type:
  application/octet-stream`, `Cache-Control: public, max-age=31536000,
  immutable` (content-addressed), `ETag: "<hash>"`, and the original name in
  `Content-Disposition`. 404 for unknown; 400 for a malformed hash (64 hex
  chars exactly — this also stops path traversal, test it).
- Docker: a named volume `models-data` mounted at `/data/models` on the
  `api` service. nginx: `/api/models` needs `client_max_body_size 200m` and
  `proxy_request_buffering off` for uploads — add a location mirroring the
  capture one. Tests in `deploy/__tests__/` for both, in the style there.

## 3. Sync by reference
- `MODEL_CHANGE` payload becomes `{ modelType, hash?, fileName?, size? }`
  — NO bytes. `SceneTree` import: parse locally (as today, so the importer
  sees it at once), upload the ORIGINAL bytes to `/api/models`, then
  broadcast the hash. Show upload progress/failure in the existing import
  status area; the 50 MB sharing cap goes away (the 200 MB import cap stays).
- Receivers: `fetch('/api/models/<hash>')` → `File` → `parseModelFile`.
  Keep an in-memory cache by hash so switching back is instant.
- `party/room.server.ts`: `currentModel` holds the reference only, and is
  **persisted to room storage** the way admissions are (read how
  `persistAdmitted` / `onStart` do it) so a restart does not drop it; replay
  it to new connections as today. Reject (drop, log once) any `MODEL_CHANGE`
  that still carries `fileBase64`: old clients must not push megabytes
  through the room.
- Curated reviews: `asset` gets `modelHash` + `importedFileName`
  instead of `importedFileBase64`. The review setup page uploads on pick
  (same endpoint) and stores the hash. Loading a curation fetches by hash.
- **Migration of existing data:** a curation that still has
  `importedFileBase64` must keep working: when loaded, upload the base64
  bytes once, write back `modelHash`, and drop `importedFileBase64` from the
  saved row. Put that in one function (`lib/migrateCurationAsset.ts`) with
  tests, and call it from the curation load path.

## What must not regress
- The built-in models (synth, headphones, bicycle) — they are not uploaded;
  `MODEL_CHANGE` with `modelType` other than `imported` works as today.
- Importing every format that imports today, including CAD (the worker path).
- Access gate: `/api/models` refuses a locked request exactly like other
  endpoints (test).
- `scripts/check-public-env.mjs` `KNOWN` stays empty; the Supabase service
  role key is server-only.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no new `as unknown as`.

## Tests
- Local store: put/get/head, idempotency, atomic write (no partial file on
  a failed write), metadata sidecar.
- API: upload happy path; too large (streamed rejection); bad extension;
  bad hash (incl. `../`); unknown hash 404; cache headers; locked → 401/403
  the way the others respond.
- Room server: MODEL_CHANGE by reference is stored, persisted, replayed to a
  new connection after a simulated restart; a base64 MODEL_CHANGE is dropped.
- Client: receiving a hash fetches and parses once, cached on a second
  receive.
- Migration function: base64 in → upload called once → hash out; already
  migrated → no upload.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
docker compose config -q && echo compose-ok
```

## Report
- Files changed / added.
- Anything you deliberately did NOT do, and why.
