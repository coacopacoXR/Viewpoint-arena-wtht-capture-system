import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pencil, Eraser, Undo2, Redo2, Check, X, Circle, Minus, Square } from 'lucide-react';
import { clsx } from 'clsx';

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
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState('#ef4444'); // Red default
    const [lineWidth, setLineWidth] = useState(3);
    const [history, setHistory] = useState<DrawingState[]>([{ paths: [], currentPath: null }]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [currentPath, setCurrentPath] = useState<Path | null>(null);

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

    // Initialize canvas with screenshot/background
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size to viewport
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        if (backgroundImage) {
            // Load and draw the captured 3D perspective
            const img = new Image();
            img.onload = () => {
                // Draw the background image
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Add slight overlay to make drawings more visible
                ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            };
            img.src = backgroundImage;
        } else {
            // Fallback: Fill with semi-transparent overlay to show drawing area
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }, [backgroundImage]);

    // Background image ref for redraw
    const bgImageRef = useRef<HTMLImageElement | null>(null);

    // Load background image on mount
    useEffect(() => {
        if (backgroundImage) {
            const img = new Image();
            img.onload = () => {
                bgImageRef.current = img;
            };
            img.src = backgroundImage;
        }
    }, [backgroundImage]);

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
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
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
    }, [history, historyIndex, currentPath, backgroundImage]);

    useEffect(() => {
        redraw();
    }, [redraw]);

    const getCanvasPoint = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;

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

    const handleUndo = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1);
        }
    };

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Create a clean canvas with just the drawing (no background)
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvas.width;
        exportCanvas.height = canvas.height;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) return;

        // Draw all paths
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
        onSave(dataUrl);
    };

    return (
        <div className="fixed inset-0 z-[300] pointer-events-auto">
            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 cursor-crosshair"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />

            {/* Toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 flex items-center gap-3">
                {/* Tools */}
                <div className="flex gap-1">
                    <button
                        onClick={() => setTool('pen')}
                        className={clsx(
                            "w-9 h-9 rounded flex items-center justify-center transition-colors",
                            tool === 'pen' ? "bg-blue-500 text-white" : "hover:bg-gray-100 text-gray-600"
                        )}
                        title="Pen"
                    >
                        <Pencil size={16} />
                    </button>
                    <button
                        onClick={() => setTool('line')}
                        className={clsx(
                            "w-9 h-9 rounded flex items-center justify-center transition-colors",
                            tool === 'line' ? "bg-blue-500 text-white" : "hover:bg-gray-100 text-gray-600"
                        )}
                        title="Line"
                    >
                        <Minus size={16} />
                    </button>
                    <button
                        onClick={() => setTool('circle')}
                        className={clsx(
                            "w-9 h-9 rounded flex items-center justify-center transition-colors",
                            tool === 'circle' ? "bg-blue-500 text-white" : "hover:bg-gray-100 text-gray-600"
                        )}
                        title="Circle"
                    >
                        <Circle size={16} />
                    </button>
                    <button
                        onClick={() => setTool('rectangle')}
                        className={clsx(
                            "w-9 h-9 rounded flex items-center justify-center transition-colors",
                            tool === 'rectangle' ? "bg-blue-500 text-white" : "hover:bg-gray-100 text-gray-600"
                        )}
                        title="Rectangle"
                    >
                        <Square size={16} />
                    </button>
                    <button
                        onClick={() => setTool('eraser')}
                        className={clsx(
                            "w-9 h-9 rounded flex items-center justify-center transition-colors",
                            tool === 'eraser' ? "bg-blue-500 text-white" : "hover:bg-gray-100 text-gray-600"
                        )}
                        title="Eraser"
                    >
                        <Eraser size={16} />
                    </button>
                </div>

                <div className="w-px h-8 bg-gray-200" />

                {/* Colors */}
                <div className="flex gap-1">
                    {colors.map(c => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            className={clsx(
                                "w-6 h-6 rounded-full border-2 transition-transform",
                                color === c ? "border-blue-500 scale-110" : "border-gray-200 hover:scale-105"
                            )}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>

                <div className="w-px h-8 bg-gray-200" />

                {/* Line widths */}
                <div className="flex gap-1">
                    {lineWidths.map(w => (
                        <button
                            key={w}
                            onClick={() => setLineWidth(w)}
                            className={clsx(
                                "w-8 h-8 rounded flex items-center justify-center transition-colors",
                                lineWidth === w ? "bg-gray-200" : "hover:bg-gray-100"
                            )}
                        >
                            <div
                                className="rounded-full bg-gray-800"
                                style={{ width: w + 2, height: w + 2 }}
                            />
                        </button>
                    ))}
                </div>

                <div className="w-px h-8 bg-gray-200" />

                {/* Undo/Redo */}
                <div className="flex gap-1">
                    <button
                        onClick={handleUndo}
                        disabled={historyIndex === 0}
                        className="w-9 h-9 rounded flex items-center justify-center hover:bg-gray-100 text-gray-600 disabled:opacity-30"
                        title="Undo"
                    >
                        <Undo2 size={16} />
                    </button>
                    <button
                        onClick={handleRedo}
                        disabled={historyIndex === history.length - 1}
                        className="w-9 h-9 rounded flex items-center justify-center hover:bg-gray-100 text-gray-600 disabled:opacity-30"
                        title="Redo"
                    >
                        <Redo2 size={16} />
                    </button>
                </div>

                <div className="w-px h-8 bg-gray-200" />

                {/* Save/Cancel */}
                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded text-xs font-bold flex items-center gap-1"
                    >
                        <X size={14} />
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-3 py-1.5 bg-green-500 text-white rounded text-xs font-bold flex items-center gap-1 hover:bg-green-600"
                    >
                        <Check size={14} />
                        Save Drawing
                    </button>
                </div>
            </div>

            {/* Instructions */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-xs">
                Draw on the screen to annotate. Your drawing will be attached to the selected component.
            </div>
        </div>
    );
};

export default DrawingCanvas;
