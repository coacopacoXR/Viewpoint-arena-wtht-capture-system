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

- **Batch B — `0cf91c6`. T1.1 done, reviewed, committed.**
  Qwen fixed violations in source rather than suppressing them: deleted two
  dead unexported components in `Interface.tsx` (`FingerPointerPill`,
  `HoverPointerPill`, both superseded by the `Inline*` variants actually
  rendered) and two dead helpers in `DialogueEngine.tsx`, plus unused
  imports across 22 files. Net 66+/163-. Verified with a real
  `npm run build` that nothing live was removed.
  **One override:** Qwen set `no-explicit-any` to `"off"` (172 violations).
  Changed here to `"warn"` with a `types.ts` exemption — 80 of the 172 are
  R3F JSX intrinsics where `any` is unavoidable, but the other 92 are real
  type debt, and a repo being prepped for external audit should surface it,
  not silence it. Final: lint 0 errors / 104 warnings, exit 0.

### In progress
- **Batch C** — T1.2 vitest + T1.4 playwright. Running. Nothing committed yet.

### Not started
- Batch D (T1.5 CI). Ticket T0.1.

### Follow-ups noticed, not yet done
- **CI must gate on lint ERRORS, not warnings** (`eslint .` exit code), since
  104 warnings are expected and intentional. Do not add `--max-warnings 0`.
- **Type-debt ratchet:** 92 `no-explicit-any` warnings across 31 files
  (worst: `lib/usePartyPresence.ts` 15, `party/room.server.ts` 13,
  `components/UI/MeetingSummary.tsx` 8, `pages/RoomPage.tsx` 7). Worth its
  own ticket; the count should only go down.
- **12 `react-hooks/exhaustive-deps` warnings** left deliberately — each
  needs a human call on runtime behaviour. Four are the ref-in-cleanup
  pattern (`lib/useWebRTC.ts:276-280`, `lib/usePartyPresence.ts:331`) which
  is a safe mechanical fix (copy ref to a local inside the effect). The rest
  involve store setters and presence Maps where adding the dep risks
  re-render loops.
- `CODE_OF_CONDUCT.md` line 66 has a deliberate
  `[TODO: INSERT ENFORCEMENT CONTACT EMAIL]` placeholder — needs a real
  address before the repo goes public. This is a user decision.
- `CONTRIBUTING.md`'s script table needs `lint`, `format`, `test`, and
  `test:e2e` rows added once batch C lands.
- `utils/modelLoader.ts` carries one `@ts-expect-error`; revisit if
  `@types/three` or `@pmndrs/pointer-events` ever fixes the dual entry point.

### Resuming
Read this file, then `git status` and `git log --oneline -5`. If a batch's
changes are in the tree but uncommitted, review them against the ticket's
acceptance criteria in `08-task-breakdown.md` before committing. Check
`.qwen-tasks/*.log` for what the agent reported.
