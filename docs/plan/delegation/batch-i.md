You are executing tickets T3.3 and T3.4 from docs/plan/08-task-breakdown.md.
Read first:
- `docs/plan/02-connector-adapters.md`
- `docs/plan/03-security-and-secrets.md`
- the T3.3 / T3.4 entries in `docs/plan/08-task-breakdown.md`

T3.1 and T3.2 are DONE and committed. Read them first as the pattern to
follow: `lib/connectors/plm/{types,onshape,teamcenter,mock}.ts`,
`api/teamcenter/{_lib,login,tasks,change-notices}.ts`, and the shared contract
suite `lib/connectors/plm/plm.contract.test.ts`. 74 tests pass.

Execute BOTH tickets.

## T3.3 — Notification adapters
- New `lib/connectors/notify/types.ts` (`NotificationSinkAdapter` interface),
  `lib/connectors/notify/teams.ts` (browser-safe client),
  `api/notify/teams.ts` (server-side webhook POST — the card-building logic
  RELOCATED from `lib/teamsIntegration.ts`, not rewritten),
  `lib/connectors/notify/teamcenter.ts` (uses T3.2's `api/teamcenter/*`).
- DELETE `lib/teamsIntegration.ts` and update every importer. Find them by
  searching; do not guess.
- **Security**: the webhook URL is a bearer credential — anyone holding it can
  post to the channel. It must move to server-side `process.env`
  (`TEAMS_WEBHOOK_URL`, no VITE_ prefix) and must never appear in any
  browser-reachable response or error message.
- **Because this fixes it, remove the `VITE_TEAMS_WEBHOOK_URL` entry from the
  `KNOWN` map in `scripts/check-public-env.mjs`.** That guard fails on a stale
  baseline by design. Remove ONLY that entry; leave `VITE_TURN_CREDENTIAL`.
- **Documented exception — do NOT "fix" this**: `lib/sharepointIntegration.ts`
  stays client-side, because it uses MSAL user-delegated auth (the user's own
  token, not an app secret). Add a code comment at the top of that file
  explaining why, so a future contributor does not wrongly move it
  server-side. Also create `docs/adapters/notify.md` recording the rule.
  (Creating that ONE new file under docs/ is explicitly permitted for this
  ticket; do not touch any other docs/ file.)
- **Required tests**: a `NotificationSinkAdapter` contract suite (same shared
  shape as the PLM one, parameterised by an adapter factory); a test that the
  webhook URL never appears in any browser-reachable response or thrown error,
  including failure paths.

## T3.4 — TURN adapter
- New `lib/connectors/turn/types.ts` (`TurnAdapter`),
  `lib/connectors/turn/cloudflare.ts` (light refactor of the existing
  `api/turn-credentials.ts`, reading `tokenIdEnv`/`apiTokenEnv` NAMES from the
  config layer rather than hardcoding), and a stub
  `lib/connectors/turn/selfHostedCoturn.ts` (Phase 5 implements it fully —
  make the stub throw an explicit not-implemented error naming the ticket, do
  not silently return empty).
- **Security**: `lib/useWebRTC.ts:14` currently reads `VITE_TURN_CREDENTIAL`,
  so the TURN credential ships in the client bundle today. TURN credentials
  must be minted server-side and fetched at runtime from
  `api/turn-credentials.ts`, never inlined. Fix `lib/useWebRTC.ts` to obtain
  them from the endpoint.
  **Preserve the existing ICE/TURN behaviour** — recent commits show WebRTC
  connectivity is fragile here; this is a credential-sourcing change, not a
  redesign of ICE gathering.
- **Then remove the `VITE_TURN_CREDENTIAL` entry from `KNOWN`** in
  `scripts/check-public-env.mjs` too. After this ticket that map should be
  EMPTY (keep the map and its comment, just with no entries).
- **Required tests**: `TurnAdapter` contract suite (mock); a test that no TURN
  credential value appears in anything the client bundle can hold statically.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
- Do NOT modify any docs/ file except creating `docs/adapters/notify.md`.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, or `.prettierrc`.
- Do NOT weaken `scripts/check-public-env.mjs` beyond the two KNOWN removals
  named above. Do not remove patterns, do not add allowlist entries.
- `types/three-augment.ts` must keep its `.ts` extension.
- NEVER write a real credential anywhere.
- No `> NUL` redirects.
- At the end run ALL of: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`. All five must pass.

## Final output
1. Files created / modified / DELETED, one line each.
2. Every importer of the old `lib/teamsIntegration.ts` and what you did to it.
3. Proof the KNOWN map is now empty and check:env still passes.
4. What you changed in `lib/useWebRTC.ts` and why it preserves existing ICE
   behaviour.
5. How many tests you added and what each asserts.
6. The exact results of all five commands.
7. Anything you deliberately did NOT do, and why.
