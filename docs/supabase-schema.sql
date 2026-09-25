-- Viewpoint Arena — Tracker Schema
-- Run this in: Supabase dashboard → SQL Editor → New query

-- Sessions (one per meeting)
create table if not exists tracker_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  title text not null default 'Design Review',
  ended_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  participant_count int not null default 1,
  model_name text
);

-- Labels snapshot copied from the review at meeting-end (added 2026-09-23).
-- Lets the tracker group sessions by the review's label values at the time.
alter table tracker_sessions
  add column if not exists labels jsonb not null default '{}'::jsonb;

-- Which design review this meeting belonged to, and what was on screen
-- (added 2026-09-24, docs/plan/14-rooms-models-admin-ai.md batch BC).
--
-- `review_id` is review_curations.id. It is NULLABLE and there is deliberately
-- no foreign key: a meeting held in a room nobody curated has a room_id and no
-- curation row, and a key would refuse exactly the write that makes the tracker
-- complete. Same reasoning as review_participants.review_id below.
--
-- `revision_ids` is the set of model_revisions rows that were VISIBLE when the
-- meeting ended — "what was on screen". An array rather than one id because a
-- review can show a product beside a mating part, and Compare shows two
-- revisions of one line at once. Empty for a meeting with no stored revisions,
-- which is every meeting recorded before this column existed.
alter table tracker_sessions
  add column if not exists review_id text;
alter table tracker_sessions
  add column if not exists revision_ids uuid[] not null default '{}';

create index if not exists tracker_sessions_review_idx
  on tracker_sessions (review_id, ended_at desc);

-- Tracker items (one per InsightCard)
create table if not exists tracker_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tracker_sessions(id) on delete cascade,
  type text not null check (type in ('RISK', 'RATIONALE', 'ACTION')),
  title text not null,
  description text not null default '',
  priority text not null default 'Medium' check (priority in ('Critical', 'High', 'Medium', 'Low')),
  status text not null default 'Open' check (status in ('Open', 'In Review', 'Approved', 'Rejected')),
  assignee text,
  due_date date,
  component_reference text,
  department text,
  agent_id text not null default '',
  source_message_ids text[],
  affected_requirement_ids text[],
  impact text,
  mitigation_strategy text,
  design_driver text,
  tradeoff_analysis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A card belongs to a design review and to the revision it was raised on
-- (added 2026-09-24, docs/plan/14-rooms-models-admin-ai.md batch BC).
--
-- This is what makes the tracker able to say "raised on Rev A · still open on
-- Rev C" instead of showing a flat list with no idea which version of the
-- product a risk was about. `raised_on_revision` is a model_revisions.id and is
-- nullable: a card from an ad-hoc session, from a review with no stored
-- revisions, or from before this column existed has nothing to point at, and
-- the tracker renders those without a revision line rather than dropping them.
--
-- `part_node_id` / `part_name` record the mesh a card was pointed at when it was
-- raised, which `component_reference` almost but not quite does: that one is
-- whatever the AI put in a free-text field, and it is only constrained to the
-- model tree's ids when the extraction was given one. These two are what the
-- app knew for certain.
--
-- `source` separates a card an agent wrote from one a person typed in the room
-- (batch BG). 'ai' is the default so every existing row reads as an agent's,
-- which is what it is. `created_by_name` is the display name behind a 'manual'
-- card and stays NULL for an agent's — the agent is already named by agent_id.
alter table tracker_items
  add column if not exists review_id text;
alter table tracker_items
  add column if not exists raised_on_revision uuid;
alter table tracker_items
  add column if not exists part_node_id text;
alter table tracker_items
  add column if not exists part_name text;
alter table tracker_items
  add column if not exists created_by_name text;
alter table tracker_items
  add column if not exists source text not null default 'ai'
    check (source in ('ai', 'manual'));

create index if not exists tracker_items_review_idx on tracker_items (review_id);
create index if not exists tracker_items_revision_idx on tracker_items (raised_on_revision);

-- Comments on items
create table if not exists tracker_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references tracker_items(id) on delete cascade,
  author_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

-- Status history (audit trail)
create table if not exists tracker_status_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references tracker_items(id) on delete cascade,
  status text not null,
  changed_by text not null default 'user',
  note text,
  created_at timestamptz not null default now()
);

-- Auto-update updated_at on tracker_items
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tracker_items_updated_at on tracker_items;
create trigger tracker_items_updated_at
  before update on tracker_items
  for each row execute function update_updated_at();

-- Enable Row Level Security (open read/write for now — lock down later with auth)
alter table tracker_sessions enable row level security;
alter table tracker_items enable row level security;
alter table tracker_comments enable row level security;
alter table tracker_status_history enable row level security;

drop policy if exists "public read sessions" on tracker_sessions;
drop policy if exists "public insert sessions" on tracker_sessions;
drop policy if exists "public update sessions" on tracker_sessions;
create policy "public read sessions"   on tracker_sessions for select using (true);
create policy "public insert sessions" on tracker_sessions for insert with check (true);
create policy "public update sessions" on tracker_sessions for update using (true);

drop policy if exists "public read items" on tracker_items;
drop policy if exists "public insert items" on tracker_items;
drop policy if exists "public update items" on tracker_items;
drop policy if exists "public delete items" on tracker_items;
create policy "public read items"   on tracker_items for select using (true);
create policy "public insert items" on tracker_items for insert with check (true);
create policy "public update items" on tracker_items for update using (true);
create policy "public delete items" on tracker_items for delete using (true);

drop policy if exists "public read comments" on tracker_comments;
drop policy if exists "public insert comments" on tracker_comments;
create policy "public read comments"   on tracker_comments for select using (true);
create policy "public insert comments" on tracker_comments for insert with check (true);

drop policy if exists "public read history" on tracker_status_history;
drop policy if exists "public insert history" on tracker_status_history;
create policy "public read history"   on tracker_status_history for select using (true);
create policy "public insert history" on tracker_status_history for insert with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Review curations (the pre-meeting curated content: title, description,
-- model, viewpoints, pins, agenda slides). Whole nested structure is stored
-- as jsonb to mirror the TypeScript ReviewDraft type. Multi-user editable;
-- the URL /review/:id/setup is the share key.
--
-- NOTE: imported GLB/OBJ files are NOT persisted server-side in v1 — only
-- the preset model TYPE survives across sessions. TODO: move imported files
-- to a Supabase Storage bucket ('review-models' with public read) and store
-- the file's URL instead of base64.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists review_curations (
  id text primary key,
  title text not null default 'Untitled Review',
  description text not null default '',
  asset jsonb not null default '{}'::jsonb,
  viewpoints jsonb not null default '[]'::jsonb,
  pins jsonb not null default '[]'::jsonb,
  agenda jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Requirements travel with the review (added 2026-09-22). A separate column
-- rather than a field inside another blob, so PostgREST selects it like the
-- rest. Idempotent: install.sh re-applies this file on every run, which is
-- how an existing install gets the column.
alter table review_curations
  add column if not exists requirements jsonb not null default '[]'::jsonb;

-- Team roster travels with the review (added 2026-09-22). People who can be
-- assigned to tracker items and insight cards. Idempotent like requirements.
alter table review_curations
  add column if not exists team jsonb not null default '[]'::jsonb;

-- User-defined label values (added 2026-09-23). Keys are field ids from
-- review_label_fields; values are free-text or chosen from the field's value
-- list. Stored on the review so the tracker can group by what the review
-- said at the time. Idempotent like requirements/team.
alter table review_curations
  add column if not exists labels jsonb not null default '{}'::jsonb;

-- Per-review visibility (added 2026-09-23). When false the review still
-- exists and the link still works, but it does not appear in the lobby's
-- Saved Reviews list. Default true so every existing review keeps behaving
-- exactly as before. Idempotent like the other add-column blocks.
alter table review_curations
  add column if not exists listed boolean not null default true;

-- Who owns this design review, and whether it has been put away
-- (added 2026-09-24, docs/plan/14-rooms-models-admin-ai.md batch BC).
--
-- `owner_id` is a GoTrue account id. NULLABLE, and NULL for every review that
-- existed before accounts did: those were created on an install with no
-- identity, so there is nobody to name. lib/reviews/roles.ts reads a NULL owner
-- as "unclaimed" and treats this install's admins as owners of it, and the admin
-- console's claim action (batch BH) is what fills the column in.
--
-- `archived` is the admin console's "put this away" (batch BE). Default false so
-- every existing review keeps appearing exactly where it does today.
alter table review_curations
  add column if not exists owner_id uuid;
alter table review_curations
  add column if not exists archived boolean not null default false;

create index if not exists review_curations_updated_at_idx
  on review_curations (updated_at desc);

drop trigger if exists review_curations_updated_at on review_curations;
create trigger review_curations_updated_at
  before update on review_curations
  for each row execute function update_updated_at();

alter table review_curations enable row level security;

drop policy if exists "public read curations" on review_curations;
drop policy if exists "public insert curations" on review_curations;
drop policy if exists "public update curations" on review_curations;
drop policy if exists "public delete curations" on review_curations;
create policy "public read curations"   on review_curations for select using (true);
create policy "public insert curations" on review_curations for insert with check (true);
create policy "public update curations" on review_curations for update using (true);
create policy "public delete curations" on review_curations for delete using (true);

-- Enable Supabase Realtime so multiple curators editing the same review see
-- each other's changes live (used by the setup page to merge concurrent
-- contributions before the meeting). Wrapped in a DO block to ignore the
-- "already member of publication" error on re-runs.
do $$
begin
  alter publication supabase_realtime add table review_curations;
-- duplicate_object: already a member (a re-run). undefined_object: plain
-- Postgres has no supabase_realtime publication; the schema is complete anyway.
exception when duplicate_object or undefined_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Label fields (added 2026-09-23). User-defined grouping dimensions: one team
-- groups by Product → Variant → Phase, another by Programme → Gate. The app
-- ships suggested fields and lets people change them. values text[] is empty
-- when the field is free-text.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists review_label_fields (
  id text primary key,
  name text not null,
  position int not null default 0,
  values text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table review_label_fields enable row level security;

drop policy if exists "public read label fields" on review_label_fields;
drop policy if exists "public insert label fields" on review_label_fields;
drop policy if exists "public update label fields" on review_label_fields;
drop policy if exists "public delete label fields" on review_label_fields;
create policy "public read label fields"   on review_label_fields for select using (true);
create policy "public insert label fields" on review_label_fields for insert with check (true);
create policy "public update label fields" on review_label_fields for update using (true);
create policy "public delete label fields" on review_label_fields for delete using (true);

-- NOT SEEDED. The fields are the user's own vocabulary (user, 2026-09-23:
-- "the labels should be set by the user, not pre filled"), so the table
-- starts empty and the tracker's "Label fields" screen is where they are
-- created. Shipping Product/Variant/Phase made our guess look like a rule.

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit events (added 2026-09-23). A minimal log of grants: who admitted whom,
-- who declined whom, and who changed the join policy. Written by the room
-- server (party/room.server.ts), read by the admin screen (lib/auditRepo.ts).
--
-- This is NOT a tamper-proof ledger. Names are self-asserted — the log records
-- what the server saw happen, described in those terms. A design review's
-- contents are commercially sensitive; silent grants are not acceptable, and
-- this is the minimum record that makes them visible.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists audit_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  action text not null,
  room_id text not null,
  actor_name text not null default '',
  actor_id text not null default '',
  subject_name text not null default '',
  subject_id text not null default '',
  detail text not null default ''
);

create index if not exists audit_events_at_idx on audit_events (at desc);

alter table audit_events enable row level security;

-- RLS policies matching the rest of this schema: there is no identity to key
-- on (no accounts, names are self-asserted), so the policies are open. The
-- database is reachable only through the app's origin, and the front-door
-- password is what guards that origin.
drop policy if exists "public read audit events" on audit_events;
drop policy if exists "public insert audit events" on audit_events;
create policy "public read audit events"   on audit_events for select using (true);
create policy "public insert audit events" on audit_events for insert with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Review participants (added 2026-09-24, docs/plan/13-identity.md batch AZ).
-- "The reviews I have been part of": one row per person per room, written when
-- a SIGNED-IN person is admitted to a room (lib/reviewParticipantsRepo.ts,
-- called from pages/RoomPage.tsx) and read back by the lobby's "Your reviews".
--
-- review_id is the room id, which for a curated review IS review_curations.id.
-- There is deliberately NO foreign key to it: an ad-hoc session has a room id
-- and no curation row, and a key would refuse exactly the write that makes the
-- list useful. The lobby joins by id with a second query and falls back to
-- "Session <short id>" when there is no curation.
--
-- Unlike every other table here, this one is NOT open. user_id defaults to
-- auth.uid() and each policy compares against auth.uid(), so a caller can write
-- and read only their own rows — who took part in a commercially sensitive
-- design review is nobody else's business, and the anon key the browser bundle
-- carries has no auth.uid() and so can read nothing here at all. A deployment
-- on identity.mode 'none' has no signed-in callers and never writes a row.
--
-- That this loads on a default install (identity profile OFF) is not an
-- assumption: the `auth` schema, the auth.uid() helper and the `authenticated`
-- role all come from the supabase/postgres image's own init-scripts, which
-- docker-compose.yml documents as running BEFORE the migrations/ directory
-- this file is mounted into. GoTrue adds tables inside `auth` at run time; it
-- is not what provides the schema (see deploy/db/auth-init.sql, which creates
-- nothing and only re-owns and re-grants what the image already made).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists review_participants (
  review_id text not null,
  user_id uuid not null default auth.uid(),
  role text not null default 'participant' check (role in ('host', 'participant')),
  first_joined_at timestamptz not null default now(),
  last_joined_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

-- The only read is "my rows, newest first", which RLS has already narrowed to
-- one user_id.
create index if not exists review_participants_user_idx
  on review_participants (user_id, last_joined_at desc);

alter table review_participants enable row level security;

-- `authenticated` only, and no delete policy: a participant row is a record,
-- not something the app ever removes. The update policy's USING doubles as its
-- WITH CHECK (Postgres applies the same expression to both), so a row can be
-- bumped — last_joined_at, or a role upgraded to 'host' — but never moved to
-- another user_id.
drop policy if exists "own review participants select" on review_participants;
drop policy if exists "own review participants insert" on review_participants;
drop policy if exists "own review participants update" on review_participants;
create policy "own review participants select" on review_participants
  for select to authenticated using (user_id = auth.uid());
create policy "own review participants insert" on review_participants
  for insert to authenticated with check (user_id = auth.uid());
create policy "own review participants update" on review_participants
  for update to authenticated using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Design review members (added 2026-09-24, docs/plan/14-rooms-models-admin-ai.md
-- batch BC). One row per SIGNED-IN account per design review, with the role that
-- account holds in it. This is the table lib/reviews/roles.ts's resolveRole
-- reads, and the one the room server reads to decide whether a scene change is
-- this person's to make.
--
-- Distinct from review_participants, which is "the reviews I have been part of"
-- — a record of attendance, keyed on the person, that they alone can read. This
-- one is the review's own roster: who is allowed to do what in it, which every
-- participant's screen has to be able to render (the People tab, the "Paco is
-- editing the review" line in batch BH) and which the room server has to be able
-- to read with the anon key it holds.
--
-- Guests are never members. There is nothing to key a row on: a guest has no
-- account, and a row keyed on a self-asserted name would be a permission granted
-- to whoever typed it. resolveRole answers 'guest' for them instead, which
-- lib/reviews/roles.ts's can() keeps out of addCard and everything above it.
--
-- 'owner' is a role here as well as review_curations.owner_id, so the roster a
-- screen renders and the column an ownership transfer writes cannot disagree:
-- transferring ownership writes both.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists review_members (
  review_id text not null,
  user_id uuid not null,
  role text not null default 'participant'
    check (role in ('owner', 'editor', 'participant')),
  added_at timestamptz not null default now(),
  added_by uuid,
  primary key (review_id, user_id)
);

create index if not exists review_members_user_idx on review_members (user_id);

alter table review_members enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Model revisions (added 2026-09-24, docs/plan/14-rooms-models-admin-ai.md
-- batch BC). Every version of every model line a design review has ever shown.
--
-- The FILE is not here. `hash` is the SHA-256 batch BA stored it under, and
-- /api/models/<hash> serves the bytes; this row is the review's record that it
-- showed that file, as that revision of that line, on that date, put there by
-- that person. Small enough to read on every open, which is what lets a review
-- rebuild its scene from history instead of from the single model its curation
-- row happens to name.
--
-- `unique (review_id, line, revision)` is the whole point of the table: two
-- uploads into the same review cannot both be Rev B of the bracket. The letter
-- is computed by lib/scene/roomScene.nextRevisionFor from the line's newest, so
-- the constraint is what catches two people importing at the same moment — the
-- second insert fails and the importer is told to try again rather than silently
-- overwriting the first one's history.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists model_revisions (
  id uuid primary key default gen_random_uuid(),
  review_id text not null,
  line text not null,
  revision text not null,
  hash text not null,
  file_name text not null default '',
  size bigint not null default 0,
  notes text not null default '',
  uploaded_by uuid,
  uploaded_by_name text not null default '',
  created_at timestamptz not null default now(),
  unique (review_id, line, revision)
);

create index if not exists model_revisions_review_idx
  on model_revisions (review_id, created_at);
create index if not exists model_revisions_hash_idx on model_revisions (hash);

alter table model_revisions enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS for the two tables above.
--
-- READ is open to anon and authenticated for any review, and has to be: a
-- participant's screen renders the model tree and the People tab from these two
-- tables, and on a deployment whose identity.mode is 'none' that screen holds
-- only the anon key. This is also what the room server reads to work out a
-- signed-in person's role — it has the anon key and nothing else.
--
-- WRITE is open too, which is the part worth saying plainly:
--
--   ROLE ENFORCEMENT IS IN THE APP AND IN THE ROOM SERVER, NOT HERE.
--   lib/reviews/roles.ts decides who may add a revision, manage people or edit
--   the review, and party/room.server.ts refuses a scene change from somebody
--   whose role does not allow it. The database does not check any of that yet.
--   Locking these tables down per role is a LATER HARDENING STEP, and it cannot
--   be done by copying the policies above: it needs a SECURITY DEFINER helper
--   that answers "what role does auth.uid() hold in this review", which only
--   means anything on a deployment with accounts at all.
--
-- The reason it is open rather than denied is the same reason every other table
-- in this file is open: a `mode: 'none'` install — the default self-hosted one —
-- has no signed-in callers, so an auth.uid()-keyed policy would refuse the only
-- writes that ever happen and the app would not work at all. What guards such an
-- install is the front-door password on the origin, exactly as it does for
-- review_curations and tracker_items.
-- ─────────────────────────────────────────────────────────────────────────────
-- Membership decides who may edit a review and run its meetings, and the room
-- server reads it with the public anon key. So it is readable by everyone but
-- writable only narrowly: a signed-in person may add THEMSELVES as owner of a
-- review they already own (the row ensureReviewOwner writes on creation).
-- Adding editors and participants goes through the api with the service role
-- (the People tab, batch BH). Open write policies here would let anyone holding
-- the public key make themselves owner or editor of any review.
drop policy if exists "public read review members" on review_members;
drop policy if exists "public insert review members" on review_members;
drop policy if exists "public update review members" on review_members;
drop policy if exists "public delete review members" on review_members;
drop policy if exists "owner adds themselves" on review_members;
drop policy if exists "owner updates own row" on review_members;
create policy "public read review members" on review_members for select using (true);
create policy "owner adds themselves" on review_members for insert to authenticated
  with check (
    user_id = auth.uid() and role = 'owner'
    and exists (select 1 from review_curations c where c.id = review_id and c.owner_id = auth.uid())
  );
create policy "owner updates own row" on review_members for update to authenticated
  using (user_id = auth.uid() and role = 'owner')
  with check (
    user_id = auth.uid() and role = 'owner'
    and exists (select 1 from review_curations c where c.id = review_id and c.owner_id = auth.uid())
  );

-- review_curations stays open to the anon key (a 'none' install writes it that
-- way), so its owner_id needs its own guard: through the public API it can be
-- set only to yourself, only while it is still empty, and never changed after.
-- The service role and database administrators are not restricted.
create or replace function guard_review_owner() returns trigger
language plpgsql as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.owner_id is not null and new.owner_id is distinct from auth.uid() then
      raise exception 'a design review''s owner can only be the person creating it'
        using errcode = '42501';
    end if;
  elsif new.owner_id is distinct from old.owner_id then
    if old.owner_id is null and new.owner_id = auth.uid() then
      return new;
    end if;
    raise exception 'the owner of a design review cannot be changed here'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists review_curations_guard_owner on review_curations;
create trigger review_curations_guard_owner
  before insert or update on review_curations
  for each row execute function guard_review_owner();

drop policy if exists "public read model revisions" on model_revisions;
drop policy if exists "public insert model revisions" on model_revisions;
drop policy if exists "public update model revisions" on model_revisions;
create policy "public read model revisions"   on model_revisions for select using (true);
create policy "public insert model revisions" on model_revisions for insert with check (true);
create policy "public update model revisions" on model_revisions for update using (true);
-- No delete policy: a revision is the review's history, and the admin console's
-- "delete a revision" (batch BE) runs through the api with a service-role token,
-- which has BYPASSRLS and does not need one.

-- ─────────────────────────────────────────────────────────────────────────────
-- Lines of a design review (added 2026-09-25, docs/plan/15-sessions-and-variants.md
-- batch BK). A design review is the lasting thing; inside it a LINE is a
-- continuous run of meetings, and a session belongs to one.
--
-- Every review has exactly one MAIN line — the meetings everybody means when they
-- say "the review met on Tuesday" — and may have VARIANTS: a named side line
-- started from one of the main line's sessions, to try a different answer without
-- losing the one the main line is holding. `parent_session_id` is that session,
-- and it is what the session map draws the variant leaving from.
--
-- On screen these are "Main line" and "Variant A". The words branch, fork, merge
-- and commit never appear: the people using this are hardware engineers and the
-- plan is explicit that the programming metaphor must not show through.
--
-- `letter` is a variant's A, B, C … and is NULL for the main line, which needs no
-- letter because there is only ever one of it. It is part of
-- `unique (review_id, kind, letter)` so two variants of one review cannot both be
-- Variant A, and it is the suffix of a variant's live room name
-- (`<reviewId>~<letter>`, lib/reviews/lines.partyRoomName) — which is why it is
-- assigned once and never reused, even after the variant is dropped.
--
-- `status` is the variant's fate: 'active' while it is being explored, 'adopted'
-- when its model and cards have been taken into the main line, 'dropped' when it
-- was not. Both are kept for the record rather than deleted — a dropped variant is
-- an answer the review tried and rejected, and that is worth seeing on the map.
-- `closed_at` is when it became one or the other. Batch BK only ever writes
-- 'active'; adopting and dropping are batch BL.
--
-- review_id has deliberately NO foreign key, for the same reason
-- tracker_sessions.review_id has none: a line belongs to a review by id, and a
-- key would refuse the write for any room that has no curation row.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists review_lines (
  id uuid primary key default gen_random_uuid(),
  review_id text not null,
  kind text not null check (kind in ('main', 'variant')),
  name text not null default '',
  letter text,
  parent_session_id uuid references tracker_sessions(id),
  status text not null default 'active' check (status in ('active', 'adopted', 'dropped')),
  created_by uuid,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (review_id, kind, letter)
);

-- Exactly one main line per design review. A partial index rather than a column
-- constraint because `unique (review_id, kind, letter)` cannot express it: the
-- main line's letter is NULL, and two NULLs are distinct to a unique constraint,
-- so without this nothing would stop a second main line appearing.
create unique index if not exists review_lines_one_main_per_review
  on review_lines (review_id) where kind = 'main';

create index if not exists review_lines_review_idx
  on review_lines (review_id, created_at);

alter table review_lines enable row level security;

-- Written exactly the way model_revisions is: open read, open insert, open
-- update, no delete (a line is the review's history). The role check — who may
-- start a variant, who may adopt or drop one — is in the app, not here, for the
-- reason set out in the model_revisions block below: a `mode: 'none'` install has
-- no signed-in callers, so an auth.uid()-keyed policy would refuse every write.
-- Batch BL is the one that tightens who may create a variant.
drop policy if exists "public read review lines" on review_lines;
drop policy if exists "public insert review lines" on review_lines;
drop policy if exists "public update review lines" on review_lines;
create policy "public read review lines"   on review_lines for select using (true);
create policy "public insert review lines" on review_lines for insert with check (true);
create policy "public update review lines" on review_lines for update using (true);

-- Which line a meeting belongs to, and which number it is on that line
-- (added 2026-09-25, docs/plan/15-sessions-and-variants.md batch BK).
--
-- `seq` is the number in the label the map and the tracker show: S1, S2, S3 on
-- the main line, A1, A2 on Variant A. Stored rather than derived from
-- `row_number() over (order by ended_at)` because a line's meetings are numbered
-- by the order they happened in and two of them can end inside the same second —
-- and because a session that is later deleted must not renumber the ones after
-- it, which would silently change what every card raised in them says.
--
-- Both NULLABLE: a meeting recorded before this column existed has no line until
-- the backfill below gives it one, and a meeting held in a room nobody curated
-- (review_id NULL) never gets one at all. lib/reviews/lines.sessionLabel answers
-- null for a session with no seq, and the tracker then renders the card without a
-- line rather than inventing "S0".
alter table tracker_sessions
  add column if not exists line_id uuid;
alter table tracker_sessions
  add column if not exists seq int;

create index if not exists tracker_sessions_line_idx
  on tracker_sessions (line_id, seq);

-- Which line a card belongs to, and which one it was raised on
-- (added 2026-09-25, docs/plan/15-sessions-and-variants.md batch BK).
--
-- Two columns because they come apart, and the moment they do is the whole point
-- of a variant. `line_id` is the line the card is ON now — where a reviewer
-- looking at the main line finds it. `origin_line_id` is the line it was RAISED
-- on, and never changes: adopting a variant into the main line (batch BL) moves
-- the card's line_id and leaves its origin alone, which is what lets the tracker
-- say "Raised in Variant A · adopted 12 Oct" instead of quietly rewriting where a
-- risk came from.
--
-- `adopted_at` is that moment, and `closed_reason` is why a card that is closed is
-- closed when the reason is not one of the four statuses — "dropped with the
-- variant" being the one batch BL writes. Both nullable and both unused in BK.
alter table tracker_items
  add column if not exists line_id uuid;
alter table tracker_items
  add column if not exists origin_line_id uuid;
alter table tracker_items
  add column if not exists adopted_at timestamptz;
alter table tracker_items
  add column if not exists closed_reason text;

create index if not exists tracker_items_line_idx on tracker_items (line_id);

-- ─── Backfill: give every review that has met a main line ────────────────────
--
-- A design review that existed before this batch has sessions and cards and no
-- line, and the moment it is opened the map, the tracker's line filter and the
-- "carried over" group all ask which line those meetings are on. So the answer is
-- written here, once, for every review that has met: its sessions and their cards
-- join a main line, numbered in the order they happened.
--
-- EVERY STATEMENT BELOW IS SAFE TO RUN TWICE, because install.sh re-applies this
-- whole file on every run and an upgrade is exactly a re-run. Each one is keyed on
-- "is still missing" (NOT EXISTS, `is null`) rather than on "has this run before",
-- and the insert conflicts with review_lines_one_main_per_review and does nothing
-- — so a second run adds no line, renumbers no session, and never overwrites a
-- line or an origin that batch BL has since moved.
insert into review_lines (review_id, kind, name, letter, status, created_at)
select s.review_id, 'main', 'Main line', null, 'active', min(s.ended_at)
from tracker_sessions s
where s.review_id is not null
  and not exists (
    select 1 from review_lines l where l.review_id = s.review_id and l.kind = 'main'
  )
group by s.review_id
on conflict do nothing;

update tracker_sessions s
set line_id = l.id
from review_lines l
where l.kind = 'main'
  and l.review_id = s.review_id
  and s.line_id is null;

with numbered as (
  select s.id, row_number() over (partition by s.line_id order by s.ended_at, s.id) as n
  from tracker_sessions s
  where s.line_id is not null
)
update tracker_sessions s
set seq = numbered.n
from numbered
where s.id = numbered.id
  and s.seq is null;

-- The card's line is its meeting's line. origin_line_id is set from the same row
-- and is the one that stays: coalesce rather than assignment, so a card BL has
-- already adopted into the main line keeps the variant it was raised on.
update tracker_items i
set line_id = coalesce(i.line_id, s.line_id),
    origin_line_id = coalesce(i.origin_line_id, s.line_id)
from tracker_sessions s
where s.id = i.session_id
  and s.line_id is not null
  and (i.line_id is null or i.origin_line_id is null);

-- ─────────────────────────────────────────────────────────────────────────────
-- Application settings (added 2026-09-24, docs/plan/14-rooms-models-admin-ai.md
-- batch BF). One row per setting, written from the admin console's AI section
-- and read back by the server-side AI router (lib/ai/settingsStore.ts).
--
-- `value` holds the non-secret half of a setting (which provider, which model,
-- an endpoint URL); `secret` holds the encrypted half (an API key, a webhook
-- header value) as the `v1:<iv>:<tag>:<ct>` string lib/ai/secretBox.ts writes.
-- The column is text rather than bytea so PostgREST can carry it as JSON and so
-- a dump of this table is still not a dump of the keys: the ciphertext is only
-- readable with a key derived from JWT_SECRET, which lives in the api
-- container's environment and not here.
--
-- THIS TABLE IS THE ONE EXCEPTION TO THE REST OF THIS FILE. Every other table
-- here is wide open on purpose — the app has no per-person identity to key a
-- policy on, and the front-door password guards the origin instead. This one
-- holds credentials, so RLS is enabled with NO POLICIES AT ALL, which in
-- Postgres means deny: the anon and authenticated roles — the two a browser's
-- Supabase key can select — get nothing, not even a row count. Only a request
-- carrying a service-role JWT reaches it, because that role has BYPASSRLS, and
-- only the api container can mint one (api/_lib/serviceRole.ts signs it with
-- JWT_SECRET, which never reaches a browser).
--
-- So the browser cannot read these settings, cannot write them, and cannot
-- discover that they exist. The admin console reaches them only through
-- /api/admin/ai, which is behind requireAdmin and which returns
-- { set: true, last4 } for a secret instead of the secret.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  secret text,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

alter table app_settings enable row level security;

-- No policies, and that is the point: see the block comment above. The drops
-- are here so a re-run of this file removes any policy an earlier version, or
-- a well-meaning `grant … to anon` added by hand, may have left behind. An
-- enabled RLS table with zero policies denies everything to every non-bypass
-- role, which is exactly what a credentials table wants.
do $$
declare
  policy_name text;
begin
  for policy_name in
    select polname from pg_policy
    where polrelid = 'public.app_settings'::regclass
  loop
    execute format('drop policy %I on public.app_settings', policy_name);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants for the self-hosted PostgREST stack.
--
-- On a bundled install the deploy/db/roles.sql init script creates the anon
-- and authenticated roles and sets default privileges, so tables created AFTER
-- that script already have the right grants. But the default-privileges mechanism
-- does not retroactively cover tables that already exist (e.g. after an upgrade
-- that adds a new table before the roles init ran). These explicit grants are
-- idempotent and cover both cases.
--
-- On hosted Supabase the roles already exist and the grants are redundant but
-- harmless. On plain Postgres (no anon role) the DO block is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant usage, select on all sequences in schema public to anon, authenticated;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- …except app_settings, which the block above just granted along with every
-- other table. This revoke is LAST ON PURPOSE: `grant … on all tables in
-- schema public` is evaluated when it runs, so it picks up app_settings like
-- any other table, and a table-level grant is checked BEFORE Row Level
-- Security. Without this, the two browser roles would have select on the
-- credentials table and RLS-with-no-policies would be the only thing stopping
-- them — one mechanism instead of two, and the weaker one to bet a set of API
-- keys on. The supabase/postgres image also installs a DEFAULT PRIVILEGES rule
-- that grants new tables to anon and authenticated as they are created, which
-- is why revoking here is not enough on its own for a table added later: any
-- new table holding a secret needs its own revoke in this same position.
--
-- Idempotent like everything else in this file, so install.sh re-applying it on
-- every run keeps the two mechanisms agreeing after an upgrade.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.app_settings from anon, authenticated;
  end if;
end $$;
