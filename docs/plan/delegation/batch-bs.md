Batch BS: the amber editing strip fits on screen.

Found live at 1600×900 after BR (committed): in Edit mode the amber strip
(`components/review/EditingStrip.tsx`, placed in `components/UI/Interface.tsx`)
holds "EDITING THE REVIEW — CHANGES ARE SAVED AND SEEN BY EVERYONE", Whole
model | Part, Move / Rotate / Scale, the selected part's name, Reset part,
Reset all parts, Save this view and Done. It runs past its container: Reset part,
Reset all parts and Save this view are drawn on top of the Edit panel's header
(the review's name) on the right, and Done is pushed off screen.

Batch BQ2 solved the same problem for the room's top bar (`components/UI/room/TopBar.tsx`):
the bar starts after the left block, ends before the side panel
(`canvasRightClass`), and drops text labels to icon + `title` tooltip when it does
not fit. Read how BQ2 did it and do the same here, reusing its mechanism (extract
a shared hook/helper if it is local to TopBar).

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/`.

## Rules
- The strip never overlaps the left block or the side panel, never scrolls
  horizontally, never wraps to a second row.
- Done is ALWAYS visible and keeps its label (it is the way out of Edit).
- When tight, in this order: the long sentence shrinks to "Editing" with the
  full sentence as its `title`; then Reset all parts, Reset part, Rotate, Scale,
  Move, Save this view drop their labels (icon + `title`); the part name
  truncates with an ellipsis (min ~8ch) and its full name is the `title`.
- Whole model | Part keep their labels (they are short and they are the mode).
- Nothing about behaviour changes.

## Tests
The compact states in order; Done always present with its label; the part name
truncates with a title.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
Files changed.
