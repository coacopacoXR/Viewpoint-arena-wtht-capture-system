# Testing & CI

## 1. Current state

Zero. No test framework in `package.json`, no test files anywhere, no ESLint
config, no `.github/workflows`. This is greenfield — every item below is a new
addition, not a fix to something broken.

## 2. Tooling choices

| Concern | Choice | Why |
|---|---|---|
| Unit / component tests | **Vitest** + `@testing-library/react`, jsdom environment | Same engine as the existing Vite build, near-zero config overlap, fast. |
| E2E | **Playwright** | Handles the WebGL/canvas surface (React Three Fiber) better than Cypress for this kind of app; first-class TypeScript. |
| Lint | **ESLint** (`typescript-eslint` recommended + `eslint-plugin-react-hooks`) | Currently entirely absent — needed before "pristine" is a fair claim. |
| Format | **Prettier** | Pair with ESLint via `eslint-config-prettier`. |
| Secret scan | **gitleaks** | See `03-security-and-secrets.md`. |

New `package.json` scripts to add (none of these exist today):
`typecheck`, `lint`, `format`, `test`, `test:e2e`.

## 3. Test tiers

1. **Unit** — pure logic, fetch/network mocked. Priority targets, because they're
   the largest and most central files in the repo and currently have zero
   coverage:
   - `store.ts` (835 lines) — reducers/selectors/actions.
   - `components/System/DialogueEngine.tsx` (1106 lines) — **write
     characterization tests BEFORE any refactor** (see §5 below); this is the
     safety net that makes extracting `MockProvider` (task T3.6) provably
     behavior-preserving instead of a rewrite-and-hope.
   - `lib/config/schema.ts` / `loadConfig.ts` — config validation, especially
     the fail-fast-on-missing-env path.
   - Adapter helper functions (URL/payload building) across `lib/connectors/*`.

2. **Contract tests** — one shared suite per adapter interface
   (`PLMAdapter`, `CaptureProvider`, `TurnAdapter`, `NotificationSinkAdapter`,
   `ModelImportAdapter`), written once against the interface, run against
   every implementation:
   - `Mock`/local implementations run in every CI build — no secrets needed.
   - Real implementations (Onshape, Teamcenter, Cloudflare, live Teams
     webhook) run in a separate, optional CI job gated on sandbox credentials
     being present as GitHub Actions secrets — nightly or manual-dispatch, not
     on every PR, so a fork/external contributor's PR still gets full mock
     coverage without needing our secrets.
   - This is also the artifact a corp uses to self-certify a custom adapter
     (e.g. a Windchill `PLMAdapter`) — document how to run it against their
     implementation in each adapter's `docs/adapters/*.md`.

3. **Integration** — PartyKit room server message handling, using PartyKit's
   local dev server + `partysocket` client in the test process. Covers
   presence sync, and (once built) the `CAPTURE_AUDIO`/`INSIGHT_CARD` relay
   messages from `local-capture-plan.md`.

4. **E2E** — Playwright, run against `vite preview` with every adapter on its
   `Mock`/default implementation (no external accounts needed in CI). Golden
   path to cover first:
   - Lobby → create room → room loads.
   - Import a model (mock/generic upload path, not live Onshape in CI).
   - Run a review session, confirm the transcript panel and at least one
     insight card appear (mock capture).
   - Open an insight card's Engineering Record, change status, confirm it
     persists (Supabase — use a disposable test project or a local
     Supabase-compatible container, not the real hosted project).

## 4. Coverage targets

Pragmatic, not dogmatic:
- `lib/` and `api/`: **70% line coverage**, enforced in CI.
- `components/Scene/*` (3D/visual): no line-coverage target — better served by
  the E2E smoke test above plus manual QA before releases. Chasing coverage
  numbers on Three.js render code produces brittle tests for little safety.
- `store.ts` and `DialogueEngine.tsx` specifically: hold to the higher bar
  above *and* flag as refactor candidates — a single 800–1100 line file is
  hard to test well regardless of coverage percentage. Splitting them (by
  domain slice for the store; by template-engine vs. UI-wiring for
  DialogueEngine) is listed as its own task in the breakdown, not bundled
  invisibly into "add tests."

## 5. Characterization testing for `DialogueEngine.tsx`

Before T3.6 (extracting `MockProvider`) touches this file: write tests that
feed it a fixed set of `(agent, part-being-inspected, agenda context)` inputs
and snapshot the resulting dialogue/insight output *as it exists today*. These
tests aren't about correctness — the simulated dialogue has no "correct"
answer — they exist purely so the refactor can prove "output unchanged" before
"and now it's also swappable for a real provider."

## 6. CI pipeline (GitHub Actions, `.github/workflows/ci.yml`)

Order, each a required check on PRs to `main`:

```
typecheck  →  lint  →  unit + contract(mock) tests  →  build  →  e2e  →  gitleaks  →  npm audit
```

Separate, non-blocking workflow: `nightly-live-adapters.yml` — runs the
contract suites against real Onshape/Teamcenter/Cloudflare/Teams sandbox
credentials (from repo secrets), alerts on failure but doesn't block PRs.
