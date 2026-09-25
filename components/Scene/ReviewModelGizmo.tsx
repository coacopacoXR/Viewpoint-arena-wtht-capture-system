// The room's transform gizmo: Move / Rotate / Scale, applied to the SELECTED
// scene model.
//
// docs/plan/14-rooms-models-admin-ai.md batch BH. The amber strip owns the three
// buttons and writes `reviewGizmoMode`; this is the thing those buttons actually
// turn on, and it lives inside the canvas because drei's TransformControls has to
// be an R3F child of the scene it manipulates. The old curate page had the same
// arrangement (components/Scene/ReviewSetupCanvas.tsx) against a single loaded
// model; this one works against the room's scene, where there can be eight.
//
// What it writes is the model's OWN transform — SceneModel.offset, .rotation and
// .scale — sent as one `setTransform` operation, so the room server applies it to
// its single copy and relays the result to everybody. That is the difference
// between "I moved the model" and "the model moved": a drag here is a change to
// the meeting, not to this browser.
//
// Batch BI added a second copy of the answer, written when the drag ENDS: the
// review keeps every model's placement too, because the room server's storage is
// the room's and a review is opened again long after that room is gone. See
// keepPlacements below and lib/scene/placement.ts.

import React, { useCallback, useEffect, useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store';
import { usePresence } from '../../lib/PresenceContext';
import { useActiveReviewStore } from '../../lib/activeReviewStore';
import { placementsFromScene } from '../../lib/scene/placement';
import { sceneModelTransform } from '../../lib/scene/roomScene';

/** How often a drag may put a message on the socket. See flush. */
const SEND_INTERVAL_MS = 100;

/**
 * The part of drei's OrbitControls this component touches.
 *
 * Named rather than imported: the canvas holds its controls ref loosely, and all
 * the gizmo needs from it is the one flag that stops the camera orbiting
 * underneath a model somebody is moving.
 */
interface OrbitLike {
  enabled: boolean;
}

const ReviewModelGizmo: React.FC<{
  controlsRef: React.MutableRefObject<OrbitLike | null>;
}> = ({ controlsRef }) => {
  const mode = useStore((state) => state.reviewGizmoMode);
  const editing = useStore((state) => state.reviewEditing);
  const activeSceneModelId = useStore((state) => state.activeSceneModelId);
  const groups = useStore((state) => state.sceneModelGroups);
  const { localUserId, broadcastSceneUpdate, broadcastReviewConfig } = usePresence();

  const object = activeSceneModelId ? groups[activeSceneModelId] : undefined;
  // The gizmo is a tool of edit mode, and edit mode belongs to one person. A
  // participant who is watching somebody else edit sees the model move; they do
  // not get handles on it.
  const mine = editing !== null && editing.userId === localUserId;

  // When the last transform of this drag went on the wire, and the one waiting to
  // go if it was throttled. Throttled rather than per frame: onObjectChange fires
  // on every pointer move, and each one would be a socket message the room server
  // applies, persists and relays as a whole SCENE_STATE to every connection. Ten
  // a second is smooth enough to watch a colleague's drag and a fraction of the
  // traffic.
  const lastSentAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback((group: THREE.Group) => {
    if (!activeSceneModelId) return;
    const model = useStore.getState().scene.models.find((m) => m.id === activeSceneModelId);
    if (!model) return;
    const current = sceneModelTransform(model);
    const update = {
      op: 'setTransform' as const,
      id: activeSceneModelId,
      transform: {
        offset: [group.position.x, group.position.y, group.position.z] as [number, number, number],
        rotation: [group.rotation.x, group.rotation.y, group.rotation.z] as [number, number, number],
        // Uniform, as everywhere else in the app: drei's scale gizmo drags one
        // axis at a time, and a model scaled 2× on X and 1× on Y is not something
        // the rest of the scene — the bounding box, the label height, placement —
        // knows how to read. Averaging the three keeps a non-uniform drag from
        // being thrown away while still landing on one number.
        scale: (group.scale.x + group.scale.y + group.scale.z) / 3 || current.scale,
      },
    };
    lastSentAt.current = Date.now();
    // Sent first, then applied locally — the order SceneTree's import uses. The
    // server relays the resulting scene back to this client too, so the local
    // step is a prediction the echo confirms; it is still needed outside a room.
    broadcastSceneUpdate(update);
    useStore.getState().applyLocalSceneUpdate(update);
  }, [activeSceneModelId, broadcastSceneUpdate]);

  const flush = useCallback((group: THREE.Group) => {
    const wait = SEND_INTERVAL_MS - (Date.now() - lastSentAt.current);
    if (wait <= 0) {
      send(group);
      return;
    }
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      send(group);
    }, wait);
  }, [send]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  /**
   * Remember where the drag ended with the REVIEW as well as with the room.
   *
   * `send` puts the transform in the scene, which the room server persists — and
   * room storage is the room's, so a review opened next month, from the lobby, on
   * an install whose server hibernated, gets its models back standing the way they
   * arrived rather than the way they were left (batch BI).
   *
   * Once per drag and not per frame: onObjectChange fires on every pointer move,
   * and each of these is a whole review broadcast to everybody in the room and a
   * row written a second later. By drag end `send` has already applied the final
   * transform locally, so the scene this reads is the scene the person is looking
   * at. Null back from the store means there was nothing to remember — no review
   * open, or every model ended where it started — and then nothing is broadcast.
   */
  const keepPlacements = useCallback(() => {
    const next = useActiveReviewStore.getState().setScenePlacements(
      placementsFromScene(useStore.getState().scene.models),
    );
    if (next) broadcastReviewConfig(next);
  }, [broadcastReviewConfig]);

  if (!mine || !mode || !object) return null;

  return (
    <TransformControls
      object={object}
      mode={mode}
      size={0.8}
      onMouseDown={() => {
        // The camera must not orbit underneath a model that is being moved. The
        // curate canvas did the same to its own OrbitControls.
        if (controlsRef.current) controlsRef.current.enabled = false;
      }}
      onMouseUp={() => {
        if (controlsRef.current) controlsRef.current.enabled = true;
        // A drag that ends inside the throttle window still has to land: the last
        // few centimetres of a move are the ones the person was aiming.
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        send(object);
        keepPlacements();
      }}
      onObjectChange={() => flush(object)}
    />
  );
};

export default ReviewModelGizmo;
