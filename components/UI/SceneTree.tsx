import React from 'react';
import { useStore, SCENE_TREE } from '../../store';
import { SceneNode } from '../../types';
import { ChevronRight, ChevronDown, Eye, EyeOff, Box, Layers, CircleDot } from 'lucide-react';
import { clsx } from 'clsx';

const TreeNode: React.FC<{ node: SceneNode; depth: number }> = ({ node, depth }) => {
    const objectState = useStore(state => state.objectStates[node.id]);
    const toggleVisibility = useStore(state => state.toggleNodeVisibility);
    const toggleExpanded = useStore(state => state.toggleNodeExpanded);
    const selectNode = useStore(state => state.selectNode);

    if (!objectState) return null;

    const isGroup = node.type === 'GROUP';
    const isExpanded = objectState.expanded;
    const isSelected = objectState.selected;
    const isVisible = objectState.visible;

    const handleToggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleExpanded(node.id);
    };

    const handleToggleVis = (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleVisibility(node.id);
    };

    const handleSelect = () => {
        selectNode(isSelected ? null : node.id);
    };

    return (
        <div className="flex flex-col select-none">
            <div 
                className={clsx(
                    "flex items-center h-7 px-2 cursor-pointer transition-colors border-l-2",
                    isSelected 
                        ? "bg-blue-50 border-blue-500" 
                        : "hover:bg-gray-50 border-transparent"
                )}
                style={{ paddingLeft: `${depth * 12 + 4}px` }}
                onClick={handleSelect}
            >
                {/* Expand Toggle */}
                <div className="w-4 flex items-center justify-center mr-1" onClick={isGroup ? handleToggleExpand : undefined}>
                    {isGroup && (
                        isExpanded 
                        ? <ChevronDown size={12} className="text-gray-500" /> 
                        : <ChevronRight size={12} className="text-gray-500" />
                    )}
                </div>

                {/* Type Icon */}
                <div className="mr-2 text-gray-500">
                    {node.type === 'GROUP' && <Layers size={12} />}
                    {node.type === 'MESH' && <Box size={12} />}
                    {node.type === 'PART' && <CircleDot size={12} />}
                </div>

                {/* Label */}
                <span className={clsx(
                    "text-[10px] font-mono truncate flex-1",
                    isSelected ? "font-bold text-blue-700" : "text-gray-700",
                    !isVisible && "opacity-50 line-through"
                )}>
                    {node.name}
                </span>

                {/* Visibility Toggle */}
                <div 
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 ml-1"
                    onClick={handleToggleVis}
                >
                    {isVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                </div>
            </div>

            {/* Children */}
            {isGroup && isExpanded && node.children && (
                <div className="flex flex-col relative">
                    {/* Tree Guide Line */}
                    <div className="absolute left-[calc(12px*var(--depth)+9px)] top-0 bottom-0 w-px bg-gray-200" style={{'--depth': depth} as any}></div>
                    {node.children.map(child => (
                        <TreeNode key={child.id} node={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};

const SceneTree: React.FC = () => {
  return (
    <div className="w-64 bg-white/90 backdrop-blur-md border border-gray-200 rounded-lg shadow-sm flex flex-col overflow-hidden pointer-events-auto mt-2">
        <div className="h-8 bg-gray-50 border-b border-gray-100 flex items-center px-3 justify-between">
            <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">Model Tree</span>
            <Layers size={12} className="text-gray-400" />
        </div>
        <div className="overflow-y-auto max-h-[40vh] py-1 custom-scrollbar">
            <TreeNode node={SCENE_TREE} depth={0} />
        </div>
    </div>
  );
};

export default SceneTree;
