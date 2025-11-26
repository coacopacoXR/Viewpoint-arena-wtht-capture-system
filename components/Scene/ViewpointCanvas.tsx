import React, { Suspense, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import World from './World';
import DialogueEngine from '../System/DialogueEngine';
import UserLaser from './UserLaser';
import { useStore } from '../../store';
import { ViewMode } from '../../types';
import * as THREE from 'three';

// Helper to calculate AI Camera target based on Weights and Gaze
const calculateWeightedCameraTarget = (scene: THREE.Scene, agents: any[], weights: Record<string, number>, time: number) => {
  const focusPoints: THREE.Vector3[] = [];
  const agentPositions: THREE.Vector3[] = [];
  let totalWeight = 0;

  if (!agents) return { target: new THREE.Vector3(), position: new THREE.Vector3(0, 5, 5) };

  agents.forEach(agent => {
      const weight = weights[agent.id] || 0;
      if (weight > 0) {
          const agentObj = scene.getObjectByName(`Agent-${agent.id}`);
          if (agentObj) {
              // Get Agent Head Position
              const headPos = new THREE.Vector3().setFromMatrixPosition(agentObj.matrixWorld);
              headPos.y += 1.6; 
              
              // Get Gaze Target (Approximate)
              const forward = new THREE.Vector3(0, 0, 1);
              forward.applyQuaternion(agentObj.quaternion);
              const lookTarget = headPos.clone().add(forward.multiplyScalar(3)); // 3 units ahead
              
              focusPoints.push(lookTarget.multiplyScalar(weight));
              agentPositions.push(headPos.multiplyScalar(weight));
              totalWeight += weight;
          }
      }
  });

  if (totalWeight === 0) {
      // Fallback: Gentle orbit around center
      return {
          target: new THREE.Vector3(0, 0.5, 0),
          position: new THREE.Vector3(
             Math.sin(time * 0.1) * 5, 
             3, 
             Math.cos(time * 0.1) * 5
          )
      };
  }

  // Calculate Weighted Centroid for LOOK TARGET
  const avgTarget = new THREE.Vector3();
  focusPoints.forEach(p => avgTarget.add(p));
  avgTarget.divideScalar(totalWeight);

  // Calculate Weighted Centroid for CAMERA POSITION
  const avgPos = new THREE.Vector3();
  agentPositions.forEach(p => avgPos.add(p));
  avgPos.divideScalar(totalWeight);

  // Ideally we want to be ~2-3 units behind the weighted center of agents, looking at the weighted center of attention
  const directionToBack = avgPos.clone().sub(avgTarget).normalize();
  const idealCamPos = avgPos.clone().add(directionToBack.multiplyScalar(3.0)).add(new THREE.Vector3(0, 1.0, 0));

  return {
      target: avgTarget,
      position: idealCamPos
  };
};

// Helper component to handle rendering logic (Standard vs Split)
const SceneRenderer = () => {
  // Use selectors to avoid re-rendering on every store update (like time)
  const viewMode = useStore(state => state.viewMode);
  const activeAgentId = useStore(state => state.activeAgentId);
  const splitScreenTargetId = useStore(state => state.splitScreenTargetId);
  const agents = useStore(state => state.agents);
  const agentWeights = useStore(state => state.agentWeights);
  const isLaserActive = useStore(state => state.isLaserActive);

  const { gl, scene, camera: defaultCamera, size } = useThree();
  
  // Lazy init secondary camera
  const agentCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  if (!agentCamRef.current) {
      agentCamRef.current = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  }

  const controlsRef = useRef<any>(null);
  
  // Movement smoothing refs
  const posVec = useRef(new THREE.Vector3());
  const targetVec = useRef(new THREE.Vector3());
  const aiTargetRef = useRef(new THREE.Vector3(0,0,0));
  const aiPosRef = useRef(new THREE.Vector3(0,5,5));

  // Interaction State for AI Mode Override
  const isInteracting = useRef(false);
  const lastInteractionEnd = useRef(0);

  // We use render priority 1 to run after standard r3f loops.
  useFrame((state, delta) => {
    const mainCam = defaultCamera as THREE.PerspectiveCamera;
    const controls = controlsRef.current;
    const elapsedTime = state.clock.getElapsedTime();
    
    // --- 1. CAMERA MOVEMENT LOGIC (Main View) ---

    if (viewMode === ViewMode.FOLLOW_PRESENTER) {
       const angle = (elapsedTime * 0.2); 
       posVec.current.set(Math.sin(angle) * 3.5 * 1.5, 3, Math.cos(angle) * 3.5 * 1.5);
       targetVec.current.set(0, 0, 0);
       
       mainCam.position.lerp(posVec.current, 0.02);
       if (controls) controls.target.lerp(targetVec.current, 0.05);
    } 
    else if (viewMode === ViewMode.POV_AGENT && activeAgentId) {
        const agentObj = scene.getObjectByName(`Agent-${activeAgentId}`);
        if (agentObj) {
             posVec.current.setFromMatrixPosition(agentObj.matrixWorld);
             posVec.current.y += 0.6; // Align with screen/eye height
             
             mainCam.position.lerp(posVec.current, 0.2);
             
             const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(agentObj.quaternion);
             targetVec.current.copy(posVec.current).add(forward);
             
             if (controls) controls.target.lerp(targetVec.current, 0.2);
        }
    }
    else if (viewMode === ViewMode.OVERHEAD || viewMode === ViewMode.HEATMAP) {
        posVec.current.set(0, 12, 0);
        targetVec.current.set(0, 0, 0);
        mainCam.position.lerp(posVec.current, 0.05);
        if (controls) controls.target.lerp(targetVec.current, 0.1);
    }
    else if (viewMode === ViewMode.AI_GUIDED) {
        const { target, position } = calculateWeightedCameraTarget(scene, agents, agentWeights, elapsedTime);
        
        // Check for user manual override
        const now = Date.now();
        const isUserActive = isInteracting.current || (now - lastInteractionEnd.current < 1500); // 1.5s delay

        if (!isUserActive) {
            // AI Controlled
            aiTargetRef.current.lerp(target, 0.02);
            aiPosRef.current.lerp(position, 0.02);
            
            mainCam.position.lerp(aiPosRef.current, 0.05);
            if (controls) controls.target.lerp(aiTargetRef.current, 0.05);
        } else {
            // User Controlled - Sync AI refs to current user position so transition is smooth later
            aiPosRef.current.copy(mainCam.position);
            if (controls) aiTargetRef.current.copy(controls.target);
        }
    }

    if (controls) controls.update();


    // --- 2. RENDER LOGIC (Split vs Standard) ---
    
    // CRITICAL: Use physical pixels for Viewport/Scissor
    const dpr = gl.getPixelRatio();
    const totalWidth = Math.floor(size.width * dpr);
    const totalHeight = Math.floor(size.height * dpr);

    gl.autoClear = false;
    gl.clear();
    
    if (viewMode === ViewMode.SPLIT_SCREEN) {
        // -- Split Screen --
        const halfWidth = Math.floor(totalWidth / 2);

        // 1. Render Left Panel (User View)
        // Update Aspect Ratio based on LOGICAL size
        mainCam.aspect = (size.width / 2) / size.height;
        mainCam.updateProjectionMatrix();

        gl.setViewport(0, 0, halfWidth, totalHeight);
        gl.setScissor(0, 0, halfWidth, totalHeight);
        gl.setScissorTest(true);
        gl.render(scene, mainCam);

        // Restore main cam aspect for next frame calculations (controls etc)
        mainCam.aspect = size.width / size.height;
        mainCam.updateProjectionMatrix();

        // 2. Render Right Panel (Agent View)
        let agentFound = false;
        if (splitScreenTargetId && agentCamRef.current) {
            const agentObj = scene.getObjectByName(`Agent-${splitScreenTargetId}`);
            if (agentObj) {
                agentFound = true;
                const p = new THREE.Vector3();
                p.setFromMatrixPosition(agentObj.matrixWorld);
                p.y += 0.6; // Eye/Screen level
                
                agentCamRef.current.position.copy(p);
                
                // Use the agent's rotation exactly
                const q = new THREE.Quaternion();
                agentObj.getWorldQuaternion(q);
                agentCamRef.current.quaternion.copy(q);
                // FIX: Objects look at +Z, Cameras look down -Z. We must rotate 180 deg around Y.
                agentCamRef.current.rotateY(Math.PI);

                // Adjust agent cam aspect
                agentCamRef.current.aspect = (size.width / 2) / size.height;
                agentCamRef.current.updateProjectionMatrix();
                agentCamRef.current.updateMatrixWorld();
                
                // IMPORTANT: Hide the agent itself so they don't block their own view
                const wasVisible = agentObj.visible;
                agentObj.visible = false;
                
                gl.setViewport(halfWidth, 0, halfWidth, totalHeight);
                gl.setScissor(halfWidth, 0, halfWidth, totalHeight);
                gl.render(scene, agentCamRef.current);
                
                // Restore visibility
                agentObj.visible = wasVisible;
            }
        }
        
        // Fallback if no agent selected or not found: Clear/Black
        if (!agentFound) {
             gl.setViewport(halfWidth, 0, halfWidth, totalHeight);
             gl.setScissor(halfWidth, 0, halfWidth, totalHeight);
             gl.setClearColor(new THREE.Color('#111'));
             gl.clear();
             // Restore default clear color
             gl.setClearColor(new THREE.Color('#f0f0f0'));
        }

        gl.setScissorTest(false);
    } else {
        // -- Standard View --
        gl.setViewport(0, 0, totalWidth, totalHeight);
        gl.setScissor(0, 0, totalWidth, totalHeight);
        gl.setScissorTest(false);
        gl.render(scene, mainCam);
    }
  }, 1);
  
  return (
    <OrbitControls 
      ref={controlsRef} 
      enableDamping 
      dampingFactor={0.1}
      // Disable controls if User Laser is active (so mouse moves pointer, not camera)
      enabled={viewMode !== ViewMode.POV_AGENT && !isLaserActive}
      minDistance={1}
      maxDistance={20}
      onStart={() => { isInteracting.current = true; }}
      onEnd={() => { isInteracting.current = false; lastInteractionEnd.current = Date.now(); }}
    />
  );
};

const ViewpointCanvas: React.FC = () => {
  return (
    <Canvas 
      shadows 
      dpr={[1, 2]} 
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, autoClear: false }}
    >
      <PerspectiveCamera makeDefault position={[5, 4, 5]} fov={40} />
      
      {/* Systems */}
      <DialogueEngine />
      <UserLaser />
      <SceneRenderer />
      
      <Suspense fallback={null}>
        <World />
      </Suspense>
    </Canvas>
  );
};

export default ViewpointCanvas;