# Next Steps — decisions only you can make

> Everything technical has moved to [`EXECUTION-LOG.md`](./EXECUTION-LOG.md),
> which is the resume point for a new session. This file is now only the short
> list of things that genuinely need **you**, because they are questions of
> fact, cost, or preference that nobody else can answer.
>
> The original version of this file described setting up the Qwen execution
> backend. That is done — see `delegation/README.md`.

## 1. Do you hold redistribution rights to the branded 3D models? (T0.1)

The repo ships `.glb` files named after real commercial products
(Sennheiser, Santa Cruz). **This is the last thing blocking a public push.**

- If **no** or **unsure** — the default applies: replace them with an openly
  licensed sample and move the originals to a git-ignored `assets/samples/`.
  Nothing further is needed from you; say the word and it proceeds.
- If **yes**, and you can point at the licence that permits redistribution,
  they can stay.

This is the one question only you can answer, which is why it was never
delegated.

## 2. Enforcement contact for the Code of Conduct

`CODE_OF_CONDUCT.md` line 66 reads `[TODO: INSERT ENFORCEMENT CONTACT EMAIL]`.
The Contributor Covenant requires a real address for reporting. A placeholder
was left deliberately rather than guessing one. Blocks going public.

## 3. How to pay for further delegated execution

The Qwen weekly quota was exhausted on **2026-09-08** and resets
**2026-09-14 19:53 UTC**. Options:

- Wait for the reset. Everything is committed; nothing is lost.
- Point Qwen at a different key (`--openai-api-key` / `--openai-base-url`, or
  `~/.qwen/settings.json`).
- Have Claude implement directly, which works but costs Claude credits — the
  thing this whole delegated setup exists to avoid.

Note for whichever you choose: `qwen3.7-plus` (the default) handled batches
A–K. `qwen3.8-max` handled L–O and drained the remaining quota in four runs.
Reserve the expensive model for genuinely hard tickets.

## 4. Two things worth your own eyes before trusting them

Neither blocks anything, but both are unverified in a way tests cannot fix:

- **The WebRTC change** (`30458db`) moved TURN credentials server-side. The
  diff is minimal and preserves the previous fallback exactly, but ICE has been
  fragile here — two reverts in recent history — and nothing in the suite
  exercises a real peer connection. Worth a manual two-browser call.
- **CI has never run.** Every check across all 26 commits was run locally. The
  first real GitHub Actions run is where the gitleaks licence question gets
  answered and where the two Windows-skipped installer tests actually execute.

---

Everything else — what was built, what was overridden and why, what is still
unfinished — is in [`EXECUTION-LOG.md`](./EXECUTION-LOG.md).
