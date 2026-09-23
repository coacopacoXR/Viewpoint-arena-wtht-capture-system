# Plan — navigation, access control and an admin screen

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

## M. Access without accounts (user decided 2026-09-23)

The earlier plan added per-person logins. The user rejected that: this is
software people deploy for themselves, and accounts are machinery that makes
sharing worse — the opposite of what a review tool needs. **There are no user
accounts.** Access is managed with secrets and links:

1. **Front-door password (optional).** One shared password for the whole
   install, set by `./install.sh` (empty = open, which is today's behaviour).
   Stops anyone on the office network from wandering in. Stored as a hash in
   `.env`; the app asks once per browser and keeps a signed cookie.
2. **Unguessable review links stay the access control for a review.** They
   are UUIDs already. Anyone with the link is in — that is the property the
   user wants to keep.
3. **Knock to join.** Someone opening a room link who has not been admitted
   before waits; the host sees "Maria wants to join — Admit / Decline".
   Per-link policy chosen when sharing: *Anyone with the link*, *Ask the
   host* (default), or, once a front-door password exists, *Password only*.
4. **Admin passphrase**, not an admin user: a second secret from the
   installer that unlocks install-wide settings — label fields, deleting
   other people's reviews, seeing every meeting in the tracker.
5. **Per-review visibility**: listed in the lobby for everyone who is in, or
   link-only (hidden from the lobby list).

What this deliberately does NOT give: proof of who someone is. Names stay
self-asserted, so the app cannot attribute an action beyond "whoever held
this link called themselves Maria". For a self-deployed team tool that is the
right trade; a deployment that needs real identity should put the app behind
its own SSO proxy, which this design does not prevent.

Row-level policies stay open (`using (true)`) because there is no identity to
key them on; the database is reachable only through the app's origin, and the
front-door password is what guards that origin. Say so plainly in
`docs/INSTALL.md` rather than implying more safety than exists.

## N. The admin panel

Once M exists, one screen, unlocked by the admin passphrase (not an admin
account):

- **Reviews**: every review on this install, who last touched it, delete or
  hide from the lobby. (There is no people list: people are names, not
  accounts.)
- **Label fields**: the same screen the tracker already has, reachable here
  too, since it is install-wide configuration.
- **Access**: the front-door password and the admin passphrase (rotate
  either), and each review's visibility and link policy.
- **Audit, minimal**: who granted what to whom, and when. A design review's
  contents are commercially sensitive; silent grants are not acceptable.

## Sequencing and honesty about size

| Batch | Work | Size | Status |
|---|---|---|---|
| AG | L (icon rail on the curate page) | small | **done** |
| AH | M1 (front-door password + admin passphrase, installer + app gate) | medium | **done 2026-09-23** |
| AI | M2 (knock-to-join, per-link policy, per-review visibility) | medium | next |
| AJ | N (admin screen behind the passphrase) | medium | after AI |

L is a UI batch and ships next. M and N are the difference between a demo and
a multi-team tool: they touch the installer, the compose stack, every data
path, and every existing install's data. They run AFTER the review-feature
batches already queued (per-speaker transcript, tracker grouping,
commit-as-comments), one batch at a time, each verified live — and until they
land, the honest description of the app stays "anyone with the link and
network access can join and edit", which is what `docs/INSTALL.md` says.

Both secrets default to EMPTY, which is exactly today's behaviour, so no
existing install locks itself overnight. Turning either on is a deliberate
act (`./install.sh` or the admin screen).

Open questions for the user are in the chat, not here.
