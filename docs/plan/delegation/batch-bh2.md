Batch BH2: two bugs in "curation inside the room" (BH), found by Claude
testing the committed-to-be build in real browsers against a real database.
Fix them; do not redesign anything.

Be economical: read the files named. Do NOT run `docker` and do NOT run any
`git` write command. Do not edit `docs/`.

## Bug 1 — edits made in the room are not saved to the database
Reproduction (live, self-hosted stack, accounts mode, Supabase configured):
1. Signed-in user clicks **New design review** in the lobby → lands in
   `/room/<id>?edit=1` with the amber strip and the review tabs. The row
   `review_curations(<id>)` exists (title "Untitled design review",
   owner set) — creation is fine.
2. Opens the Views tab, clicks **Save this view** in the amber strip. The Views
   tab shows the new viewpoint "01" with a Jump button; the review pill shows
   1 viewpoint.
3. Clicks **Done**, then waits several seconds.
4. In the database: `jsonb_array_length(viewpoints)` for that row is **0**, and
   `updated_at` did not move after step 2. After reloading the room the view
   is gone and the review pill is not shown.
So the in-memory review changes, but nothing is written. Your previous run
said it widened the persistence subscriber in `pages/RoomPage.tsx` beyond
`isHost` and made the cleanup flush the debounce — verify that against the
actual code path of Save this view:
- find where Save this view writes (the amber strip in
  `components/review/EditingStrip.tsx` → `components/review/useActiveReviewActions.ts`
  / `components/review/draftActions.ts`), which store it updates
  (`lib/activeReviewStore.ts` vs `lib/reviewSetupStore.ts`), and whether the
  subscriber that calls `saveCuration` (`lib/curationsRepo.ts`) is actually
  subscribed to THAT store and THAT key in the room;
- check the other editing actions the same way (agenda add/edit, pins,
  requirements, labels, transform of a model) — any that do not persist are
  the same bug;
- check the "New design review" path specifically: the room may be reading
  its review from `useReviewSetupStore` (the draft handed over by the lobby)
  while edits go to `useActiveReviewStore`, or the reverse.
Write a test that exercises the REAL path end to end in jsdom: render the
room pieces (or call the same functions the button calls) with the real
stores, mock only the Supabase client, click Save this view (or call its
handler), advance timers past the debounce, and assert `saveCuration` (or the
Supabase upsert) was called with a payload whose `viewpoints` has the new
view. Do the same for Done-within-a-second (the flush). The test must fail
on the code as it is now — say in the report that you saw it fail first.

## Bug 2 — the owner sees "Import locked" when they are not the meeting host
Reproduction: the owner creates a review and edits it; another signed-in
person (made an editor in People) joins; the owner reloads the page and
re-enters — the other person is now the meeting host. The owner's model tree
shows **Import locked**. The room server (BC) already decides scene
permissions by ROLE when identity is on; the client still uses
`mayChangeModels(modelEditors, localUserId, sessionHostId)`
(`components/UI/SceneTree.tsx` `useScenePermissions`, `lib/scene/*`), which is
host-based. Make the client ask the same question the server asks: with
identity on, use `useReviewRole()` — owners and editors may change models (and
`setModelEditors`), and `modelEditors` 'everyone' / named people still widen
it; in mode none keep today's host rule exactly. One shared function used by
both the client and the room server, so they cannot disagree again; test it
for every role × modelEditors setting × mode.

## What must not regress
- Everything BH verified live: Edit strip and tabs, one editor at a time with
  the banner for others, People tab adding an editor who then gets Edit, the
  old setup URL redirect, New design review creating the row.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no new `as unknown as`.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
- The root cause of bug 1, in one paragraph, with file and line.
- Which editing actions were affected.
- That the new tests failed before the fix.
