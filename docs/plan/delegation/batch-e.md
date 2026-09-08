You are executing tickets T2.1 and T2.2 from docs/plan/08-task-breakdown.md.
Read these first — they are the specification, and §3 of the architecture doc
defines the exact config shape you must implement:
- `docs/plan/01-architecture-and-master-config.md`, especially §3
- `docs/plan/03-security-and-secrets.md`
- the T2.1 / T2.2 entries in `docs/plan/08-task-breakdown.md`

Phase 1 is done: `npm run lint`, `typecheck`, `test`, `test:e2e`, `check:env`
and `build` all exist and pass. Do not redo them. Vitest is configured and
working — write real tests with it.

Execute BOTH tickets. Do NOT start T2.3 or T2.4.

## T2.1 — Config schema
- New: `lib/config/schema.ts` — a zod schema covering `plm`, `capture`,
  `turn`, `db`, `notifications[]`, and `modelImport`, matching the shape in
  `01-architecture-and-master-config.md` §3. Export `defineConfig()`.
- Add `zod` as a real dependency (install it).
- Use discriminated unions on provider type, so each provider requires
  exactly its own fields and validation errors name the offending field.
- **Secrets are never values in the config.** A connector references a
  credential by ENV VAR NAME (fields ending in `Env`, e.g. `passwordEnv:
  "TC_PASSWORD"`), never by value. Enforce this in the schema: reject any
  `*Env` field whose value looks like a literal secret rather than an env var
  name (env var names are UPPER_SNAKE_CASE). Also reject `VITE_`-prefixed
  names in any `*Env` field — those get inlined into the client bundle, which
  is the exact vulnerability this architecture exists to prevent.
- **Required tests** (`lib/config/__tests__/schema.test.ts` or similar):
  valid config passes; missing required fields per provider type fail with a
  clear error naming the field; a `VITE_`-prefixed `*Env` is rejected.

## T2.2 — Config loader
- New: `lib/config/loadConfig.ts` — **server-only**. Reads
  `viewpoint.config.ts`, validates it against the T2.1 schema, then checks
  that every enabled connector's `*Env` name resolves to a non-empty
  `process.env` value. If one is missing it must throw fail-fast with a
  specific message naming the exact missing variable and the connector that
  needs it. Do not fall back to a default or warn-and-continue.
- Add a guard that makes importing this module from client code fail loudly
  rather than silently bundling it.
- New: `viewpoint.config.example.ts` at repo root — a documented, working
  example.
- Add `viewpoint.config.ts` to `.gitignore`.
- **Required tests**: the fail-fast path (missing env throws with the expected
  message, asserted on the message content, not just that it throws) and the
  happy path. Use vitest env stubbing; do NOT mutate the real process.env
  without restoring it.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
  Leave changes in the working tree for review.
- Do NOT modify anything under `docs/`.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, `.prettierrc`, or `scripts/check-public-env.mjs`.
- Do NOT add anything to the KNOWN baseline in `scripts/check-public-env.mjs`.
- `types/three-augment.ts` must keep its `.ts` extension.
- Do NOT refactor existing application code to use the new config yet — that
  is Phase 3. This ticket only adds the config layer and its tests.
- NEVER write a real credential into any file, including the example config.
- Do not use `> NUL` or `> /dev/null` redirects that create stray files.
- At the end run ALL of: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`. All five must pass.

## Final output
End with a short report:
1. Files created/modified, one line each.
2. The config shape you implemented, as a compact tree.
3. How many tests you added and exactly what each asserts.
4. The exact results of all five commands.
5. Anything you deliberately did NOT do, and why.
