Open more 3D formats — above all CAD. The user: "I want that it supports more
3d formats, especially CAD formats, as many as possible."

Be economical: read the files named, not the whole repo. Do NOT run
`docker`, and do NOT run any `git` write command (`commit`, `add`, `push`,
`checkout`, `reset`, `stash`). Do not edit anything under `docs/`. You MAY run
`npm install <pkg>` for the one dependency named below and nothing else.

## Where things are
- `utils/modelLoader.ts`: `SUPPORTED_EXTENSIONS` (~16), one loader function
  per format, `validateModelFile` (50 MB cap), `parseModelFile` (dispatch on
  extension, then wraps, builds the scene tree with `buildSceneTree`,
  normalises scale/position). Everything downstream (tree, picking, pins,
  sharing) works off the `THREE.Object3D` it returns, so a new format only has
  to produce a good Object3D **with a meaningful hierarchy and names**.
- The two file pickers hard-code the list: `components/UI/SceneTree.tsx` ~231
  (`accept=`) and `pages/ReviewSetupPage.tsx` ~669. Also the error text in
  `validateModelFile`. Derive all three from ONE exported list so they cannot
  drift again.
- Remote clients receive the file bytes (`MODEL_CHANGE` in
  `lib/usePartyPresence.ts`) and run the same `parseModelFile`, with a local
  MIME map keyed by extension (~`mimeMap`). Make sure every new extension
  works through that path too (the MIME value barely matters; the extension
  drives the dispatch).

## Part 1 — CAD: STEP, IGES, BREP via OpenCascade (occt-import-js)
Formats: `.step`, `.stp`, `.iges`, `.igs`, `.brep`, `.brp`.

- `npm install occt-import-js` (LGPL-2.1, OpenCascade compiled to WASM;
  used unmodified and loaded as a separate file, which is how LGPL is met
  alongside this Apache-2.0 project).
- Its API: a factory `occtimportjs(moduleArgs)` returning a promise of an
  object with `ReadStepFile(bytes: Uint8Array, params)`, `ReadIgesFile`,
  `ReadBrepFile`. The result is JSON: `{ success, root: { name, meshes:
  number[], children: [...] }, meshes: [{ name, color?: [r,g,b] (0..1),
  brep_faces: [{ first, last, color }], attributes: { position: { array },
  normal?: { array } }, index: { array } }] }`. Params:
  `{ linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.001, angularDeflection: 0.5 }` is a sensible default
  (fine enough for design review, not so fine a big assembly stalls).
- **Run it in a Web Worker** (`utils/cadWorker.ts`, created with
  `new Worker(new URL('./cadWorker.ts', import.meta.url), { type: 'module' })`),
  so tessellating a large assembly does not freeze the room. The worker loads
  the WASM with `locateFile` pointing at the URL Vite gives for
  `occt-import-js/dist/occt-import-js.wasm?url`. Post the file bytes in
  (transfer the ArrayBuffer), post the JSON result back.
- **Lazy**: nothing of OpenCascade may load until a CAD file is actually
  opened. Check with `npm run build` that the WASM is a separate asset and
  the main bundle did not grow by megabytes — report the main chunk size
  before and after.
- **Convert the JSON to three.js in `utils/cadToThree.ts`** (pure, testable,
  no worker in it): one `THREE.Group` per assembly node (name = node name),
  one `THREE.Mesh` per referenced mesh (name = mesh name, falling back to the
  node name, then "Part N"), `BufferGeometry` from position/normal/index
  (compute normals if absent), `MeshStandardMaterial` with the mesh colour or
  a neutral grey, `side: DoubleSide`. Per-face colours (`brep_faces`) as
  geometry groups with one material each when the faces have differing
  colours; otherwise one material. The result keeps the CAD assembly tree, so
  the model tree shows the real assembly with part names.
- **Up axis.** Many CAD systems are Z-up; three.js is Y-up. Do not guess
  per file. Add `upAxis: 'y' | 'z'` handling: default `'z'` for CAD formats
  (rotate the wrapper group −90° about X), `'y'` for everything else, and
  keep this a single constant/map so it can be changed. Say in the report
  whether there is an existing post-import control (scale slider etc.) where
  a "Flip up axis" button would naturally go, but do NOT build UI for it.
- **Size cap.** STEP files are large. Raise the limit for CAD formats to
  200 MB, keep 50 MB for the rest, and keep the check in `validateModelFile`.
- **Errors.** `success: false`, an empty result, or a worker crash must
  reject with a plain message ("Could not read this STEP file. If it came from
  a CAD system, re-export it as STEP AP214 or AP242.") — never hang, never
  leave the import spinner running. Time out after 3 minutes.

## Part 2 — more mesh formats with three.js's own loaders
All are in `three/examples/jsm/loaders/` for three 0.181 — confirm each exists
before using it:
- `.3mf` (`3MFLoader`), `.ply` (`PLYLoader`), `.dae` (`ColladaLoader`),
  `.3ds` (`TDSLoader`), `.wrl`/`.vrml` (`VRMLLoader`), `.amf` (`AMFLoader`).
- PLY and other geometry-only loaders return a BufferGeometry: wrap in a Mesh
  exactly like `loadSTL` does.
- If a loader cannot work from a single uploaded file (e.g. it needs sibling
  texture files), make it load what it can (geometry) and not crash on the
  missing textures; say which in the report.

## Explicitly out of scope — say so in the report, do not attempt
Native proprietary formats (SolidWorks .sldprt/.sldasm, CATIA .CATPart/
.CATProduct, NX .prt, Creo .prt/.asm, Inventor .ipt/.iam, Parasolid .x_t/.x_b,
JT .jt) have no open-source reader. If one is picked, the error must say what
to do: "This is a native CAD file. Export it as STEP (AP214/AP242) from your
CAD system, or connect your PLM system, which can convert it." Recognise
those extensions ONLY to give that message (they are not in the accept list).

## Tests
- `utils/__tests__/cadToThree.test.ts`: a hand-built result JSON (two nodes,
  three meshes, one with a colour, one with per-face colours) → the group
  hierarchy, names, material colours and geometry groups are right; missing
  normals get computed.
- `utils/__tests__/cadImport.node.test.ts`: occt-import-js runs in Node too
  (`require('occt-import-js')()`), so parse a REAL small STEP and IGES file and
  run the result through `cadToThree`. Fixtures: download
  `test/testfiles/simple-basic-cube/cube.stp` and an IGES test file from
  https://github.com/kovacsv/occt-import-js (LGPL-2.1, same licence as the
  library) into `utils/__tests__/fixtures/`, with a README there naming the
  source and licence. Keep fixtures under 200 KB. If the node test needs a
  different vitest environment than jsdom, set it per file with the
  `// @vitest-environment node` comment.
- Extension dispatch: each new extension reaches the right loader; a native
  CAD extension gives the export-as-STEP message; the accept list and the
  error text come from the one shared list.

## What must not regress
- GLB/glTF/OBJ/FBX/STL import, the scene tree built from imports, picking,
  sharing a model to other clients.
- `scripts/check-public-env.mjs`'s `KNOWN` map stays empty.
- No `any`, no `eslint-disable`, no `@ts-ignore`, no new `as unknown as`
  (the one existing `rootGroup.add(... as unknown as THREE.Object3D)` is
  documented and may stay). If occt-import-js ships no types, write a small
  `types/occt-import-js.d.ts` for exactly the API above.

## Finish by running, and paste the exact tail of each
```
npm run typecheck
npm run lint
npm run test
npm run build          # and report the main chunk size and the wasm asset
npm run check:env
```

## Report
- Formats now supported, and which of them you verified with a real file.
- Main chunk size before/after; where the WASM ends up in `dist/`.
- The licence note you added and where (a THIRD_PARTY or NOTICE file if the
  repo has one — check — otherwise say where it should go).
- Anything you deliberately did NOT do, and why.
