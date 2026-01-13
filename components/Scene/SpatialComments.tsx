import React, { useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Vector2, Raycaster, Group } from 'three';
import { useStore, getCurrentSceneTree } from '../../store';
import { MessageSquare, Pencil, Check, X } from 'lucide-react';
import { SceneNode } from '../../types';

// Helper to find node name
const findNodeName = (id: string, node: SceneNode): string | null => {
    if (node.id === id) return node.name;
    if (node.children) {
        for (const child of node.children) {
            const found = findNodeName(id, child);
            if (found) return found;
        }
    }
    return null;
};

// Single comment marker in 3D space
const CommentMarker: React.FC<{
    id: string;
    position: { x: number; y: number; z: number };
    content: string;
    author: string;
    authorColor: string;
    type: 'text' | 'drawing';
    drawingData?: string;
    resolved: boolean;
    attachedToNodeName: string;
    onClick: () => void;
}> = ({ id, position, content, author, authorColor, type, drawingData, resolved, attachedToNodeName, onClick }) => {
    const groupRef = useRef<Group>(null);

    return (
        <group ref={groupRef} position={[position.x, position.y + 0.15, position.z]}>
            <Html
                center
                distanceFactor={3}
                style={{
                    transition: 'all 0.2s',
                    opacity: resolved ? 0.5 : 1,
                    pointerEvents: 'auto'
                }}
            >
                <div
                    onClick={onClick}
                    className={`
                        cursor-pointer transform hover:scale-110 transition-transform
                        ${resolved ? 'opacity-60' : ''}
                    `}
                >
                    {/* Comment Pin */}
                    <div className="relative">
                        {/* Pin Circle */}
                        <div
                            className={`
                                w-8 h-8 rounded-full flex items-center justify-center
                                shadow-lg border-2 border-white
                                ${type === 'drawing' ? 'bg-purple-500' : 'bg-blue-500'}
                                ${resolved ? 'bg-gray-400' : ''}
                            `}
                            style={{ backgroundColor: resolved ? '#9ca3af' : authorColor }}
                        >
                            {type === 'drawing' ? (
                                <Pencil size={14} className="text-white" />
                            ) : (
                                <MessageSquare size={14} className="text-white" />
                            )}
                        </div>

                        {/* Connecting line */}
                        <div className="absolute top-full left-1/2 w-0.5 h-4 bg-white/50 -translate-x-1/2" />

                        {/* Preview tooltip on hover */}
                        <div className="absolute left-10 top-0 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div className="bg-black/90 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap max-w-48 truncate">
                                <span className="font-bold" style={{ color: authorColor }}>{author}:</span> {content.slice(0, 50)}...
                            </div>
                        </div>
                    </div>
                </div>
            </Html>
        </group>
    );
};

// Comment placement preview (shown when placing a new comment)
const CommentPlacementPreview: React.FC = () => {
    const { camera, scene } = useThree();
    const commentMode = useStore(state => state.commentMode);
    const setPendingComment = useStore(state => state.setPendingComment);
    const activeModelType = useStore(state => state.activeModelType);
    const pendingCommentPosition = useStore(state => state.pendingCommentPosition);

    const raycaster = useRef(new Raycaster());
    const previewRef = useRef<Group>(null);
    const currentTree = getCurrentSceneTree(activeModelType);

    useFrame((state) => {
        if (commentMode !== 'placing-comment' && commentMode !== 'placing-drawing') return;

        // Update raycaster
        raycaster.current.setFromCamera(state.pointer, camera);
        const intersects = raycaster.current.intersectObjects(scene.children, true);

        let hitPoint: Vector3 | null = null;
        let foundId: string | null = null;
        let foundName: string | null = null;

        for (const hit of intersects) {
            if (hit.object.name.startsWith('Agent') || hit.object.type === 'Line' || hit.object.type === 'Points') continue;

            let curr = hit.object;
            while (curr) {
                if (curr.userData && curr.userData.modelId) {
                    foundId = curr.userData.modelId;
                    foundName = findNodeName(foundId, currentTree);
                    break;
                }
                if (curr.parent) curr = curr.parent;
                else break;
            }

            if (foundId) {
                hitPoint = hit.point.clone();
                break;
            }
        }

        if (previewRef.current && hitPoint) {
            previewRef.current.position.copy(hitPoint);
            previewRef.current.position.y += 0.15;
            previewRef.current.visible = true;
        } else if (previewRef.current) {
            previewRef.current.visible = false;
        }
    });

    // Handle click to place comment
    useEffect(() => {
        if (commentMode !== 'placing-comment' && commentMode !== 'placing-drawing') return;

        const handleClick = (e: MouseEvent) => {
            if (e.button !== 0) return; // Only left click

            const pointer = new Vector2(
                (e.clientX / window.innerWidth) * 2 - 1,
                -(e.clientY / window.innerHeight) * 2 + 1
            );

            raycaster.current.setFromCamera(pointer, camera);
            const intersects = raycaster.current.intersectObjects(scene.children, true);

            for (const hit of intersects) {
                if (hit.object.name.startsWith('Agent') || hit.object.type === 'Line' || hit.object.type === 'Points') continue;

                let curr = hit.object;
                let foundId: string | null = null;
                while (curr) {
                    if (curr.userData && curr.userData.modelId) {
                        foundId = curr.userData.modelId;
                        break;
                    }
                    if (curr.parent) curr = curr.parent;
                    else break;
                }

                if (foundId) {
                    const foundName = findNodeName(foundId, currentTree) || 'Unknown';
                    setPendingComment(
                        { x: hit.point.x, y: hit.point.y, z: hit.point.z },
                        foundId,
                        foundName
                    );
                    break;
                }
            }
        };

        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [commentMode, camera, scene, setPendingComment, currentTree]);

    if (commentMode !== 'placing-comment' && commentMode !== 'placing-drawing') return null;

    return (
        <group ref={previewRef}>
            <Html center distanceFactor={3}>
                <div className="w-10 h-10 rounded-full border-4 border-dashed border-blue-400 flex items-center justify-center animate-pulse bg-blue-500/20">
                    {commentMode === 'placing-drawing' ? (
                        <Pencil size={16} className="text-blue-400" />
                    ) : (
                        <MessageSquare size={16} className="text-blue-400" />
                    )}
                </div>
            </Html>
        </group>
    );
};

// Main component that renders all spatial comments
const SpatialComments: React.FC = () => {
    const comments = useStore(state => state.comments);
    const setCommentMode = useStore(state => state.setCommentMode);
    const setPendingComment = useStore(state => state.setPendingComment);

    const handleCommentClick = (commentId: string) => {
        // Could open detail view or highlight in panel
        console.log('Clicked comment:', commentId);
    };

    return (
        <group>
            {/* Render all comments */}
            {comments.map(comment => (
                <CommentMarker
                    key={comment.id}
                    id={comment.id}
                    position={comment.position}
                    content={comment.content}
                    author={comment.author}
                    authorColor={comment.authorColor}
                    type={comment.type}
                    drawingData={comment.drawingData}
                    resolved={comment.resolved}
                    attachedToNodeName={comment.attachedToNodeName}
                    onClick={() => handleCommentClick(comment.id)}
                />
            ))}

            {/* Placement preview */}
            <CommentPlacementPreview />
        </group>
    );
};

export default SpatialComments;
