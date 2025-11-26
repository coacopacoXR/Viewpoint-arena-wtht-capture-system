import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group, MeshStandardMaterial, Mesh } from 'three';
import { Html, Line, Trail } from '@react-three/drei';
import { AgentState, PointOfInterest, ViewMode, AgentBehaviorState, AgentStyle } from '../../types';
import { useStore } from '../../store';
import * as THREE from 'three';

interface AgentProps {
  initialState: AgentState;
  allAgents: AgentState[]; 
}

const Agent: React.FC<AgentProps> = ({ initialState, allAgents }) => {
  const groupRef = useRef<Group>(null);
  const visualRef = useRef<Group>(null); // For the visual mesh independent rotation
  const materialRef = useRef<MeshStandardMaterial>(null);
  
  const pois = useStore(state => state.pois);
  const showFrustums = useStore(state => state.showFrustums);
  const showGaze = useStore(state => state.showGaze);
  const showTrails = useStore(state => state.showTrails);
  const isPlaying = useStore(state => state.isPlaying);
  const activeAgentId = useStore(state => state.activeAgentId);
  const setActiveAgent = useStore(state => state.setActiveAgent);
  const setViewMode = useStore(state => state.setViewMode);
  const viewMode = useStore(state => state.viewMode);
  const leaderId = useStore(state => state.leaderId);
  const splitScreenTargetId = useStore(state => state.splitScreenTargetId);
  const agentStyle = useStore(state => state.agentStyle);
  const updateHeatmap = useStore(state => state.updateHeatmap);
  const updateAgentStatus = useStore(state => state.updateAgentStatus);
  
  // Local state for behavior
  const [behavior, setBehavior] = useState<AgentBehaviorState>('IDLE');
  const [targetPoi, setTargetPoi] = useState<PointOfInterest | null>(null);
  const [targetPos, setTargetPos] = useState(new Vector3(0, 0, 0));
  
  // Movement references
  const position = useRef(new Vector3(
    Math.sin(initialState.id === '1' ? 0 : initialState.id === '2' ? 2 : 4) * 3.5,
    1,
    Math.cos(initialState.id === '1' ? 0 : initialState.id === '2' ? 2 : 4) * 3.5
  ));
  const lookTarget = useRef(new Vector3());
  const timer = useRef(0);
  const lookAtRef = useRef(new Vector3()); // Smooth lookAt

  // Initialize random behavior
  useEffect(() => {
    if (pois.length > 0 && !targetPoi) {
      pickNewTask();
    }
  }, [pois]);

  const pickNewTask = () => {
    if (pois.length === 0) return;
    
    // Pick random POI
    const poi = pois[Math.floor(Math.random() * pois.length)];
    setTargetPoi(poi);
    
    // Calculate a standing position near the POI
    const angle = Math.random() * Math.PI * 2;
    const dist = 2.5 + Math.random() * 1.0; 
    
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;
    setTargetPos(new Vector3(x, 1, z));
    
    setBehavior('MOVING');
    // SYNC TO STORE
    updateAgentStatus(initialState.id, 'MOVING', null);
    
    timer.current = 2 + Math.random() * 3; 
  };

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // --- Translucency Logic ---
    const camera = state.camera;
    const camPos = camera.position;
    const agentPos = groupRef.current.position;
    const centerPos = new Vector3(0, 0, 0); 

    const distCamToAgent = camPos.distanceTo(agentPos);
    const distCamToCenter = camPos.distanceTo(centerPos);
    
    const toAgent = agentPos.clone().sub(camPos).normalize();
    const toCenter = centerPos.clone().sub(camPos).normalize();
    const alignment = toAgent.dot(toCenter);

    let targetOpacity = 1.0;
    const isOccluding = (distCamToAgent < distCamToCenter - 1.0) && (alignment > 0.92);
    
    if (isOccluding) {
        targetOpacity = 0.15;
    }

    if (materialRef.current) {
        materialRef.current.opacity = THREE.MathUtils.lerp(materialRef.current.opacity, targetOpacity, delta * 5);
        materialRef.current.transparent = true; 
        materialRef.current.depthWrite = materialRef.current.opacity > 0.8;
    }

    // --- Visual Rotation Logic ---
    if (visualRef.current && agentStyle === AgentStyle.BOX) {
        visualRef.current.lookAt(0, 0.5, 0); 
    }

    if (!isPlaying) return;

    // --- Heatmap Data Collection ---
    if (behavior === 'INSPECTING' && targetPoi) {
        updateHeatmap(targetPoi.id, delta);
    }

    // --- MOVEMENT LOGIC ---
    const isFollowingUser = leaderId === 'USER';

    if (isFollowingUser) {
         // -- FOLLOWER LOGIC --
         // Get Leader (Camera) Orientation
         const leaderPos = state.camera.position.clone();
         const leaderDir = new Vector3(0, 0, -1).applyQuaternion(state.camera.quaternion);
         leaderDir.y = 0; leaderDir.normalize();
         const leaderRight = new Vector3(-1, 0, 0).applyQuaternion(state.camera.quaternion);
         leaderRight.y = 0; leaderRight.normalize();

         // Define Formation Slots
         // ID 1: Left, ID 2: Right, ID 3: Further Back
         let offsetRight = 0;
         let offsetBack = 2.5;
         
         if (initialState.id === '1') offsetRight = -1.5;
         if (initialState.id === '2') offsetRight = 1.5;
         if (initialState.id === '3') { offsetRight = 0; offsetBack = 3.5; }

         // Calculate Desired Position
         const formationPos = leaderPos.clone()
             .add(leaderDir.clone().multiplyScalar(-offsetBack)) // Behind
             .add(leaderRight.clone().multiplyScalar(offsetRight)); // Side
         
         formationPos.y = 1.0; // Keep height constant

         // Calculate Desired Look Target (Parallel to Leader)
         // We want them to look at the same thing the leader is looking at (roughly)
         const farTarget = leaderPos.clone().add(leaderDir.clone().multiplyScalar(10));

         // Apply Smooth Movement
         position.current.lerp(formationPos, 0.05);
         lookAtRef.current.lerp(farTarget, 0.05);
         
         // If we were autonomous, switch state but don't spam store
         if (behavior !== 'FOLLOWING') {
             setBehavior('FOLLOWING');
             updateAgentStatus(initialState.id, 'FOLLOWING', null);
         }

    } else {
        // -- AUTONOMOUS LOGIC --
        if (behavior === 'MOVING') {
            // Orbital Movement Logic to prevent crossing the center
            const cx = 0; 
            const cz = 0;
            
            // Current polar coords relative to center
            const dx = position.current.x - cx;
            const dz = position.current.z - cz;
            let currentAngle = Math.atan2(dx, dz); 
            let currentRadius = Math.sqrt(dx*dx + dz*dz);
            
            // Target polar coords
            const tx = targetPos.x - cx;
            const tz = targetPos.z - cz;
            const targetAngle = Math.atan2(tx, tz);
            const targetRadius = Math.sqrt(tx*tx + tz*tz);

            // Shortest angular path
            let deltaAngle = targetAngle - currentAngle;
            // Normalize to -PI to +PI
            if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
            if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;

            const angularSpeed = 0.6; // Rad/s
            const radialSpeed = 1.0; // Units/s
            
            // Check arrival
            if (Math.abs(deltaAngle) < 0.1 && Math.abs(targetRadius - currentRadius) < 0.2) {
                setBehavior('INSPECTING');
                // SYNC TO STORE
                updateAgentStatus(initialState.id, 'INSPECTING', targetPoi?.id || null);
                
                timer.current = 3 + Math.random() * 5; 
            } else {
                 // Move Angle
                 const angleStep = angularSpeed * delta;
                 if (Math.abs(deltaAngle) > 0.01) {
                     currentAngle += Math.sign(deltaAngle) * Math.min(Math.abs(deltaAngle), angleStep);
                 }
                 
                 // Move Radius
                 currentRadius = THREE.MathUtils.lerp(currentRadius, targetRadius, delta * radialSpeed);

                 // Update Cartesian Position
                 position.current.x = cx + Math.sin(currentAngle) * currentRadius;
                 position.current.z = cz + Math.cos(currentAngle) * currentRadius;
            }
            
            if (targetPoi) lookAtRef.current.lerp(targetPoi.position, 0.1);

        } else if (behavior === 'INSPECTING') {
            timer.current -= delta;
            if (targetPoi) lookAtRef.current.lerp(targetPoi.position, 0.1);
            position.current.y = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
            if (timer.current <= 0) pickNewTask();
        } else if (behavior === 'FOLLOWING') {
            // Just released from follow mode, pick a task
            pickNewTask();
        }
    }

    lookTarget.current.copy(lookAtRef.current);

    // Separation (prevent overlapping)
    if (!isFollowingUser) {
        allAgents.forEach(other => {
             if (other.id !== initialState.id) {
                const otherObj = groupRef.current?.parent?.getObjectByName(`Agent-${other.id}`);
                if (otherObj) {
                    const diff = position.current.clone().sub(otherObj.position);
                    const dist = diff.length();
                    if (dist < 1.2) {
                        diff.normalize().multiplyScalar(delta * 2.0);
                        position.current.add(diff);
                    }
                }
             }
        });
    }

    groupRef.current.position.lerp(position.current, 0.2); // Smoother Lerp
    groupRef.current.lookAt(lookAtRef.current);
  });

  const agentColor = initialState.role === 'PRESENTER' ? '#ff4400' : (initialState.role === 'REVIEWER' ? '#0066ff' : '#888');
  
  const isPossessed = (viewMode === ViewMode.POV_AGENT && activeAgentId === initialState.id);
  const isVisible = !isPossessed; 
  const isActive = activeAgentId === initialState.id;
  const isSplitTarget = splitScreenTargetId === initialState.id;

  const handleInteraction = (e: any) => {
    e.stopPropagation();
    setActiveAgent(initialState.id);
    setViewMode(ViewMode.POV_AGENT);
  };

  return (
    <group ref={groupRef} onClick={handleInteraction} name={`Agent-${initialState.id}`}>
      {/* Ghost Trails */}
      {showTrails && (
          <Trail width={0.3} length={15} color={agentColor} attenuation={(t) => t * t}>
            <mesh visible={false} position={[0, 0, 0]}>
                <sphereGeometry args={[0.1]} />
            </mesh>
          </Trail>
      )}

      {/* Selection Highlight */}
      {(isActive || isSplitTarget) && !isPossessed && (
        <mesh position={[0, -0.8, 0]} rotation={[-Math.PI/2, 0, 0]}>
            <ringGeometry args={[0.4, 0.5, 32]} />
            <meshBasicMaterial color={isSplitTarget ? "#00ff00" : agentColor} opacity={0.5} transparent />
        </mesh>
      )}

      {/* Avatar Visuals */}
      <group visible={isVisible}>
          
          {/* STYLE: SCREEN (Box) */}
          {agentStyle === AgentStyle.BOX && (
             <group ref={visualRef} position={[0, 0.6, 0]}>
                 <mesh castShadow receiveShadow>
                    <planeGeometry args={[0.12, 0.08]} />
                    <meshPhysicalMaterial 
                        ref={materialRef} 
                        color={agentColor} 
                        roughness={0.1} 
                        metalness={0.8} 
                        emissive={agentColor}
                        emissiveIntensity={0.5}
                        side={THREE.DoubleSide}
                        transparent
                        opacity={0.85}
                    />
                 </mesh>
                 <mesh position={[0, 0, -0.005]}>
                    <boxGeometry args={[0.13, 0.09, 0.01]} />
                    <meshStandardMaterial color="#111" roughness={0.5} />
                 </mesh>
             </group>
          )}

          {/* STYLE: CAPSULE */}
          {agentStyle === AgentStyle.CAPSULE && (
             <mesh castShadow receiveShadow rotation={[Math.PI/2, 0, 0]} position={[0, 0.1, 0]}>
                <capsuleGeometry args={[0.2, 1.2, 4, 8]} />
                <meshStandardMaterial ref={materialRef} color="#333" roughness={0.3} metalness={0.1} />
             </mesh>
          )}
          
          {/* STYLE: ROBOT */}
          {agentStyle === AgentStyle.ROBOT && (
            <group position={[0, 0.2, 0]}>
                 <mesh castShadow receiveShadow>
                    <boxGeometry args={[0.4, 0.8, 0.3]} />
                    <meshStandardMaterial ref={materialRef} color="#444" roughness={0.3} metalness={0.6} />
                 </mesh>
                 <mesh castShadow receiveShadow position={[0, 0.6, 0]}>
                    <boxGeometry args={[0.3, 0.3, 0.3]} />
                    <meshStandardMaterial color={agentColor} />
                 </mesh>
            </group>
          )}

          {/* Eyes */}
          {(agentStyle === AgentStyle.CAPSULE) && (
             <group position={[0, 0.5, 0.21]}>
                <mesh>
                  <boxGeometry args={[0.25, 0.08, 0.05]} />
                  <meshStandardMaterial color={agentColor} emissive={agentColor} emissiveIntensity={isActive ? 0.8 : 0.4} />
                </mesh>
             </group>
          )}

          {showFrustums && (
            <group position={[0, 0.6, 0.1]}>
                <Line
                    points={[
                    [0, 0, 0], [-0.5, 0.3, 1.5],
                    [0, 0, 0], [0.5, 0.3, 1.5],
                    [0, 0, 0], [-0.5, -0.3, 1.5],
                    [0, 0, 0], [0.5, -0.3, 1.5],
                    [-0.5, 0.3, 1.5], [0.5, 0.3, 1.5],
                    [0.5, 0.3, 1.5], [0.5, -0.3, 1.5],
                    [0.5, -0.3, 1.5], [-0.5, -0.3, 1.5],
                    [-0.5, -0.3, 1.5], [-0.5, 0.3, 1.5],
                    ]}
                    color={agentColor}
                    transparent
                    opacity={isActive ? 0.4 : 0.15}
                    lineWidth={1}
                />
            </group>
          )}
      </group>

      {/* Gaze Ray */}
      {showGaze && isVisible && (
        <group>
            <Line
            points={[[0, 0.6, 0.1], [0, 0.6, 4]]}
            color={agentColor}
            transparent
            opacity={0.1}
            dashScale={2}
            dashed
            lineWidth={1}
            />
        </group>
      )}

      {/* UI Tags */}
      {isVisible && (
        <Html position={[0, 1.0, 0]} center distanceFactor={6} style={{pointerEvents: 'none'}}>
            <div className="flex flex-col items-center gap-1 opacity-80">
                <div className={`font-mono text-[8px] px-1 rounded border whitespace-nowrap backdrop-blur-md transition-colors ${isActive ? 'bg-black text-white border-black' : 'text-gray-500 bg-white/60 border-gray-200'}`}>
                {initialState.name}
                </div>
            </div>
        </Html>
      )}
    </group>
  );
};

export default Agent;