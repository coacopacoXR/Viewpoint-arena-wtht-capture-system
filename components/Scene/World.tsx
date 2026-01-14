import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import Product from './Product';
import Bicycle from './Bicycle';
import Agent from './Agent';
import HeatmapOverlay from './HeatmapOverlay';
import { useStore } from '../../store';
import { ViewMode } from '../../types';

// Component to render imported STEP geometry
const ImportedSTEPModel: React.FC = () => {
    const importedMeshes = useStore(state => state.importedMeshes);
    const objectStates = useStore(state => state.objectStates);
    const groupRef = useRef<THREE.Group>(null);
    const registerPOI = useStore(state => state.registerPOI);

    // Register POIs for imported parts
    useEffect(() => {
        if (!importedMeshes) return;

        importedMeshes.children.forEach((child, index) => {
            if (child instanceof THREE.Mesh) {
                const box = new THREE.Box3().setFromObject(child);
                const center = box.getCenter(new THREE.Vector3());
                const id = child.userData.modelId || `imported_${index}`;
                registerPOI({
                    id: id,
                    position: center,
                    label: child.name || `Part ${index + 1}`,
                    type: 'GENERAL'
                });
            }
        });
    }, [importedMeshes, registerPOI]);

    // Update material based on selection state
    useEffect(() => {
        if (!importedMeshes) return;

        importedMeshes.children.forEach((child, index) => {
            if (child instanceof THREE.Mesh) {
                const id = child.userData.modelId || `imported_${index}`;
                const state = objectStates[id];
                const mat = child.material as THREE.MeshStandardMaterial;

                if (state) {
                    child.visible = state.visible;
                    if (state.selected) {
                        mat.emissive = new THREE.Color(0x0044aa);
                        mat.emissiveIntensity = 0.5;
                    } else {
                        mat.emissive = new THREE.Color(0x000000);
                        mat.emissiveIntensity = 0;
                    }
                }
            }
        });
    }, [importedMeshes, objectStates]);

    if (!importedMeshes) return null;

    return <primitive ref={groupRef} object={importedMeshes} />;
};

const World: React.FC = () => {
  // Use selectors to improve performance and prevent re-renders
  const isPlaying = useStore(state => state.isPlaying);
  const setTime = useStore(state => state.setTime);
  const viewMode = useStore(state => state.viewMode);
  const setUserInteractionPoint = useStore(state => state.setUserInteractionPoint);
  const agents = useStore(state => state.agents);
  const activeModelType = useStore(state => state.activeModelType);
  
  // Ref to track throttle
  const lastTimeUpdate = useRef(0);

  useFrame((state, delta) => {
    if (isPlaying) {
      // Only update React state (store.time) every 100ms to prevent crash
      // This keeps the UI clock ticking but allows 60fps animation via state.clock
      if (state.clock.elapsedTime - lastTimeUpdate.current > 0.1) {
          setTime(state.clock.elapsedTime);
          lastTimeUpdate.current = state.clock.elapsedTime;
      }
    }
  });

  // Handle user gaze/interaction tracking for "Follow User" mode
  const handlePointerMove = (e: any) => {
    if (e.point) {
        setUserInteractionPoint(e.point);
    }
  };

  const isHeatmap = viewMode === ViewMode.HEATMAP;

  return (
    <>
      <color attach="background" args={[isHeatmap ? '#111' : '#f0f0f0']} />
      <fog attach="fog" args={[isHeatmap ? '#111' : '#f0f0f0', 5, 25]} />

      <ambientLight intensity={isHeatmap ? 0.2 : 0.7} />
      <pointLight position={[10, 10, 10]} intensity={0.5} castShadow />
      
      <Environment preset="studio" blur={1} environmentIntensity={isHeatmap ? 0.2 : 1} />

      {/* Interaction Plane for Mouse Tracking */}
      <mesh visible={false} rotation={[-Math.PI/2, 0, 0]} position={[0, 0.5, 0]} onPointerMove={handlePointerMove}>
         <planeGeometry args={[20, 20]} />
         <meshBasicMaterial />
      </mesh>

      <Grid 
        infiniteGrid 
        fadeDistance={20} 
        fadeStrength={1.5} 
        sectionSize={1} 
        cellSize={0.5} 
        sectionColor={isHeatmap ? "#333" : "#cccccc"} 
        cellColor={isHeatmap ? "#222" : "#e5e5e5"} 
        position={[0, -0.01, 0]}
      />

      <group position={[0, 0, 0]}>
        {/* Conditionally render model based on activeModelType */}
        {activeModelType === 'imported' ? (
          <ImportedSTEPModel />
        ) : activeModelType === 'bicycle' ? (
          <Bicycle />
        ) : (
          <Product />
        )}

        <ContactShadows
            opacity={0.4}
            scale={10}
            blur={1.5}
            far={1.2}
            resolution={256}
            color="#000000"
        />
      </group>
      
      {isHeatmap && <HeatmapOverlay />}

      {agents.map((agent) => (
        <Agent key={agent.id} initialState={agent} allAgents={agents} />
      ))}
    </>
  );
};

export default World;