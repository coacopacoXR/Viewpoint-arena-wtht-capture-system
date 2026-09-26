Batch BW: the tracker in the app's look, and adding people from the lobby.

The user: "I'd like the aesthetics of the tracker to match the aesthetics of the
other parts of the app" and "it should be possible to add people in the design
review straight from the lobby".

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/`.

## 1. Tracker look (`pages/TrackerPage.tsx` and components only it uses)
Batch BJ did exactly this for the Manager view; batch BO built the new lobby in
the house style. Read `components/lobby/*` (the lobby: `bg-[#f3f4f6]` ground,
white cards with `border-gray-200`, black primary buttons, mono 10px uppercase
labels with tracking, gray-500 secondary text, the top bar with the VA logo) and
`components/UI/room/TopBar.tsx`, and make the tracker read as the same product:
- The same top bar as the lobby (logo → lobby, "Lobby" link, name chip if it is
  reusable; otherwise logo + Lobby link), replacing the tracker's own header.
- Light ground and white panels instead of any dark/gradient/teal treatment;
  filters as the lobby's chip style (black active, white inactive); tables/cards
  with gray-200 borders; status/priority/type colours kept ONLY where they carry
  meaning (RISK red, ACTION blue, RATIONALE amber; Approved green, Rejected red,
  Open/In Review neutral), like BJ's rule.
- Its own scroll container (`h-full overflow-y-auto`): index.html fixes the body
  for the 3D room, so a page taller than the window must scroll itself — the
  lobby had exactly this bug.
- Keep every feature, filter, data flow, the SessionMap above a review's cards,
  continuity labels, line labels, archive, exports. Visual change only.
- Existing tests that assert behaviour must pass unchanged; if one asserted a
  colour class you changed, update just that assertion and list it.

## 2. People from the lobby
The room's Edit panel has a People tab (`components/review/PeopleTab.tsx`,
`lib/reviews/membersClient.ts`, `api/reviews/members.ts`) that adds people by
email with a role and changes/removes them; only some roles may (read the rules
in `lib/reviews/roles.ts` and the endpoint). In the lobby preview
(`components/lobby/ReviewPreview.tsx`) add a **People** section under the
heading: avatars + names + role for the current roster, and — for those the
endpoint allows — "+ Add person" (email + role select + Add, inline, the same
validation and error sentences as the People tab), change role, remove (inline
confirm, never window.confirm). Reuse PeopleTab's logic: extract the shared part
(roster load, add/change/remove calls, error mapping) into a hook or component
both use; keep PeopleTab's own layout for the dark panel and give the lobby the
light one. In mode none (no accounts) the section is hidden, as PeopleTab is.
Refresh the lobby card's "3 people" count after a change. After adding, the
existing roster-changed event (`lib/reviews/rosterEvents.ts`) fires so open role
checks re-read.

## What must not regress
Tracker features and filters; the lobby; PeopleTab in the room; permissions
(the endpoint is the authority — hiding a control is not the enforcement). No
`any`, no `eslint-disable`, no `@ts-ignore`, no new `as unknown as`.

## Tests
Tracker renders the shared top bar and scrolls; People section: shown/hidden by
mode and role, add/change/remove call the client and show its errors, inline
confirm; PeopleTab still works (existing tests).

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
Files changed; class families replaced in the tracker (from → to).
