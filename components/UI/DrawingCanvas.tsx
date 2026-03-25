import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pencil, Eraser, Undo2, Redo2, Check, X, Circle, Minus, Square } from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../../store';

interface DrawingCanvasProps {
    onSave: (dataUrl: string) => void;
    onCancel: () => void;
    backgroundImage?: string | null; // Captured 3D perspective screenshot
}

type Tool = 'pen' | 'eraser' | 'line' | 'circle' | 'rectangle';

interface DrawingState {
    paths: Path[];
    currentPath: Path | null;
}

interface Path {
    tool: Tool;
    color: string;
    width: number;
    points: { x: number; y: number }[];
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ onSave, onCancel, backgroundImage }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const setDrawingInteractionActive = useStore(state => state.setDrawingInteractionActive);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState('#ef4444'); // Red default
    const [lineWidth, setLineWidth] = useState(3);
    const [history, setHistory] = useState<DrawingState[]>([{ paths: [], currentPath: null }]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [currentPath, setCurrentPath] = useState<Path | null>(null);

    // Ref for isArmed check in mouse handlers
    const isArmedRef = useRef(false);

    const colors = [
        '#ef4444', // red
        '#f97316', // orange
        '#eab308', // yellow
        '#22c55e', // green
        '#3b82f6', // blue
        '#8b5cf6', // purple
        '#000000', // black
        '#ffffff', // white
    ];

    const lineWidths = [2, 4, 6, 8];

    // Background image ref for redraw
    const bgImageRef = useRef<HTMLImageElement | null>(null);

    // Minimal animation: quick fade-in, immediately ready to draw
    useEffect(() => {
        // Short delay for smooth transition, then enable drawing
        const timer = setTimeout(() => {
            setIsReady(true);
            setDrawingInteractionActive(true);
        }, 150);

        return () => clearTimeout(timer);
    }, [setDrawingInteractionActive]);

    // Keep isArmedRef in sync
    useEffect(() => {
        isArmedRef.current = isReady;
    }, [isReady]);

    // Cancel drawing mode
    const handleCancel = useCallback(() => {
        setDrawingInteractionActive(false);
        onCancel();
    }, [setDrawingInteractionActive, onCancel]);

    // Redraw canvas
    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas first
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background
        if (bgImageRef.current) {
            ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
            // Add slight overlay to make drawings more visible
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Draw all paths from history
        const state = history[historyIndex];
        [...state.paths, currentPath].filter(Boolean).forEach(path => {
            if (!path) return;

            ctx.strokeStyle = path.color;
            ctx.lineWidth = path.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (path.tool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
            } else {
                ctx.globalCompositeOperation = 'source-over';
            }

            if (path.tool === 'pen' || path.tool === 'eraser') {
                ctx.beginPath();
                path.points.forEach((point, i) => {
                    if (i === 0) {
                        ctx.moveTo(point.x, point.y);
                    } else {
                        ctx.lineTo(point.x, point.y);
                    }
                });
                ctx.stroke();
            } else if (path.tool === 'line' && path.points.length >= 2) {
                ctx.beginPath();
                ctx.moveTo(path.points[0].x, path.points[0].y);
                ctx.lineTo(path.points[path.points.length - 1].x, path.points[path.points.length - 1].y);
                ctx.stroke();
            } else if (path.tool === 'circle' && path.points.length >= 2) {
                const start = path.points[0];
                const end = path.points[path.points.length - 1];
                const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
                ctx.beginPath();
                ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
                ctx.stroke();
            } else if (path.tool === 'rectangle' && path.points.length >= 2) {
                const start = path.points[0];
                const end = path.points[path.points.length - 1];
                ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
            }
        });

        ctx.globalCompositeOperation = 'source-over';
    }, [history, historyIndex, currentPath]);

    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        redraw();
    }, [redraw]);

    useEffect(() => {
        resizeCanvas();
    }, [resizeCanvas]);

    // Load background image on mount and redraw when it is ready.
    useEffect(() => {
        if (backgroundImage) {
            const img = new Image();
            img.onload = () => {
                bgImageRef.current = img;
                redraw();
            };
            img.src = backgroundImage;
        } else {
            bgImageRef.current = null;
            redraw();
        }
    }, [backgroundImage, redraw]);

    useEffect(() => {
        const handleResize = () => resizeCanvas();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [resizeCanvas]);

    const getCanvasPoint = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return {
            x: (e.clientX - rect.left) * dpr,
            y: (e.clientY - rect.top) * dpr
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        if (!isArmedRef.current) return;

        const point = getCanvasPoint(e);
        setIsDrawing(true);
        setCurrentPath({
            tool,
            color: tool === 'eraser' ? '#000000' : color,
            width: tool === 'eraser' ? lineWidth * 3 : lineWidth,
            points: [point]
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing || !currentPath) return;

        const point = getCanvasPoint(e);
        setCurrentPath({
            ...currentPath,
            points: [...currentPath.points, point]
        });
    };

    const handleMouseUp = () => {
        if (!isDrawing || !currentPath) return;

        setIsDrawing(false);

        // Add to history
        const newState: DrawingState = {
            paths: [...history[historyIndex].paths, currentPath],
            currentPath: null
        };

        // Remove any future history if we're not at the end
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newState);

        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setCurrentPath(null);
    };

    const handleUndo = useCallback(() => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
        }
    }, [historyIndex]);

    const handleRedo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1);
        }
    }, [history.length, historyIndex]);

    const handleSave = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Create export canvas with background + drawing annotations
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvas.width;
        exportCanvas.height = canvas.height;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) return;

        // Draw background image (3D view snapshot) if available
        if (bgImageRef.current) {
            ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
        }

        // Draw all annotation paths on top
        const state = history[historyIndex];
        state.paths.forEach(path => {
            ctx.strokeStyle = path.color;
            ctx.lineWidth = path.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (path.tool === 'pen') {
                ctx.beginPath();
                path.points.forEach((point, i) => {
                    if (i === 0) {
                        ctx.moveTo(point.x, point.y);
                    } else {
                        ctx.lineTo(point.x, point.y);
                    }
                });
                ctx.stroke();
            } else if (path.tool === 'line' && path.points.length >= 2) {
                ctx.beginPath();
                ctx.moveTo(path.points[0].x, path.points[0].y);
                ctx.lineTo(path.points[path.points.length - 1].x, path.points[path.points.length - 1].y);
                ctx.stroke();
            } else if (path.tool === 'circle' && path.points.length >= 2) {
                const start = path.points[0];
                const end = path.points[path.points.length - 1];
                const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
                ctx.beginPath();
                ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
                ctx.stroke();
            } else if (path.tool === 'rectangle' && path.points.length >= 2) {
                const start = path.points[0];
                const end = path.points[path.points.length - 1];
                ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
            }
        });

        const dataUrl = exportCanvas.toDataURL('image/png');
        setDrawingInteractionActive(false);
        onSave(dataUrl);
    }, [history, historyIndex, onSave, setDrawingInteractionActive]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
                return;
            }

            const isModifier = e.metaKey || e.ctrlKey;
            if (isModifier && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
            }

            if (isModifier && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
            }

            if (isModifier && e.key === 'Enter') {
                e.preventDefault();
                handleSave();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleRedo, handleSave, handleUndo, onCancel]);

    return (
        <>
            {/* Minimal backdrop - simple dark overlay */}
            <div
                className={clsx(
                    "fixed inset-0 z-[300] transition-opacity duration-150",
                    isReady ? "bg-black/20" : "bg-black/40"
                )}
                style={{ pointerEvents: 'none' }}
            />

            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className={clsx(
                    "fixed inset-0 z-[301] transition-opacity duration-150",
                    isReady
                        ? "opacity-100 cursor-crosshair pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                )}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />

            {/* Minimal toolbar - clean, functional design */}
            <div
                className={clsx(
                    "fixed top-3 left-1/2 -translate-x-1/2 z-[307] bg-neutral-900 rounded-lg px-2 py-1.5 flex items-center gap-1 transition-all duration-150",
                    isReady
                        ? "opacity-100 pointer-events-auto translate-y-0"
                        : "opacity-0 pointer-events-none -translate-y-2"
                )}
            >
                {/* Tools */}
                <div className="flex">
                    <button
                        onClick={() => setTool('pen')}
                        className={clsx(
                            "w-8 h-8 rounded flex items-center justify-center transition-colors",
                            tool === 'pen' ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-white"
                        )}
                        title="Pen"
                    >
                        <Pencil size={14} />
                    </button>
                    <button
                        onClick={() => setTool('line')}
                        className={clsx(
                            "w-8 h-8 rounded flex items-center justify-center transition-colors",
                            tool === 'line' ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-white"
                        )}
                        title="Line"
                    >
                        <Minus size={14} />
                    </button>
                    <button
                        onClick={() => setTool('circle')}
                        className={clsx(
                            "w-8 h-8 rounded flex items-center justify-center transition-colors",
                            tool === 'circle' ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-white"
                        )}
                        title="Circle"
                    >
                        <Circle size={14} />
                    </button>
                    <button
                        onClick={() => setTool('rectangle')}
                        className={clsx(
                            "w-8 h-8 rounded flex items-center justify-center transition-colors",
                            tool === 'rectangle' ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-white"
                        )}
                        title="Rectangle"
                    >
                        <Square size={14} />
                    </button>
                    <button
                        onClick={() => setTool('eraser')}
                        className={clsx(
                            "w-8 h-8 rounded flex items-center justify-center transition-colors",
                            tool === 'eraser' ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-white"
                        )}
                        title="Eraser"
                    >
                        <Eraser size={14} />
                    </button>
                </div>

                <div className="w-px h-6 bg-neutral-700 mx-1" />

                {/* Colors - compact */}
                <div className="flex gap-0.5">
                    {colors.map(c => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            className={clsx(
                                "w-5 h-5 rounded-sm transition-all",
                                color === c ? "ring-1 ring-white ring-offset-1 ring-offset-neutral-900" : "opacity-70 hover:opacity-100"
                            )}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>

                <div className="w-px h-6 bg-neutral-700 mx-1" />

                {/* Line widths - minimal */}
                <div className="flex">
                    {lineWidths.map(w => (
                        <button
                            key={w}
                            onClick={() => setLineWidth(w)}
                            className={clsx(
                                "w-7 h-8 rounded flex items-center justify-center transition-colors",
                                lineWidth === w ? "bg-neutral-700" : "hover:bg-neutral-800"
                            )}
                        >
                            <div
                                className="rounded-full bg-white"
                                style={{ width: w, height: w }}
                            />
                        </button>
                    ))}
                </div>

                <div className="w-px h-6 bg-neutral-700 mx-1" />

                {/* Undo/Redo */}
                <div className="flex">
                    <button
                        onClick={handleUndo}
                        disabled={historyIndex === 0}
                        className="w-8 h-8 rounded flex items-center justify-center text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400"
                        title="Undo"
                    >
                        <Undo2 size={14} />
                    </button>
                    <button
                        onClick={handleRedo}
                        disabled={historyIndex === history.length - 1}
                        className="w-8 h-8 rounded flex items-center justify-center text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400"
                        title="Redo"
                    >
                        <Redo2 size={14} />
                    </button>
                </div>

                <div className="w-px h-6 bg-neutral-700 mx-1" />

                {/* Actions */}
                <button
                    onClick={handleCancel}
                    className="w-8 h-8 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                    title="Cancel (Esc)"
                >
                    <X size={14} />
                </button>
                <button
                    onClick={handleSave}
                    className="w-8 h-8 rounded flex items-center justify-center bg-white text-neutral-900 hover:bg-neutral-200 transition-colors"
                    title="Save"
                >
                    <Check size={14} />
                </button>
            </div>

            {/* Minimal status bar */}
            <div
                className={clsx(
                    "fixed bottom-3 left-1/2 -translate-x-1/2 z-[307] bg-neutral-900 text-neutral-500 px-3 py-1.5 rounded text-[10px] font-mono tracking-wide transition-opacity duration-150",
                    isReady ? "opacity-100" : "opacity-0"
                )}
            >
                ESC cancel · ⌘Z undo · ⇧⌘Z redo
            </div>
        </>
    );
};

export default DrawingCanvas;
