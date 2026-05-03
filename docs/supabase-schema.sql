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

create trigger tracker_items_updated_at
  before update on tracker_items
  for each row execute function update_updated_at();

-- Enable Row Level Security (open read/write for now — lock down later with auth)
alter table tracker_sessions enable row level security;
alter table tracker_items enable row level security;
alter table tracker_comments enable row level security;
alter table tracker_status_history enable row level security;

create policy "public read sessions" on tracker_sessions for select using (true);
create policy "public insert sessions" on tracker_sessions for insert with check (true);
create policy "public update sessions" on tracker_sessions for update using (true);

create policy "public read items" on tracker_items for select using (true);
create policy "public insert items" on tracker_items for insert with check (true);
create policy "public update items" on tracker_items for update using (true);
create policy "public delete items" on tracker_items for delete using (true);

create policy "public read comments" on tracker_comments for select using (true);
create policy "public insert comments" on tracker_comments for insert with check (true);

create policy "public read history" on tracker_status_history for select using (true);
create policy "public insert history" on tracker_status_history for insert with check (true);
