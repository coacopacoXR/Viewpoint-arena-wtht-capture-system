Plan 14, batch BG: hand-made cards, plus three small follow-ups found in
review.

Read `docs/plan/14-rooms-models-admin-ai.md` ("Added 2026-09-24 (afternoon)"
→ "Hand-made cards"). Built so far: BA–BF, BC (cards carry `source`
('ai'|'manual'), `created_by_name`, `review_id`, `raised_on_revision`,
`part_node_id`, `part_name`; `InsightCard.source` / `createdByName` exist in
`types.ts`), BH (the room's Edit review mode and roles hook
`lib/reviews/useReviewRole.ts` — `can('addCard')`).

Be economical: read the files named. Do NOT run `docker` and do NOT run any
`git` write command. Do not edit `docs/`. Claude tests live.

## 1. Hand-made cards (the main job)
The user: "it should be possible for users to add decision cards themselves
in case they do not want to use AI."
- In the room's Capture panel (`components/UI/ConversationPanel.tsx`, the
  "Detected insights" list), a **+ Card** button, shown when
  `can('addCard')` (everyone but guests; in mode none, everyone).
- It opens an inline form (not a modal, not a browser dialog): type (Risk /
  Action / Rationale — use the same words and colours the AI cards use),
  title (required), description, priority, and for actions assignee and due
  date. A checkbox "About the part: <name>" appears when a part is selected
  or pointed at (the laser/selection state the room already has), which fills
  `componentReference` / part fields the way grounded AI cards do.
- Saving creates an `InsightCard` with `source: 'manual'`,
  `createdByName` = my display name, broadcast exactly like AI cards (find
  how `addInsightCard` + `INSIGHT_CARD` travel) so everyone sees it at once,
  and saved to the tracker at meeting end exactly like AI cards (the tracker
  bridge already writes `source`/`created_by_name` — check it does for these).
- The card shows "Added by Maria" where AI cards show the agent. Hand-made
  and AI cards are editable the same way afterwards (`can('editCard')`).
- Works while AI capture is off or paused (editing), and in a room where no
  AI is configured at all.

## 2. Archived reviews stay out of the lobby
`review_curations.archived` exists (BC) and the admin console sets it (BE),
but the lobby's lists (`pages/LobbyPage.tsx`, `lib/curationsRepo.ts`
`listRecentCurations` and friends) still show archived reviews. Filter them
out of the lobby's "Saved reviews" and "Your reviews". A direct link to an
archived review still opens it.

## 3. Models section shows every stored file
`/admin` → Models (`pages/AdminPage.tsx` ModelsSection, `api/admin/models.ts`)
lists only files a design review references, so files uploaded in plain
sessions are invisible and can never be removed. Add `list()` to the model
store (`lib/storage/modelStore.ts`; local: read the `<hash>.json` sidecars;
supabase: the Storage list API) and show unreferenced files too, marked "Not
used by any design review", deletable. Keep the 409 guard for referenced
files.

## 4. Deadlines the small model gets wrong
The built-in 7B model turns "by Friday" into the wrong date even with the
calendar in its prompt. Resolve relative deadlines in code instead:
- Extraction output gains an optional `dueDateText` (the words as spoken:
  "by Friday", "next week", "end of the month", "tomorrow") alongside
  `dueDate`. Update the extraction schema/prompt in BOTH
  `lib/connectors/capture/extractionPrompt.ts` and
  `capture-service/capture_service/prompt.py` (+ `extraction_schema.json`
  files; the parity test `capture-service/tests/test_typescript_parity.py`
  must keep passing), asking the model to copy the phrase verbatim.
- `lib/capture/resolveDeadline.ts` (pure): today's date + phrase → ISO date
  or null. Weekday names (the next occurrence after today; "this Friday" on a
  Friday = today), "tomorrow", "today", "next week" (next Monday), "end of the
  week" (Friday), "end of the month", "in N days/weeks". Unknown phrase →
  null. Where a card has `dueDateText` that resolves, that date wins over the
  model's `dueDate`; otherwise keep the model's. Apply it in the server router
  (`lib/ai/router.ts`) after parsing, so every provider benefits.
- Tests for each phrase and for "resolved date overrides the model's".

## 5. PLM launch lost its destination (regression from BH)
`pages/LaunchPage.tsx` (the deep link a PLM system opens, T5.3) navigates to
`/review/<uuid>/setup` with `plmLaunch` state; BH replaced that page with a
redirect to `/room/<uuid>?edit=1`, which keeps the state but nothing in the
room reads it — a PLM launch now opens an empty room. Make the room consume
`plmLaunch` the way the old page did: add the document reference to the
review, and open the Onshape document browser (`components/UI/OnshapeBrowser.tsx`)
inside Edit mode so the user picks the part, including the OAuth return-to
that brings them back to the same room with Edit on. Keep LaunchPage's own
test suite green and add a room-side test for the launch state.

## What must not regress
- AI cards, grounding, the tracker, mode none.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no new `as unknown as`.
- `scripts/check-public-env.mjs` `KNOWN` stays empty.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
cd capture-service && .venv/Scripts/python.exe -m pytest -q
```

## Report
- Files changed / added.
- Anything you deliberately did NOT do, and why.
