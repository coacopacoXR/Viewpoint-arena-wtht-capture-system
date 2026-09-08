You are executing tickets T2.3 and T2.4 from docs/plan/08-task-breakdown.md.
Read first — these are the specification:
- `docs/plan/01-architecture-and-master-config.md`
- `docs/plan/03-security-and-secrets.md`
- the T2.3 / T2.4 entries in `docs/plan/08-task-breakdown.md`

T2.1 and T2.2 are DONE and committed: `lib/config/schema.ts` (zod schema,
`defineConfig`) and `lib/config/loadConfig.ts` (server-only, fail-fast env
validation) exist, with 24 passing tests in `lib/config/__tests__/`. Read them
before writing anything. Build on them; do not rewrite them.

Note one subtlety already settled, do not "fix" it: `*Env` fields reject
`VITE_`-prefixed names EXCEPT `db.urlEnv` and `db.anonKeyEnv`, which use
`publicEnvVarName` because the browser must read them and the Supabase anon
key is client-safe by design (Row Level Security). That asymmetry is
deliberate and is pinned by tests.

Execute BOTH tickets.

## T2.3 — Public config endpoint
- New: `api/public-config.ts` — a Vercel serverless function returning ONLY
  the non-secret parts of the resolved config, so the client can learn which
  providers are active without learning anything sensitive.
- New: `lib/config/publicConfig.ts` — a client-side fetch-and-cache wrapper.
  Cache the result; do not refetch on every call. Handle fetch failure
  gracefully with a clear error, not a silent empty object.
- **Redaction is the whole point of this ticket.** The response must contain
  no `*Env` field names and no resolved secret VALUES. Implement redaction as
  an explicit ALLOWLIST of fields to expose (e.g. each connector's `provider`,
  and genuinely public things like baseUrl), NOT a denylist of fields to strip
  — a denylist silently leaks any field added later.
  The `db.urlEnv`/`db.anonKeyEnv` exception above is about the SCHEMA, not
  this endpoint: still do not emit `*Env` NAMES here.
- **Required tests**: assert the redaction. Build a config where every
  connector has secret-referencing fields, run it through the redactor, and
  assert the output JSON has no key matching `/Env$/`, and that no value from
  the input's env-name fields appears anywhere in the serialized output.
  Also assert a NEW secret-bearing field added to the schema would not leak —
  i.e. prove the allowlist behaviour, not just the current shape.

## T2.4 — .env.example regeneration
- Rewrite `.env.example` to match the T2.1 schema: every env var the example
  config references, grouped by connector, each with a comment saying what it
  is and whether it is server-only or public.
- Make the VITE_ rule explicit in the file: a prominent comment stating that
  VITE_-prefixed vars are inlined into the client bundle and must never hold a
  secret, and that `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are the
  documented exceptions.
- Never write a real credential — use obvious placeholders.
- Update the README's env section to point at the master config
  (`viewpoint.config.ts`) as the primary interface, with raw env vars as the
  credential store behind it. Keep the edit tight; do not rewrite the README.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
- Do NOT modify anything under `docs/`.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, `.prettierrc`, or `scripts/check-public-env.mjs`.
- Do NOT add anything to the KNOWN baseline in `scripts/check-public-env.mjs`.
- Do NOT refactor existing application code to consume the config — Phase 3.
- `types/three-augment.ts` must keep its `.ts` extension.
- Do not use `> NUL` redirects that create stray files.
- At the end run ALL of: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`. All five must pass.

## Final output
1. Files created/modified, one line each.
2. The exact JSON the public endpoint returns for the example config.
3. How many tests you added and what each asserts.
4. The exact results of all five commands.
5. Anything you deliberately did NOT do, and why.
