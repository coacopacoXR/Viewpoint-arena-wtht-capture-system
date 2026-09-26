Batch BY: backups and a record of deletions.

On 2026-09-26 data on the maintainer's own install was lost (reviews and
meetings deleted) and there was NO backup to restore from. A self-hosted product
for companies must back itself up out of the box and record who deleted what.

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. You MAY edit `docs/INSTALL.md` (and only
that doc besides `docs/supabase-schema.sql`).

## 1. Nightly database backups, on by default
- `docker-compose.yml`: a `db-backup` service (small image: the same postgres
  image the `db` service uses, so `pg_dump` matches the server version), on the
  default profile, depending on `db` healthy. It runs a loop script
  (`deploy/backup/backup.sh`, POSIX sh): every `BACKUP_INTERVAL_HOURS` (default
  24) `pg_dumpall` via the `supabase_admin` credentials the stack already has
  (read how other services connect; never print the password), gzip to
  `/backups/db-YYYYMMDD-HHMMSS.sql.gz` on a named volume `db-backups` (or a bind
  path `BACKUP_DIR` if set in `.env`), write to a temp name and rename when
  complete, keep the newest `BACKUP_KEEP` (default 14), delete older ones, log
  one line per run ("backup ok: <file> <size>" / "backup FAILED: <reason>").
  Also runs once at start.
- Model files: also back up the model storage volume the api uses (read
  `docker-compose.yml` for its name) as a tar.gz alongside, same retention —
  only if `BACKUP_MODELS=true` (default true), because model files can be large.
- `.env.example` / install.sh: add the four variables with the defaults and one
  comment line each; install.sh writes them (non-interactive defaults).
- Restore: `deploy/backup/restore.sh <file>` — refuses unless `--yes` is given,
  stops `api`, `rest`, `realtime`, `auth`, `partykit`, restores the dump into
  `db` (`psql` of the dumpall), restarts them. `docs/INSTALL.md`: a short
  "Backups and restore" section (where they are, how to change interval/keep,
  how to copy them off the machine, how to restore).
- Health: the api's `/api/health` gains `backup: ok | stale | missing` by reading
  the newest file's mtime in a read-only mount of the backup volume (stale = older
  than 2× the interval). The admin console shows it where other health shows.

## 2. Deletions are recorded
`api/reviews/delete.ts` (review and session deletes) and the lines endpoint's
drop/merge write an `audit_events` row with the service role (read the table's
columns in `docs/supabase-schema.sql` and how `party/room.server.ts` writes
audit rows): action `review_deleted` / `session_deleted` / `variant_dropped` /
`variant_merged`, room_id = review id, actor = the verified caller (id + name),
subject = the review title / session label / variant label, detail = counts
("3 sessions, 12 cards"). The admin console's existing audit view (if any —
check) lists them; if there is none, add a simple "Activity" list in the admin
console (newest 200, action, who, what, when).

## Tests
backup.sh: naming, retention, temp-then-rename (shellcheck-clean; unit-test the
retention logic in a small sh test or a node test that runs it against a temp
dir with fake files); restore.sh refuses without --yes; health `backup` status
from file mtimes; delete/drop/merge write audit rows with actor and counts.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
Files changed; how to verify on an install; anything deliberately not done.
