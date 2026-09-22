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

-- Seed suggested fields on first run ONLY. If the user deleted a field,
-- re-running install.sh must not resurrect it. The `where not exists` guard
-- checks whether ANY row exists — if the table is empty, insert the seeds.
insert into review_label_fields (id, name, position, values)
select id, name, position, values
from (values
  ('product',  'Product',  0, array['Headphones', 'Bicycle', 'Synth']::text[]),
  ('variant',  'Variant',  1, array['Mk I', 'Mk II', 'Prototype']::text[]),
  ('phase',    'Phase',    2, array['Concept', 'Detailed Design', 'Validation']::text[])
) as seeds(id, name, position, values)
where not exists (select 1 from review_label_fields);

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
