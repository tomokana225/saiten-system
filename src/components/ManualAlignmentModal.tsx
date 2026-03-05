
import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import { XIcon, CheckCircle2Icon, RotateCcwIcon, CrosshairIcon, Wand2Icon } from './icons';
import { loadImage, findAlignmentMarks } from '../utils';

interface Point { x: number; y: number; }
interface Corners { tl: Point; tr: Point; br: Point; bl: Point; }

interface ManualAlignmentModalProps {
    imageUrl: string;
    initialCorners?: Corners;
    onSave: (corners: Corners) => void;
    onClose: () => void;
}

export const ManualAlignmentModal: React.FC<ManualAlignmentModalProps> = ({
    imageUrl, initialCorners, onSave, onClose
}) => {
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [corners, setCorners] = useState<Corners>(initialCorners || {
        tl: { x: 50, y: 50 },
        tr: { x: 450, y: 50 },
        br: { x: 450, y: 650 },
        bl: { x: 50, y: 650 }
    });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadImage(imageUrl).then(setImg);
    }, [imageUrl]);

    const handleAutoAlign = async () => {
        if (!img) return;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        const found = findAlignmentMarks(imageData);
        if (found) {
            setCorners(found);
        } else {
            alert('基準マークが見つかりませんでした。');
        }
    };

    if (!img) return null;

    const cornerLabels: Record<keyof Corners, string> = {
        tl: '左上', tr: '右上', br: '右下', bl: '左下'
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <CrosshairIcon className="w-5 h-5 text-sky-500" />
                        <h3 className="text-lg font-bold">手動位置補正</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    <div 
                        ref={containerRef}
                        className="flex-1 relative bg-slate-200 dark:bg-slate-950 overflow-hidden"
                    >
                        <img 
                            src={imageUrl} 
                            alt="Full Page" 
                            className="w-full h-full object-contain pointer-events-none select-none"
                        />
                        
                        <div className="absolute inset-0 w-full h-full">
                            <InteractiveOverlay 
                                img={img} 
                                corners={corners} 
                                onCornerChange={(k, p) => setCorners(prev => ({ ...prev, [k]: p }))}
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-64 p-4 bg-slate-50 dark:bg-slate-800 border-l dark:border-slate-700 flex flex-col gap-4">
                        <div className="text-sm text-slate-500">
                            4隅の基準点（L字マークの中心など）をドラッグして正確な位置に合わせてください。
                        </div>
                        
                        <div className="space-y-2">
                            {Object.entries(cornerLabels).map(([key, label]) => (
                                <div key={key} className="flex items-center justify-between p-2 bg-white dark:bg-slate-700 rounded border dark:border-slate-600">
                                    <span className="text-xs font-bold">{label}</span>
                                    <span className="text-[10px] font-mono text-slate-400">
                                        {Math.round(corners[key as keyof Corners].x)}, {Math.round(corners[key as keyof Corners].y)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-auto flex flex-col gap-2">
                            <button 
                                onClick={handleAutoAlign}
                                className="flex items-center justify-center gap-2 w-full py-2 text-sm bg-purple-100 dark:bg-purple-900/50 hover:bg-purple-200 dark:hover:bg-purple-800 rounded-md transition-colors"
                            >
                                <CrosshairIcon className="w-4 h-4" />
                                <span>自動認識</span>
                            </button>
                            <button 
                                onClick={() => {
                                    if (confirm('基準点を初期位置に戻しますか？')) {
                                        setCorners(initialCorners || {
                                            tl: { x: 50, y: 50 },
                                            tr: { x: img.naturalWidth - 50, y: 50 },
                                            br: { x: img.naturalWidth - 50, y: img.naturalHeight - 50 },
                                            bl: { x: 50, y: img.naturalHeight - 50 }
                                        });
                                    }
                                }}
                                className="flex items-center justify-center gap-2 w-full py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"
                            >
                                <RotateCcwIcon className="w-4 h-4" />
                                <span>リセット</span>
                            </button>
                            <button 
                                onClick={() => onSave(corners)}
                                className="flex items-center justify-center gap-2 w-full py-2 text-sm bg-sky-600 text-white hover:bg-sky-500 rounded-md transition-colors font-bold"
                            >
                                <CheckCircle2Icon className="w-4 h-4" />
                                <span>補正を適用</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const InteractiveOverlay: React.FC<{ 
    img: HTMLImageElement; 
    corners: Corners; 
    onCornerChange: (key: keyof Corners, pos: Point) => void 
}> = ({ img, corners, onCornerChange }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dragging, setDragging] = useState<keyof Corners | null>(null);

    const getClientToNatural = useCallback((clientX: number, clientY: number) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        
        // Handle object-contain letterboxing
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const rectAspect = rect.width / rect.height;
        
        let displayW, displayH, offsetX = 0, offsetY = 0;
        if (rectAspect > imgAspect) {
            displayH = rect.height;
            displayW = displayH * imgAspect;
            offsetX = (rect.width - displayW) / 2;
        } else {
            displayW = rect.width;
            displayH = displayW / imgAspect;
            offsetY = (rect.height - displayH) / 2;
        }

        // Clamp values to image bounds
        const x = Math.max(0, Math.min(img.naturalWidth, ((clientX - rect.left - offsetX) / displayW) * img.naturalWidth));
        const y = Math.max(0, Math.min(img.naturalHeight, ((clientY - rect.top - offsetY) / displayH) * img.naturalHeight));
        return { x, y };
    }, [img]);

    const getNaturalToClient = useCallback((nx: number, ny: number) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const rectAspect = rect.width / rect.height;
        
        let displayW, displayH, offsetX = 0, offsetY = 0;
        if (rectAspect > imgAspect) {
            displayH = rect.height;
            displayW = displayH * imgAspect;
            offsetX = (rect.width - displayW) / 2;
        } else {
            displayW = rect.width;
            displayH = displayW / imgAspect;
            offsetY = (rect.height - displayH) / 2;
        }

        const x = (nx / img.naturalWidth) * displayW + offsetX;
        const y = (ny / img.naturalHeight) * displayH + offsetY;
        return { x, y };
    }, [img]);

    const handleMouseMove = (e: MouseEvent) => {
        if (!dragging) return;
        const pos = getClientToNatural(e.clientX, e.clientY);
        onCornerChange(dragging, pos);
    };

    const handleMouseUp = () => {
        setDragging(null);
    };

    useEffect(() => {
        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, getClientToNatural, onCornerChange]);

    const [isReady, setIsReady] = useState(false);

    useLayoutEffect(() => {
        if (svgRef.current) {
            setIsReady(true);
        }
    }, []);

    const pts = useMemo(() => {
        if (!svgRef.current) return { tl: {x:0,y:0}, tr: {x:0,y:0}, br: {x:0,y:0}, bl: {x:0,y:0} };
        return {
            tl: getNaturalToClient(corners.tl.x, corners.tl.y),
            tr: getNaturalToClient(corners.tr.x, corners.tr.y),
            br: getNaturalToClient(corners.br.x, corners.br.y),
            bl: getNaturalToClient(corners.bl.x, corners.bl.y),
        };
    }, [corners, img, getNaturalToClient, isReady]);

    return (
        <svg ref={svgRef} className="absolute inset-0 w-full h-full overflow-visible">
            {/* Polygon connecting corners */}
            <polygon 
                points={`${pts.tl.x},${pts.tl.y} ${pts.tr.x},${pts.tr.y} ${pts.br.x},${pts.br.y} ${pts.bl.x},${pts.bl.y}`}
                className="fill-sky-500/10 stroke-sky-500 stroke-2"
            />
            
            {/* Interactive Handles */}
            {Object.entries(pts).map(([key, p]) => (
                <g 
                    key={key} 
                    className="cursor-move pointer-events-auto"
                    onMouseDown={(e) => { e.stopPropagation(); setDragging(key as keyof Corners); }}
                >
                    <circle cx={p.x} cy={p.y} r={12} className="fill-white/50 stroke-sky-500 stroke-1" />
                    <circle cx={p.x} cy={p.y} r={4} className="fill-sky-600" />
                    <text x={p.x + 15} y={p.y + 5} className="text-[10px] fill-sky-600 font-bold select-none">
                        {key.toUpperCase()}
                    </text>
                </g>
            ))}
        </svg>
    );
};
