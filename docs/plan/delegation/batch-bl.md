Plan 15, batch BL: the Variant actions. Read
`docs/plan/15-sessions-and-variants.md` (short, approved by the user) first.
BK (committed) added `review_lines` (main + variant, `letter`, `status`
active/adopted/dropped, `parent_session_id`), `line_id` / `seq` on
`tracker_sessions`, `line_id` / `origin_line_id` / `adopted_at` /
`closed_reason` on `tracker_items`, `lib/reviews/lines.ts` + `linesRepo.ts`,
the room honouring `/room/<reviewId>?line=<lineId>` (PartyKit room
`<reviewId>~<letter>`), carried-over cards, and `components/review/SessionMap.tsx`
in the room (Sessions button) and the tracker.

On screen: "Variant", "Main line", "Explore a variant from here", "Adopt into
main line", "Drop variant". Never "branch", "fork", "merge", "commit".

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/` except
`docs/supabase-schema.sql`.

## 1. Who may do it
Use `lib/reviews/roles.ts`: exploring, adopting and dropping a variant are
`editReview` actions (owners and editors; in mode none, the meeting host).
Add the three as named actions only if that keeps the roles table readable;
otherwise gate on `editReview` and say so.

## 2. Explore a variant from here
On any session stop in the SessionMap (main line or a variant), an
**Explore a variant from here** action (for those allowed): asks for a short
name ("Steel hinge pin"), creates a `review_lines` row (kind variant, next
free letter A, B, …, `parent_session_id` = that session), and opens the
variant's room (`/room/<reviewId>?line=<id>`). The variant's room starts with:
- the scene of that session: its `revision_ids` (as BK's "start where the line
  left off" does, but from the PARENT session);
- the parent line's cards that were open at that session, shown as
  "Carried over" (BK) — the same tracker items, not copies.
A "you are on Variant A · Steel hinge pin" chip sits in the room's top bar,
with a link back to the main line.

## 3. Adopt into main line
On an active variant (in the SessionMap and in the variant's room), **Adopt
into main line**:
- Model: if only the variant changed the model since its parent session,
  its latest revision(s) become the main line's current scene. If BOTH lines
  uploaded new revisions of the same model line since the parent session,
  ask ONE plain question inline: "Keep Rev C from the main line or Rev B2 from
  Variant A?" — never a conflict screen.
- Cards: the variant's cards (still open or not) move to the main line
  (`line_id` = main line), keep `origin_line_id` = the variant, get
  `adopted_at` = now. The tracker shows "Raised in Variant A · adopted <date>".
- The variant's status becomes adopted, `closed_at` set; the SessionMap draws
  it rejoining the main line with a green stop (BK already renders it).
- Writes that touch several rows happen in one server call
  (`api/reviews/lines.ts`, service role, checking the caller's role like
  `api/reviews/members.ts` does) so a half-adopted variant cannot happen.

## 4. Drop variant
**Drop variant**: asks for a one-line reason ("Too expensive to tool"),
sets status dropped + `closed_at`, and closes the variant's OPEN cards with
`closed_reason` = "Dropped with Variant A: <reason>" (status → Rejected, via
the same status history the tracker uses). The variant stays visible, greyed,
for the record. Same endpoint, same role check.

## 4b. Lock the writes (security)
Today `review_lines` accepts inserts/updates from the anon key (BK copied
`model_revisions`). Tighten in `docs/supabase-schema.sql`, idempotently: the
browser may only INSERT a `kind='main'` row (BK's `ensureMainLine` needs it)
and may not UPDATE or DELETE `review_lines` at all. Creating a variant also goes
through `api/reviews/lines.ts` (service role, role check) — so all three
actions (explore, adopt, drop) are one endpoint with an `action` field. The
moves of `tracker_items` for adopt/drop are done there too. Add a schema test
asserting the policies.

## 5. Tracker
- Line filter (BK) includes adopted/dropped variants, labelled as such.
- Cards: "Main line · S3", "Variant A · A2", "Raised in Variant A · adopted
  12 Oct", "Closed — dropped with Variant B: <reason>".
- The review's view in the tracker shows the SessionMap above its cards (BK)
  and now its actions for those allowed.

## What must not regress
BK behaviour, existing reviews/sessions/cards, BH3 save-on-edit rules,
permissions, mode none. No `any`, no `eslint-disable`, no `@ts-ignore`, no
new `as unknown as`. `scripts/check-public-env.mjs` `KNOWN` stays empty.

## Tests
Next letter; explore creates the line and the room starts from the parent
session's revisions and open cards; adopt moves cards (origin kept, adopted_at
set) and the scene (both the single-changed case and the both-changed
question); drop closes open cards with the reason and leaves closed ones
alone; endpoint refuses participants/guests; tracker labels for adopted and
dropped.

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
