import React, { useRef, useState, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Vector2, Raycaster, Group } from 'three';
import { useStore, getCurrentSceneTree } from '../../store';
import { MessageSquare, Check, X, GripVertical, Link2, ChevronDown, ChevronUp, Maximize2, Minimize2, Pencil } from 'lucide-react';
import { SceneNode, SpatialComment } from '../../types';

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

// Enhanced comment marker with expandable content
const CommentMarker: React.FC<{
    comment: SpatialComment;
    isGlobalExpanded: boolean;
    onToggleExpand: () => void;
    onUpdateOffset: (offset: { x: number; y: number }) => void;
}> = ({ comment, isGlobalExpanded, onToggleExpand, onUpdateOffset }) => {
    const groupRef = useRef<Group>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [localOffset, setLocalOffset] = useState(comment.screenOffset || { x: 0, y: 0 });

    const isExpanded = isGlobalExpanded || comment.expanded;

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!isExpanded) return;
        e.stopPropagation();
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.clientX - localOffset.x, y: e.clientY - localOffset.y });
    }, [isExpanded, localOffset]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging) return;
        e.stopPropagation();
        const newOffset = {
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        };
        setLocalOffset(newOffset);
    }, [isDragging, dragStart]);

    const handleMouseUp = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
            onUpdateOffset(localOffset);
        }
    }, [isDragging, localOffset, onUpdateOffset]);

    // Parse @mentions for highlighting
    const highlightMentions = (text: string) => {
        const parts = text.split(/(@\w+(?:\s\w+)?)/g);
        return parts.map((part, i) => {
            if (part.startsWith('@')) {
                return (
                    <span key={i} className="text-blue-400 font-bold">
                        {part}
                    </span>
                );
            }
            return part;
        });
    };

    return (
        <group ref={groupRef} position={[comment.position.x, comment.position.y + 0.15, comment.position.z]}>
            <Html
                center
                distanceFactor={isExpanded ? 2.5 : 3}
                style={{
                    transition: 'all 0.2s',
                    opacity: comment.resolved ? 0.5 : 1,
                    pointerEvents: 'auto',
                    transform: isExpanded ? `translate(${localOffset.x}px, ${localOffset.y}px)` : 'none'
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div className={`transition-all duration-300 ${comment.resolved ? 'opacity-60' : ''}`}>
                    {/* Collapsed View - Just the Pin */}
                    {!isExpanded && (
                        <div
                            onClick={onToggleExpand}
                            className="cursor-pointer transform hover:scale-110 transition-transform"
                        >
                            <div className="relative">
                                {/* Pin Circle */}
                                <div
                                    className={`
                                        w-8 h-8 rounded-full flex items-center justify-center
                                        shadow-lg border-2 border-white
                                        ${comment.type === 'drawing' ? 'bg-purple-500' : 'bg-blue-500'}
                                        ${comment.resolved ? 'bg-gray-400' : ''}
                                    `}
                                    style={{ backgroundColor: comment.resolved ? '#9ca3af' : comment.authorColor }}
                                >
                                    {comment.type === 'drawing' ? (
                                        <Pencil size={14} className="text-white" />
                                    ) : (
                                        <MessageSquare size={14} className="text-white" />
                                    )}
                                </div>

                                {/* Connecting line */}
                                <div className="absolute top-full left-1/2 w-0.5 h-4 bg-white/50 -translate-x-1/2" />

                                {/* Hover tooltip */}
                                <div className="absolute left-10 top-0 opacity-0 hover:opacity-100 pointer-events-none z-50">
                                    <div className="bg-black/90 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap max-w-48 truncate">
                                        <span className="font-bold" style={{ color: comment.authorColor }}>{comment.author}:</span> {comment.content.slice(0, 50)}...
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Expanded View - Full Comment Card */}
                    {isExpanded && (
                        <div
                            className={`
                                bg-white rounded-lg shadow-2xl border-2 min-w-64 max-w-80
                                ${isDragging ? 'cursor-grabbing' : ''}
                            `}
                            style={{ borderColor: comment.authorColor }}
                        >
                            {/* Header with drag handle */}
                            <div
                                className="flex items-center justify-between px-3 py-2 border-b border-gray-100 cursor-grab active:cursor-grabbing"
                                onMouseDown={handleMouseDown}
                                style={{ backgroundColor: `${comment.authorColor}15` }}
                            >
                                <div className="flex items-center gap-2">
                                    <GripVertical size={12} className="text-gray-400" />
                                    <div
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                                        style={{ backgroundColor: comment.authorColor }}
                                    >
                                        {comment.author[0]}
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-800">{comment.author}</div>
                                        <div className="text-[9px] text-gray-400">
                                            {new Date(comment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                                >
                                    <Minimize2 size={14} className="text-gray-500" />
                                </button>
                            </div>

                            {/* Linked Component Badge */}
                            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                                <Link2 size={10} className="text-blue-500" />
                                <span className="text-[10px] font-mono text-blue-600 font-bold">
                                    {comment.attachedToNodeName}
                                </span>
                            </div>

                            {/* Content */}
                            <div className="p-3">
                                {comment.type === 'drawing' && comment.drawingData ? (
                                    <div className="mb-2">
                                        <img
                                            src={comment.drawingData}
                                            alt="Drawing annotation"
                                            className="w-full rounded border border-gray-200"
                                        />
                                    </div>
                                ) : null}

                                <div className="text-xs text-gray-700 leading-relaxed">
                                    {highlightMentions(comment.content)}
                                </div>

                                {/* Assignees */}
                                {comment.assignees.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {comment.assignees.map((assignee, i) => (
                                            <span
                                                key={i}
                                                className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full"
                                            >
                                                @{assignee}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Status */}
                                {(comment.resolved || comment.linkedToMeeting) && (
                                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
                                        {comment.resolved && (
                                            <span className="text-[9px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                <Check size={8} /> Resolved
                                            </span>
                                        )}
                                        {comment.linkedToMeeting && (
                                            <span className="text-[9px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                <Link2 size={8} /> In Meeting
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </Html>
        </group>
    );
};

// Utility to capture WebGL canvas
const captureCanvas = (): string | null => {
    const canvas = Array.from(document.querySelectorAll('canvas')).find(
        (el) => el.width > 0 && el.height > 0
    );
    if (!canvas) return null;
    try {
        return canvas.toDataURL('image/png');
    } catch (e) {
        console.warn('Failed to capture canvas:', e);
        return null;
    }
};

// Comment placement preview (shown when placing a new comment or drawing)
const CommentPlacementPreview: React.FC = () => {
    const { camera, scene, gl } = useThree();
    const commentMode = useStore(state => state.commentMode);
    const setPendingComment = useStore(state => state.setPendingComment);
    const setCommentMode = useStore(state => state.setCommentMode);
    const setCapturedScreenshot = useStore(state => state.setCapturedScreenshot);
    const setShowDrawingCanvas = useStore(state => state.setShowDrawingCanvas);
    const activeModelType = useStore(state => state.activeModelType);
    const importedSceneTree = useStore(state => state.importedSceneTree);
    const pendingCommentPosition = useStore(state => state.pendingCommentPosition);

    const raycaster = useRef(new Raycaster());
    const previewRef = useRef<Group>(null);
    const currentTree = getCurrentSceneTree(activeModelType, importedSceneTree);

    const isPlacingMode = commentMode === 'placing-comment' || commentMode === 'placing-drawing';

    useFrame((state) => {
        if (!isPlacingMode) return;

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

    // Handle click to place comment or drawing anchor
    React.useEffect(() => {
        if (!isPlacingMode) return;

        const handleClick = (e: MouseEvent) => {
            if (e.button !== 0) return; // Only left click

            const rect = gl.domElement.getBoundingClientRect();
            const pointer = new Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
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

                    // For drawing mode, capture screenshot and open drawing canvas
                    if (commentMode === 'placing-drawing') {
                        const screenshot = captureCanvas();
                        setCapturedScreenshot(screenshot);
                        setCommentMode('drawing');
                        setShowDrawingCanvas(true);
                    }
                    break;
                }
            }
        };

        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [commentMode, isPlacingMode, camera, scene, gl, setPendingComment, setCommentMode, setCapturedScreenshot, setShowDrawingCanvas, currentTree]);

    if (!isPlacingMode) return null;

    const isDrawingMode = commentMode === 'placing-drawing';

    return (
        <group ref={previewRef}>
            <Html center distanceFactor={3}>
                <div className={`w-10 h-10 rounded-full border-4 border-dashed flex items-center justify-center animate-pulse ${isDrawingMode ? 'border-purple-400 bg-purple-500/20' : 'border-blue-400 bg-blue-500/20'}`}>
                    {isDrawingMode ? (
                        <Pencil size={16} className="text-purple-400" />
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
    const commentsExpandedInScene = useStore(state => state.commentsExpandedInScene);
    const toggleCommentExpanded = useStore(state => state.toggleCommentExpanded);
    const setCommentScreenOffset = useStore(state => state.setCommentScreenOffset);

    return (
        <group>
            {/* Render all comments */}
            {comments.map(comment => (
                <CommentMarker
                    key={comment.id}
                    comment={comment}
                    isGlobalExpanded={commentsExpandedInScene}
                    onToggleExpand={() => toggleCommentExpanded(comment.id)}
                    onUpdateOffset={(offset) => setCommentScreenOffset(comment.id, offset)}
                />
            ))}

            {/* Placement preview */}
            <CommentPlacementPreview />
        </group>
    );
};

export default SpatialComments;
