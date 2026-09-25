// A live, read-only look at the model a design review would open on.
//
// docs/plan/15-sessions-and-variants.md batch BO. The lobby's preview panel has
// always shown a snapshot: a picture taken the last time somebody was in the room,
// which is no picture at all for a review that has never had one, and a stale one
// for a review whose model was replaced afterwards. "Turn in 3D" swaps that
// picture for this — the same models, standing where they were left, that a room
// opened on this review's own address would start from. The point of the batch is
// that somebody browsing the lobby can see what a design review looks like inside
// without going into it.
//
// The reference implementation is `showReviewScene` in lib/scene/showCurationModel.ts,
// and the scene this viewer builds is deliberately the same answer. THREE things
// differ, and all three follow from being outside a room:
//
//   1. It never touches store.ts. showReviewScene's whole job is to write the
//      shared scene so the room renders it; a lobby that has been scrolled past
//      twelve reviews must not leave twelve scenes behind in the room's global
//      state, and it has no room to leave them in. So the scene is computed into
//      this component's own state and thrown away, and nothing here reads or writes
//      a store.
//   2. It draws what the SCENE says is visible — `model.visible === true` — which
//      is store.ts's `sceneModelVisible` with no local overrides. Hiding a model so
//      you can see the one behind it is one participant's business and lives in the
//      room's store, which point 1 has just promised not to read.
//   3. It disposes what it parses. The room's `pruneSceneEntries` drops the
//      reference and stops, which is fine for a canvas that lives as long as the
//      page; this one mounts once per review and a lobby can be scrolled through
//      dozens in a session.
//
// The LOADERS are the room's, not a second set: lib/modelsClient.fetchModelFile
// (the same /api/models download, and the same in-memory cache, so a review the
// lobby has already looked at costs nothing the second time), lib/scene/
// sceneEntries.parseSceneModelFile (the same parse, with the same hash-derived tree
// prefix), and `placeImportedGroup` out of components/Scene/ImportedModel.tsx (the
// room's own centring and scaling). A viewer that parsed the bytes itself would
// agree with the room today and drift from it the first time utils/modelLoader.ts
// changed — and "the lobby shows what the room shows" is the entire claim.
//
// THIS FILE IS A React.lazy TARGET and nothing may import it any other way. It
// pulls in three.js, @react-three/fiber and @react-three/drei, and the lobby's
// first paint must not pay for them.

import React, { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Grid,
  OrbitControls,
  PerspectiveCamera,
} from '@react-three/drei';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';
import { loadCuration } from '../../lib/curationsRepo';
import { fetchModelFile } from '../../lib/modelsClient';
import {
  listModelRevisions,
  revisionsForSession,
  sceneFromRevisions,
} from '../../lib/reviews/revisionsRepo';
import { originRevisionIds } from '../../lib/reviews/linesRepo';
import { curationSceneModel } from '../../lib/scene/curationScene';
import { applyStoredPlacements } from '../../lib/scene/placement';
import {
  sceneModelLabel,
  sceneModelTransform,
  type SceneModel,
} from '../../lib/scene/roomScene';
import { parseSceneModelFile, type SceneModelEntry } from '../../lib/scene/sceneEntries';
import { placeImportedGroup } from '../Scene/ImportedModel';

// ─── The words ──────────────────────────────────────────────────────────────
//
// Exported for the same reason lib/modelsClient exports its messages: the preview
// panel and its tests have to be able to ask for the exact sentence rather than
// retype it, and a string two files spell separately is a string that eventually
// disagrees with itself.

/** While the review's scene is being read and its models downloaded and parsed. */
export const LOADING_MESSAGE = 'Loading the model…';
/** Nothing to draw: no model on the review, or only a bundled preset. */
export const NO_MODEL_MESSAGE = 'This design review has no model to show yet.';
/** The read threw, or every model this review named failed to load. */
export const LOAD_FAILED_MESSAGE = 'The model could not be loaded.';

/** The camera's field of view, and the one framing falls back to. */
const CAMERA_FOV = 45;
/**
 * How much further back than "exactly fills the frame" the camera sits.
 *
 * A model that touches all four edges reads as a thumbnail that was cropped, not as
 * something you are looking at, and it leaves nowhere for the eye to go when the
 * first thing somebody does is drag it.
 */
const FRAME_PADDING = 1.4;
/**
 * The angle the camera arrives from, as a direction.
 *
 * The room's own default camera is at [8, 6, 8] (components/Scene/
 * ViewpointCanvas.tsx), so this is that same three-quarter view scaled to whatever
 * the model turns out to be — the lobby picture and the room picture start from the
 * same place, which is the point of the panel.
 */
const FRAME_DIRECTION = new THREE.Vector3(8, 6, 8).normalize();

// ─── State ──────────────────────────────────────────────────────────────────

/** One model of the review's scene, parsed, placed, and measured. */
interface LoadedModel {
  model: SceneModel;
  entry: SceneModelEntry;
  /**
   * This model's box in WORLD space — its own geometry after placeImportedGroup,
   * with the wrapper transform the JSX below applies composed onto it.
   *
   * Measured here, in the load, and not by a component inside the canvas: by the
   * time anything renders, the group has a parent, and three's Box3.setFromObject
   * reads world matrices, so a box measured then would count the wrapper's offset
   * twice or not at all depending on whether R3F had put the wrapper in the scene
   * graph yet. Detached, the answer is exact and has no timing in it.
   */
  box: THREE.Box3;
}

/**
 * The four things the panel can be showing.
 *
 * One value rather than a `loading` flag beside a list, because the failure this
 * exists to prevent is the two disagreeing — a spinner over a canvas that has
 * nothing in it, or a "no model" message over one that has.
 */
type ViewerState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'failed' }
  | { status: 'ready'; loaded: LoadedModel[]; box: THREE.Box3 };

// ─── Disposal ───────────────────────────────────────────────────────────────

/**
 * A node in a parsed model's graph that owns something on the GPU.
 *
 * Read by shape rather than with `instanceof THREE.Mesh`, for two reasons: the
 * loaders answer LineSegments and Points as well as meshes and both hold a geometry
 * that has to be freed, and a test can hand back a plain object shaped like one
 * without dragging three's constructors into the assertion.
 */
interface DisposableNode extends THREE.Object3D {
  geometry?: { dispose?: () => void };
  material?: { dispose?: () => void } | Array<{ dispose?: () => void } | undefined>;
}

/**
 * Free the GPU memory one parsed model holds.
 *
 * `parseSceneModelFile` builds fresh three.js objects on every call — a group, and
 * a geometry and a material per mesh in it — and after this viewer unmounts nothing
 * else in the app owns any of them. The room gets away without this because its
 * canvas lives as long as the page and its store's prune is just a dropped
 * reference; the lobby mounts a viewer per review, so a session spent scrolling the
 * lobby would otherwise hold every model it looked at.
 *
 * Textures are deliberately NOT disposed. utils/modelLoader's convertToStandardMaterial
 * copies `map`, `normalMap` and `alphaMap` across by reference, so one texture can
 * be sampled by two materials in the same file — and freeing a texture something is
 * still sampling shows up as black geometry far away from the code that caused it.
 */
function disposeGroup(group: THREE.Object3D): void {
  group.traverse((child) => {
    const node = child as DisposableNode;
    node.geometry?.dispose?.();
    const material = node.material;
    if (Array.isArray(material)) {
      for (const one of material) one?.dispose?.();
    } else {
      material?.dispose?.();
    }
  });
}

// ─── Which models, and where ────────────────────────────────────────────────

/**
 * The scene this review would open a room on.
 *
 * showReviewScene's arithmetic, transplanted: the review's whole stored history,
 * narrowed to the revisions its MAIN LINE was last looking at, plus the curation's
 * own model when history has never recorded it (every review created before the
 * model_revisions table existed), with the review's stored placements applied over
 * the beside-each-other default the history computes.
 *
 * The line id is null and always will be here: the lobby has no line to be on, and
 * a room opened on the review's own address starts from the main line, which is
 * exactly what `originRevisionIds(reviewId, null)` answers.
 *
 * With no stored history at all this reduces to the one-model scene
 * `curationScene` builds — sceneFromRevisions([], unrecorded) keeps the unrecorded
 * model as its line's Rev A — so there is no second code path for a review that has
 * never had a meeting.
 *
 * ONE PLACE THIS IS NOT showReviewScene, and it is on purpose. showReviewScene is
 * only ever called for an asset whose `modelType` is 'imported' — see syncMainModel
 * in lib/activeReviewStore.ts, which returns early for 'none' and for a preset — so
 * it never has to ask what the other model types mean. This viewer does, and the
 * answer it must not give is "nothing": since batch BI every review the lobby
 * creates carries modelType 'none', including one whose meeting imported four
 * models and recorded all four. Gating on modelType the way the room's caller does
 * would have shown an empty panel for exactly the reviews worth looking into. So
 * the gate here is whether the review has any imported model to draw at all, from
 * its history or from its asset, and `modelType` is not read.
 */
async function reviewSceneFor(reviewId: string): Promise<SceneModel[]> {
  const draft = await loadCuration(reviewId);
  const asset = draft?.asset;

  const [revisions, origin] = await Promise.all([
    listModelRevisions(reviewId),
    originRevisionIds(reviewId, null),
  ]);

  const unrecorded =
    asset?.modelHash && asset.importedFileName
      ? curationSceneModel(asset.modelHash, asset.importedFileName)
      : null;

  const scene = applyStoredPlacements(
    sceneFromRevisions(revisionsForSession(revisions, origin), unrecorded),
    asset?.placements,
  );

  return scene.models;
}

/**
 * This model's world box, measured while its group is still detached.
 *
 * The wrapper matrix is composed by hand from `sceneModelTransform` rather than read
 * off a group in the canvas, so it is the same numbers the JSX below is given: a
 * model written before Move / Rotate / Scale existed has no rotation and no scale
 * field, and sceneModelTransform is the one place that says what absent means.
 */
function measure(model: SceneModel, entry: SceneModelEntry): THREE.Box3 {
  const box = new THREE.Box3().setFromObject(entry.group);
  if (box.isEmpty()) return box;
  const transform = sceneModelTransform(model);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(transform.offset),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(transform.rotation[0], transform.rotation[1], transform.rotation[2]),
    ),
    new THREE.Vector3().setScalar(transform.scale),
  );
  return box.applyMatrix4(matrix);
}

/** The box around everything this viewer is about to draw. */
function contentBox(loaded: readonly LoadedModel[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const one of loaded) {
    if (!one.box.isEmpty()) box.union(one.box);
  }
  return box;
}

// ─── Framing ────────────────────────────────────────────────────────────────

/**
 * The part of drei's OrbitControls framing touches.
 *
 * Named rather than imported, which is what components/Scene/ReviewModelGizmo.tsx
 * does for the same reason: R3F types `state.controls` as a bare
 * THREE.EventDispatcher, and all framing needs is where the controls are looking and
 * a nudge to apply it.
 */
interface OrbitLike extends THREE.EventDispatcher {
  target: THREE.Vector3;
  update: () => void;
}

/**
 * Point the controls at `center`, if what R3F handed us has a target to point.
 *
 * Guarded rather than assumed because `makeDefault` publishes the controls a render
 * later than the canvas that asked for them, and a viewer whose model landed before
 * its controls did would otherwise throw inside an effect and take the whole canvas
 * with it.
 */
function retarget(controls: THREE.EventDispatcher | null, center: THREE.Vector3): void {
  const orbit = controls as OrbitLike | null;
  if (!orbit || !orbit.target || typeof orbit.update !== 'function') return;
  orbit.target.copy(center);
  orbit.update();
}

/**
 * Put the camera far enough back that everything drawn fits, looking at its middle.
 *
 * A child of the canvas because it needs R3F's camera and controls, and an effect
 * rather than a component because it has nothing to draw. It runs once per set of
 * models and then leaves the camera alone: this is a read-only view, and a viewer
 * that kept re-framing would fight whoever is dragging it.
 *
 * The distance is the bounding sphere's radius over tan(fov/2), padded — good enough
 * for a bracket and for an assembly, and it needs no knowledge of what the model is.
 */
const FrameToContent: React.FC<{ box: THREE.Box3 }> = ({ box }) => {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);

  useEffect(() => {
    if (!camera || box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return;

    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : CAMERA_FOV;
    const distance = (sphere.radius / Math.tan((fov * Math.PI) / 360)) * FRAME_PADDING;

    camera.position.copy(sphere.center).addScaledVector(FRAME_DIRECTION, distance);
    // Fitted to the model rather than left at the canvas defaults: a 20 mm fastener
    // and a 6 m assembly cannot share a near plane, and guessing wrong clips one of
    // them into nothing.
    camera.near = Math.max(distance / 1000, 0.001);
    camera.far = distance * 100 + sphere.radius * 10;
    camera.updateProjectionMatrix();
    camera.lookAt(sphere.center);
    retarget(controls, sphere.center);
  }, [box, camera, controls]);

  return null;
};

// ─── The panel ──────────────────────────────────────────────────────────────

class EnvErrorBoundary extends React.Component<{ children: React.ReactNode }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export interface ReviewModelViewerProps {
  /** The design review to look inside. Changing it reloads and frees the last one. */
  reviewId: string;
  /** Extra classes for the panel, so the preview can size it. */
  className?: string;
}

/**
 * The live viewer the lobby's "Turn in 3D" swaps in for the snapshot.
 *
 * Read-only in the strictest sense available: it draws the review's models and
 * changes nothing about them. There is no import, no hide, no gizmo and no socket —
 * somebody who is not even a participant in this design review can look at it, and
 * looking must not be able to move anything.
 */
const ReviewModelViewer: React.FC<ReviewModelViewerProps> = ({ reviewId, className }) => {
  const [state, setState] = useState<ViewerState>({ status: 'loading' });

  useEffect(() => {
    // Set by the teardown below and checked after every await. A load that finishes
    // after this viewer is gone — because the person scrolled to another review, or
    // closed the preview — must not setState on a component React has already
    // unmounted. React 18 stopped warning about that, but the state is dead either
    // way, and the group it parsed would leak: nothing would ever dispose it,
    // because the teardown that would have already ran.
    let cancelled = false;
    // Every group this load has parsed and not yet handed to React. The teardown
    // disposes the lot, and anything parsed AFTER the teardown is disposed at the
    // point it is noticed — between those two, no parsed group can outlive this
    // effect.
    const owned: THREE.Object3D[] = [];

    /**
     * Download and parse one model, and place it the way the room places it.
     *
     * Answers null for a model that failed, so one review whose Rev C was deleted
     * from model storage still shows Rev A and Rev B beside it rather than showing
     * nothing at all.
     */
    const loadOne = async (model: SceneModel): Promise<LoadedModel | null> => {
      try {
        const file = await fetchModelFile(model.hash, model.fileName);
        if (cancelled) return null;
        const entry = await parseSceneModelFile(model, file);
        if (cancelled) {
          // Parsed while the teardown was running. It is ours and nothing will ever
          // render it, so free it here rather than adding it to a list nobody reads.
          disposeGroup(entry.group);
          return null;
        }
        owned.push(entry.group);
        // The room's own centring and scaling, applied once here rather than in an
        // effect like SceneModelView's: that one has to re-run because its entry
        // arrives from a global store into a group R3F may re-parent, and this group
        // is owned by this effect from the moment it is parsed to the moment it is
        // disposed. Doing it before React has seen the object is also what makes
        // `measure` below exact — see LoadedModel.box.
        placeImportedGroup(entry.group, entry.scale * entry.baseScale, entry.basePosition);
        return { model, entry, box: measure(model, entry) };
      } catch (error) {
        console.error(`[lobby] could not load ${model.fileName} (${model.hash}):`, error);
        return null;
      }
    };

    const run = async (): Promise<void> => {
      const models = await reviewSceneFor(reviewId);
      if (cancelled) return;

      // A model with no hash has nothing to fetch — that is the legacy marker
      // lib/scene/curationScene.ts mints for a draft whose bytes were never
      // uploaded, and lib/scene/useSceneModelLoader.ts skips it for the same reason.
      const wanted = models.filter((model) => model.visible === true && model.hash !== '');
      if (wanted.length === 0) {
        // Includes a review whose asset names one of the app's bundled models —
        // headphones, bicycle, synth. Those are React components deep in the room's
        // own scene graph (components/Scene/Headphones.tsx and its siblings), and
        // drawing one here would mean mounting the room's product presets into the
        // lobby's bundle for a preview. Out of scope for this batch: the snapshot
        // the panel already had is the better answer for such a review, and saying
        // "no model to show yet" is honest enough next to it.
        setState({ status: 'empty' });
        return;
      }

      const results = await Promise.all(wanted.map(loadOne));
      if (cancelled) return;
      const loaded = results.filter((one): one is LoadedModel => one !== null);
      if (loaded.length === 0) {
        // Everything it named failed: a storage bucket that is not configured, a
        // deployment whose /api/models is behind a login this session is not through.
        setState({ status: 'failed' });
        return;
      }
      setState({ status: 'ready', loaded, box: contentBox(loaded) });
    };

    run().catch((error) => {
      // The scene read itself threw — loadCuration does not catch, so a database
      // that is unreachable rejects here. A preview panel that crashed the lobby
      // would be worse than one that says it could not load.
      console.error('[lobby] could not read the review to preview:', error);
      if (!cancelled) setState({ status: 'failed' });
    });

    return () => {
      cancelled = true;
      for (const group of owned) disposeGroup(group);
      owned.length = 0;
    };
  }, [reviewId]);

  const names =
    state.status === 'ready'
      ? state.loaded.map(({ model }) => sceneModelLabel(model)).join(', ')
      : '';

  return (
    <div
      className={`flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden ${className ?? ''}`}
      data-testid="review-model-viewer"
    >
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/60">
        <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">
          Inside this design review
        </p>
        {names && (
          <p className="font-mono text-[9px] text-gray-400 truncate" title={names}>
            {names}
          </p>
        )}
      </div>

      {/* The canvas is mounted only once there is something in it: a review with no
          model gets a sentence, not a WebGL context nobody is going to draw into. */}
      <div className="relative flex-1 min-h-[220px]">
        {state.status === 'loading' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white"
            role="status"
          >
            <Loader2 size={18} className="animate-spin text-gray-300" />
            <p className="text-[11px] text-gray-500">{LOADING_MESSAGE}</p>
          </div>
        )}

        {state.status === 'empty' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white px-4">
            <p className="text-[11px] font-mono italic text-gray-300 text-center" role="status">
              {NO_MODEL_MESSAGE}
            </p>
          </div>
        )}

        {state.status === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white px-4">
            <p className="text-[11px] font-mono italic text-gray-300 text-center" role="status">
              {LOAD_FAILED_MESSAGE}
            </p>
          </div>
        )}

        {state.status === 'ready' && (
          <Canvas
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
            aria-label="Live view of the model this design review would open on"
          >
            <PerspectiveCamera
              makeDefault
              fov={CAMERA_FOV}
              position={[3.2, 2.4, 3.2]}
              near={0.05}
              far={400}
            />

            <ambientLight intensity={0.75} />
            <directionalLight position={[4, 6, 4]} intensity={0.9} />

            {/* The preset fetches a remote HDR, so it is both suspended and fenced:
                an install with no route to the CDN shows a flat-lit model rather than
                an empty panel. Both halves are World.tsx's arrangement. */}
            <EnvErrorBoundary>
              <Suspense fallback={null}>
                <Environment preset="studio" blur={1} environmentIntensity={1} />
              </Suspense>
            </EnvErrorBoundary>

            <Grid
              infiniteGrid
              fadeDistance={12}
              fadeStrength={1.5}
              sectionSize={1}
              cellSize={0.5}
              sectionColor="#cccccc"
              cellColor="#e5e5e5"
              position={[0, -0.01, 0]}
            />

            {state.loaded.map(({ model, entry }) => {
              // The room's own transform for this model, applied to the WRAPPER and
              // not to the geometry inside it: placeImportedGroup has already scaled
              // and centred that group, and scaling it again would scale the centring
              // with it and slide the model off its own origin.
              const transform = sceneModelTransform(model);
              return (
                <group
                  key={model.id}
                  position={transform.offset}
                  rotation={transform.rotation}
                  scale={transform.scale}
                >
                  <primitive object={entry.group} />
                </group>
              );
            })}

            <ContactShadows
              opacity={0.35}
              scale={10}
              blur={1.6}
              far={1.2}
              resolution={256}
              color="#000000"
            />

            {/* Orbit and zoom, and nothing else: panning moves the model off the
                stage a fixed frame was composed around, and there is no edit here
                for a drag to be mistaken for. */}
            <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.12} />

            <FrameToContent box={state.box} />
          </Canvas>
        )}
      </div>

      <div className="flex-shrink-0 px-3 py-1.5 border-t border-gray-100">
        <p className="font-mono text-[9px] text-gray-400 uppercase tracking-widest">
          Drag to turn it · this preview cannot change the review
        </p>
      </div>
    </div>
  );
};

export default ReviewModelViewer;
