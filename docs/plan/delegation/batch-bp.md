Batch BP: polish the new lobby (found in live testing of BO, committed).

Be economical — limited tool calls; read each file once. Do NOT run `docker`
and do NOT run any `git` write command. Do not edit `docs/`.

## 1. Snapshots frame the model
Live, the card snapshot showed the model as a speck in a big grey floor: the
capture copies the room's wide camera. Make the capture helper (BO's
`captureRoomThumbnail` / `ThumbnailCapture`) render with its OWN temporary
PerspectiveCamera framed to the bounding box of the review's models (the
group(s) holding imported models and samples — find how the room identifies
them; not the floor, grid, avatars, lasers or pins), same fit rule as
`ReviewModelViewer`'s framing (reuse that function; extract it to a shared
module if needed), from a 3/4 view slightly above. Restore nothing on the room
camera — it is never touched. Keep the downscale/JPEG path. Test the framing
math (a box → camera position/fov distance) without WebGL.

## 2. "Turn in 3D" shows built-in samples too
A review whose model is one of the built-in samples (Synth assembly,
Headphones, Bicycle — `activeModelType` presets, no `model_revisions` row)
currently says "This design review has no model to show yet." Show the sample:
find how the room decides a review shows a sample (the review config / scene
record / `lib/scene/showCurationModel`), and render the same preset component
the room renders, lazy like the rest of the viewer. Only when the review truly
has no model does the sentence appear.

## 3. The preview's session map is compact
In `components/lobby/ReviewPreview.tsx` the embedded `SessionMap` repeats the
panel's own header ("DESIGN REVIEW / title / 1 session") and sits in a nested
card. Add a `compact` prop to `SessionMap` that drops its header block and outer
card chrome (keep the legend small, inline, right-aligned above the drawing),
and use it in the preview. The room's and the tracker's use is unchanged.

## 4. Mini map with one session
`components/review/MiniSessionMap.tsx` draws a lone dot for a review with one
session. Draw the main line as a short stub from the left edge to the dot (and
to the last dot generally), dots at r=4, the current (latest) stop filled. Keep
the shared layout's ordering.

## 5. The end-of-meeting board has a way back to the lobby
The "Session Review Board" shown after End Session
(`components/UI/MeetingSummary.tsx` or wherever "Return to Scene" lives) has
"Open Tracker" and "Return to Scene" but no way to the lobby. Add "Lobby"
(same button style as "Open Tracker", arrow-left icon) that navigates to `/`.

## What must not regress
BO/BN behaviour, the room's own camera, the lazy chunk boundary (three.js stays
out of the lobby's entry chunk — check the build output and say what you
found), tests. No `any`, no `eslint-disable`, no `@ts-ignore`, no new
`as unknown as`.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:env
```

## Report
Files changed; anything deliberately not done.
