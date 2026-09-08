You are executing tickets T5.1 and T5.2 from docs/plan/08-task-breakdown.md.
This is THE ticket that makes "an organisation can install this" true, so the
install flow must actually work, not merely exist.

Read first — these are the specification:
- `docs/plan/06-deployment-and-installation.md` — especially §2 (self-hosted /
  air-gapped) and the `install.sh` responsibilities list. Follow it.
- `docs/local-capture-plan.md` §"Installation" — the service list.
- `docs/plan/05-observability-and-metrics.md` §1 — for T5.2.
- `capture-service/README.md` — the service you are containerizing, and its
  environment variables. It currently has NO auth and NO CORS; the README says
  to bind it to a private network. T5.1 is where that gets settled.

Everything through Phase 4 is DONE: the config layer (`lib/config/`), the
adapters (`lib/connectors/{plm,notify,turn,modelImport,capture}/`), and
`capture-service/` (Python, 419 pytest tests). 429 JS tests pass. Do not break
any of them.

## T5.1 — docker-compose.yml + install.sh
Services per `06-deployment-and-installation.md` §2: `app` (nginx serving the
Vite build), `partykit`, `capture-service`, `whisper`, `ollama`, `postgres`,
optional `n8n` behind a compose profile, and `nginx-proxy` for TLS.

`install.sh` must:
1. Detect the OS and abort cleanly on native Windows with WSL guidance.
2. Check for Docker and Compose, and say exactly what to install if missing.
3. Prompt interactively and write BOTH files:
   - `.env` — secrets only.
   - `viewpoint.config.ts` — the master config.
   Prompts: which PLM (Onshape / Teamcenter / none-manual-upload), which
   capture backend (mock / local / openai / anthropic / ollamaDirect), cloud or
   self-hosted database, which notification sinks. Each answer must write the
   right `provider` value AND the matching `*Env` names, and collect the secret
   values into `.env`.
4. Be re-runnable: never silently overwrite an existing `.env` or
   `viewpoint.config.ts` — back up or confirm first.
5. Be non-interactive-capable (`--defaults` or similar) so CI can exercise it.

**Security, and this is not optional**: `capture-service` accepts meeting audio
and currently has no auth. Do NOT expose it to the host or the internet by
default. Put it on an internal compose network reachable only by the proxy and
the app, generate a shared secret in `.env` at install time, and require it on
the service. Say plainly in the compose file and README why.

## T5.2 — /api/health
- Add `healthCheck()` to each adapter interface and implement it for every
  adapter, per `05-observability-and-metrics.md` §1.
- New `api/health.ts` aggregating them.
- It must NEVER leak a credential, an env var name, an upstream error body, or
  an internal hostname. Report per-connector status only. Test that.
- A failing connector must not fail the whole endpoint — report it as degraded.

## Tests — required
- Shell-check or lint `install.sh`, and run it in `--defaults` mode in a temp
  directory, asserting it writes a `viewpoint.config.ts` that PASSES the zod
  schema in `lib/config/schema.ts`, and a matching `.env`. An installer that
  writes a config the app then rejects is the exact failure this must prevent.
- Validate `docker-compose.yml` parses (`docker compose config` if Docker is
  available; otherwise a YAML parse plus explicit assertions on the service
  list, the internal network, and that capture-service publishes no host port).
- `/api/health`: aggregation, a degraded connector, and the no-leak assertions.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
- Do NOT modify anything under `docs/`.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, `.prettierrc`, or `scripts/check-public-env.mjs`.
- The `KNOWN` map in `scripts/check-public-env.mjs` is EMPTY and must stay so.
- Do NOT change existing adapter behaviour; adding `healthCheck()` is additive.
- Never write a real credential. Generated secrets must be random at install
  time, never a hardcoded default.
- No `> NUL` redirects.
- At the end run: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`, and the capture-service pytest suite
  (`capture-service/.venv` already exists). Report all six.

## Final output
1. Files created/modified, one line each.
2. The compose service list, which ports are published to the host, and why
   capture-service is not among them.
3. The exact install.sh prompt flow, and a sample generated
   `viewpoint.config.ts`.
4. Proof the generated config passes the zod schema.
5. How many tests you added and what each asserts.
6. The exact results of all six commands.
7. Anything you deliberately did NOT do, and why.
