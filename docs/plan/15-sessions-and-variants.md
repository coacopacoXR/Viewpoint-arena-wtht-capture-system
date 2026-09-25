# Plan — sessions that come from a design review, and variants

Written 2026-09-25. Approved by the user from the "Review Sessions Map"
sketch (https://claude.ai/artifact/6jY5fEKK94RMX8R1gc4MAX): "otherwise I
like it".

> "When you click a new design review, it creates a new design review and the
> sessions sort of emanate from that design review, so even if the 3D model
> changes throughout the process, design reviews have a consistency in terms
> of process management. I want it to be possible to see all the sessions
> that came from a specific design review and that it is possible to fork them
> and merge them (think of programming … but don't make it too deep since
> hardware engineers are not always familiar with that) and it needs to be
> reflected in the tracker."

## Decided

- **Design review** = the process. It owns a **main line** of sessions.
- **Session** = one meeting. It starts where the previous session on its line
  ended: the same model revision(s) on screen and the open cards carried over.
- **Variant** (the user's word; software's "branch"): a named side line
  started from any session ("Explore a variant from here"). It begins with that
  session's model and open cards; its sessions and cards stay on the variant.
- **Adopt variant into main line** (merge): the variant's latest model
  revision(s) become the main line's current ones, and its cards move over
  **together with the model** (decided by the user), each marked
  "from Variant A". The variant shows as adopted. If both lines changed the
  model, adopting asks one plain question: "Keep Rev C from the main line or
  Rev B2 from Variant A?".
- **Drop variant**: kept for the record, greyed out; its open cards close as
  "dropped with the variant".
- **Session map**: a design review's page and its room show every session in
  order, main line and variants, as a map (the sketch); clicking a session
  shows attendees, revision on screen, summary and cards.
- **Tracker**: each card says where it came from ("Main line · S3",
  "Variant A · A2"); filter by design review, then by line; adopted cards keep
  their history ("Raised in Variant A · adopted 12 Oct"); dropped variants'
  cards show closed with the reason. The existing revision continuity stays.
- Words: never "branch", "fork", "merge", "commit" on screen.

## Batches

| Batch | Work |
|---|---|
| BK | Data model: lines (main + variants) and sessions belonging to a line; a session starts from its line's state; the session map in the review's room and the tracker. No variants UI yet beyond showing lines. |
| BL | Variants: Explore a variant from here, Adopt into main line (with the model question), Drop variant; tracker labels and filters for lines. |
