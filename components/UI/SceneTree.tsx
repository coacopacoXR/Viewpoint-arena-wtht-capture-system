import React, { useRef, useState, useEffect } from 'react';
import { useStore, getCurrentSceneTree } from '../../store';
import { SceneNode } from '../../types';
import { ChevronRight, ChevronDown, Eye, EyeOff, Box, Layers, CircleDot, Upload, FileBox, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const activeModelType = useStore(state => state.activeModelType);
    const importSTEPFile = useStore(state => state.importSTEPFile);
    const isImporting = useStore(state => state.isImporting);
    const setIsImporting = useStore(state => state.setIsImporting);
    const importError = useStore(state => state.importError);
    const importSuccess = useStore(state => state.importSuccess);
    const lastImportedFileName = useStore(state => state.lastImportedFileName);
    const clearImportStatus = useStore(state => state.clearImportStatus);
    const setImportError = useStore(state => state.setImportError);

    const currentTree = getCurrentSceneTree(activeModelType);

    // Auto-clear success message after 5 seconds
    useEffect(() => {
        if (importSuccess) {
            const timer = setTimeout(() => {
                clearImportStatus();
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [importSuccess, clearImportStatus]);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const validateFile = (file: File): string | null => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!extension || !['step', 'stp'].includes(extension)) {
            return `Invalid file type: .${extension || 'unknown'}. Please select a .step or .stp file.`;
        }
        if (file.size > 100 * 1024 * 1024) {
            return 'File too large. Maximum size is 100MB.';
        }
        return null;
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file
        const error = validateFile(file);
        if (error) {
            setImportError(error);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            return;
        }

        setIsImporting(true);
        clearImportStatus();

        // Simulate import delay for demo (would be actual parsing in production)
        const delay = Math.min(1500, Math.max(500, file.size / 10000)); // Scale delay with file size
        setTimeout(() => {
            importSTEPFile(file.name, file.size);
        }, delay);

        // Clear input for re-selection
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="w-64 bg-white/90 backdrop-blur-md border border-gray-200 rounded-lg shadow-sm flex flex-col overflow-hidden pointer-events-auto mt-2">
            {/* Header with Import Button */}
            <div className="bg-gray-50 border-b border-gray-100 px-3 py-2">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">Model Tree</span>
                    <div className="flex items-center gap-1">
                        {activeModelType === 'bicycle' && (
                            <span className="text-[8px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">
                                STEP
                            </span>
                        )}
                        <Layers size={12} className="text-gray-400" />
                    </div>
                </div>

                {/* Import STEP Button */}
                <button
                    onClick={handleImportClick}
                    disabled={isImporting}
                    className={clsx(
                        "w-full px-3 py-2 rounded text-[10px] font-bold flex items-center justify-center gap-2 transition-all",
                        isImporting
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-blue-500 text-white hover:bg-blue-600 shadow-sm"
                    )}
                >
                    {isImporting ? (
                        <>
                            <Loader2 size={12} className="animate-spin" />
                            Importing STEP File...
                        </>
                    ) : (
                        <>
                            <Upload size={12} />
                            Import STEP File
                        </>
                    )}
                </button>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".step,.stp,.STEP,.STP"
                    onChange={handleFileChange}
                    className="hidden"
                />

                {/* Current Model Info */}
                <div className="mt-2 text-[9px] text-gray-400 flex items-center gap-1">
                    <FileBox size={10} />
                    {lastImportedFileName || (activeModelType === 'bicycle' ? 'urban_commuter_bicycle.step' : 'synth_assembly.step')}
                </div>

                {/* Import Status Messages */}
                {importSuccess && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-[10px] text-green-700 flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
                        <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
                        <div className="flex-1">{importSuccess}</div>
                        <button
                            onClick={clearImportStatus}
                            className="text-green-400 hover:text-green-600"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}

                {importError && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-[10px] text-red-700 flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
                        <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                        <div className="flex-1">{importError}</div>
                        <button
                            onClick={clearImportStatus}
                            className="text-red-400 hover:text-red-600"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}
            </div>

            {/* Tree View */}
            <div className="overflow-y-auto max-h-[35vh] py-1 custom-scrollbar">
                <TreeNode node={currentTree} depth={0} />
            </div>
        </div>
    );
};

export default SceneTree;
