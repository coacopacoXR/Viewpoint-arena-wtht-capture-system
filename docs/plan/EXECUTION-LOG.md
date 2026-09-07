# Execution Log

Append-only record of delegated ticket execution. Updated after every batch so
a session that ends mid-run can be resumed without re-deriving state.

**Setup**: Qwen Code CLI v0.23 (`qwen3.7-plus`, ModelStudio token plan, 1M ctx)
executes tickets headless (`qwen -y -o text < spec`). Claude writes the specs,
reviews the diff, and commits. Qwen is forbidden from all `git` write commands,
so every change lands in the working tree for review first. Specs live in
`.qwen-tasks/`, run logs beside them as `*.log` (both git-ignored).

**Branch**: `planning/oss-enterprise-readiness`. Nothing is pushed to
`origin`/`main` without the user reviewing.

**Batch order** (serialized, not parallel â€” every Phase 1 ticket edits
`package.json`, so concurrent agents would collide there):
- A â€” T0.2 gitignore, T0.3 OSS baseline files, T1.3 typecheck script
- B â€” T1.1 lint & format (the plan's designated validation ticket)
- C â€” T1.2 vitest, T1.4 playwright
- D â€” T1.5 CI pipeline (depends on Aâ€“C)
- T0.1 asset swap â€” deliberately held back from batch A; needs a
  permissively-licensed replacement model downloaded, a poor fit for an
  unattended agent. To be sequenced separately.

---

## Session 2026-09-07

### Done
- `2a478e7` — committed `docs/plan/`, `docs/paper/`, `docs/README.md` as a
  clean baseline so delegated diffs are reviewable.
- `36f6011` — added this execution log.
- Verified the Qwen headless path works end to end (13s round trip).
- Wrote specs `.qwen-tasks/batch-a.md` and `.qwen-tasks/batch-b.md`.
- **Batch A — `3736451`. T0.2, T0.3, T1.3 done, reviewed, committed.**
  Reviewed rather than trusted: independently reproduced the typecheck
  failure (10 errors without the `types/three-augment.ts` bridge, 0 with
  it), so the fix is real and not a silencing hack. Tried a cleaner
  tsconfig `paths` root-cause fix first — it is worse (11 errors) and was
  reverted. Discovered the bridge file's `.ts` extension is load-bearing
  (as `.d.ts` it becomes an ambient declaration, not an augmentation, and
  the 10 errors return); documented in the file so nobody "tidies" it.
  Confirmed Qwen's `.gitignore` edit did not clobber the `.qwen-tasks/`
  entry added here.

### In progress
- **Batch B** — T1.1 lint & format. Running. Nothing reviewed or committed yet.

### Not started
- Batches C (T1.2 vitest, T1.4 playwright), D (T1.5 CI). Ticket T0.1.

### Follow-ups noticed, not yet done
- `CODE_OF_CONDUCT.md` line 66 has a deliberate
  `[TODO: INSERT ENFORCEMENT CONTACT EMAIL]` placeholder — needs a real
  address before the repo goes public. This is a user decision.
- `CONTRIBUTING.md`'s script table lists only `dev`/`build`/`preview`/
  `typecheck`. It needs `lint`, `format`, `test`, and `test:e2e` added once
  batches B and C land.
- `utils/modelLoader.ts` carries one `@ts-expect-error`; revisit if
  `@types/three` or `@pmndrs/pointer-events` ever fixes the dual entry point.

### Open questions for the user
- None. Everything batches Aâ€“D need was already decided in
  `07-oss-hygiene-and-licensing.md` (Apache-2.0) and `NEXT-STEPS.md`
  (replace the branded `.glb` assets; don't escalate technical calls).

### Resuming
Read this file, then `git status` and `git log --oneline -5`. If a batch's
changes are in the tree but uncommitted, review them against the ticket's
acceptance criteria in `08-task-breakdown.md` before committing. Check
`.qwen-tasks/*.log` for what the agent reported.
