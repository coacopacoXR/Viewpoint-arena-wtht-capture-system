import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pencil, Eraser, Undo2, Redo2, Check, X, Circle, Minus, Square, Play, Crosshair } from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../../store';

interface DrawingCanvasProps {
    onSave: (dataUrl: string) => void;
    onCancel: () => void;
    backgroundImage?: string | null; // Captured 3D perspective screenshot
}

type Tool = 'pen' | 'eraser' | 'line' | 'circle' | 'rectangle';
type AnimationPhase = 'init' | 'scanning' | 'framing' | 'ready' | 'drawing';

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
    const [animationPhase, setAnimationPhase] = useState<AnimationPhase>('init');
    const [scanLinePosition, setScanLinePosition] = useState(0);
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState('#ef4444'); // Red default
    const [lineWidth, setLineWidth] = useState(3);
    const [history, setHistory] = useState<DrawingState[]>([{ paths: [], currentPath: null }]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [currentPath, setCurrentPath] = useState<Path | null>(null);

    // Ref for isArmed check in mouse handlers
    const isArmedRef = useRef(false);

    // Derived state for backward compatibility
    const isArmed = animationPhase === 'drawing';

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

    // Dramatic animation sequence: init -> scanning -> framing -> ready -> drawing
    useEffect(() => {
        // Phase 1: Initial flash/capture effect
        const initTimer = setTimeout(() => {
            setAnimationPhase('scanning');
        }, 100);

        // Phase 2: Scanning line animation
        const scanTimer = setTimeout(() => {
            setAnimationPhase('framing');
        }, 800);

        // Phase 3: Corner brackets frame in
        const frameTimer = setTimeout(() => {
            setAnimationPhase('ready');
        }, 1400);

        return () => {
            clearTimeout(initTimer);
            clearTimeout(scanTimer);
            clearTimeout(frameTimer);
        };
    }, []);

    // Animate the scan line during scanning phase
    useEffect(() => {
        if (animationPhase === 'scanning') {
            const interval = setInterval(() => {
                setScanLinePosition(prev => {
                    if (prev >= 100) return 100;
                    return prev + 4;
                });
            }, 16);
            return () => clearInterval(interval);
        }
    }, [animationPhase]);

    // Keep isArmedRef in sync
    useEffect(() => {
        isArmedRef.current = isArmed;
    }, [isArmed]);

    // Start drawing mode - lock navigation
    const handleStartDrawing = useCallback(() => {
        setAnimationPhase('drawing');
        setDrawingInteractionActive(true);
    }, [setDrawingInteractionActive]);

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
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
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
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
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
        setDrawingInteractionActive(false);
        onSave(dataUrl);
    }, [history, historyIndex, onSave]);

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

    // Check if we're in a phase before 'ready'
    const isPreReady = animationPhase === 'init' || animationPhase === 'scanning' || animationPhase === 'framing';

    return (
        <>
            {/* Full-screen takeover backdrop with vignette */}
            <div
                className={clsx(
                    "fixed inset-0 z-[300] transition-all ease-out",
                    animationPhase === 'init'
                        ? "bg-white duration-100"
                        : animationPhase === 'scanning'
                            ? "bg-black/70 duration-300"
                            : animationPhase === 'framing'
                                ? "bg-black/60 backdrop-blur-sm duration-500"
                                : animationPhase === 'ready'
                                    ? "bg-black/50 backdrop-blur-md duration-700"
                                    : "bg-black/30 backdrop-blur-sm duration-500"
                )}
                style={{
                    pointerEvents: 'none',
                    boxShadow: isPreReady ? 'inset 0 0 200px 100px rgba(0,0,0,0.8)' : 'inset 0 0 150px 50px rgba(0,0,0,0.5)'
                }}
            />

            {/* Scan line effect during scanning phase */}
            {animationPhase === 'scanning' && (
                <div
                    className="fixed left-0 right-0 z-[305] h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                    style={{
                        top: `${scanLinePosition}%`,
                        boxShadow: '0 0 20px 5px rgba(34, 211, 238, 0.6), 0 0 60px 10px rgba(34, 211, 238, 0.3)',
                        transition: 'top 16ms linear'
                    }}
                />
            )}

            {/* Initial flash effect */}
            <div
                className={clsx(
                    "fixed inset-0 z-[304] bg-white pointer-events-none transition-opacity duration-200",
                    animationPhase === 'init' ? "opacity-80" : "opacity-0"
                )}
            />

            {/* Canvas - shows captured screenshot */}
            <canvas
                ref={canvasRef}
                className={clsx(
                    "fixed inset-0 z-[301] transition-all",
                    animationPhase === 'init'
                        ? "opacity-0 scale-110 duration-100"
                        : animationPhase === 'scanning'
                            ? "opacity-60 scale-100 duration-500 pointer-events-none"
                            : animationPhase === 'framing'
                                ? "opacity-80 scale-100 duration-500 pointer-events-none"
                                : animationPhase === 'ready'
                                    ? "opacity-90 scale-100 duration-500 pointer-events-none"
                                    : "opacity-100 scale-100 duration-300 cursor-crosshair pointer-events-auto"
                )}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />

            {/* Corner brackets frame overlay */}
            <div
                className={clsx(
                    "fixed inset-0 z-[302] pointer-events-none transition-all duration-500",
                    animationPhase === 'framing' || animationPhase === 'ready' ? "opacity-100" : "opacity-0"
                )}
            >
                {/* Top-left bracket */}
                <div className={clsx(
                    "absolute top-8 left-8 w-20 h-20 transition-all duration-700",
                    animationPhase === 'framing' || animationPhase === 'ready'
                        ? "opacity-100 translate-x-0 translate-y-0"
                        : "opacity-0 -translate-x-4 -translate-y-4"
                )}>
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 to-transparent"
                         style={{ boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)' }} />
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-400 to-transparent"
                         style={{ boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)' }} />
                </div>
                {/* Top-right bracket */}
                <div className={clsx(
                    "absolute top-8 right-8 w-20 h-20 transition-all duration-700 delay-75",
                    animationPhase === 'framing' || animationPhase === 'ready'
                        ? "opacity-100 translate-x-0 translate-y-0"
                        : "opacity-0 translate-x-4 -translate-y-4"
                )}>
                    <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-l from-cyan-400 to-transparent"
                         style={{ boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)' }} />
                    <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-cyan-400 to-transparent"
                         style={{ boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)' }} />
                </div>
                {/* Bottom-left bracket */}
                <div className={clsx(
                    "absolute bottom-8 left-8 w-20 h-20 transition-all duration-700 delay-100",
                    animationPhase === 'framing' || animationPhase === 'ready'
                        ? "opacity-100 translate-x-0 translate-y-0"
                        : "opacity-0 -translate-x-4 translate-y-4"
                )}>
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 to-transparent"
                         style={{ boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)' }} />
                    <div className="absolute bottom-0 left-0 w-1 h-full bg-gradient-to-t from-cyan-400 to-transparent"
                         style={{ boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)' }} />
                </div>
                {/* Bottom-right bracket */}
                <div className={clsx(
                    "absolute bottom-8 right-8 w-20 h-20 transition-all duration-700 delay-150",
                    animationPhase === 'framing' || animationPhase === 'ready'
                        ? "opacity-100 translate-x-0 translate-y-0"
                        : "opacity-0 translate-x-4 translate-y-4"
                )}>
                    <div className="absolute bottom-0 right-0 w-full h-1 bg-gradient-to-l from-cyan-400 to-transparent"
                         style={{ boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)' }} />
                    <div className="absolute bottom-0 right-0 w-1 h-full bg-gradient-to-t from-cyan-400 to-transparent"
                         style={{ boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)' }} />
                </div>
            </div>

            {/* "DRAWING MODE" title overlay during transition */}
            <div
                className={clsx(
                    "fixed inset-0 z-[303] flex items-center justify-center pointer-events-none transition-all duration-500",
                    animationPhase === 'scanning' || animationPhase === 'framing'
                        ? "opacity-100"
                        : "opacity-0"
                )}
            >
                <div className="text-center">
                    <div className={clsx(
                        "flex items-center justify-center gap-4 mb-4 transition-all duration-700",
                        animationPhase === 'scanning' || animationPhase === 'framing'
                            ? "opacity-100 scale-100"
                            : "opacity-0 scale-90"
                    )}>
                        <Crosshair
                            size={40}
                            className="text-cyan-400"
                            style={{ filter: 'drop-shadow(0 0 10px rgba(34, 211, 238, 0.8))' }}
                        />
                    </div>
                    <h1
                        className={clsx(
                            "text-4xl font-black tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-white to-cyan-400 transition-all duration-700",
                            animationPhase === 'scanning' || animationPhase === 'framing'
                                ? "opacity-100 translate-y-0"
                                : "opacity-0 translate-y-4"
                        )}
                        style={{
                            textShadow: '0 0 30px rgba(34, 211, 238, 0.5)',
                            filter: 'drop-shadow(0 0 20px rgba(34, 211, 238, 0.3))'
                        }}
                    >
                        DRAWING MODE
                    </h1>
                    <p className={clsx(
                        "text-cyan-200/60 text-sm mt-2 tracking-widest transition-all duration-700 delay-200",
                        animationPhase === 'framing' ? "opacity-100" : "opacity-0"
                    )}>
                        CAPTURING VIEW...
                    </p>
                </div>
            </div>

            {/* "Start Drawing" prominent center button - shown during 'ready' phase */}
            <div
                className={clsx(
                    "fixed inset-0 z-[306] flex items-center justify-center transition-all duration-500",
                    animationPhase === 'ready'
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none scale-95"
                )}
            >
                <div className="flex flex-col items-center gap-6">
                    {/* Mode indicator */}
                    <div className={clsx(
                        "flex items-center gap-3 px-6 py-2 rounded-full bg-black/40 backdrop-blur-sm border border-cyan-400/30 transition-all duration-500 delay-100",
                        animationPhase === 'ready' ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
                    )}>
                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"
                             style={{ boxShadow: '0 0 10px rgba(34, 211, 238, 0.8)' }} />
                        <span className="text-cyan-400 text-xs font-bold tracking-widest">DRAWING MODE ACTIVE</span>
                    </div>

                    {/* Main action button */}
                    <button
                        onClick={handleStartDrawing}
                        className={clsx(
                            "group relative px-12 py-6 rounded-2xl text-white font-bold text-xl",
                            "bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-600",
                            "shadow-2xl shadow-cyan-500/30",
                            "hover:shadow-cyan-500/50 hover:scale-105",
                            "active:scale-95",
                            "transition-all duration-300 ease-out",
                            "flex items-center gap-4"
                        )}
                    >
                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                            <Play size={24} fill="currentColor" />
                        </div>
                        <span>Start Drawing</span>

                        {/* Animated ring */}
                        <div className="absolute inset-0 rounded-2xl border-2 border-white/30 animate-pulse" />

                        {/* Outer glow ring */}
                        <div
                            className="absolute -inset-1 rounded-2xl border border-cyan-400/50 animate-ping"
                            style={{ animationDuration: '2s' }}
                        />
                    </button>

                    {/* Instructions */}
                    <div className="text-center max-w-md">
                        <p className="text-white/90 text-sm font-medium mb-2">
                            Draw annotations on the captured 3D view
                        </p>
                        <p className="text-white/60 text-xs">
                            Navigation is locked while drawing. Press ESC to cancel.
                        </p>
                    </div>

                    {/* Cancel link */}
                    <button
                        onClick={handleCancel}
                        className="text-white/50 hover:text-white/80 text-sm transition-colors flex items-center gap-2"
                    >
                        <X size={14} />
                        Cancel
                    </button>
                </div>
            </div>

            {/* Toolbar - slides in from top during 'drawing' phase */}
            <div
                className={clsx(
                    "fixed top-4 left-1/2 -translate-x-1/2 z-[307] bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-200 p-3 flex items-center gap-3 transition-all duration-500 ease-out",
                    animationPhase === 'drawing'
                        ? "opacity-100 pointer-events-auto translate-y-0"
                        : "opacity-0 pointer-events-none -translate-y-8"
                )}
            >
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
                        onClick={handleCancel}
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
                        OK
                    </button>
                </div>
            </div>

            {/* Instructions - shown only during drawing phase */}
            <div
                className={clsx(
                    "fixed bottom-6 left-1/2 -translate-x-1/2 z-[307] bg-black/80 backdrop-blur-sm text-white px-6 py-3 rounded-xl text-xs transition-all duration-500",
                    animationPhase === 'drawing'
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-4"
                )}
            >
                <span className="text-white/60">Draw on the screen.</span>{' '}
                <span className="text-white/80">⌘/Ctrl+Z</span> <span className="text-white/60">undo</span> •{' '}
                <span className="text-white/80">⇧⌘/Ctrl+Z</span> <span className="text-white/60">redo</span> •{' '}
                <span className="text-white/80">Esc</span> <span className="text-white/60">cancel</span> •{' '}
                <span className="text-white/80">OK</span> <span className="text-white/60">save</span>
            </div>
        </>
    );
};

export default DrawingCanvas;
