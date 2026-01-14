import occtimportjs from 'occt-import-js';
import * as THREE from 'three';
import { SceneNode } from '../types';

export interface STEPImportResult {
    meshes: THREE.Group;
    sceneTree: SceneNode;
    fileName: string;
}

let occtInstance: any = null;

// Initialize the OCCT WebAssembly module
async function initOCCT(): Promise<any> {
    if (occtInstance) return occtInstance;

    occtInstance = await occtimportjs();
    return occtInstance;
}

// Parse a STEP file and return Three.js geometry + scene tree
export async function parseSTEPFile(file: File): Promise<STEPImportResult> {
    const occt = await initOCCT();

    // Read file as ArrayBuffer
    const fileBuffer = await file.arrayBuffer();
    const fileContent = new Uint8Array(fileBuffer);

    // Parse STEP file
    const result = occt.ReadStepFile(fileContent, null);

    if (!result.success) {
        throw new Error('Failed to parse STEP file');
    }

    // Create Three.js group to hold all meshes
    const rootGroup = new THREE.Group();
    rootGroup.name = file.name.replace(/\.(step|stp)$/i, '');

    // Build scene tree structure
    const sceneTree: SceneNode = {
        id: 'imported_assembly',
        name: rootGroup.name,
        type: 'GROUP',
        children: []
    };

    // Process each mesh from the STEP file
    result.meshes.forEach((mesh: any, meshIndex: number) => {
        const meshName = mesh.name || `Part_${meshIndex + 1}`;
        const meshId = `imported_${meshIndex}`;

        // Create geometry from the mesh data
        const geometry = new THREE.BufferGeometry();

        // Set vertex positions
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3)
        );

        // Set normals if available
        if (mesh.attributes.normal) {
            geometry.setAttribute(
                'normal',
                new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3)
            );
        } else {
            geometry.computeVertexNormals();
        }

        // Set face indices
        if (mesh.index) {
            geometry.setIndex(new THREE.BufferAttribute(mesh.index.array, 1));
        }

        // Get color from mesh or use default
        let color = new THREE.Color(0.7, 0.7, 0.75); // Default gray
        if (mesh.color) {
            color = new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]);
        }

        // Create material
        const material = new THREE.MeshStandardMaterial({
            color: color,
            metalness: 0.3,
            roughness: 0.6,
            side: THREE.DoubleSide
        });

        // Create mesh
        const threeMesh = new THREE.Mesh(geometry, material);
        threeMesh.name = meshName;
        threeMesh.castShadow = true;
        threeMesh.receiveShadow = true;

        // Store model ID in userData for selection/laser
        threeMesh.userData.modelId = meshId;

        // Apply transformation if present
        if (mesh.brep_faces && mesh.brep_faces.length > 0) {
            // Handle BRep faces if needed
        }

        rootGroup.add(threeMesh);

        // Add to scene tree
        sceneTree.children!.push({
            id: meshId,
            name: meshName,
            type: 'MESH'
        });
    });

    // Center and scale the model appropriately
    const box = new THREE.Box3().setFromObject(rootGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Center the model
    rootGroup.position.sub(center);

    // Scale to fit within a reasonable size (max dimension ~2 units)
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
        const scale = 2 / maxDim;
        rootGroup.scale.setScalar(scale);
    }

    // Lift model so it sits on the ground plane
    const scaledBox = new THREE.Box3().setFromObject(rootGroup);
    rootGroup.position.y -= scaledBox.min.y;

    return {
        meshes: rootGroup,
        sceneTree: sceneTree,
        fileName: file.name
    };
}

// Helper to generate object states from scene tree
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
