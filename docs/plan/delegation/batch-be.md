Plan 14, batch BE: the admin console's Reviews and Models sections.

Read `docs/plan/14-rooms-models-admin-ai.md` ("One admin console") first.
Built: `/admin` with a section list (People, Reviews, Labels, Access,
Activity, AI) in `pages/AdminPage.tsx`, `requireAdmin`
(`api/_lib/adminAuth.ts`), service-role token (`api/_lib/serviceRole.ts`),
settings store pattern (`lib/ai/settingsStore.ts` shows how the api reads and
writes privileged tables through PostgREST). BC added `review_members`,
`review_curations.owner_id/archived`, `model_revisions`. BA stores model
files by hash (`lib/storage/`).

ONLY touch `/admin` (the page and components it uses), `api/admin/*`, and
new files for this batch. Another batch is editing the room, the lobby,
`lib/reviews/*`, `api/reviews/*` and the review setup page right now — do not
touch those.

Be economical. Do NOT run `docker` and do NOT run any `git` write command.
Do not edit `docs/`. Claude tests live.

## 1. Reviews section (replaces today's "Reviews" section, keeping what it does)
Today's section lists reviews with show/hide-in-lobby, delete, label fields.
Keep all of that, and add per review: owner (name/email), member count,
revisions count, last meeting date, archived flag. Actions: **Transfer owner**
(to an existing account, by email — service role write of `owner_id` and the
member rows), **Archive / Unarchive** (archived reviews are hidden from the
lobby but kept), and today's Delete (with an in-page confirm). Filters:
active / archived / all; search by title. Endpoint `api/admin/reviews.ts`
(GET list with those fields; PATCH owner/archived), `requireAdmin`.
In `mode: 'none'` show everything that does not need accounts (no owner
column, no transfer).

## 2. Models section
Every stored model file: file name, size, which reviews/revisions use it (by
hash, from `model_revisions` and from `review_curations.asset.modelHash`),
uploaded by, uploaded at; total storage used. Action: **Delete revision**
(removes the `model_revisions` row) and **Delete file** — only allowed when
nothing references the hash any more (409 with a plain message otherwise);
deleting the file removes it from the model store (`lib/storage/` — add a
`delete(hash)` to the store interface and both implementations, with tests).
Endpoint `api/admin/models.ts`, `requireAdmin`.

## What must not regress
- The existing Reviews section behaviour, label fields, the passphrase path
  in mode none.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no new `as unknown as`.
- `scripts/check-public-env.mjs` `KNOWN` stays empty.

## Tests
- endpoints: admin-only, list shapes, transfer owner (service role write,
  member rows updated), archive, delete-file refusal while referenced,
  delete-file success when unreferenced (store.delete called).
- store delete for local (file and sidecar gone) and supabase (request shape).
- AdminPage: the two sections render with mocked data; mode none hides
  account-only columns.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
- Files changed / added.
- Anything you deliberately did NOT do, and why.
