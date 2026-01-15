import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { SceneNode } from '../types';

export interface ModelImportResult {
    root: THREE.Group;
    sceneTree: SceneNode;
    fileName: string;
    baseScale: number;
    basePosition: THREE.Vector3;
}

const SUPPORTED_EXTENSIONS = ['.glb', '.gltf', '.obj', '.fbx', '.stl'];

const ensureMeshMaterial = (mesh: THREE.Mesh) => {
    if (!mesh.material) {
        mesh.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0.7, 0.7, 0.75),
            metalness: 0.2,
            roughness: 0.6,
            side: THREE.DoubleSide
        });
        return;
    }

    if (Array.isArray(mesh.material)) {
        mesh.material.forEach(material => {
            material.side = THREE.DoubleSide;
        });
    } else {
        mesh.material.side = THREE.DoubleSide;
    }
};

const hasRenderableDescendant = (object: THREE.Object3D): boolean => {
    if (object instanceof THREE.Mesh) return true;
    return object.children.some(child => hasRenderableDescendant(child));
};

const buildSceneTree = (object: THREE.Object3D, counter: { value: number }): SceneNode | null => {
    if (!hasRenderableDescendant(object)) return null;

    const index = counter.value++;
    const id = `imported_${index}`;
    object.userData.modelId = id;

    const isMesh = object instanceof THREE.Mesh;
    const fallbackName = isMesh ? `Mesh ${index + 1}` : `Group ${index + 1}`;
    const name = object.name && object.name.trim().length > 0 ? object.name : fallbackName;

    const node: SceneNode = {
        id,
        name,
        type: isMesh ? 'MESH' : 'GROUP'
    };

    const children = object.children
        .map(child => buildSceneTree(child, counter))
        .filter((child): child is SceneNode => Boolean(child));

    if (children.length > 0) {
        node.children = children;
    }

    return node;
};

const applySceneDefaults = (root: THREE.Object3D) => {
    root.traverse(child => {
        if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            ensureMeshMaterial(child);
            if (child.geometry && !child.geometry.attributes.normal) {
                child.geometry.computeVertexNormals();
            }
        }
    });
};

const centerModel = (root: THREE.Group): { baseScale: number; basePosition: THREE.Vector3 } => {
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    root.position.sub(center);
    const basePosition = root.position.clone();

    const baseScale = maxDim > 0 ? 2 / maxDim : 1;

    return { baseScale, basePosition };
};

const loadGLTF = async (file: File): Promise<THREE.Object3D> => {
    const loader = new GLTFLoader();
    const arrayBuffer = await file.arrayBuffer();

    return new Promise((resolve, reject) => {
        loader.parse(
            arrayBuffer,
            '',
            gltf => resolve(gltf.scene || gltf.scenes[0]),
            error => reject(error)
        );
    });
};

const loadOBJ = async (file: File): Promise<THREE.Object3D> => {
    const loader = new OBJLoader();
    const text = await file.text();
    return loader.parse(text);
};

const loadFBX = async (file: File): Promise<THREE.Object3D> => {
    const loader = new FBXLoader();
    const arrayBuffer = await file.arrayBuffer();
    return loader.parse(arrayBuffer, '');
};

const loadSTL = async (file: File): Promise<THREE.Object3D> => {
    const loader = new STLLoader();
    const arrayBuffer = await file.arrayBuffer();
    const geometry = loader.parse(arrayBuffer);
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.7, 0.7, 0.75),
        metalness: 0.2,
        roughness: 0.6,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = file.name.replace(/\.[^/.]+$/, '');
    return mesh;
};

export const validateModelFile = (file: File): string | null => {
    const maxSize = 50 * 1024 * 1024;
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
        return 'Invalid file type. Please select a .glb, .gltf, .obj, .fbx, or .stl file.';
    }

    if (file.size > maxSize) {
        return `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`;
    }

    return null;
};

export async function parseModelFile(file: File): Promise<ModelImportResult> {
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    let loadedObject: THREE.Object3D;

    switch (extension) {
        case '.glb':
        case '.gltf':
            loadedObject = await loadGLTF(file);
            break;
        case '.obj':
            loadedObject = await loadOBJ(file);
            break;
        case '.fbx':
            loadedObject = await loadFBX(file);
            break;
        case '.stl':
            loadedObject = await loadSTL(file);
            break;
        default:
            throw new Error('Unsupported file type.');
    }

    const rootGroup = new THREE.Group();
    rootGroup.name = file.name.replace(/\.[^/.]+$/, '');
    rootGroup.add(loadedObject);

    applySceneDefaults(rootGroup);

    const { baseScale, basePosition } = centerModel(rootGroup);

    const counter = { value: 0 };
    const sceneTree = buildSceneTree(rootGroup, counter) ?? {
        id: 'imported_root',
        name: rootGroup.name,
        type: 'GROUP'
    };

    return {
        root: rootGroup,
        sceneTree,
        fileName: file.name,
        baseScale,
        basePosition
    };
}

export function generateObjectStates(node: SceneNode, states: Record<string, any> = {}): Record<string, any> {
    states[node.id] = {
        id: node.id,
        visible: true,
        selected: false,
        expanded: true
    };

    if (node.children) {
        node.children.forEach(child => generateObjectStates(child, states));
    }

    return states;
}
