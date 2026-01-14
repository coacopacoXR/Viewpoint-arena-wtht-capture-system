import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
    Pencil, Eraser, Undo2, Redo2, Check, X, Circle, Minus, Square,
    ArrowRight, Type, Highlighter, Move, ZoomIn, ZoomOut, RotateCcw,
    Maximize2, Grid3X3, MousePointer2, PenTool
} from 'lucide-react';
import { clsx } from 'clsx';

interface DrawingCanvasProps {
    onSave: (dataUrl: string) => void;
    onCancel: () => void;
    backgroundImage?: string | null;
    attachedToName?: string;
}

type Tool = 'pen' | 'eraser' | 'line' | 'circle' | 'rectangle' | 'arrow' | 'highlighter' | 'text' | 'select';

interface DrawingState {
    paths: Path[];
    currentPath: Path | null;
}

interface Path {
    tool: Tool;
    color: string;
    width: number;
    points: { x: number; y: number }[];
    text?: string;
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ onSave, onCancel, backgroundImage, attachedToName }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState('#ef4444');
    const [lineWidth, setLineWidth] = useState(3);
    const [history, setHistory] = useState<DrawingState[]>([{ paths: [], currentPath: null }]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [currentPath, setCurrentPath] = useState<Path | null>(null);
    const [showGrid, setShowGrid] = useState(false);
    const [textInput, setTextInput] = useState('');
    const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const bgImageRef = useRef<HTMLImageElement | null>(null);

    const colors = [
        { value: '#ef4444', name: 'Red' },
        { value: '#f97316', name: 'Orange' },
        { value: '#eab308', name: 'Yellow' },
        { value: '#22c55e', name: 'Green' },
        { value: '#3b82f6', name: 'Blue' },
        { value: '#8b5cf6', name: 'Purple' },
        { value: '#ec4899', name: 'Pink' },
        { value: '#000000', name: 'Black' },
        { value: '#ffffff', name: 'White' },
    ];

    const lineWidths = [
        { value: 2, name: 'Thin' },
        { value: 4, name: 'Medium' },
        { value: 6, name: 'Thick' },
        { value: 10, name: 'Extra Thick' },
    ];

    const tools = [
        { id: 'select' as Tool, icon: MousePointer2, name: 'Select', shortcut: 'V' },
        { id: 'pen' as Tool, icon: PenTool, name: 'Pen', shortcut: 'P' },
        { id: 'highlighter' as Tool, icon: Highlighter, name: 'Highlighter', shortcut: 'H' },
        { id: 'line' as Tool, icon: Minus, name: 'Line', shortcut: 'L' },
        { id: 'arrow' as Tool, icon: ArrowRight, name: 'Arrow', shortcut: 'A' },
        { id: 'circle' as Tool, icon: Circle, name: 'Circle', shortcut: 'C' },
        { id: 'rectangle' as Tool, icon: Square, name: 'Rectangle', shortcut: 'R' },
        { id: 'text' as Tool, icon: Type, name: 'Text', shortcut: 'T' },
        { id: 'eraser' as Tool, icon: Eraser, name: 'Eraser', shortcut: 'E' },
    ];

    // Enter fullscreen on mount
    useEffect(() => {
        const enterFullscreen = async () => {
            try {
                if (containerRef.current && document.fullscreenEnabled) {
                    await containerRef.current.requestFullscreen();
                    setIsFullscreen(true);
                }
            } catch (e) {
                console.log('Fullscreen not available');
            }
        };
        enterFullscreen();

        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (textPosition) return; // Don't handle shortcuts when typing

            const key = e.key.toLowerCase();

            // Tool shortcuts
            if (key === 'v') setTool('select');
            if (key === 'p') setTool('pen');
            if (key === 'h') setTool('highlighter');
            if (key === 'l') setTool('line');
            if (key === 'a') setTool('arrow');
            if (key === 'c') setTool('circle');
            if (key === 'r') setTool('rectangle');
            if (key === 't') setTool('text');
            if (key === 'e') setTool('eraser');

            // Undo/Redo
            if ((e.metaKey || e.ctrlKey) && key === 'z') {
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
            }

            // Escape to cancel
            if (key === 'escape') {
                if (textPosition) {
                    setTextPosition(null);
                    setTextInput('');
                } else {
                    onCancel();
                }
            }

            // Save with Cmd/Ctrl + S
            if ((e.metaKey || e.ctrlKey) && key === 's') {
                e.preventDefault();
                handleSave();
            }

            // Toggle grid with G
            if (key === 'g') setShowGrid(prev => !prev);

            // Increase/decrease brush size with [ and ]
            if (key === '[') {
                setLineWidth(prev => Math.max(1, prev - 2));
            }
            if (key === ']') {
                setLineWidth(prev => Math.min(20, prev + 2));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [textPosition, historyIndex, history]);

    // Initialize canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        if (backgroundImage) {
            const img = new Image();
            img.onload = () => {
                bgImageRef.current = img;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            };
            img.src = backgroundImage;
        } else {
            ctx.fillStyle = 'rgba(30, 30, 30, 0.85)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }, [backgroundImage]);

    // Load background image for redraw
    useEffect(() => {
        if (backgroundImage) {
            const img = new Image();
            img.onload = () => {
                bgImageRef.current = img;
            };
            img.src = backgroundImage;
        }
    }, [backgroundImage]);

    const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
        const headLength = 15;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    };

    // Redraw canvas
    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background
        if (bgImageRef.current) {
            ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = 'rgba(30, 30, 30, 0.85)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Draw grid if enabled
        if (showGrid) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            const gridSize = 50;
            for (let x = 0; x < canvas.width; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }
        }

        // Draw all paths from history
        const state = history[historyIndex];
        [...state.paths, currentPath].filter(Boolean).forEach(path => {
            if (!path) return;

            ctx.strokeStyle = path.color;
            ctx.fillStyle = path.color;
            ctx.lineWidth = path.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (path.tool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
            } else if (path.tool === 'highlighter') {
                ctx.globalCompositeOperation = 'multiply';
                ctx.globalAlpha = 0.4;
                ctx.lineWidth = path.width * 4;
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            }

            if (path.tool === 'pen' || path.tool === 'eraser' || path.tool === 'highlighter') {
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
            } else if (path.tool === 'arrow' && path.points.length >= 2) {
                const start = path.points[0];
                const end = path.points[path.points.length - 1];
                drawArrow(ctx, start.x, start.y, end.x, end.y);
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
            } else if (path.tool === 'text' && path.text && path.points.length > 0) {
                ctx.font = `${path.width * 6}px Inter, sans-serif`;
                ctx.fillText(path.text, path.points[0].x, path.points[0].y);
            }

            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        });
    }, [history, historyIndex, currentPath, showGrid]);

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

        if (tool === 'text') {
            setTextPosition(point);
            return;
        }

        if (tool === 'select') return;

        setIsDrawing(true);
        setCurrentPath({
            tool,
            color: tool === 'eraser' ? '#000000' : color,
            width: tool === 'eraser' ? lineWidth * 3 : lineWidth,
            points: [point]
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing || !currentPath || tool === 'select') return;

        const point = getCanvasPoint(e);

        if (tool === 'pen' || tool === 'eraser' || tool === 'highlighter') {
            setCurrentPath({
                ...currentPath,
                points: [...currentPath.points, point]
            });
        } else {
            // For shapes, only keep first and last point
            setCurrentPath({
                ...currentPath,
                points: [currentPath.points[0], point]
            });
        }
    };

    const handleMouseUp = () => {
        if (!isDrawing || !currentPath) return;

        setIsDrawing(false);

        const newState: DrawingState = {
            paths: [...history[historyIndex].paths, currentPath],
            currentPath: null
        };

        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newState);

        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setCurrentPath(null);
    };

    const handleTextSubmit = () => {
        if (!textPosition || !textInput.trim()) {
            setTextPosition(null);
            setTextInput('');
            return;
        }

        const textPath: Path = {
            tool: 'text',
            color,
            width: lineWidth,
            points: [textPosition],
            text: textInput
        };

        const newState: DrawingState = {
            paths: [...history[historyIndex].paths, textPath],
            currentPath: null
        };

        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newState);

        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setTextPosition(null);
        setTextInput('');
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

    const handleClear = () => {
        const newState: DrawingState = { paths: [], currentPath: null };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newState);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Export the full canvas including background
        const dataUrl = canvas.toDataURL('image/png');
        onSave(dataUrl);
    };

    const toggleFullscreen = async () => {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else if (containerRef.current) {
            await containerRef.current.requestFullscreen();
        }
    };

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-[500] bg-neutral-900 flex flex-col"
        >
            {/* Top Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-neutral-800 border-b border-neutral-700">
                {/* Left: Logo & Title */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <PenTool size={16} className="text-white" />
                        </div>
                        <div>
                            <div className="text-white font-bold text-sm">Drawing Mode</div>
                            {attachedToName && (
                                <div className="text-neutral-400 text-[10px]">
                                    Attaching to: {attachedToName}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Center: Main Tools */}
                <div className="flex items-center gap-1 bg-neutral-700/50 rounded-lg p-1">
                    {tools.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTool(t.id)}
                            className={clsx(
                                "w-9 h-9 rounded-lg flex items-center justify-center transition-all group relative",
                                tool === t.id
                                    ? "bg-blue-500 text-white shadow-lg"
                                    : "text-neutral-400 hover:text-white hover:bg-neutral-600"
                            )}
                            title={`${t.name} (${t.shortcut})`}
                        >
                            <t.icon size={18} />
                            {/* Tooltip */}
                            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                                {t.name} <span className="text-neutral-400">({t.shortcut})</span>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleUndo}
                        disabled={historyIndex === 0}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Undo (Cmd+Z)"
                    >
                        <Undo2 size={18} />
                    </button>
                    <button
                        onClick={handleRedo}
                        disabled={historyIndex === history.length - 1}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Redo (Cmd+Shift+Z)"
                    >
                        <Redo2 size={18} />
                    </button>

                    <div className="w-px h-6 bg-neutral-600 mx-1" />

                    <button
                        onClick={handleClear}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700"
                        title="Clear All"
                    >
                        <RotateCcw size={18} />
                    </button>
                    <button
                        onClick={() => setShowGrid(!showGrid)}
                        className={clsx(
                            "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
                            showGrid ? "bg-blue-500 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-700"
                        )}
                        title="Toggle Grid (G)"
                    >
                        <Grid3X3 size={18} />
                    </button>
                    <button
                        onClick={toggleFullscreen}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700"
                        title="Toggle Fullscreen"
                    >
                        <Maximize2 size={18} />
                    </button>

                    <div className="w-px h-6 bg-neutral-600 mx-1" />

                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                        <X size={16} />
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg"
                    >
                        <Check size={16} />
                        Save Drawing
                    </button>
                </div>
            </div>

            {/* Main Canvas Area */}
            <div className="flex-1 relative overflow-hidden">
                <canvas
                    ref={canvasRef}
                    className={clsx(
                        "absolute inset-0",
                        tool === 'text' ? 'cursor-text' :
                        tool === 'select' ? 'cursor-default' :
                        tool === 'eraser' ? 'cursor-cell' :
                        'cursor-crosshair'
                    )}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                />

                {/* Text Input Overlay */}
                {textPosition && (
                    <div
                        className="absolute z-10"
                        style={{ left: textPosition.x, top: textPosition.y + 60 }} // +60 for toolbar
                    >
                        <input
                            type="text"
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleTextSubmit();
                                if (e.key === 'Escape') {
                                    setTextPosition(null);
                                    setTextInput('');
                                }
                            }}
                            onBlur={handleTextSubmit}
                            autoFocus
                            className="bg-white border-2 border-blue-500 rounded px-2 py-1 text-sm outline-none min-w-[200px]"
                            style={{ color }}
                            placeholder="Type your text..."
                        />
                    </div>
                )}
            </div>

            {/* Left Sidebar - Colors & Stroke */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-neutral-800/95 backdrop-blur-sm rounded-xl p-3 border border-neutral-700 shadow-2xl">
                {/* Colors */}
                <div className="mb-4">
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2 font-bold">Color</div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {colors.map(c => (
                            <button
                                key={c.value}
                                onClick={() => setColor(c.value)}
                                className={clsx(
                                    "w-7 h-7 rounded-lg border-2 transition-all hover:scale-110",
                                    color === c.value ? "border-white scale-110 shadow-lg" : "border-transparent"
                                )}
                                style={{ backgroundColor: c.value }}
                                title={c.name}
                            />
                        ))}
                    </div>
                </div>

                {/* Stroke Width */}
                <div>
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2 font-bold">Stroke</div>
                    <div className="flex flex-col gap-1">
                        {lineWidths.map(w => (
                            <button
                                key={w.value}
                                onClick={() => setLineWidth(w.value)}
                                className={clsx(
                                    "h-8 rounded-lg flex items-center justify-center gap-2 transition-all px-2",
                                    lineWidth === w.value
                                        ? "bg-blue-500 text-white"
                                        : "text-neutral-400 hover:bg-neutral-700"
                                )}
                            >
                                <div
                                    className="rounded-full bg-current"
                                    style={{ width: w.value + 2, height: w.value + 2 }}
                                />
                                <span className="text-[10px]">{w.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Help Bar */}
            <div className="bg-neutral-800 border-t border-neutral-700 px-4 py-2 flex items-center justify-between text-neutral-400 text-xs">
                <div className="flex items-center gap-4">
                    <span><kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px]">P</kbd> Pen</span>
                    <span><kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px]">A</kbd> Arrow</span>
                    <span><kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px]">R</kbd> Rectangle</span>
                    <span><kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px]">T</kbd> Text</span>
                    <span><kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px]">E</kbd> Eraser</span>
                    <span><kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px]">G</kbd> Grid</span>
                </div>
                <div className="flex items-center gap-4">
                    <span><kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px]">[</kbd><kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px]">]</kbd> Brush Size</span>
                    <span><kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px]">⌘Z</kbd> Undo</span>
                    <span><kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px]">⌘S</kbd> Save</span>
                    <span><kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px]">Esc</kbd> Cancel</span>
                </div>
            </div>
        </div>
    );
};

export default DrawingCanvas;
