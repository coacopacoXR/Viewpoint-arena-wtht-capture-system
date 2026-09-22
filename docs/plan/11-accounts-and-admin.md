# Plan — navigation, accounts and an admin panel

Written 2026-09-23. Two problems of very different size, raised together:
the curate page's tab bar is cramped, and there should be an admin panel that
manages people and their access to reviews and groups of reviews.

---

## L. The curate page needs room to grow (small)

Six tabs (ASSET · VIEWPOINTS · PINS · AGENDA · REQS · PEOPLE) share a 400 px
sidebar; the last two already clip, and plan 10-F adds label fields on top.
A seventh tab is not the answer.

**User chose 2026-09-23: the icon rail.** Replace the single row with a **vertical icon rail** on the sidebar's left
edge: icon + short label per section, the active one highlighted, counts as
small badges. It scales to ten sections without clipping, keeps every section
one click away, and leaves the panel's full width for content. Sections group
as: **Model** (asset) · **Content** (viewpoints, pins, agenda) · **Setup**
(requirements, people, labels), with a thin divider between groups rather
than nested menus.

Same treatment for the room's right-hand panel if it grows past four tabs.

---

## M. Accounts — the prerequisite nobody can skip

**User decided 2026-09-23: build it — full sign-in, then the admin panel.**

Today there is **no sign-in**. You type a display name in the lobby and that
is your whole identity; every room, review and tracker item is readable and
writable by anyone who can reach the app, and the database's row-level
policies are literally `using (true)`. Nothing can be "given access to"
because there is nobody to give it to.

So an admin panel needs, in order:

1. **Identity.** The bundled stack already ships Postgres + PostgREST +
   Realtime; Supabase's auth service (GoTrue) is the missing fourth piece and
   drops into the same compose file, behind the same nginx, with the same JWT
   secret PostgREST already trusts. Email + password to start (no SMTP
   needed if admins create accounts and hand out the first password), with
   the door open to company SSO later.
2. **Accounts that mean something to the app.** A `profiles` table keyed by
   the auth user id: display name, colour, role (`admin` | `member`). The
   lobby stops asking for a name and shows who you are signed in as; presence
   and transcript lines carry the user id, which also closes the spoofing
   hole where a participant can post lines as somebody else.
3. **Real row-level security.** Replace the open policies: a review is
   readable by its members; the tracker shows the sessions you have access
   to; only admins can change label fields or other people's access. This is
   the step that actually enforces anything — the UI hiding a button is not
   access control.
4. **Migration for existing installs.** Reviews created before accounts have
   no owner. On first sign-in of the first admin, claim them all for that
   admin, and say so plainly rather than silently hiding data.

## M-bis. Guests: a link must stay enough (user, 2026-09-23)

**Accounts must not make sharing rigid.** Sending someone a link and having
them join has to keep working — the app's whole point is that a supplier or a
colleague joins a review in one click. So accounts are for *members*, and a
room additionally accepts *guests*:

- **Knock to join (default).** Someone with the link who is not signed in
  types a name and lands in a waiting state; the host sees "Maria wants to
  join — Admit / Decline". Admitting mints a **guest token**: signed with the
  same JWT secret, scoped to that one room, expiring with the meeting. It
  carries no access to other reviews, the tracker, or anything else, and the
  row-level policies check that claim rather than trusting the client.
- **Per-link policy**, chosen when sharing: *Anyone with the link* (no
  knock — for a demo or an open review), *Ask the host* (the default), or
  *Members only* (the locked-down case). The share panel says which one is
  in force, in words.
- **A guest is a real participant**: their name appears in presence, their
  transcript lines are attributed to them, they can be assigned an action.
  What they cannot do is wander into other reviews.
- **Leaving the meeting ends the access.** No lingering guest sessions; a
  returning guest knocks again (or the host copies a fresh link).

This is what keeps the "solid architecture, not rigid" balance: identity
where it protects data, a link where it removes friction.

## N. The admin panel

Once M exists, one screen (admin only):

- **People**: list, invite (create account + temporary password), set role,
  deactivate. Deactivating never deletes their past contributions.
- **Groups**: named groups of people ("Mechanical team") and named groups of
  reviews — the latter being the label fields from plan 10-F reused as the
  grouping, so "everything tagged Product = Momentum 4" is a thing access can
  be granted to, rather than inventing a second hierarchy.
- **Access**: per review and per review-group, grant read or edit to a person
  or a people-group. Defaults: the creator is owner; nothing is public by
  default; an admin can always see everything (and the panel says so).
- **Audit, minimal**: who granted what to whom, and when. A design review's
  contents are commercially sensitive; silent grants are not acceptable.

## Sequencing and honesty about size

| Batch | Work | Size |
|---|---|---|
| AG | L (icon rail on the curate page) | small |
| AH | M1 (GoTrue in the stack, sign-in, profiles) | large |
| AI | M2 (row-level security over reviews/tracker) | large, and the riskiest |
| AJ | N (admin panel: people, groups, access, audit) | large |
| AK | M-bis (guest links: knock-to-join, per-link policy, scoped guest tokens) | medium, built WITH M3 so guests are never locked out |

L is a UI batch and ships next. M and N are the difference between a demo and
a multi-team tool: they touch the installer, the compose stack, every data
path, and every existing install's data. They run AFTER the review-feature
batches already queued (per-speaker transcript, tracker grouping,
commit-as-comments), one batch at a time, each verified live — and until they
land, the honest description of the app stays "anyone with the link and
network access can join and edit", which is what `docs/INSTALL.md` says.

Order to build M in, so the app never spends a batch half-locked:
M1 the auth service + sign-in + profiles (everything still readable by
everyone, so nothing breaks); M2 ownership and membership recorded on every
review/session; M3 the policies flipped from `using (true)` to real ones, with
the migration that claims existing rows; N the panel. M3 is the batch that can
lock people out of their own data, so it gets a rehearsal on a copy of the
database and a documented way back.

Open questions for the user are in the chat, not here.
