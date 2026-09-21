You are executing ticket T5.3 from docs/plan/08-task-breakdown.md: the PLM
launch-context deep link, i.e. "open a design review straight from Onshape or
Teamcenter". Every PLM adapter already implements `resolveLaunchContext()`,
but NOTHING in the app calls it. Your job is to wire it in, and to close two
security holes the deep link would otherwise widen.

Be economical: everything you need is listed below. Read these files, not the
whole repo.

## Read first
- `lib/connectors/plm/types.ts`, `onshape.ts` (resolveLaunchContext ~line 269),
  `teamcenter.ts` (~line 162), `mock.ts` (~line 81), `plm.contract.test.ts`.
- `App.tsx` (routes), `pages/LobbyPage.tsx` lines 35-120 (how a review is
  created: `crypto.randomUUID()`, identity via `useIdentity` from `lib/identity.ts`).
- `pages/ReviewSetupPage.tsx`: the ModelTab component around lines 375-530
  (`handleFile`, `showOnshapeBrowser`, `addReference`, `useConnectorConfig`).
- `components/UI/OnshapeBrowser.tsx` (steps: auth -> documents -> elements -> loading).
- `lib/onshape.ts` (`listOnshapeElements`, `importOnshapeModel`, `startOnshapeSignIn`).
- `api/onshape/auth-start.ts` and `api/onshape/callback.ts` (returnTo handling).
- `lib/config/ConfigContext.tsx` (`useConnectorConfig().plm`).

## Decisions already made (do not redesign)

1. **Route**: a new SPA route `/launch` (App.tsx). The PLM system opens
   `https://<host>/launch?plmSource=onshape&plmDoc=<id>&plmWorkspace=<id>&plmElement=<id>`.
   vercel.json and deploy/nginx/app.conf already fall back to index.html for
   unknown paths, so no server routing change is needed. Verify that and say so.
2. **No token in the URL.** The plan sketch mentions `token=<short-lived>`. Do
   NOT accept, read, store or forward any token/credential query parameter.
   Tokens in URLs leak via history, logs and the Referer header; auth is the
   PLM's existing session (Onshape: the HttpOnly OAuth cookies). If a `token`
   param is present, ignore it and strip it from the address bar
   (`history.replaceState`) before anything else happens. Add a comment
   explaining why.
3. **A launch creates a NEW review with a random id** (`crypto.randomUUID()`),
   exactly as the lobby does. `roomHint` is NOT used as a room/review id:
   deriving the room from a document id would make rooms guessable, and today
   an unguessable id is what protects a room. Keep `roomHint` in the interface
   (it is the plan's contract) but document on the interface that it is a
   human-readable label, not an access-controlled room id.
4. **Adapter selection**: only the adapter matching `useConnectorConfig().plm`
   may resolve. A link with `plmSource=teamcenter` on a deployment configured
   for Onshape is rejected with a clear message, not silently resolved. While
   config is still loading, wait; if config is unavailable, reject (fail-safe).
   Instantiate adapters the way existing code does; do not add new config fields.
5. **Identity**: if `useIdentity()` has no name, show a minimal name prompt on
   the launch page (reuse the lobby's input styling), then continue. Do not
   bounce the user to `/` and lose the launch parameters.

## 1. Input validation — `lib/connectors/plm/launchParams.ts` (new)
- `parseLaunchParams(search: string)` -> `{ source, doc: PLMDocumentRef } | { error: string }`.
- Accept only known keys: plmSource, plmDoc, plmWorkspace, plmElement.
- Validate ids BEFORE any adapter sees them: Onshape ids must match
  `/^[0-9a-f]{24}$/`; Teamcenter and mock ids `/^[A-Za-z0-9_.-]{1,128}$/`.
  Anything else -> error. Error messages must NOT echo the raw input.
- The adapters' `resolveLaunchContext` methods should apply the same id check
  (defence in depth, since a corp may call the adapter directly), returning
  null on an invalid id. Extend `plm.contract.test.ts` with a case: a
  path-traversal / URL-injection id such as `../../x`, `a?b=c`, `a/b`, `%2F` is
  never returned unmodified in `doc.id`.

## 2. Launch page — `pages/LaunchPage.tsx` (new)
- Parse params, strip token (decision 2), wait for config, pick the adapter
  (decision 4), call `resolveLaunchContext`, then
  `navigate(\`/review/${crypto.randomUUID()}/setup\`, { state: { plmLaunch: { source, doc } } , replace: true })`.
- Error states render a short message and a "Go to lobby" button. Never render
  the raw query string.

## 3. Setup page picks it up — `pages/ReviewSetupPage.tsx`
- On mount, if `location.state?.plmLaunch` is present, handle it ONCE (guard
  with a ref so StrictMode double-mount does not import twice), then clear it
  with `navigate(location.pathname, { replace: true, state: null })` so a
  reload does not re-trigger.
- Record the source document as a reference via the existing `addReference`
  (name like `Onshape document`, URL built from the validated ids only, e.g.
  `https://cad.onshape.com/documents/<doc>/w/<ws>/e/<el>`; for Teamcenter no URL
  unless one can be built from config's plm.baseUrl without new config fields).
- **Onshape with an element id**: open `OnshapeBrowser` in a new
  "launch" mode that starts on the loading step and imports that element
  directly. It needs the element's type (ASSEMBLY vs PARTSTUDIO): get it from
  `listOnshapeElements(doc, ws)`. If the element is not in the list, show the
  element picker for that document instead.
- **Onshape without an element id** (or without workspace): open
  `OnshapeBrowser` directly on the elements step for that document. If the
  workspace is missing, get the document's default workspace the same way the
  browser already does, or fall back to the documents step with an explanation.
- **Not signed in to Onshape**: the browser's existing auth step handles it;
  make sure the sign-in `returnTo` brings the user back to `/launch?...` with
  the original (validated, token-stripped) params, not to the setup page
  (whose router state would be lost across the OAuth redirect).
- **Teamcenter**: its geometry export route does not exist yet (`exportGeometry`
  throws not-implemented; see EXECUTION-LOG batch H). Do NOT fake it. Record the
  reference and show a visible note in the Model tab: geometry import from
  Teamcenter is not available yet, upload the exported file instead.
- Add the needed props to `OnshapeBrowser` (e.g. `initialDocument?`,
  `initialElementId?`). Without them it must behave exactly as today.

## 4. Security fixes
- **Open redirect** in `api/onshape/callback.ts`: `returnTo.startsWith('/')`
  accepts `//evil.com` and `/\evil.com`, which browsers treat as another host.
  Replace with a helper `safeReturnPath(v)` (put it in `api/_lib/`) that only
  accepts a path starting with a single `/`, not followed by `/` or `\`,
  containing no control characters, no `\`, and parsing (`new URL(v, 'http://x')`)
  to origin `http://x`. Otherwise `/`. Apply it in `auth-start.ts` too (validate
  on the way in, not only on the way out).
- **Unencoded ids** in `lib/onshape.ts`: `listOnshapeElements`,
  `importOnshapeModel` and the status/download calls interpolate ids into
  query strings raw. Use `encodeURIComponent` (or URLSearchParams) everywhere.
  Do not otherwise change their behaviour.

## Tests (vitest) — required
- `launchParams`: valid onshape/teamcenter/mock links; invalid ids rejected;
  unknown source rejected; `token` never appears in the result; error messages
  do not contain the raw input.
- `safeReturnPath`: `/room/abc?x=1` kept; `//evil.com`, `/\evil.com`,
  `\\evil.com`, `https://evil.com`, `javascript:alert(1)`, `/%0d%0aSet-Cookie`
  (decoded control chars) and empty -> `/`. Plus a handler-level test that the
  callback redirects to `/` for `//evil.com`.
- `LaunchPage` (testing-library): config says onshape + onshape link ->
  navigates to `/review/<uuid>/setup` with plmLaunch state; the uuid is NOT
  derived from the doc id; mismatched source -> error, no navigation; config
  unavailable -> error, no navigation; `token` stripped via replaceState.
- `lib/onshape.ts`: an id containing `&` is encoded in the request URL.
- OnshapeBrowser without the new props: existing behaviour unchanged (if an
  existing test covers it, keep it green; otherwise add one render test).
- MUTATION CHECK: revert `safeReturnPath` to `startsWith('/')`, confirm a test
  fails, restore. Then make `LaunchPage` use `roomHint` as the review id,
  confirm a test fails, restore. Report which tests caught each.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`,
  `git stash` or any other git write command.
- Do NOT modify anything under `docs/`.
- Do NOT touch these files (T4.4, just landed and reviewed; out of scope here):
  `components/UI/ManagerPanel.tsx`, anything under `lib/connectors/capture/`,
  `api/capture/`, `lib/useMeetingRecorder.ts`, `deploy/`, `docker-compose.yml`.
  If `npm run test` / `lint` / `typecheck` reports failures ONLY in those
  files, report them and do not fix them.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, `.prettierrc`, or `scripts/check-public-env.mjs`.
  The `KNOWN` map in `scripts/check-public-env.mjs` is EMPTY and must stay so.
- No new `VITE_` variables. No `any`, no `eslint-disable`, no `@ts-ignore`.
  If a snapshot changes, fix the code, do not update the snapshot.
- No `> NUL` redirects.
- At the end run: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`.

## Final output
1. Files created/modified, one line each.
2. The full path of a launch, from the PLM's URL to a model on screen, for
   Onshape (signed in and not signed in) and for Teamcenter.
3. How many tests you added and what each asserts.
4. Both mutation check results.
5. The exact results of the five commands.
6. Anything you deliberately did NOT do, and why.
