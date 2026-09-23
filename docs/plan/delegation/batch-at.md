Two small infrastructure gaps. Both are well understood; implement exactly
this. Be economical: read the files named, not the whole repo. Do NOT run
`docker`, and do NOT run any `git` write command (`commit`, `add`, `push`,
`checkout`, `reset`, `stash`). Do not edit anything under `docs/`.

## Part 1 — the config file on Vercel

### The problem
The deployment's settings live in `viewpoint.config.ts` at the repo root. It
is git-ignored (each deployment writes its own), and `lib/config/loadConfig.ts`
imports it with a dynamic `import()` of a path computed at runtime. On Vercel,
a deploy from git therefore never has the file, and the bundler could not
trace it even if it did, so every endpoint that calls `loadConfig` falls back
to defaults. Operators on Vercel set configuration as environment variables in
the dashboard, so that is where the config has to be able to come from.

### The design (do not redesign)
1. A new environment variable, `VIEWPOINT_CONFIG`, holding the config as
   **JSON**. The config is pure data (every secret is referenced by the NAME of
   an env var, e.g. `clientSecretEnv: 'ONSHAPE_CLIENT_SECRET'`, never by
   value), so JSON can represent it and the variable itself is not secret.
2. `loadConfig(configPath?: string)` in `lib/config/loadConfig.ts`:
   - **Called with a path** → load that file exactly as today (tests rely on
     this; do not change their behaviour).
   - **Called with no argument** → if `process.env.VIEWPOINT_CONFIG` is set
     and non-empty, `JSON.parse` it and run the SAME `validateConfig` +
     `checkEnvVars` as the file path. Otherwise load `defaultConfigPath()` as
     today.
   - A JSON parse error must throw
     `Invalid VIEWPOINT_CONFIG: not valid JSON (<parser message>)`. It must
     NOT include the variable's value in the message.
   - If BOTH the env var is set and the file exists, the env var wins, and a
     single `console.warn` says so (once per process, not per call) naming
     both sources but not their contents.
3. Change the callers that pass `defaultConfigPath()` explicitly
   (`api/health.ts` ~31/47, `api/capture/_proxyShared.ts` ~24) to call
   `loadConfig()` with no argument, so they pick up the env var too. Grep for
   any other `loadConfig(` call in `api/` and `lib/` and make them consistent.
   `api/health.ts` reports which config source it used somewhere in its
   output — if it prints the path, make it print `env:VIEWPOINT_CONFIG` in the
   env case. Read the file to see what it shows.
4. A helper script so an operator can produce the JSON from their existing
   file: `scripts/config-to-json.mjs` — imports `viewpoint.config.ts` from the
   cwd (Node 24 can import `.ts` directly; check how
   `lib/config/__tests__/loadConfigPath.test.ts` or `package.json` scripts
   already do this), validates it with `validateConfig`, and prints
   single-line JSON to stdout. Add `"config:json": "node scripts/config-to-json.mjs"`
   to `package.json` scripts. If importing `.ts` from a `.mjs` needs a flag,
   use whatever the repo already uses for its other `.ts`-importing scripts.
5. `.env.example`: add a commented `VIEWPOINT_CONFIG=` entry with one line of
   explanation ("Vercel and other hosts without a config file: the output of
   `npm run config:json`").

### Tests (in `lib/config/__tests__/loadConfigEnv.test.ts`)
- no argument + env set → config comes from the env JSON (use a small valid
  config; copy a fixture shape from `loadConfig.test.ts`);
- no argument + env set + file missing → still works;
- explicit path + env set → the FILE wins;
- invalid JSON → the error message, and the message does not contain the raw
  value (put a recognisable marker string in the bad JSON and assert it is
  absent);
- env JSON that fails the schema → the same "Invalid viewpoint config" error
  the file path gives;
- the env JSON still goes through `checkEnvVars` (a config naming a missing
  secret env var throws).
Restore `process.env` after each test.

## Part 2 — capture-service CORS allowlist

`capture-service` (Python, FastAPI) has no CORS middleware. Browsers reach it
only through the app's own proxy today, so the absence of CORS headers is
effectively "deny all cross-origin", which is correct. What is missing is a
deliberate, documented way to allow a browser origin if an operator ever
points one at it directly.

1. Find where the FastAPI app is created (`capture-service/capture_service/`).
2. Read `CAPTURE_ALLOWED_ORIGINS` (comma-separated list of exact origins,
   e.g. `https://review.example.com,https://localhost`). Unset or empty → add
   NO CORS middleware at all (today's behaviour, unchanged). Set → add
   `CORSMiddleware` with exactly those origins, `allow_credentials=False`,
   methods `GET, POST, OPTIONS`, and headers limited to what the endpoints
   need (`Content-Type` and the shared-secret header the service already
   checks — read the code to find its name).
3. Reject `*` in the list: log an error and start WITHOUT CORS rather than
   allowing every origin. A wildcard next to a shared-secret header is the
   mistake this guard exists for.
4. Strip whitespace; ignore empty entries; an origin with a path or trailing
   slash is invalid → log and skip that entry.
5. Add the variable, commented, wherever the service's other env vars are
   documented in `capture-service/README.md` and in the root
   `docker-compose.yml`'s capture-service environment block (commented out,
   not set).

Tests in `capture-service/tests/test_cors.py`, using the existing test client
pattern in that folder:
- unset → a preflight from any origin gets no `access-control-allow-origin`;
- set to one origin → preflight from it is allowed, from another is not;
- `*` → no CORS at all;
- an entry with a path is skipped, the valid ones still work.

## What must not regress
- Every existing test in `lib/config/__tests__/` and `capture-service/tests/`.
- `scripts/check-public-env.mjs`'s `KNOWN` map stays empty.
- No `any` in new TS code, no `eslint-disable`, no `@ts-ignore`. If an
  existing test fails, fix the code, not the assertion.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npx vitest run lib/config
npm run check:env
cd capture-service && .venv/Scripts/python.exe -m pytest -q
```

## Report
- Files changed / added, one line each.
- The exact wording `api/health.ts` shows for each config source.
- Anything you deliberately did NOT do, and why.
