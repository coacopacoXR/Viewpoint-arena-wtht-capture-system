import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import modelUrl from './sennheiser_momentum_4_headphones.glb?url';
import { remoteLaserTargets, remoteLaserColors, remoteLaserMeshNames, isLaserEntryFresh } from '../../lib/laserTargetRef';
import { useStore } from '../../store';

const TARGET_SIZE = 2;

// Sennheiser GLB mesh names look like "Cup_L_low_Baked.001_Sennheiser_Momentum_4_Baked.003_0".
// Strip the sketchfab-style _low_Baked.xxx_... suffix and humanize separators.
function cleanPartName(raw: string): string {
  if (!raw) return 'Part';
  const stripped = raw.replace(/_low_Baked.*$/i, '').replace(/_/g, ' ').trim();
  if (!stripped) return raw;
  // Map terse suffixes to human-readable directions
  return stripped
    .replace(/\bL\b/g, 'Left')
    .replace(/\bR\b/g, 'Right');
}

const Headphones: React.FC = () => {
  const { scene } = useGLTF(modelUrl);
  const glowColorRef = useRef(new THREE.Color());

  const { scale, offsetY } = useMemo(() => {
    scene.updateWorldMatrix(true, true);

    // Stamp every mesh with a stable sequential index so clients can identify
    // the exact mesh being pointed at. Clone material per-mesh so emissive
    // edits don't bleed across meshes that share material instances (this GLB
    // has 9 meshes sharing 1 material — without cloning, highlighting any
    // part lights up the whole model).
    let idx = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.userData.modelId = 'headphones_assembly';
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
      console.log(`[Headphones] stamped ${idx} meshes with unique materials`);
    }

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return { scale: 1, offsetY: 0 };
    const s = TARGET_SIZE / maxDim;
    return { scale: s, offsetY: -box.min.y * s };
  }, [scene]);

  useFrame(() => {
    const granularity = useStore.getState().laserHighlightGranularity;

    if (granularity === 'model') {
      // Whole model glows in the first active pointer's color
      let activeColor: string | null = null;
      remoteLaserTargets.forEach((targetId, userId) => {
        if (!isLaserEntryFresh(userId)) return;
        if (!activeColor && targetId === 'headphones_assembly') {
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
      // Per-mesh: only the specific mesh index being pointed at glows
      const meshGlow = new Map<string, string>();
      remoteLaserTargets.forEach((targetId, userId) => {
        if (!isLaserEntryFresh(userId)) return;
        if (targetId !== 'headphones_assembly') return;
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

useGLTF.preload(modelUrl);

export default Headphones;
