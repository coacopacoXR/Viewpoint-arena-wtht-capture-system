Plan 14, batch BH: prepare a design review inside its room.

Read `docs/plan/14-rooms-models-admin-ai.md`, sections "How things are
organised" and "Preparing a review inside its room (approved by the user)".
The approved design, as the user saw it in a sketch:
- four roles (owner, editor, participant, guest) — the table is code already:
  `lib/reviews/roles.ts` (`can`, `resolveRole`, `REVIEW_ACTIONS`);
- an **Edit** button in the room's top bar, only for owners and editors;
- with Edit on: the right side panel swaps from Capture · Comments · Chat to
  the review's own tabs — **Agenda · Views · Pins · Requirements · Labels ·
  People**; the top bar becomes an amber strip "Editing the review — changes
  are saved and seen by everyone" with Move / Rotate / Scale and **Done**; the
  model tree gets **+ Revision**; "Save this view" turns the camera into a
  viewpoint; the call keeps running but capture and cards pause;
- everyone else sees "<name> is editing the review", never the tools;
- the lobby's "Curate a design review" becomes **New design review**, which
  creates the review and opens its room with Edit on; the old
  `/review/:id/setup` address redirects to `/room/:id?edit=1`.

Already built: BC (`review_members`, owner_id guard, `membersRepo`,
`revisionsRepo`, roles), BB (scene list, revisions, Compare, `modelEditors`),
BD (admin console, `requireAdmin`, service-role token), identity (plan 13).
Do NOT touch `/admin`, `pages/AdminPage.tsx` or `api/admin/*` — another batch
is editing those now.

Be economical: read the files named. Do NOT run `docker` and do NOT run any
`git` write command. Do not edit `docs/` except `docs/supabase-schema.sql`.
Claude tests live with real accounts.

## 1. My role in this room
`lib/reviews/useReviewRole.ts`: a hook returning `{ role, can(action) }` for
the current room, from `resolveRole` with: identity mode (public config), the
signed-in account (`vp_user.accountId`, guest flag), the review's `owner_id`
and members (read once per room, refreshed when People changes), whether I am
an admin (token `app_metadata.role`), and whether I am the meeting host
(`sessionHostId === localUserId`). In `mode: 'none'` this must reproduce today
exactly: host → editor, others → participant.

## 2. The curation tabs move into the room
Today they live in `pages/ReviewSetupPage.tsx` (1,935 lines): Asset,
Viewpoints, Pins, Agenda, Requirements, Labels tabs, a transform gizmo
(`components/Scene/ReviewSetupCanvas.tsx`), draft autosave
(`lib/reviewSetupStore.ts`). The room reads the review through
`lib/activeReviewStore.ts` and presents it via `ReviewPanelContent`.
- Extract the tab components out of ReviewSetupPage into
  `components/review/` (one file each) so the room and — until it is
  removed — the old page can both render them. Do not fork copies.
- In the room (desktop only; the phone view is unchanged), the side panel
  (`components/UI/Interface.tsx` right panel) shows those tabs when Edit is on,
  in the order Agenda · Views · Pins · Requirements · Labels · People. The
  Asset tab's content becomes the model tree's job (+ Revision, which reuses
  BB's import flow with "New revision of …") plus the transform tools in the
  amber strip.
- Edits save through the same store/repo the setup page uses and are
  broadcast so other people in the room see the review update (the room
  already applies `REVIEW_CONFIG` broadcasts — find it and reuse it).
- Transform: Move / Rotate / Scale apply to the SELECTED scene model (BB's
  `activeSceneModelId`), using drei's `TransformControls` as
  ReviewSetupCanvas does, and are saved as that model's offset/transform so
  everyone sees it (BB `setOffset`; extend with rotation/scale if the scene
  model lacks them, persisted like offset).
- "Save this view": adds a viewpoint from the current camera (position,
  target) to the review, named "View N" and renamable in the Views tab.
- While Edit is on for anyone in the room, capture (live transcript and
  card extraction) is paused for the room, and resumes on Done. Broadcast an
  `EDITING_STATE { editorName | null }` through the room server so everyone
  shows the banner "Paco is editing the review" (non-editors) and capture
  knows. Only one person edits at a time: a second editor pressing Edit sees
  "Paco is editing — ask them, or take over", and taking over ends the first
  person's edit mode (they see "Maria took over editing").

## 3. People tab (owners only; read-only list for editors)
- Lists members (name, role) and lets the owner add a person by email (an
  existing account on this install), change role (editor / participant),
  remove. Writes go through a new endpoint `api/reviews/members.ts` (NOT under
  `api/admin`): the caller's token must resolve to `managePeople` for that
  review (owner or admin); the api writes with the service-role token
  (`api/_lib/serviceRole.ts`), because `review_members` is read-only to the
  public key (BC). Look up the email via GoTrue's admin users list.
- An ownerless review (created before accounts): an admin opening it sees
  "This review has no owner. Make me the owner" in the People tab; the api
  sets `owner_id` and the owner row with the service role.
- In `mode: 'none'` the People tab is absent.

## 4. Entry points
- Lobby: "Curate a design review" → **New design review**: creates the
  review row (title "Untitled design review", owner = me when signed in) and
  navigates to `/room/<id>?edit=1`. The room opens with Edit on for an
  owner/editor.
- Saved reviews' "Edit" action → `/room/<id>?edit=1`.
- `/review/:id/setup` → redirect to `/room/:id?edit=1`. Remove the page's
  route but keep the file only if something still imports it; otherwise
  delete it and its now-unused pieces.

## What must not regress
- Meetings exactly as today when nobody edits.
- `mode: 'none'`: the host can edit (as the old curate page allowed anyone),
  others cannot; no People tab.
- Existing reviews open with their agenda, viewpoints, pins, requirements,
  labels and models.
- The phone view, boardroom, split view, follow.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no new `as unknown as`.
- `scripts/check-public-env.mjs` `KNOWN` stays empty.

## Tests
- useReviewRole for each mode and role.
- Edit button visibility per role; amber strip and panel swap when on;
  non-editors see the banner not the tools.
- Single editor: take over flow via the room server message.
- Capture paused while editing (the recorder/extractor refuses to send).
- members endpoint: owner can add/change/remove; editor/participant 403;
  admin can claim an ownerless review; nobody can claim an owned one.
- Lobby "New design review" creates and navigates with ?edit=1; old setup URL
  redirects.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
- Files changed / added / deleted.
- What happened to ReviewSetupPage.
- Anything you deliberately did NOT do, and why.
