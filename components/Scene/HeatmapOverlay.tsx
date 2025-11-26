import React from 'react';
import { useStore } from '../../store';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const HeatmapOverlay: React.FC = () => {
  const pois = useStore(state => state.pois);
  const heatmapValues = useStore(state => state.heatmapValues);

  // Color scale function: Blue -> Green -> Yellow -> Red
  const getColorForValue = (val: number) => {
      const normalized = Math.min(val / 15, 1.0); // Cap at 15 seconds for max heat
      const color = new THREE.Color();
      color.setHSL(0.6 - (normalized * 0.6), 1.0, 0.5); // Hue 0.6 (Blue) to 0.0 (Red)
      return color;
  };

  return (
    <group>
      {pois.map(poi => {
          const val = heatmapValues[poi.id] || 0;
          if (val < 0.1) return null; // Don't show if no attention

          const scale = 0.2 + Math.min(val / 5, 0.8); // Grow size with attention
          const color = getColorForValue(val);

          return (
            <mesh key={poi.id} position={poi.position}>
                <sphereGeometry args={[scale, 16, 16]} />
                <meshBasicMaterial 
                    color={color} 
                    transparent 
                    opacity={0.3} 
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
          );
      })}
    </group>
  );
};

export default HeatmapOverlay;