Batch BI: empty rooms by default with sample models on request, plus three
small follow-ups. Keep it to exactly these four sections.

Be economical: read the files named, read each once. Do NOT run `docker` and
do NOT run any `git` write command. Do not edit `docs/`.

## 1. No default model; the three built-ins become samples
The user: "remove the headphones and the bike, at this point they are not
necessary, keep them as sample 3D models somehow, but not as default."
- Today `store.ts` ~826 starts every room with `activeModelType: 'headphones'`,
  and the scene (`lib/scene/roomScene.ts`, `RoomScene.builtIn`) can hold a
  built-in ('synth' | 'headphones' | 'bicycle'). New rooms and new design
  reviews must start EMPTY: no model at all.
- An empty room shows, in the 3D view, one calm centred prompt in the room's
  existing style: "No model yet" with two actions — **Import a model**
  (opens the same import flow as the model tree's button) and **Try a
  sample** (a small menu: Synth assembly, Headphones, Bicycle). People who may
  not change models see only "No model yet — the host will add one".
- Also put **Samples** in the model tree's import area ("or try a sample") so
  a sample can be added later, through the same scene operation as today
  (`setBuiltIn`), obeying the same who-can-change-models permission.
- Existing reviews/rooms that already HAVE a built-in keep it (do not
  migrate anything away). Only the DEFAULT changes. Grep every place that
  assumes a model is always present (the 29-ish references to
  'headphones'/'bicycle'/'synth', the tree, the laser, capture grounding,
  tracker `model_name`) and make an empty scene safe: nothing may crash or
  show "Sennheiser Momentum 4" when there is no model.

## 2. Add a pin from inside the room
Pins can be listed, jumped to and edited in the room's Edit mode (Pins tab,
`components/review/PinsTab.tsx`) but not ADDED — `addPin` exists only in
`lib/reviewSetupStore.ts`. In Edit mode, the Pins tab gets **+ Pin**: the next
click on the model places a pin at that point on that part (reuse the laser/
raycast the room already has to find the point and part), then the usual pin
fields. It goes through `useActiveReviewActions` so it marks a local edit and
is saved and broadcast like the other review edits (BH3).

## 3. Model placement is saved with the review
Move / Rotate / Scale in Edit mode change the scene model's offset/transform,
which is persisted only in the room's PartyKit storage, not in the review
row. Save it with the review too: when the review is saved, include each
scene model's transform (the review already has `asset.transform` —
`lib/reviewSetupStore.ts` `ModelTransform` — and `model_revisions` rows; pick
the one that keeps a revision's placement per revision, and say which). On
opening the review, the stored placement wins.

## 4. Load the editing tools only when needed
`components/review/ReviewEditPanel.tsx` and the tabs it renders are in the
main bundle (~50 kB) though only owners/editors in Edit mode use them. Load
them with `React.lazy` + `Suspense` (a small neutral placeholder while
loading). Report the main chunk size before and after (`npm run build`).

## What must not regress
Everything in the room, Edit mode, BH3 persistence rules (save only on local
edits), permissions, CAD import, the tracker. No `any`, no `eslint-disable`,
no `@ts-ignore`, no new `as unknown as`. `scripts/check-public-env.mjs`
`KNOWN` stays empty.

## Tests
Empty scene renders the prompt (and the non-editor wording); picking a sample
adds it via `setBuiltIn`; nothing crashes with no model (tree, laser, capture
grounding); + Pin places and saves through the local-edit path; transform
saved and restored; lazy panel renders after load.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
Files changed; main chunk before/after; where placement is stored; anything
deliberately not done.
