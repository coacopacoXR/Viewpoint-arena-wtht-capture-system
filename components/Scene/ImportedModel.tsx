import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { Vector3 } from 'three';

// Wrapper that connects imported meshes to the Scene Tree State
const ImportedModelPart: React.FC<{
    mesh: THREE.Mesh;
    id: string;
}> = ({ mesh, id }) => {
    const objectState = useStore(state => state.objectStates[id]);
    const registerPOI = useStore(state => state.registerPOI);
    const meshRef = useRef<THREE.Mesh>(null);

    const visible = objectState ? objectState.visible : true;
    const selected = objectState ? objectState.selected : false;

    // Register POI for this part
    useEffect(() => {
        if (meshRef.current) {
            const box = new THREE.Box3().setFromObject(meshRef.current);
            const center = box.getCenter(new THREE.Vector3());
            registerPOI({
                id: id,
                position: center,
                label: mesh.name || id,
                type: 'GENERAL'
            });
        }
    }, [registerPOI, id, mesh.name]);

    // Update material when selected
    useEffect(() => {
        if (meshRef.current && meshRef.current.material) {
            const mat = meshRef.current.material as THREE.MeshStandardMaterial;
            if (selected) {
                mat.emissive = new THREE.Color(0x0044aa);
                mat.emissiveIntensity = 0.5;
            } else {
                mat.emissive = new THREE.Color(0x000000);
                mat.emissiveIntensity = 0;
            }
        }
    }, [selected]);

    if (!visible) return null;

    // Clone the mesh for React rendering
    const clonedGeometry = mesh.geometry.clone();
    const clonedMaterial = (mesh.material as THREE.MeshStandardMaterial).clone();

    return (
        <mesh
            ref={meshRef}
            geometry={clonedGeometry}
            material={clonedMaterial}
            name={mesh.name}
            userData={{ modelId: id }}
            castShadow
            receiveShadow
        />
    );
};

const ImportedModel: React.FC = () => {
    const importedMeshes = useStore(state => state.importedMeshes);
    const groupRef = useRef<THREE.Group>(null);

    if (!importedMeshes) return null;

    return (
        <group ref={groupRef}>
            {importedMeshes.children.map((child, index) => {
                if (child instanceof THREE.Mesh) {
                    const id = child.userData.modelId || `imported_${index}`;
                    return (
                        <ImportedModelPart
                            key={id}
                            mesh={child}
                            id={id}
                        />
                    );
                }
                return null;
            })}
        </group>
    );
};

export default ImportedModel;
