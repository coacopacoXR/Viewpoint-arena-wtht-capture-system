Batch BJ: make the Manager view look like the rest of the app.

The user: "match the aesthetics of the manager view to the aesthetics of the
rest of the software, it feels a little different."

ONLY touch `components/UI/ManagerPanel.tsx` and the components it renders
that are used nowhere else (check with grep before editing a shared one).
Another batch is editing the room, the store and the review tabs right now —
do not touch those. Be economical. Do NOT run `docker` and do NOT run any
`git` write command. Do not edit `docs/`.

## The house style (read these to copy it exactly, do not invent)
The room's right side panel and bars: `components/UI/Interface.tsx` (the right
panel: white `bg-white`, `border-l border-gray-200`, tab row with black active
tab `bg-black text-white`, grey inactive), `components/UI/room/TopBar.tsx` and
`CallBar.tsx` (`bg-white/90 backdrop-blur-md border border-gray-200 rounded-md
shadow-sm`, font-mono 10px uppercase labels with letter-spacing, gray-500
text), `components/UI/ConversationPanel.tsx` (cards, section headers like
"DETECTED INSIGHTS").

## What is different today (fix these)
- The header is a dark teal gradient (`from-[#0f172a] via-[#134e4a]
  to-[#0f172a]`) with emerald text and an emerald icon tile — nothing else in
  the app looks like that. Make it the house header: white, gray-200 bottom
  border, black title "Manager" in the same mono uppercase label style, close
  button like the side panel's.
- Tabs: use the same tab treatment as the room's side panel (black active,
  grey inactive, same sizes).
- The drag handle between the room and the manager column is black with an
  emerald hover — make it gray-200, gray-400 on hover.
- Emerald is used as the manager's accent throughout; keep green ONLY where it
  carries meaning (status Approved, success), and use the app's neutral
  black/gray elsewhere, like the rest of the room.
- Background `bg-[#fafafa]` → the side panel's white; inner sections separated
  the way the side panel does.
Keep every function, every tab, every data flow exactly as it is. This is a
visual change only.

## Tests
Existing ManagerPanel tests must pass unchanged (they test behaviour). If a
test asserted a colour class that you changed, update just that assertion and
say which.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npx vitest run components/UI
npm run build
```

## Report
Files changed; every class family you replaced (from → to).
