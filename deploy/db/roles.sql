-- deploy/db/roles.sql
-- Mounted as /docker-entrypoint-initdb.d/init-scripts/99-roles.sql; runs once,
-- on the first boot of a fresh supabase-db-data volume.
--
-- Adapted from Supabase's self-host docker/volumes/db/roles.sql. The image
-- creates the roles itself; this only gives the one PostgREST logs in as the
-- generated password. supabase_admin (used by Realtime) already gets
-- POSTGRES_PASSWORD from the image's own init. The upstream file also sets
-- supabase_functions_admin, pgbouncer, supabase_auth_admin and
-- supabase_storage_admin; this stack runs none of those services, and
-- supabase_functions_admin does not even exist without the webhooks script,
-- so setting it aborts the whole init.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
