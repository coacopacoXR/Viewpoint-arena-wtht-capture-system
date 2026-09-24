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
