Two small changes the user asked for after testing the room:

1. **Remove the top-down view ("Extended Map") and the heatmap.** Both are
   demo-era. Removal, not hiding.
2. **Split view must default to the other PEOPLE in the room, not to agents.**

Be economical: read only the files named, plus anything a type error or grep
leads you to. Do NOT run `docker`, and do NOT run any `git` write command
(`commit`, `add`, `push`, `checkout`, `reset`, `stash`). Claude reviews the
diff afterwards. Do not edit anything under `docs/`.

## Part 1 — remove OVERHEAD and HEATMAP

Known references (grep `HEATMAP`, `OVERHEAD`, `HeatmapOverlay`, `Heatmap`,
`isHeatmap` to confirm there are no others):
- `types.ts` ~121-122: the `ViewMode.OVERHEAD` and `ViewMode.HEATMAP` members.
  Delete both.
- `components/Scene/HeatmapOverlay.tsx`: delete the file.
- `components/Scene/World.tsx`: the import, `isHeatmap`, and
  `{isHeatmap && <HeatmapOverlay />}`, plus any other branch on `isHeatmap`.
- `components/Scene/Product.tsx` ~43 and ~99: `isHeatmap` and every colour /
  emissive ternary that depends on it. Keep the non-heatmap value of each
  ternary exactly (e.g. `isHeatmap ? "#444" : "#e0e0e0"` becomes `"#e0e0e0"`).
- `components/Scene/ViewpointCanvas.tsx` ~292: the
  `viewMode === ViewMode.OVERHEAD || viewMode === ViewMode.HEATMAP` camera
  branch. Delete the branch only; the other branches stay as they are.
- `components/UI/Interface.tsx` ~1019-1032: the "Extended Map" and "Attention
  Heatmap" buttons. Remove the `Map` and `Flame` lucide imports if nothing else
  in the file uses them.
- `components/UI/ViewConfigExplainer.tsx` ~108-140: the OVERHEAD and HEATMAP
  entries, and their icon imports if unused.
- Whatever state only fed the heatmap. Read `HeatmapOverlay.tsx` before
  deleting it and follow what it reads from the store. If a store field or
  action exists ONLY for the heatmap (check with grep that nothing else reads
  it), remove it. If anything else reads it, leave it and say so in the report.

If `viewMode` is persisted anywhere (grep `localStorage`, `persist(` in
`store.ts`), a saved `'OVERHEAD'` or `'HEATMAP'` would now be an invalid value
— make loading fall back to `ViewMode.FREE`. If nothing persists it, say so.

## Part 2 — split view defaults to people

Read:
- `components/UI/Interface.tsx` `handleSplitToggle` (~200). Today it defaults
  `splitScreenTarget` to `agents[0]`.
- `components/UI/SplitViewOverlay.tsx` — the whole file (239 lines). The
  picker lists "Agents" first and participants second, and the
  disconnect fallback (~56-65) falls back to the first agent.
- `store.ts` — `hideAgents` (true by default), `splitScreenTarget`,
  `setSplitScreenTarget`.
- `lib/PresenceContext.ts` for `remoteParticipantList`.

Decisions already made (do not redesign):
1. **Default target when split view opens and nothing valid is picked:** the
   first remote participant (`remoteParticipantList[0]`). Only if there are no
   remote participants AND agents are visible (`!hideAgents`) fall back to the
   first agent. Otherwise leave the target `null`.
2. **Agents are invisible when agents are off.** With `hideAgents` true the
   picker must not render the Agents section at all, and a
   `splitScreenTarget` of kind `'agent'` must be treated as no target (render
   the empty pane, label shows nothing agent-related). Do NOT write to the
   store to clear it — turning agents back on should restore it.
3. **Picker order:** People first, Agents second (and only when visible).
4. **Disconnect fallback** (the effect at ~56-65): when the followed user
   leaves, choose by rule 1 again (next remaining participant, else a visible
   agent, else `null`). Never jump to an agent while agents are off.
5. **Empty state.** When split view is on and there is no target, the right
   pane is currently a blank dark rectangle. The overlay must show one plain
   line over that half, e.g. "No one else is here yet. When someone joins,
   their view appears here." Keep the existing styling vocabulary of the file.
6. If rule 1 is applied in two places (Interface and the overlay), put it in
   ONE small pure function (e.g. `pickDefaultSplitTarget(participants, agents,
   hideAgents)` in `lib/splitTarget.ts`) and call it from both.

## What must not regress
- Free view, AI guided, leader/sync, and split view buttons keep working.
- Picking an agent in the picker (with agents on) still works exactly as now.
- `scripts/check-public-env.mjs`'s `KNOWN` map stays empty.
- No `any` in new code, no `eslint-disable`, no loosened tsconfig, no
  `@ts-ignore`. If a test fails, fix the code rather than the assertion,
  unless the test was asserting the removed heatmap/overhead behaviour — then
  delete that test and say so.

## Tests to add
- `lib/__tests__/splitTarget.test.ts`: participants present → first
  participant; none + agents visible → first agent; none + agents hidden →
  null; none + no agents → null.
- A render test for `SplitViewOverlay` (put it in
  `components/UI/__tests__/`) showing that with `hideAgents: true` no
  "Agents" heading is rendered, and with an agent target and agents hidden the
  empty-state line appears. Look at existing tests in
  `components/UI/__tests__/` for how the store and PresenceContext are set up
  and copy that pattern.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npx vitest run lib/__tests__/splitTarget.test.ts components/UI/__tests__
npm run build
```
(The full suite is slow; Claude runs it after.)

## Report
- Files changed / deleted, one line each.
- Any store field or action removed, and the grep proving nothing else read it.
- Whether viewMode is persisted.
- Anything you deliberately did NOT do, and why.
