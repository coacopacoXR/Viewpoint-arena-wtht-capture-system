import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useStore, sceneModelVisible, type SceneModelEntry } from '../../store';
import type { SceneModel } from '../../lib/scene/roomScene';

/**
 * Scale the imported model and put it centred on the origin, resting on the
 * floor. basePosition is -centre in the model's OWN units; the group is scaled,
 * so the offset is scaled with it. Unscaled, a model far from its origin (a CAD
 * part in millimetres, 100 mm out) was pushed ~100 scene units away and never
 * appeared.
 *
 * Places the model at the ORIGIN of whatever group holds it. Where in the room
 * that is comes from the SceneModel's offset, applied by the wrapper group in
 * SceneModelView below — so a model can be put beside another without this
 * having to know anything about the models around it.
 */
export function placeImportedGroup(group: THREE.Object3D, scale: number, basePosition: THREE.Vector3 | null): void {
    group.scale.setScalar(scale);
    if (basePosition) group.position.copy(basePosition).multiplyScalar(scale);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    group.position.y -= box.min.y;
}

/**
 * One model of the scene, at its offset.
 *
 * Its own component rather than a loop body because each one carries three
 * effects that must run against ITS geometry and nothing else's: the placement,
 * the point-of-interest registration the agents and the laser target, and the
 * walk that applies node visibility and the selection glow. Sharing one set of
 * refs across models is how the second model would have ended up registered
 * against the first one's meshes.
 */
const SceneModelView: React.FC<{ model: SceneModel; entry: SceneModelEntry; label: string | null }> = ({
    model,
    entry,
    label,
}) => {
    const objectStates = useStore(state => state.objectStates);
    const registerPOI = useStore(state => state.registerPOI);
    const groupRef = useRef<THREE.Group>(null);
    const registeredIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!groupRef.current) return;
        placeImportedGroup(groupRef.current, entry.scale * entry.baseScale, entry.basePosition);
    }, [entry]);

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
    }, [registerPOI, entry]);

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
    }, [objectStates, entry]);

    // Above the model, in scene units: the geometry is scaled inside the group,
    // the label is a sibling of it, so it is measured from the same numbers
    // placement uses rather than inheriting a scale that would grow the text.
    const labelY = entry.size.y * entry.baseScale * entry.scale + 0.15;

    return (
        <group position={model.offset}>
            <primitive ref={groupRef} object={entry.group} />
            {label && (
                <Html
                    position={[0, labelY, 0]}
                    center
                    distanceFactor={6}
                    style={{ pointerEvents: 'none' }}
                    zIndexRange={[0, 0]}
                >
                    <div
                        style={{
                            background: 'rgba(0,0,0,0.7)',
                            color: '#fff',
                            fontFamily: 'monospace',
                            fontSize: '7px',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {label}
                    </div>
                </Html>
            )}
        </group>
    );
};

/**
 * Every model the room's scene is showing.
 *
 * Renders nothing when the scene holds no models, which is what lets World mount
 * it unconditionally next to the built-ins: a room looking at the bundled
 * headphones has an empty list and this is an empty fragment.
 *
 * A model that is hidden is not rendered at all rather than rendered invisible,
 * so its meshes stay out of the raycast — pointing at where a hidden model was
 * should point at whatever is behind it, which is why somebody hid it.
 */
const ImportedModel: React.FC = () => {
    const scene = useStore(state => state.scene);
    const sceneEntries = useStore(state => state.sceneEntries);
    const localModelVisibility = useStore(state => state.localModelVisibility);

    const shown = scene.models.filter(model => {
        if (!sceneEntries[model.id]) return false;
        return sceneModelVisible(model, localModelVisibility);
    });
    if (shown.length === 0) return null;

    // A revision is only ambiguous when another one of the same product is on
    // screen beside it, so that is when it gets a label. Derived from the shared
    // scene rather than from whoever pressed Compare: the comparison is a scene
    // operation, and a label only one participant can see would have the room
    // looking at two brackets and arguing about which is which.
    const visiblePerLine = new Map<string, number>();
    for (const model of shown) {
        visiblePerLine.set(model.line, (visiblePerLine.get(model.line) ?? 0) + 1);
    }

    return (
        <>
            {shown.map(model => (
                <SceneModelView
                    key={model.id}
                    model={model}
                    entry={sceneEntries[model.id]}
                    label={(visiblePerLine.get(model.line) ?? 0) > 1 ? `Rev ${model.revision}` : null}
                />
            ))}
        </>
    );
};

export default ImportedModel;
