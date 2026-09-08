You are executing tickets T4.5 and T4.6 from docs/plan/08-task-breakdown.md.
Read first:
- `docs/plan/02-connector-adapters.md` §2 (CaptureProvider, and the rule that
  API keys are NEVER used directly from the browser)
- `docs/local-capture-plan.md` (the LLM extraction pipeline and the
  InsightCard shape it produces)
- the T4.5 / T4.6 entries in `docs/plan/08-task-breakdown.md`

T3.6 is DONE: `lib/connectors/capture/types.ts` defines `CaptureProvider` and
`lib/connectors/capture/mock.ts` implements it, with a shared contract suite in
`capture.contract.test.ts`. READ ALL THREE before writing anything. 182 tests
pass; do not break any.

## A judgement call you must make and report
The existing `CaptureProvider` interface was extracted from the SIMULATED
engine, which invents dialogue from the scene tree. Real providers instead turn
a TRANSCRIPT into insight cards. If the current interface cannot express both,
EXTEND it rather than distorting either side — for example an optional
transcript-driven method alongside the existing simulation-driven one, with the
mock continuing to satisfy the interface unchanged. Do NOT change the mock's
behaviour: `components/System/__tests__/dialogueEngine.characterization.test.ts`
pins its output with 61 snapshots and they must all still pass byte-identical.
Report exactly what you changed in the interface and why.

## T4.5 — OpenAI and Anthropic providers
- New `api/capture/extract.ts` — a Vercel serverless function that takes a
  transcript and returns `InsightCard[]`. The API key is read from server-side
  `process.env` ONLY (names come from the config's `capture.apiKeyEnv`,
  defaulting to `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`). The browser must never
  see a key.
- New `lib/connectors/capture/openai.ts` and
  `lib/connectors/capture/anthropic.ts` — browser-safe clients that POST the
  transcript to that endpoint. No API key in any argument or return value.
- Structured output: instruct the model to return JSON matching the existing
  `InsightCard` shape in `types.ts`, and PARSE DEFENSIVELY. A model returning
  prose, truncated JSON, markdown code fences, or extra fields must produce a
  clear error, never a crash and never a half-built card. Write tests for each
  of those malformed cases.
- The endpoint must never echo the API key, the raw upstream body, or the
  transcript back in an error response.

## T4.6 — OllamaDirectProvider
- New `lib/connectors/capture/ollamaDirect.ts` — browser talks directly to an
  Ollama instance on the LAN. There is no API key here, which is the entire
  point of the mode: nothing leaves the network.
- The base URL comes from config, not a hardcoded localhost.
- Fail clearly when Ollama is unreachable — this mode is the one users will
  misconfigure most, so the error must say what to check.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
- Do NOT modify anything under `docs/`.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, `.prettierrc`, or `scripts/check-public-env.mjs`.
- The `KNOWN` map in `scripts/check-public-env.mjs` is EMPTY and MUST stay
  empty. If you find yourself wanting a `VITE_`-prefixed key name, you have
  made a mistake — the key belongs server-side.
- Do NOT wire these providers into the UI yet. Adding them + tests is this
  ticket; selection happens later.
- Do NOT touch `components/System/DialogueEngine.tsx`.
- Never write a real credential or API key anywhere, including tests.
- No `> NUL` redirects.
- At the end run ALL of: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build`. All five must pass.

## Final output
1. Files created/modified, one line each.
2. What you changed in the `CaptureProvider` interface and why, and explicit
   confirmation the 61 characterization snapshots still pass unchanged.
3. Every malformed-model-output case you handle, and the test for each.
4. How many tests you added and what each asserts.
5. The exact results of all five commands.
6. Anything you deliberately did NOT do, and why.
