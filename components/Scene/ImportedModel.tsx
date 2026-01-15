import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '../../store';

const ImportedModel: React.FC = () => {
    const importedMeshes = useStore(state => state.importedMeshes);
    const importedScale = useStore(state => state.importedScale);
    const importedBaseScale = useStore(state => state.importedBaseScale);
    const importedBasePosition = useStore(state => state.importedBasePosition);
    const objectStates = useStore(state => state.objectStates);
    const registerPOI = useStore(state => state.registerPOI);
    const groupRef = useRef<THREE.Group>(null);
    const registeredIds = useRef<Set<string>>(new Set());

    if (!importedMeshes) return null;

    useEffect(() => {
        if (!groupRef.current) return;
        const group = groupRef.current;
        group.scale.setScalar(importedScale * importedBaseScale);
        if (importedBasePosition) {
            group.position.copy(importedBasePosition);
        }
        const box = new THREE.Box3().setFromObject(group);
        group.position.y -= box.min.y;
    }, [importedScale, importedBaseScale, importedBasePosition, importedMeshes]);

    useEffect(() => {
        if (!groupRef.current) return;
        registeredIds.current.clear();

        groupRef.current.traverse(child => {
            if (child instanceof THREE.Mesh) {
                const id = child.userData.modelId as string | undefined;
                if (!id || registeredIds.current.has(id)) return;
                const box = new THREE.Box3().setFromObject(child);
                const center = box.getCenter(new THREE.Vector3());
                registerPOI({
                    id,
                    position: center,
                    label: child.name || id,
                    type: 'GENERAL'
                });
                registeredIds.current.add(id);
            }
        });
    }, [registerPOI, importedMeshes]);

    useEffect(() => {
        if (!groupRef.current) return;

        const updateVisibility = (object: THREE.Object3D, parentVisible: boolean, parentSelected: boolean) => {
            const id = object.userData.modelId as string | undefined;
            const state = id ? objectStates[id] : undefined;
            const isVisible = (state?.visible ?? true) && parentVisible;
            const isSelected = (state?.selected ?? false) || parentSelected;

            object.visible = isVisible;

            if (object instanceof THREE.Mesh) {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach(material => {
                    if (material && 'emissive' in material) {
                        const meshMaterial = material as THREE.MeshStandardMaterial;
                        meshMaterial.emissive = isSelected ? new THREE.Color(0x0044aa) : new THREE.Color(0x000000);
                        meshMaterial.emissiveIntensity = isSelected ? 0.5 : 0;
                    }
                });
            }

            object.children.forEach(child => updateVisibility(child, isVisible, isSelected));
        };

        updateVisibility(groupRef.current, true, false);
    }, [objectStates, importedMeshes]);

    return <primitive ref={groupRef} object={importedMeshes} />;
};

export default ImportedModel;
