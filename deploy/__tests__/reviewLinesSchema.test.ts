// docs/supabase-schema.sql — review_lines, and the backfill that gives every review
// that has met a main line.
//
// docs/plan/15-sessions-and-variants.md batch BK. install.sh re-applies this file on
// EVERY run, so an upgrade is exactly a second run of it: a statement that is not
// idempotent does not fail loudly at install time, it fails on somebody's database
// six weeks later with a duplicate key or a half-renumbered history. These tests parse
// the file as text and pin the invariants that make a re-run safe, the way
// deploy/__tests__/databaseLayer.test.ts and identityLayer.test.ts do for theirs.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const SCHEMA = readFileSync(join(REPO_ROOT, 'docs/supabase-schema.sql'), 'utf8');

/** The file with its `--` comments taken out, so an assertion cannot match prose. */
const SQL = SCHEMA.split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

/** Everything from a marker to the next section rule, with comments stripped. */
function section(marker: string): string {
  const start = SQL.indexOf(marker);
  expect(start, `no "${marker}" in the schema`).toBeGreaterThanOrEqual(0);
  return SQL.slice(start);
}

const LINES_TABLE = SQL.slice(
  SQL.indexOf('create table if not exists review_lines'),
  SQL.indexOf('create index if not exists review_lines_review_idx'),
);

// ─── The table ──────────────────────────────────────────────────────────────

describe('docs/supabase-schema.sql — review_lines', () => {
  it('creates the table only if it is not there, so a re-run cannot fail', () => {
    expect(SQL).toContain('create table if not exists review_lines');
  });

  it('allows exactly two kinds of line and three fates, both as checks', () => {
    expect(LINES_TABLE).toContain("kind text not null check (kind in ('main', 'variant'))");
    expect(LINES_TABLE).toContain("status text not null default 'active' check (status in ('active', 'adopted', 'dropped'))");
  });

  it('keeps a variant\'s letter, its parent session and who started it', () => {
    expect(LINES_TABLE).toContain('letter text');
    expect(LINES_TABLE).toContain('parent_session_id uuid references tracker_sessions(id)');
    expect(LINES_TABLE).toContain('created_by uuid');
    expect(LINES_TABLE).toContain('created_by_name text');
    expect(LINES_TABLE).toContain('closed_at timestamptz');
  });

  it('stops two variants of one review being the same letter', () => {
    expect(LINES_TABLE).toContain('unique (review_id, kind, letter)');
  });

  it('stops a review having two main lines, which the unique key cannot', () => {
    // The main line's letter is NULL and two NULLs are distinct to a unique
    // constraint, so without this partial index nothing would stop a second one.
    expect(SQL).toContain(
      'create unique index if not exists review_lines_one_main_per_review',
    );
    expect(SQL).toMatch(
      /on review_lines \(review_id\) where kind = 'main'/,
    );
  });

  it('has no foreign key on review_id, like every other review_id in this file', () => {
    // A key would refuse the write for a room that has no curation row, which is
    // exactly the write that makes the tracker complete.
    expect(LINES_TABLE).not.toContain('review_id text not null references');
    expect(LINES_TABLE).toContain('review_id text not null');
  });
});

describe('docs/supabase-schema.sql — review_lines row level security', () => {
  it('is enabled, and written the way model_revisions is', () => {
    expect(SQL).toContain('alter table review_lines enable row level security');
    expect(SQL).toContain('create policy "public read review lines"   on review_lines for select using (true)');
    expect(SQL).toContain('create policy "public insert review lines" on review_lines for insert with check (true)');
    expect(SQL).toContain('create policy "public update review lines" on review_lines for update using (true)');
  });

  it('drops each policy before creating it, so a re-run cannot fail on a duplicate', () => {
    for (const name of ['public read review lines', 'public insert review lines', 'public update review lines']) {
      const drop = SQL.indexOf(`drop policy if exists "${name}" on review_lines`);
      const create = SQL.indexOf(`create policy "${name}"`);
      expect(drop, `no drop for "${name}"`).toBeGreaterThanOrEqual(0);
      expect(create, `no create for "${name}"`).toBeGreaterThan(drop);
    }
  });

  it('has no delete policy: a line is the review\'s history', () => {
    expect(SQL).not.toContain('on review_lines for delete');
  });
});

// ─── The columns this batch adds ────────────────────────────────────────────

describe('docs/supabase-schema.sql — the new columns', () => {
  const added = [
    ['tracker_sessions', 'line_id uuid'],
    ['tracker_sessions', 'seq int'],
    ['tracker_items', 'line_id uuid'],
    ['tracker_items', 'origin_line_id uuid'],
    ['tracker_items', 'adopted_at timestamptz'],
    ['tracker_items', 'closed_reason text'],
  ] as const;

  it.each(added)('adds %s.%s only if it is not there', (table, column) => {
    const statement = `alter table ${table}\n  add column if not exists ${column};`;
    expect(SQL).toContain(statement);
  });

  it('leaves all of them nullable, so a row written before this batch still reads', () => {
    for (const [, column] of added) {
      expect(SQL).toContain(`add column if not exists ${column};`);
      expect(SQL).not.toContain(`add column if not exists ${column} not null`);
    }
  });

  it('indexes the two lookups the app makes: a line\'s sessions, and a line\'s cards', () => {
    expect(SQL).toContain('create index if not exists tracker_sessions_line_idx');
    expect(SQL).toContain('create index if not exists tracker_items_line_idx');
  });
});

// ─── The backfill ───────────────────────────────────────────────────────────

describe('docs/supabase-schema.sql — the backfill, run twice', () => {
  const BACKFILL = section('insert into review_lines (review_id, kind, name, letter, status, created_at)');

  it('gives every review that has met a main line', () => {
    expect(BACKFILL).toContain("select s.review_id, 'main', 'Main line', null, 'active'");
    expect(BACKFILL).toContain('from tracker_sessions s');
    expect(BACKFILL).toContain('where s.review_id is not null');
  });

  it('adds no second main line on a re-run, twice over', () => {
    // NOT EXISTS so a second run does not even try, and ON CONFLICT so two installs
    // of the file running at once — or a partial earlier run — cannot both win.
    expect(BACKFILL).toMatch(/not exists \(\s*select 1 from review_lines l where l\.review_id = s\.review_id and l\.kind = 'main'\s*\)/);
    expect(BACKFILL).toContain('on conflict do nothing');
  });

  it('gives a review with no sessions no line at all', () => {
    // A review that has never met has nothing to number, and a main line invented for
    // it would appear on a map with no stops on it.
    expect(BACKFILL).toContain('where s.review_id is not null');
    expect(BACKFILL).toContain('group by s.review_id');
  });

  it('puts a session on its review\'s main line only while it is on none', () => {
    const sessions = section('update tracker_sessions s\nset line_id = l.id');
    expect(sessions).toContain('and s.line_id is null');
    expect(sessions).toContain("where l.kind = 'main'");
  });

  it('numbers the sessions by the order they ended in, and numbers each one once', () => {
    const numbered = section('with numbered as (');
    expect(numbered).toContain('row_number() over (partition by s.line_id order by s.ended_at, s.id)');
    // Without `s.seq is null` a re-run would renumber every session, and a session
    // added between the two runs would shift the numbers of all the ones after it —
    // silently changing what every card raised in them says it was raised in.
    expect(numbered).toContain('and s.seq is null');
    // Ties broken by id, because two meetings of one review can end inside the same
    // second and a map whose stops swap places between two runs looks broken.
    expect(numbered).toContain('order by s.ended_at, s.id');
  });

  it('puts a card on its meeting\'s line without overwriting a line batch BL moved', () => {
    const items = section('update tracker_items i');
    // coalesce, not assignment: adopting a variant into the main line moves line_id
    // and leaves origin_line_id alone, and a re-run of the backfill must not undo
    // either half of that.
    expect(items).toContain('set line_id = coalesce(i.line_id, s.line_id)');
    expect(items).toContain('origin_line_id = coalesce(i.origin_line_id, s.line_id)');
    expect(items).toContain('and (i.line_id is null or i.origin_line_id is null)');
  });

  it('leaves a card whose meeting has no line alone', () => {
    const items = section('update tracker_items i');
    expect(items).toContain('and s.line_id is not null');
  });
});

// ─── The whole file, re-run ─────────────────────────────────────────────────

describe('docs/supabase-schema.sql — the file is safe to apply twice', () => {
  it('creates every table and every index conditionally', () => {
    for (const match of SQL.matchAll(/create (?:unique )?(?:table|index) (?!if not exists)/g)) {
      expect.fail(`an unconditional create: ${SQL.slice(match.index, (match.index ?? 0) + 80)}`);
    }
  });

  it('adds every column conditionally', () => {
    for (const match of SQL.matchAll(/add column (?!if not exists)/g)) {
      expect.fail(`an unconditional add column: ${SQL.slice(match.index, (match.index ?? 0) + 80)}`);
    }
  });

  it('drops every policy before it creates it', () => {
    for (const match of SQL.matchAll(/create policy "([^"]+)"/g)) {
      const name = match[1] ?? '';
      const created = match.index ?? 0;
      const dropped = SQL.indexOf(`drop policy if exists "${name}"`);
      // app_settings' policies are dropped by a DO block over pg_policy instead, which
      // is the one place a per-name drop is not the mechanism.
      if (SQL.slice(created, created + 200).includes('on app_settings')) continue;
      expect(dropped, `no drop before the create of "${name}"`).toBeGreaterThanOrEqual(0);
      expect(dropped).toBeLessThan(created);
    }
  });

  it('creates review_lines before the block that grants on every table', () => {
    // `grant … on all tables in schema public` is evaluated when it runs, so a table
    // created after it is not covered — and a table the anon role cannot select is a
    // map that renders empty on a self-hosted install.
    const table = SQL.indexOf('create table if not exists review_lines');
    const grants = SQL.indexOf('grant select, insert, update, delete on all tables in schema public');
    expect(table).toBeGreaterThanOrEqual(0);
    expect(grants).toBeGreaterThan(table);
  });

  it('still revokes app_settings last, after the grants have run', () => {
    const grants = SQL.indexOf('grant select, insert, update, delete on all tables in schema public');
    const revoke = SQL.indexOf('revoke all on public.app_settings from anon, authenticated');
    expect(revoke).toBeGreaterThan(grants);
  });
});
