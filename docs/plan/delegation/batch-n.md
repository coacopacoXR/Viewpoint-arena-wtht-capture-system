You are executing tickets T4.1, T4.2 and T4.3 from docs/plan/08-task-breakdown.md.
Read first, and follow them rather than inventing an architecture:
- `docs/local-capture-plan.md` — especially the "Components", "faster-whisper
  server", "LLM extraction pipeline" and "Installation" sections. This is the
  primary specification.
- the T4.1 / T4.2 / T4.3 entries in `docs/plan/08-task-breakdown.md`
- `lib/connectors/capture/parseInsightCards.ts` and `extractionPrompt.ts` —
  the TypeScript side already extracts InsightCards from a transcript. The
  Python service must produce the SAME card shape. Read them and match it.
- `types.ts` for the InsightCard / InsightDetails shape.

This creates a NEW subsystem in `capture-service/`. It is Python (FastAPI, per
the ticket). The existing npm checks do not cover it, so it needs its own tests
and its own CI job.

## T4.1 — capture-service skeleton (batch mode only)
- `capture-service/` FastAPI app. Accepts a FULL meeting audio upload. No
  streaming — batch only, per the plan's "ship batch before live" guidance.
- Endpoints at minimum: `POST /capture` (audio in, InsightCard[] out) and
  `GET /health`.
- Config from environment variables, NOT a settings UI: Whisper model size,
  Ollama base URL and model, and a max upload size. Document every variable.
- `capture-service/requirements.txt` (or pyproject), and a README explaining
  how to run it locally without Docker.

## T4.2 — Whisper batch transcription
- Integrate faster-whisper in BATCH mode per the plan. Produce speaker-labelled
  transcript chunks with start/end times, matching the `TranscriptChunk` shape
  in `lib/connectors/capture/types.ts` so both sides agree.
- Whisper must be lazily loaded and swappable: the tests must run with NO model
  downloaded and NO GPU. Put it behind a small interface with a fake
  implementation for tests.

## T4.3 — LLM extraction
- Ollama client, the extraction prompt, and structured-output parsing into the
  InsightCard shape.
- Parse DEFENSIVELY, mirroring the TypeScript parser's behaviour: reject prose,
  truncated JSON, wrong envelope, unknown fields, bad enum values; a batch is
  all-or-nothing so a half-built card never escapes. Unwrap a closed markdown
  fence but reject one that is never closed — match
  `lib/connectors/capture/parseInsightCards.ts`, which was just settled.
- Never log or return the transcript or any credential in an error.

## Tests — required, and they must run without GPU, Ollama or a Whisper model
- pytest suite covering: the endpoints, the defensive parser (every malformed
  case above), config validation, and the upload size limit.
- Fake the Whisper and Ollama clients. NO test may require a network call, a
  downloaded model, or a running Ollama.
- Add a `capture-service` job to `.github/workflows/ci.yml` that installs
  Python and runs pytest. Do NOT disturb the existing Node jobs, and do NOT add
  `--max-warnings` anywhere.
- Document in the service README how a contributor runs the real end-to-end
  path locally with Ollama installed, since CI cannot.

## Rules
- Do NOT run `git commit`, `git add`, `git push`, `git checkout`, `git reset`.
- Do NOT modify anything under `docs/`.
- Do NOT modify existing TypeScript source except, if genuinely required, to
  export a type. Do not change any existing behaviour.
- Do NOT weaken `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, `.prettierrc`, or `scripts/check-public-env.mjs`.
- The `KNOWN` map in `scripts/check-public-env.mjs` is EMPTY and must stay so.
- Never write a real credential. No `> NUL` redirects.
- Add `capture-service` build artefacts (`__pycache__`, `.venv`, `*.pyc`,
  `.pytest_cache`) to `.gitignore`.
- At the end run: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run check:env`, `npm run build` (all must still pass), AND the new
  pytest suite. Report all six.

## Final output
1. Files created/modified, one line each.
2. The service's HTTP interface and every environment variable it reads.
3. How Whisper and Ollama are faked so tests need no GPU, model or network.
4. How many pytest tests you added and what each covers.
5. The exact results of all six commands.
6. Anything you deliberately did NOT do, and why.
