Batch BQ: name a design review, start a variant from a visible button, and an
import choice that does not look like it deletes.

The user: "There is no way to name the design review or to create product
variants ... importing one 3d model deletes the last ... I dont see anything
about creating the product variants."

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/` except
`docs/supabase-schema.sql`.

## 1. Naming a design review
Today every review is "Untitled design review" and nothing edits
`review_curations.title` (the draft's `title`).
- Lobby, "+ New design review" (`components/lobby/LobbyActions.tsx`): clicking
  it opens an inline field in place ("Name this design review", placeholder
  "e.g. Door hinge, rev C", autofocus, Enter = Create, Esc = cancel; an empty
  name creates "Untitled design review" as today). The name goes into the
  created row (`createReview` / the draft).
- Rename where the title is shown, for owners and editors (`can(role,
  'editReview')`; in mode none the host): the lobby preview's title
  (`components/lobby/ReviewPreview.tsx`) and the room's Edit panel header
  (`components/review/ReviewEditPanel.tsx` — add the title as its first field,
  inline-editable). Save through the same draft actions / save-on-local-edit
  path the other review fields use (BH3's `markLocalEdit` rules — a rename is a
  local edit), so everybody in the room gets it via REVIEW_CONFIG. Max 120
  chars, trimmed; empty → keep the old name.
- The room shows the review's name: next to the logo/Lobby link in the top-left
  block (`components/UI/Interface.tsx`), truncated, `title` attribute with the
  full name. Variant rooms show "Name · Variant A" there (the LineChip already
  says which variant; do not duplicate the chip — just the name).

## 2. Starting a variant from a visible button
Today the only way is: Sessions → click a session stop → "Explore a variant
from here" at the bottom of that panel. Nobody finds it.
- Room top bar (`components/UI/room/TopBar.tsx`), next to Sessions, for those
  who may (`editReview`): a "Variant" button (lucide GitBranch icon is fine as
  an icon; the WORD on screen is "Variant", never branch/fork). It opens a
  small popover: "Explore a variant" — name field (placeholder "Steel hinge
  pin"), and "Starts from: <latest session label on this line, e.g. S3 · 24 Sep>"
  or, when the line has no sessions yet, "Starts from: the model as it is now".
  Start → the existing explore flow (`lib/reviews/linesClient.exploreVariant`)
  and navigate to the variant room.
- Lobby preview: the same "+ Variant" action next to Open room, for the same
  people, same popover.
- A variant with NO parent session must work: `api/reviews/lines.ts` explore
  currently requires `parentSessionId`. Allow it to be absent when the parent
  line has no sessions: create the variant with `parent_session_id` null and
  have the variant room start from the parent line's current scene (whatever
  the main line room would show now — the review's stored revisions). Session
  map layout: a variant with no parent session leaves the main line at its
  start. Keep all the BL checks (role, letters, unique retry).
- Keep "Explore a variant from here" on session stops as it is.

## 3. The import choice (the "it deletes my last model" report)
When a second model is imported, the Model Tree shows three options in this
order: "New revision of <model> — becomes Rev B and hides the one before it",
"Add next to it", "Replace everything". Users read the first as "replace" and
think the old model was deleted. Change to:
- Order: **Add next to it** first and visually primary (black), then **New
  revision of <model>**, then **Replace everything** (red text, last).
- Copy: "Add next to it — both models stay on screen." / "New revision of
  <model> — shown instead of Rev A. Rev A is kept; show it again from the tree."
  / "Replace everything — removes all models from the scene and clears this
  meeting's comments, chat and cards."
- Hidden revisions must be findable: in the Model Tree each model line lists
  its revisions (Rev A, Rev B …) with an eye toggle; a hidden one is shown
  greyed with "hidden" and one click shows it again. Check what exists (BB built
  revisions + Compare) and fill only the gap — if every revision is already
  listed with a working toggle, just make hidden ones visually obvious.

## What must not regress
BK/BL/BM/BN/BO/BP behaviour, the one-record-per-meeting rule, permissions,
mode none, BH3 save rules. No `any`, no `eslint-disable`, no `@ts-ignore`, no
new `as unknown as`. `scripts/check-public-env.mjs` `KNOWN` stays empty.

## Tests
New review with a name writes it; rename in the edit panel and in the lobby
preview (allowed / not allowed); the room shows the name; Variant popover
starts a variant with and without a parent session (endpoint accepts a missing
parent only when the line has no sessions); import options order and copy;
hidden revision listed and can be shown.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
Files changed; exact SQL (if any); anything deliberately not done.
