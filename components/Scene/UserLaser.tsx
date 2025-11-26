import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Raycaster, Mesh, Group } from 'three';
import { useStore } from '../../store';

const UserLaser: React.FC = () => {
    const { camera, scene } = useThree();
    const isLaserActive = useStore(state => state.isLaserActive);
    const setLaserActive = useStore(state => state.setLaserActive);
    const selectNode = useStore(state => state.selectNode);

    const raycaster = useRef(new Raycaster());
    
    // Refs for direct manipulation (60fps performance)
    const beamMesh = useRef<Mesh>(null);
    const sparkMesh = useRef<Group>(null);
    
    const laserEndPos = useRef(new Vector3());
    const laserStartPos = useRef(new Vector3());
    
    // Optimization: Track the last ID to avoid spamming the store every frame
    const lastHitId = useRef<string | null>(null);

    // Handle Mouse Inputs (Left + Right Button)
    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            // buttons: 1=Left, 2=Right, 3=Left+Right
            if (e.buttons === 3) {
                setLaserActive(true);
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (e.buttons !== 3) {
                setLaserActive(false);
                // Clear selection on release
                selectNode(null); 
                lastHitId.current = null;
            }
        };

        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('blur', () => setLaserActive(false));

        return () => {
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('blur', () => setLaserActive(false));
        };
    }, [setLaserActive, selectNode]);

    useFrame((state) => {
        if (!isLaserActive) return;

        // 1. Update Raycaster
        raycaster.current.setFromCamera(state.pointer, camera);

        // 2. Intersect Scene
        const intersects = raycaster.current.intersectObjects(scene.children, true);
        
        let foundId: string | null = null;
        let hitPoint = new Vector3();

        for (let i = 0; i < intersects.length; i++) {
            const hit = intersects[i];
            if (hit.object.name.startsWith('Agent') || hit.object.type === 'Line' || hit.object.type === 'Points') continue;

            let curr = hit.object;
            while (curr) {
                if (curr.userData && curr.userData.modelId) {
                    foundId = curr.userData.modelId;
                    break;
                }
                if (curr.parent) curr = curr.parent;
                else break;
            }

            if (foundId) {
                hitPoint.copy(hit.point);
                break;
            }
        }

        // 3. Calculate Beam Coordinates
        const start = new Vector3();
        start.setFromMatrixPosition(camera.matrixWorld);
        
        const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        
        // Start laser slightly below and to the right (Handheld feel)
        start.add(right.multiplyScalar(0.3)); 
        start.add(up.multiplyScalar(-0.2));
        start.add(forward.multiplyScalar(0.5)); // Move forward past clip plane
        
        let hitSomething = false;

        if (!foundId) {
            // No hit: Shoot into distance
            hitPoint.copy(raycaster.current.ray.origin).add(raycaster.current.ray.direction.multiplyScalar(20));
            hitSomething = false;
        } else {
            hitSomething = true;
        }

        laserStartPos.current.copy(start);
        laserEndPos.current.copy(hitPoint);

        // 4. Update Visuals (Directly manipulate meshes)
        if (beamMesh.current) {
            // Position at midpoint
            const midPoint = new Vector3().addVectors(start, hitPoint).multiplyScalar(0.5);
            beamMesh.current.position.copy(midPoint);
            
            // Orient to look at endpoint
            beamMesh.current.lookAt(hitPoint);
            beamMesh.current.rotateX(Math.PI / 2); // Cylinder aligns along Y by default, we need Z alignment or similar logic

            // Scale height to match distance
            const dist = start.distanceTo(hitPoint);
            beamMesh.current.scale.set(1, dist, 1);
        }

        if (sparkMesh.current) {
            sparkMesh.current.visible = hitSomething;
            if (hitSomething) {
                sparkMesh.current.position.copy(hitPoint);
            }
        }

        // 5. Update Store (Debounced)
        if (foundId !== lastHitId.current) {
             selectNode(foundId);
             lastHitId.current = foundId;
        }
    });

    if (!isLaserActive) return null;

    return (
        <group>
            {/* The Beam (Cylinder) */}
            <mesh ref={beamMesh}>
                {/* Height 1, radius very small. We scale height in loop. */}
                <cylinderGeometry args={[0.005, 0.005, 1, 8]} />
                <meshBasicMaterial color="#ff0000" transparent opacity={0.6} depthTest={false} />
            </mesh>
            
            {/* The Spark at impact */}
            <group ref={sparkMesh}>
                <mesh>
                    <sphereGeometry args={[0.03, 8, 8]} />
                    <meshBasicMaterial color="#ffaa00" toneMapped={false} />
                </mesh>
                <pointLight color="#ff0000" intensity={2} distance={1} />
            </group>
        </group>
    );
};

export default UserLaser;