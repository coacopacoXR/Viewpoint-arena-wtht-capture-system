import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Vector3, Raycaster, Mesh, Group } from 'three';
import { useStore } from '../../store';
import { usePresence } from '../../lib/PresenceContext';
import { setLaserEntry, clearLaserEntry } from '../../lib/laserTargetRef';

const UserLaser: React.FC = () => {
    const { camera, scene } = useThree();
    const isLaserActive = useStore(state => state.isLaserActive);
    const setLaserActive = useStore(state => state.setLaserActive);
    const selectNode = useStore(state => state.selectNode);
    const userColor = useStore(state => state.currentUserColor);
    const { broadcastLaserMove, localUserId } = usePresence();
    const lastLaserBroadcast = useRef(0);

    const raycaster = useRef(new Raycaster());

    // Refs for direct manipulation (60fps performance)
    const beamMesh = useRef<Mesh>(null);
    const sparkMesh = useRef<Group>(null);
    const partLabelRef = useRef<HTMLDivElement>(null);

    const laserEndPos = useRef(new Vector3());
    const laserStartPos = useRef(new Vector3());

    const lastHitId = useRef<string | null>(null);
    const lastPartName = useRef<string | null>(null);

    // Activation sources tracked independently so the laser stays active as
    // long as ANY source is held (mouse both-buttons OR the P key).
    const mouseHeld = useRef(false);
    const keyHeld = useRef(false);
    const wasActive = useRef(false);

    useEffect(() => {
        const sync = () => {
            const active = mouseHeld.current || keyHeld.current;
            if (active === wasActive.current) return;
            wasActive.current = active;
            setLaserActive(active);
            if (!active) {
                // Belt-and-suspenders: clear local state + tell remotes the laser is off.
                // The TTL on receivers is a backstop if this broadcast is lost.
                broadcastLaserMove(null, null);
                selectNode(null);
                lastHitId.current = null;
                lastPartName.current = null;
                clearLaserEntry(localUserId);
                if (partLabelRef.current) {
                    partLabelRef.current.style.display = 'none';
                    partLabelRef.current.textContent = '';
                }
            }
        };

        const isTextInput = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            return (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable
            );
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (e.buttons === 3) { mouseHeld.current = true; sync(); }
        };
        const handleMouseUp = (e: MouseEvent) => {
            if (e.buttons !== 3) { mouseHeld.current = false; sync(); }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.repeat) return;
            if (e.key !== 'p' && e.key !== 'P') return;
            if (isTextInput(e.target)) return;
            keyHeld.current = true;
            sync();
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key !== 'p' && e.key !== 'P') return;
            keyHeld.current = false;
            sync();
        };
        const releaseAll = () => {
            mouseHeld.current = false;
            keyHeld.current = false;
            sync();
        };
        const handleVisibility = () => {
            if (document.hidden) releaseAll();
        };

        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        // pointerup fires even when the cursor leaves the window — covers cases
        // where mouseup doesn't get delivered (drag out, browser focus loss).
        window.addEventListener('pointerup', handleMouseUp as unknown as EventListener);
        window.addEventListener('pointercancel', releaseAll);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', releaseAll);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('pointerup', handleMouseUp as unknown as EventListener);
            window.removeEventListener('pointercancel', releaseAll);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', releaseAll);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [setLaserActive, selectNode, broadcastLaserMove, localUserId]);

    useFrame((state) => {
        if (!isLaserActive) return;

        raycaster.current.setFromCamera(state.pointer, camera);

        const intersects = raycaster.current.intersectObjects(scene.children, true);

        let foundId: string | null = null;
        let foundMeshName: string | null = null;
        let foundPartName: string | null = null;
        let hitPoint = new Vector3();

        for (let i = 0; i < intersects.length; i++) {
            const hit = intersects[i];
            const obj: any = hit.object;
            // Skip non-content (helpers, agent avatars, remote avatars, remote laser dots/beams)
            if (
                obj.userData?.skipRaycast ||
                obj.name?.startsWith?.('Agent') ||
                obj.type === 'Line' ||
                obj.type === 'Points'
            ) continue;

            // Walk up looking for a tagged model — also bail if any ancestor is skipRaycast
            let curr: any = obj;
            let skip = false;
            while (curr) {
                if (curr.userData?.skipRaycast) { skip = true; break; }
                if (curr.userData?.modelId) { foundId = curr.userData.modelId; break; }
                curr = curr.parent ?? null;
            }
            if (skip) { foundId = null; continue; }

            if (foundId) {
                hitPoint.copy(hit.point);
                foundMeshName = obj.userData?.meshIndex != null
                    ? String(obj.userData.meshIndex)
                    : (obj.name || null);
                foundPartName = obj.userData?.partName ?? null;
                break;
            }
        }

        // Build beam start position (handheld feel — offset right, down, forward from camera)
        const start = new Vector3();
        start.setFromMatrixPosition(camera.matrixWorld);

        const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

        start.add(right.multiplyScalar(0.3));
        start.add(up.multiplyScalar(-0.2));
        start.add(forward.multiplyScalar(0.5));

        let hitSomething = false;

        if (!foundId) {
            hitPoint.copy(raycaster.current.ray.origin).add(raycaster.current.ray.direction.multiplyScalar(20));
            hitSomething = false;
        } else {
            hitSomething = true;
        }

        laserStartPos.current.copy(start);
        laserEndPos.current.copy(hitPoint);

        if (beamMesh.current) {
            const midPoint = new Vector3().addVectors(start, hitPoint).multiplyScalar(0.5);
            beamMesh.current.position.copy(midPoint);
            beamMesh.current.lookAt(hitPoint);
            beamMesh.current.rotateX(Math.PI / 2);

            const dist = start.distanceTo(hitPoint);
            beamMesh.current.scale.set(1, dist, 1);
        }

        if (sparkMesh.current) {
            sparkMesh.current.visible = hitSomething;
            if (hitSomething) {
                sparkMesh.current.position.copy(hitPoint);
                const pulse = 1.0 + 0.25 * Math.sin(state.clock.elapsedTime * 14.0);
                sparkMesh.current.scale.setScalar(pulse);
            }
        }

        if (foundId !== lastHitId.current) {
             selectNode(foundId);
             lastHitId.current = foundId;
        }

        // Local part-name label (imperative DOM update — no re-render)
        if (partLabelRef.current && foundPartName !== lastPartName.current) {
            lastPartName.current = foundPartName;
            partLabelRef.current.textContent = foundPartName ?? '';
            partLabelRef.current.style.display = foundPartName ? 'block' : 'none';
        }

        // Local highlight feedback — mirror our own laser target into the
        // shared maps so model components light up the part we're pointing at
        // without waiting for a network roundtrip.
        setLaserEntry(localUserId, foundId, foundMeshName, foundPartName, userColor);

        // Network broadcast at ~10fps
        const now = Date.now();
        if (now - lastLaserBroadcast.current > 100) {
            lastLaserBroadcast.current = now;
            broadcastLaserMove([hitPoint.x, hitPoint.y, hitPoint.z], foundId, foundMeshName, foundPartName);
        }
    });

    if (!isLaserActive) return null;

    return (
        <group>
            <mesh ref={beamMesh} userData={{ skipRaycast: true }}>
                <cylinderGeometry args={[0.005, 0.005, 1, 8]} />
                <meshBasicMaterial color={userColor} transparent opacity={0.6} depthTest={false} />
            </mesh>

            <group ref={sparkMesh} userData={{ skipRaycast: true }}>
                <mesh userData={{ skipRaycast: true }}>
                    <sphereGeometry args={[0.03, 8, 8]} />
                    <meshBasicMaterial color={userColor} toneMapped={false} />
                </mesh>
                <pointLight color={userColor} intensity={2} distance={1} />
                {/* Part-name label tracks the spark so the user always knows what they're pointing at */}
                <Html position={[0, 0.08, 0]} center distanceFactor={6} style={{ pointerEvents: 'none' }} zIndexRange={[0, 0]}>
                    <div
                        ref={partLabelRef}
                        style={{
                            background: userColor,
                            color: '#fff',
                            fontFamily: 'monospace',
                            fontSize: '8px',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            whiteSpace: 'nowrap',
                            display: 'none',
                            boxShadow: '0 0 6px rgba(0,0,0,0.5)',
                        }}
                    />
                </Html>
            </group>
        </group>
    );
};

export default UserLaser;
