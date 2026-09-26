# Next Steps — decisions only you can make

> **2026-09-26: the release plan is [`16-release.md`](./16-release.md).** Its
> §2 lists the decisions for the release (version, private docs, history
> rewrite, security review timing, licence, sample model, repo name). The
> items below are older.

> Everything technical has moved to [`EXECUTION-LOG.md`](./EXECUTION-LOG.md),
> which is the resume point for a new session. This file is now only the short
> list of things that genuinely need **you**, because they are questions of
> fact, cost, or preference that nobody else can answer.
>
> The original version of this file described setting up the Qwen execution
> backend. That is done — see `delegation/README.md`.

## 1. Branded 3D models (T0.1) — DECIDED 2026-09-17

The repo ships `.glb` files named after real commercial products
(Sennheiser, Santa Cruz).

**Decision:** keep them for now. At the public release, replace them with a
simple cube and remove the originals.

Caveat recorded at decision time: the GitHub repo is *already* public and both
models are on `main` there, so "at release" means the release announcement,
not the moment the repo becomes visible. A swap in a new commit leaves the
files in git history; removing them fully needs a history rewrite
(`git filter-repo --path-glob '*.glb' --invert-paths`), as was done for commit
attribution on 2026-09-17.

## 2. Enforcement contact for the Code of Conduct — DONE 2026-09-21

Set to fgarciarivera94@gmail.com.

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
- ~~CI has never run.~~ Done 2026-09-21: branch pushed, all 9 jobs green after
  four fixes (see EXECUTION-LOG). The gitleaks action ran without a licence
  prompt on this personal-account repo.

## 5. Your Supabase project no longer exists

`.env.local` points at `ckdtbqtuqvurkzcderms.supabase.co`, which does not
resolve any more (probably deleted, or paused too long). Anywhere that uses it
cannot save reviews or use the tracker. The Docker install will bring its own
database; for Vercel you would need a new Supabase project.

## 6. The Docker install works; try it yourself

Done 2026-09-22 and walked end to end on this machine: follow
[`docs/INSTALL.md`](../INSTALL.md). WSL2, Ubuntu 24.04 and Docker Desktop's
WSL integration are set up here already (Ubuntu user `coaco`, no password
yet: run `passwd` in Ubuntu to set one). A working install is running now
in `~/viewpoint-arena` inside Ubuntu, so https://localhost/ opens it.

Before anyone else follows the guide, the branch has to be pushed: the
guide clones it from GitHub.

## 7. What is left of plan 12 (updated 2026-09-23, night)

Written up in full in [`12-camera-room-ui-and-identity.md`](./12-camera-room-ui-and-identity.md).
The camera work (A) and the room layout (B, your Option B) are **built,
committed and running on your local install**. See EXECUTION-LOG for what each
batch did.

- **Identity (C): still yours to pick.** You asked for "an account system
  where you can see what reviews you have been a part of". The options, from
  cheapest:
  1. A name you keep: your browser identity made permanent and portable, with
     no sign-up.
  2. Real accounts on the deployment.
  3. Borrowing identity from SSO, the PLM or Teams. This fits your
     "complement, don't replace" test best and costs the most.

  Nothing is started until you pick.
- **Try the snap-back.** Follow someone and drag your view: it eases back
  after 2 seconds. If that feels too short or too long, the number is
  `FOLLOW_RESUME_DELAY_MS` in `lib/followTiming.ts`. The boardroom uses the
  same number now (it was 3 s).
- **Look at the new layout** at https://localhost/ and say what to change.
- **Push when you are happy.** The 8 commits from this session are not
  pushed yet.

---

Everything else — what was built, what was overridden and why, what is still
unfinished — is in [`EXECUTION-LOG.md`](./EXECUTION-LOG.md).
