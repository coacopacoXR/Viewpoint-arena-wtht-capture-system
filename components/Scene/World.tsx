import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid, Environment, ContactShadows } from '@react-three/drei';
import type * as THREE from 'three';

class EnvErrorBoundary extends React.Component<{ children: React.ReactNode }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
import Product from './Product';
import Bicycle from './Bicycle';
import Headphones from './Headphones';
import ImportedModel from './ImportedModel';
import Agent from './Agent';
import HeatmapOverlay from './HeatmapOverlay';
import { useStore } from '../../store';
import { ViewMode } from '../../types';

interface WorldProps {
  hideAgents?: boolean;
  /** When provided, the inner model-transform group attaches to this ref so
   * the setup canvas can drive it with TransformControls. */
  modelGroupRef?: React.MutableRefObject<THREE.Group | null>;
}

const World: React.FC<WorldProps> = ({ hideAgents: hideAgentsOverride, modelGroupRef }) => {
  // Use selectors to improve performance and prevent re-renders
  const isPlaying = useStore(state => state.isPlaying);
  const setTime = useStore(state => state.setTime);
  const viewMode = useStore(state => state.viewMode);
  const setUserInteractionPoint = useStore(state => state.setUserInteractionPoint);
  const agents = useStore(state => state.agents);
  const storeHideAgents = useStore(state => state.hideAgents);
  const hideAgents = hideAgentsOverride ?? storeHideAgents;
  const activeModelType = useStore(state => state.activeModelType);
  const modelTransform = useStore(state => state.modelTransform);
  
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
      
      <EnvErrorBoundary>
        <Environment preset="studio" blur={1} environmentIntensity={isHeatmap ? 0.2 : 1} />
      </EnvErrorBoundary>

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
        {/* Inner group applies the curator's transform — affects only the
            model itself, not contact shadows / heatmap / etc. */}
        <group
          ref={modelGroupRef as React.RefObject<THREE.Group>}
          position={modelTransform.position}
          rotation={modelTransform.rotation}
          scale={modelTransform.scale}
        >
          {activeModelType === 'imported' ? (
            <ImportedModel />
          ) : activeModelType === 'bicycle' ? (
            <Bicycle />
          ) : activeModelType === 'headphones' ? (
            <Headphones />
          ) : (
            <Product />
          )}
        </group>

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

      {!hideAgents && agents.map((agent) => (
        <Agent key={agent.id} initialState={agent} allAgents={agents} />
      ))}
    </>
  );
};

export default World;
