import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import modelUrl from './santa_cruz_v10_dh_bicycle.glb?url';
import { remoteLaserTargets, remoteLaserColors, remoteLaserMeshNames, isLaserEntryFresh } from '../../lib/laserTargetRef';
import { useStore } from '../../store';

// Longest-axis target size (world units). Bikes are big, so a bit larger than
// the headphones default of 2.
const TARGET_SIZE = 3;

// Best-effort prettifier for arbitrary GLB mesh names exported by CAD tools.
// Strips index / id suffixes, replaces separators with spaces, capitalizes.
function cleanPartName(raw: string): string {
  if (!raw) return 'Part';
  let s = raw
    .replace(/_(low|high|baked|lod\d*)([._].*)?$/i, '')
    .replace(/[._]\d+$/, '')
    .replace(/[._]/g, ' ')
    .trim();
  if (!s) s = raw;
  return s
    .replace(/\bL\b/g, 'Left')
    .replace(/\bR\b/g, 'Right')
    .replace(/\s+/g, ' ');
}

const Bicycle: React.FC = () => {
  // useMeshopt=true so drei wires up the MeshoptDecoder for the compressed
  // geometry buffers in this GLB (3.3 MB compressed, ~40 MB uncompressed).
  const { scene } = useGLTF(modelUrl, undefined, true);
  const glowColorRef = useRef(new THREE.Color());

  const { scale, offsetY } = useMemo(() => {
    scene.updateWorldMatrix(true, true);

    // Stamp every mesh: modelId for laser walk-up, sequential meshIndex for
    // cross-client part identification, partName for the floating label, and
    // a cloned material so per-mesh emissive edits don't bleed across meshes
    // that share materials.
    let idx = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.userData.modelId = 'bicycle_assembly';
        obj.userData.meshIndex = String(idx++);
        obj.userData.partName = cleanPartName(obj.name);
        if (Array.isArray(obj.material)) {
          obj.material = obj.material.map((m) => m.clone());
        } else if (obj.material) {
          obj.material = (obj.material as THREE.Material).clone();
        }
      }
    });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log(`[Bicycle] stamped ${idx} meshes with unique materials`);
    }

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return { scale: 1, offsetY: 0 };
    const s = TARGET_SIZE / maxDim;
    return { scale: s, offsetY: -box.min.y * s };
  }, [scene]);

  // Drive the emissive glow from the same shared laser maps as Headphones —
  // remote + local pointers light up the part they're targeting.
  useFrame(() => {
    const granularity = useStore.getState().laserHighlightGranularity;

    if (granularity === 'model') {
      let activeColor: string | null = null;
      remoteLaserTargets.forEach((targetId, userId) => {
        if (!isLaserEntryFresh(userId)) return;
        if (!activeColor && targetId === 'bicycle_assembly') {
          activeColor = remoteLaserColors.get(userId) ?? '#ffffff';
        }
      });
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (!mat || !('emissive' in mat)) return;
        if (activeColor) {
          glowColorRef.current.set(activeColor);
          mat.emissive.lerp(glowColorRef.current, 0.15);
          mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.45, 0.15);
        } else {
          mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.0, 0.1);
        }
      });
    } else {
      const meshGlow = new Map<string, string>();
      remoteLaserTargets.forEach((targetId, userId) => {
        if (!isLaserEntryFresh(userId)) return;
        if (targetId !== 'bicycle_assembly') return;
        const meshIdx = remoteLaserMeshNames.get(userId);
        if (meshIdx != null) meshGlow.set(meshIdx, remoteLaserColors.get(userId) ?? '#ffffff');
      });
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (!mat || !('emissive' in mat)) return;
        const activeColor = meshGlow.get(String(obj.userData.meshIndex)) ?? null;
        if (activeColor) {
          glowColorRef.current.set(activeColor);
          mat.emissive.lerp(glowColorRef.current, 0.15);
          mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.45, 0.15);
        } else {
          mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.0, 0.1);
        }
      });
    }
  });

  return (
    <group scale={scale} position-y={offsetY}>
      <primitive object={scene} />
    </group>
  );
};

useGLTF.preload(modelUrl, undefined, true);

export default Bicycle;
