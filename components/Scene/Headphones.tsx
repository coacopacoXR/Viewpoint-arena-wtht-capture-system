import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import modelUrl from './sennheiser_momentum_4_headphones.glb?url';
import { useStore } from '../../store';
import { applyBuiltInGlow } from '../../lib/builtInModelGlow';
import { buildSceneTree } from '../../utils/modelLoader';
import type { SceneNode } from '../../types';

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

const ROOT_ID = 'headphones_assembly';

const Headphones: React.FC = () => {
  const { scene } = useGLTF(modelUrl);
  const glowColorRef = useRef(new THREE.Color());
  const setBuiltInSceneTree = useStore(state => state.setBuiltInSceneTree);
  const objectStates = useStore(state => state.objectStates);

  const { scale, offsetY, sceneTree } = useMemo(() => {
    scene.updateWorldMatrix(true, true);

    // Build the real scene tree from the GLB. The root keeps the legacy id
    // 'headphones_assembly' so laser targeting and network broadcasts keep working.
    const counter = { value: 0 };
    const rawTree = buildSceneTree(scene, counter, 'headphones');
    const tree: SceneNode = rawTree ?? {
      id: ROOT_ID,
      name: 'Sennheiser Momentum 4',
      type: 'GROUP'
    };
    // Override root id to the legacy constant
    tree.id = ROOT_ID;
    // The GLB's own root object must carry the same id, or the root row's eye
    // toggle and selection would point at nothing.
    scene.userData.nodeId = ROOT_ID;
    tree.name = 'Sennheiser Momentum 4';
    // Same names as the pointer's pop-up, so the tree and the label agree.
    const cleanNames = (node: SceneNode) => {
      node.children?.forEach(child => {
        child.name = cleanPartName(child.name);
        cleanNames(child);
      });
    };
    cleanNames(tree);

    // Stamp every mesh: modelId = root id (for laser walk-up), nodeId = unique tree id.
    // Clone material per-mesh so emissive edits don't bleed across meshes.
    let idx = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.userData.modelId = ROOT_ID;
        obj.userData.nodeId = obj.userData.nodeId ?? `headphones_${idx}`;
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
      console.log(`[Headphones] stamped ${idx} meshes with unique materials`);
    }

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return { scale: 1, offsetY: 0, sceneTree: tree };
    const s = TARGET_SIZE / maxDim;
    return { scale: s, offsetY: -box.min.y * s, sceneTree: tree };
  }, [scene]);

  // Install the real tree once the GLB loads
  useEffect(() => {
    if (sceneTree) {
      setBuiltInSceneTree('headphones', sceneTree);
    }
  }, [sceneTree, setBuiltInSceneTree]);

  // Visibility from the tree's eye toggles. (Selection glow is applied per
  // frame together with the pointer glow — setting it here would be faded out
  // by the pointer pass on the next frame.)
  useEffect(() => {
    scene.traverse((object) => {
      const nodeId = object.userData.nodeId as string | undefined;
      if (nodeId) object.visible = objectStates[nodeId]?.visible ?? true;
    });
  }, [objectStates, scene]);

  // Pointer glow and tree-selection glow in one pass (see lib/builtInModelGlow).
  useFrame(() => {
    const { laserHighlightGranularity, objectStates: states } = useStore.getState();
    applyBuiltInGlow(scene, ROOT_ID, laserHighlightGranularity, states, glowColorRef.current);
  });

  return (
    <group scale={scale} position-y={offsetY}>
      <primitive object={scene} />
    </group>
  );
};

useGLTF.preload(modelUrl);

export default Headphones;
