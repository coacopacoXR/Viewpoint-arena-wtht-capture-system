Plan 15, batch BK: sessions belong to a line of a design review, and the
session map. Read `docs/plan/15-sessions-and-variants.md` first (short,
approved by the user). This batch is the BK row ONLY: lines exist (main +
variants as data), sessions belong to a line, a session starts from its
line's state, and the map shows it all. Do NOT build the Explore / Adopt /
Drop actions (next batch, BL) — but shape the data so BL is only UI + a few
writes.

On screen: "Design review", "Session", "Main line", "Variant". Never
"branch", "fork", "merge", "commit".

Be economical — you have a limited number of tool calls; read each file once.
Do NOT run `docker` and do NOT run any `git` write command. Do not edit
`docs/` except `docs/supabase-schema.sql`.

## Today (verified)
- A design review = a `review_curations` row (id = room id). BC added
  `review_members`, `model_revisions`, `tracker_sessions.review_id` +
  `revision_ids`, and `tracker_items.review_id / raised_on_revision /
  source / created_by_name / part_*`.
- A session is written to `tracker_sessions` when a meeting ends
  (`lib/trackerBridge.ts`, called from the store's `endMeeting`).
- The tracker (`pages/TrackerPage.tsx`) filters by design review and shows
  revision continuity (`components/UI/CardContinuity.tsx`,
  `lib/trackerContinuity.ts`).
- The room is `/room/<reviewId>`; the PartyKit room name is the same id; the
  room server keeps the scene per PartyKit room (BB).

## 1. Schema (idempotent, existing style)
- `review_lines (id uuid pk, review_id text, kind text check in
  ('main','variant'), name text, letter text, -- 'A','B'… for variants, null for main
  parent_session_id uuid null references tracker_sessions(id),
  status text check in ('active','adopted','dropped') default 'active',
  created_by uuid null, created_by_name text, created_at, closed_at null,
  unique (review_id, kind, letter))`. Exactly one main line per review —
  enforce with a partial unique index on (review_id) where kind='main'.
  RLS: public read; writes the same way `model_revisions` is written today
  (see its policies) — BL will tighten who may create variants.
- `tracker_sessions`: add `line_id uuid null`, `seq int null` (the session's
  number on its line: S1, S2… on main; A1, A2… on Variant A).
- `tracker_items`: add `line_id uuid null`, `origin_line_id uuid null`
  (where it was raised; differs from line_id after an adoption in BL),
  `adopted_at timestamptz null`, `closed_reason text null`.
- Backfill in SQL: every review with sessions gets a main line; its sessions
  and items get that line and `seq` by `ended_at` order. Safe to run twice.

## 2. Lines in code (`lib/reviews/linesRepo.ts`, pure helpers in `lib/reviews/lines.ts`)
- `ensureMainLine(reviewId)`; `listLines(reviewId)`;
  `sessionLabel(line, seq)` → "S3" / "A2"; `lineLabel(line)` → "Main line" /
  "Variant A · <name>".
- The room is on a line: `/room/<reviewId>` = main line (every existing link
  keeps working); `/room/<reviewId>?line=<lineId>` = that variant. The PartyKit
  room name for a variant is `<reviewId>~<letter>` so a variant's meeting has its
  own live room and scene; main keeps `<reviewId>`. (BL creates variants; here
  just make the room honour `?line=`.)
- `trackerBridge` writes `line_id` and the next `seq` for that line on the
  session and `line_id` + `origin_line_id` on each card.

## 3. A session starts where its line left off
When a room opens on a line that already has sessions:
- The scene starts from the last session's `revision_ids` if the room has no
  scene of its own yet (the review's stored revisions already do most of
  this — build on `sceneFromRevisions`).
- The Capture panel shows a **"Carried over"** group above new cards: the
  line's cards that are still open (status Open / In Review) from earlier
  sessions, read from `tracker_items`, collapsed to one line each ("RISK ·
  Hinge pin wears · from S2"), expandable. They are the same tracker items (no
  duplicates are created); editing one edits the tracker item. They are not
  re-saved as new cards at meeting end.

## 4. The session map
`components/review/SessionMap.tsx`: the review's lines and sessions drawn as
in the approved sketch — main line as a horizontal line of numbered stops,
variants as side lines leaving from their parent session, adopted variants
rejoining with a green stop, dropped ones greyed and dashed. Each stop shows
its label, date and the revision(s) on screen; clicking one opens a small
panel: date, who attended (`participant_count` / names if stored), the
revision(s), the summary if one was generated, and its cards (links into the
tracker). Built with plain SVG/HTML (no new charting library), legible in the
app's light style, horizontally scrollable when long.
Shown in two places:
- the room: a **Sessions** button in the top bar opens it in a panel over the
  canvas (everyone may view);
- the tracker's design-review view, above its cards.

## 5. Tracker
Each card shows its line and session: "Main line · S3" or "Variant A · A2"
next to the existing revision continuity; filter by line within a design
review (All / Main line / each variant). Keep all existing tracker features.

## What must not regress
Existing reviews, links, sessions and cards (backfill!), mode none, BH3
save-on-edit rules, permissions, CAD import. No `any`, no `eslint-disable`,
no `@ts-ignore`, no new `as unknown as`. `scripts/check-public-env.mjs`
`KNOWN` stays empty.

## Tests
Label helpers; main line ensured once; trackerBridge writes line/seq/origin;
room honours `?line=` (PartyKit name); carried-over cards come from the line,
are not duplicated at meeting end; SessionMap renders main + variant + adopted
+ dropped from fixture data and opens a session's panel; tracker labels and
line filter; the backfill SQL text is idempotent.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
Files changed; the exact SQL added; anything deliberately not done.
