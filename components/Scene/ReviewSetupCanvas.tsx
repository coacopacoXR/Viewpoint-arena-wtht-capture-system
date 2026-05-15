import React, { Suspense, useImperativeHandle, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import World from './World';
import { useReviewSetupStore, type ReviewPin, type ReviewViewpoint, type PinSeverity } from '../../lib/reviewSetupStore';

// ─── Imperative API exposed to the setup page ───────────────────────────────
export interface ReviewSetupCanvasHandle {
  captureViewpoint: () => { position: [number, number, number]; lookAt: [number, number, number]; thumbnail?: string } | null;
  jumpTo: (vp: { position: [number, number, number]; lookAt: [number, number, number] }) => void;
}

interface Props {
  pinMode: boolean;
  selectedPinId: string | null;
  onSelectPin: (id: string | null) => void;
}

const PIN_COLOR: Record<PinSeverity, string> = {
  info: '#3b82f6',
  concern: '#f59e0b',
  blocker: '#ef4444',
};

// ─── Inner helpers that need r3f context ────────────────────────────────────

// Bridges imperative parent calls into r3f state via shared refs.
interface InnerState {
  camera: THREE.PerspectiveCamera | null;
  controls: any | null;
  gl: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
}

const SceneBridge: React.FC<{ stateRef: React.MutableRefObject<InnerState> }> = ({ stateRef }) => {
  const { camera, gl, scene } = useThree();
  useEffect(() => {
    stateRef.current.camera = camera as THREE.PerspectiveCamera;
    stateRef.current.gl = gl;
    stateRef.current.scene = scene;
  }, [camera, gl, scene, stateRef]);
  return null;
};

// Handles pin-mode clicks. We use a Mesh-level raycast through the model so
// we can capture the precise mesh + partName (same userData layout the laser uses).
const PinDropHandler: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const { scene, camera, gl } = useThree();
  const addPin = useReviewSetupStore((s) => s.addPin);
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());

  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;

    const handler = (e: PointerEvent) => {
      // Translate to NDC
      const rect = el.getBoundingClientRect();
      ndc.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(ndc.current, camera);
      const hits = raycaster.current.intersectObjects(scene.children, true);

      for (const hit of hits) {
        const obj: any = hit.object;
        if (obj.userData?.skipRaycast) continue;
        if (obj.name?.startsWith?.('Agent')) continue;

        // Walk up to find modelId
        let curr: any = obj;
        let modelId: string | null = null;
        while (curr) {
          if (curr.userData?.skipRaycast) { curr = null; break; }
          if (curr.userData?.modelId) { modelId = curr.userData.modelId; break; }
          curr = curr.parent ?? null;
        }
        if (!modelId) continue;

        const meshIndex = obj.userData?.meshIndex != null ? String(obj.userData.meshIndex) : null;
        const partName = obj.userData?.partName ?? null;

        addPin({
          label: partName || 'Untitled pin',
          worldPos: [hit.point.x, hit.point.y, hit.point.z],
          modelId,
          meshIndex,
          partName,
          severity: 'info',
        });
        return;
      }
    };

    el.addEventListener('pointerdown', handler);
    return () => el.removeEventListener('pointerdown', handler);
  }, [enabled, gl, camera, scene, addPin]);

  return null;
};

const PinMarker: React.FC<{ pin: ReviewPin; selected: boolean; onClick: () => void }> = ({ pin, selected, onClick }) => {
  return (
    <group position={pin.worldPos}>
      <mesh
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        userData={{ skipRaycast: true }}
      >
        <sphereGeometry args={[selected ? 0.05 : 0.035, 16, 16]} />
        <meshBasicMaterial color={PIN_COLOR[pin.severity]} toneMapped={false} depthTest={false} />
      </mesh>
      {/* Stem to the surface */}
      <mesh position={[0, 0.05, 0]} userData={{ skipRaycast: true }}>
        <cylinderGeometry args={[0.003, 0.003, 0.1, 6]} />
        <meshBasicMaterial color={PIN_COLOR[pin.severity]} toneMapped={false} depthTest={false} />
      </mesh>
      <Html
        position={[0, 0.13, 0]}
        center
        distanceFactor={6}
        style={{ pointerEvents: 'none' }}
        zIndexRange={[0, 0]}
      >
        <div style={{
          background: PIN_COLOR[pin.severity],
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: '8px',
          padding: '1px 4px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
          opacity: selected ? 1 : 0.85,
          boxShadow: selected ? '0 0 8px rgba(0,0,0,0.4)' : 'none',
        }}>
          {pin.label}
        </div>
      </Html>
    </group>
  );
};

// Renders a small camera-icon gizmo at each saved viewpoint's position so the
// host can see where their saved angles are in space.
const ViewpointGhost: React.FC<{ vp: ReviewViewpoint }> = ({ vp }) => {
  return (
    <group position={vp.position} userData={{ skipRaycast: true }}>
      <mesh userData={{ skipRaycast: true }}>
        <boxGeometry args={[0.12, 0.08, 0.16]} />
        <meshBasicMaterial color="#94a3b8" transparent opacity={0.55} depthTest={false} />
      </mesh>
      <Html position={[0, 0.12, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(15,23,42,0.85)',
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: '7px',
          padding: '1px 4px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
        }}>{vp.label}</div>
      </Html>
    </group>
  );
};

// Smoothly moves the camera + orbit controls toward a target viewpoint.
const JumpAnimator: React.FC<{
  target: { position: [number, number, number]; lookAt: [number, number, number] } | null;
  controlsRef: React.MutableRefObject<any>;
  onDone: () => void;
}> = ({ target, controlsRef, onDone }) => {
  const { camera } = useThree();
  const elapsed = useRef(0);
  const startPos = useRef(new THREE.Vector3());
  const startLook = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const active = useRef(false);
  const DURATION = 0.45; // seconds

  useEffect(() => {
    if (!target) return;
    startPos.current.copy(camera.position);
    if (controlsRef.current?.target) {
      startLook.current.copy(controlsRef.current.target);
    } else {
      startLook.current.set(0, 0, 0);
    }
    targetPos.current.set(...target.position);
    targetLook.current.set(...target.lookAt);
    elapsed.current = 0;
    active.current = true;
  }, [target, camera, controlsRef]);

  useFrame((_, delta) => {
    if (!active.current) return;
    elapsed.current += delta;
    const t = Math.min(1, elapsed.current / DURATION);
    // ease in-out
    const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(startPos.current, targetPos.current, k);
    if (controlsRef.current?.target) {
      controlsRef.current.target.lerpVectors(startLook.current, targetLook.current, k);
      controlsRef.current.update();
    }
    if (t >= 1) {
      active.current = false;
      onDone();
    }
  });

  return null;
};

const ReviewSetupCanvas = React.forwardRef<ReviewSetupCanvasHandle, Props>(({ pinMode, selectedPinId, onSelectPin }, ref) => {
  const stateRef = useRef<InnerState>({ camera: null, controls: null, gl: null, scene: null });
  const controlsRef = useRef<any>(null);
  const pins = useReviewSetupStore((s) => s.draft?.pins ?? []);
  const viewpoints = useReviewSetupStore((s) => s.draft?.viewpoints ?? []);
  const [jumpTarget, setJumpTarget] = React.useState<{ position: [number, number, number]; lookAt: [number, number, number] } | null>(null);

  useImperativeHandle(ref, () => ({
    captureViewpoint: () => {
      const { camera, gl, scene } = stateRef.current;
      if (!camera || !gl || !scene) return null;
      // Render one frame so the drawing buffer is fresh, then snap a thumbnail.
      gl.render(scene, camera);
      let thumbnail: string | undefined;
      try {
        thumbnail = gl.domElement.toDataURL('image/jpeg', 0.55);
      } catch {
        thumbnail = undefined;
      }
      const lookAt = controlsRef.current?.target ?? new THREE.Vector3(0, 0, 0);
      return {
        position: [camera.position.x, camera.position.y, camera.position.z],
        lookAt: [lookAt.x, lookAt.y, lookAt.z],
        thumbnail,
      };
    },
    jumpTo: (vp) => setJumpTarget(vp),
  }), []);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      style={{ width: '100%', height: '100%' }}
      gl={{
        antialias: true,
        preserveDrawingBuffer: true, // needed for thumbnail capture
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
    >
      <PerspectiveCamera makeDefault position={[5, 4, 5]} fov={50} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.1}
        enabled={!pinMode}
        minDistance={1}
        maxDistance={20}
      />
      <SceneBridge stateRef={stateRef} />
      <PinDropHandler enabled={pinMode} />
      <JumpAnimator target={jumpTarget} controlsRef={controlsRef} onDone={() => setJumpTarget(null)} />

      <Suspense fallback={null}>
        <World />
      </Suspense>

      {pins.map((p) => (
        <PinMarker
          key={p.id}
          pin={p}
          selected={p.id === selectedPinId}
          onClick={() => onSelectPin(p.id === selectedPinId ? null : p.id)}
        />
      ))}
      {viewpoints.map((v) => (
        <ViewpointGhost key={v.id} vp={v} />
      ))}
    </Canvas>
  );
});

ReviewSetupCanvas.displayName = 'ReviewSetupCanvas';
export default ReviewSetupCanvas;
