
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import type { Template, Area, AreaType, Point } from '../types';
import { AreaType as AreaTypeEnum } from '../types';
import { TemplateSidebar, areaTypeColors } from './template_editor/TemplateSidebar';
import { TemplateToolbar } from './template_editor/TemplateToolbar';
import { useProject } from '../context/ProjectContext';
import { analyzeMarkSheetSnippet, findNearestAlignedRefArea } from '../utils';

interface TemplateEditorProps {
    apiKey: string;
}

interface DrawState {
    isDrawing: boolean;
    isResizing: boolean;
    isMoving: boolean;
    startPoint: { x: number, y: number };
    resizeHandle: string | null;
    moveStartArea: Area | null;
    moveStartPositions?: Map<number, { x: number; y: number }>;
}

export interface DetectionSettings {
    minSize: number;
    threshold: number;
    padding: number;
}

const RESIZE_HANDLE_SIZE = 12;
const MIN_AREA_SIZE = 5;

const migrateAreas = (areasToMigrate: Area[]): Area[] => {
    return areasToMigrate.map(area => {
        const migratedArea = { ...area };
        if (migratedArea.pageIndex === undefined) migratedArea.pageIndex = 0;
        if (migratedArea.type === AreaTypeEnum.MARK_SHEET && migratedArea.questionNumber === undefined) {
            const match = migratedArea.name.match(/\d+/);
            migratedArea.questionNumber = match ? parseInt(match[0], 10) : undefined;
        }
        return migratedArea;
    });
};

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ apiKey }) => {
    const { activeProject, handleAreasChange, handleTemplateChange } = useProject();
    const { template, areas: initialAreas, points, aiSettings } = activeProject!;

    const [history, setHistory] = useState<Area[][]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const pages = template.pages || (template.filePath ? [{ imagePath: template.filePath, width: template.width, height: template.height }] : []);
    const [activePageIndex, setActivePageIndex] = useState(0);
    const activePage = pages[activePageIndex];

    const [areas, setAreas] = useState<Area[]>(() => migrateAreas(initialAreas));
    const [selectedAreaIds, setSelectedAreaIds] = useState<Set<number>>(new Set());
    const [zoom, setZoom] = useState(1);
    
    const [isAutoDetectMode, setIsAutoDetectMode] = useState(false);
    const [wandTargetType, setWandTargetType] = useState<AreaType>(AreaTypeEnum.ANSWER);
    const [manualDrawType, setManualDrawType] = useState<AreaType | null>(null);
    
    const [drawState, setDrawState] = useState<DrawState | null>(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    
    const [panState, setPanState] = useState<{ isPanning: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

    const [detSettings, setDetSettings] = useState<DetectionSettings>({
        minSize: 15,
        threshold: 160,
        padding: 0
    });

    const [showMarkPoints, setShowMarkPoints] = useState(false);
    const [detectedMarkPoints, setDetectedMarkPoints] = useState<Record<number, {x: number, y: number}[]>>({});

    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const interactionThrottle = useRef<number | null>(null);

    const [canvasCursor, setCanvasCursor] = useState<'default' | 'crosshair' | 'nwse-resize' | 'nesw-resize' | 'ns-resize' | 'ew-resize' | 'move' | 'pointer'>('default');

    useEffect(() => {
        const migrated = migrateAreas(initialAreas);
        setAreas(migrated);
        setHistory([migrated]);
        setHistoryIndex(0);
    }, [activeProject?.id]);

    const commitAreas = useCallback((newAreas: Area[]) => {
        const migrated = migrateAreas(newAreas);
        setAreas(migrated);
        setHistory(prev => {
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, migrated];
        });
        setHistoryIndex(prev => prev + 1);
        handleAreasChange(migrated);
    }, [historyIndex, handleAreasChange]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            const prevState = history[historyIndex - 1];
            setHistoryIndex(prev => prev - 1);
            setAreas(prevState);
            handleAreasChange(prevState);
        }
    }, [history, historyIndex, handleAreasChange]);

    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const nextState = history[historyIndex + 1];
            setHistoryIndex(prev => prev + 1);
            setAreas(nextState);
            handleAreasChange(nextState);
        }
    }, [history, historyIndex, handleAreasChange]);
    
    const currentPageAreas = areas.filter(a => (a.pageIndex === undefined ? 0 : a.pageIndex) === activePageIndex);

    // --- Mark Detection Preview Logic ---
    const updateMarkDetection = useCallback(async () => {
        if (!showMarkPoints || !activePage) return;
        
        const markSheetAreas = currentPageAreas.filter(a => a.type === AreaTypeEnum.MARK_SHEET);
        const newDetectedPoints: Record<number, {x: number, y: number}[]> = {};

        for (const area of markSheetAreas) {
            const point = points.find(p => p.id === area.id) || { id: area.id, markSheetOptions: 4, markSheetLayout: 'horizontal' } as Point;
            const refR = findNearestAlignedRefArea(area, areas, AreaTypeEnum.MARKSHEET_REF_RIGHT);
            const refB = findNearestAlignedRefArea(area, areas, AreaTypeEnum.MARKSHEET_REF_BOTTOM);

            try {
                const res = await analyzeMarkSheetSnippet(
                    activePage.imagePath,
                    area,
                    point,
                    aiSettings.markSheetSensitivity,
                    refR,
                    refB
                );
                newDetectedPoints[area.id] = res.positions;
            } catch (e) {
                console.error("Editor mark detection failed for area", area.id, e);
            }
        }
        setDetectedMarkPoints(newDetectedPoints);
    }, [showMarkPoints, currentPageAreas, activePage, points, areas, aiSettings.markSheetSensitivity]);

    useEffect(() => {
        if (showMarkPoints) {
            updateMarkDetection();
        } else {
            setDetectedMarkPoints({});
        }
    }, [showMarkPoints, updateMarkDetection]);

    const getResizeHandle = useCallback((area: Area, x: number, y: number) => {
        const handleSize = RESIZE_HANDLE_SIZE / zoom;
        const handles = [
            { name: 'top-left', x: area.x, y: area.y, cursor: 'nwse-resize' as const },
            { name: 'top-right', x: area.x + area.width, y: area.y, cursor: 'nesw-resize' as const },
            { name: 'bottom-left', x: area.x, y: area.y + area.height, cursor: 'nesw-resize' as const },
            { name: 'bottom-right', x: area.x + area.width, y: area.y + area.height, cursor: 'nwse-resize' as const },
            { name: 'top', x: area.x + area.width / 2, y: area.y, cursor: 'ns-resize' as const },
            { name: 'bottom', x: area.x + area.width / 2, y: area.y + area.height, cursor: 'ns-resize' as const },
            { name: 'left', x: area.x, y: area.y + area.height / 2, cursor: 'ew-resize' as const },
            { name: 'right', x: area.x + area.width, y: area.y + area.height / 2, cursor: 'ew-resize' as const },
        ];
        for (const handle of handles) {
            if (Math.abs(x - handle.x) < handleSize && Math.abs(y - handle.y) < handleSize) return handle;
        }
        return null;
    }, [zoom]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas || !activePage) return;

        canvas.width = activePage.width;
        canvas.height = activePage.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        currentPageAreas.forEach(area => {
            const color = areaTypeColors[area.type]?.hex || '#000000';
            const isSelected = selectedAreaIds.has(area.id);
            ctx.strokeStyle = color;
            ctx.lineWidth = isSelected ? 4 : 2;
            ctx.strokeRect(area.x, area.y, area.width, area.height);

            ctx.save();
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.15;
            ctx.fillRect(area.x, area.y, area.width, area.height);
            
            ctx.globalAlpha = 0.4;
            const fontSize = Math.max(12, Math.min(area.height * 0.4, 60));
            if (area.width > 20 && area.height > 15) {
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(area.name, area.x + area.width / 2, area.y + area.height / 2);
            }
            ctx.restore();

            // Draw detection points if enabled and available
            if (showMarkPoints && detectedMarkPoints[area.id]) {
                ctx.save();
                ctx.strokeStyle = '#22c55e'; // Bright Green
                ctx.lineWidth = 1;
                detectedMarkPoints[area.id].forEach(pos => {
                    // Draw Crosshair
                    ctx.beginPath();
                    ctx.moveTo(pos.x - 10, pos.y); ctx.lineTo(pos.x + 10, pos.y);
                    ctx.moveTo(pos.x, pos.y - 10); ctx.lineTo(pos.x, pos.y + 10);
                    ctx.stroke();
                    // Draw Center Dot
                    ctx.fillStyle = '#22c55e';
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.restore();
            }

            if (isSelected) {
                ctx.fillStyle = '#0ea5e9';
                const handleSize = RESIZE_HANDLE_SIZE / zoom;
                const rectHandles = [
                    { x: area.x, y: area.y }, { x: area.x + area.width, y: area.y },
                    { x: area.y + area.height }, { x: area.x + area.width, y: area.y + area.height },
                    { x: area.x + area.width / 2, y: area.y }, { x: area.x + area.width / 2, y: area.y + area.height },
                    { x: area.y + area.height / 2 }, { x: area.x + area.width, y: area.y + area.height / 2 },
                ];
                // Note: The original handles array had a bug in y coordinates above, fixing here for visualization
                const correctedHandles = [
                    { x: area.x, y: area.y }, { x: area.x + area.width, y: area.y },
                    { x: area.x, y: area.y + area.height }, { x: area.x + area.width, y: area.y + area.height },
                    { x: area.x + area.width / 2, y: area.y }, { x: area.x + area.width / 2, y: area.y + area.height },
                    { x: area.x, y: area.y + area.height / 2 }, { x: area.x + area.width, y: area.y + area.height / 2 },
                ];
                correctedHandles.forEach(h => ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize));
            }
        });
    }, [currentPageAreas, selectedAreaIds, activePage, zoom, showMarkPoints, detectedMarkPoints]);
    
    const getRelativeCoords = (e: React.MouseEvent | MouseEvent): { x: number, y: number } => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const isMiddleClick = e.button === 1; 
        const isSpacePan = e.button === 0 && isSpacePressed;
        
        if (isMiddleClick || isSpacePan) {
            if (containerRef.current) setPanState({ isPanning: true, startX: e.clientX, startY: e.clientY, scrollLeft: containerRef.current.scrollLeft, scrollTop: containerRef.current.scrollTop });
            return;
        }

        const pos = getRelativeCoords(e);
        const clickedArea = currentPageAreas.slice().reverse().find(a => pos.x >= a.x && pos.x <= a.x + a.width && pos.y >= a.y && pos.y <= a.y + a.height);
        const handle = clickedArea && selectedAreaIds.has(clickedArea.id) ? getResizeHandle(clickedArea, pos.x, pos.y) : null;

        if (handle && clickedArea) {
            setDrawState({ isResizing: true, isMoving: false, isDrawing: false, startPoint: pos, resizeHandle: handle.name, moveStartArea: clickedArea });
        } else if (clickedArea) {
            if (!selectedAreaIds.has(clickedArea.id) && !e.shiftKey) setSelectedAreaIds(new Set([clickedArea.id]));
            else if (e.shiftKey) { const next = new Set(selectedAreaIds); if(next.has(clickedArea.id)) next.delete(clickedArea.id); else next.add(clickedArea.id); setSelectedAreaIds(next); }
            
            const moveStartPositions = new Map<number, { x: number; y: number }>();
            const targetIds = selectedAreaIds.has(clickedArea.id) ? selectedAreaIds : new Set([clickedArea.id]);
            targetIds.forEach(id => {
                const area = areas.find(a => a.id === id);
                if (area) moveStartPositions.set(id, { x: area.x, y: area.y });
            });
            setDrawState({ isResizing: false, isMoving: true, isDrawing: false, startPoint: pos, resizeHandle: null, moveStartArea: clickedArea, moveStartPositions });
        } else if (manualDrawType) {
            setDrawState({ isDrawing: true, isResizing: false, isMoving: false, startPoint: pos, resizeHandle: null, moveStartArea: null });
        } else {
            setSelectedAreaIds(new Set());
        }
    };
    
    const handleInteractionMove = (e: React.MouseEvent) => {
        const pos = getRelativeCoords(e);
        
        if (!drawState && !panState) {
            const hoveredArea = currentPageAreas.slice().reverse().find(a => pos.x >= a.x && pos.x <= a.x + a.width && pos.y >= a.y && pos.y <= a.y + a.height);
            if (hoveredArea) {
                const handle = selectedAreaIds.has(hoveredArea.id) ? getResizeHandle(hoveredArea, pos.x, pos.y) : null;
                setCanvasCursor(handle ? handle.cursor : 'move');
            } else if (manualDrawType) setCanvasCursor('crosshair');
            else setCanvasCursor('default');
        }

        if (panState?.isPanning && containerRef.current) {
            const dx = e.clientX - panState.startX; const dy = e.clientY - panState.startY;
            containerRef.current.scrollLeft = panState.scrollLeft - dx;
            containerRef.current.scrollTop = panState.scrollTop - dy;
            return;
        }

        if (!drawState) return;

        const performUpdate = () => {
            if (drawState.isResizing && drawState.moveStartArea) {
                setAreas(currentAreas => currentAreas.map(area => {
                    if (area.id !== drawState.moveStartArea!.id) return area;
                    const newArea = { ...area }; const { resizeHandle } = drawState;
                    if (resizeHandle?.includes('right')) newArea.width = Math.max(MIN_AREA_SIZE, pos.x - newArea.x);
                    if (resizeHandle?.includes('bottom')) newArea.height = Math.max(MIN_AREA_SIZE, pos.y - newArea.y);
                    if (resizeHandle?.includes('left')) { const newWidth = newArea.x + newArea.width - pos.x; if (newWidth > MIN_AREA_SIZE) { newArea.width = newWidth; newArea.x = pos.x; } }
                    if (resizeHandle?.includes('top')) { const newHeight = newArea.y + newArea.height - pos.y; if (newHeight > MIN_AREA_SIZE) { newArea.height = newHeight; newArea.y = pos.y; } }
                    return newArea;
                }));
            } else if (drawState.isMoving && drawState.moveStartPositions) {
                const dx = pos.x - drawState.startPoint.x; const dy = pos.y - drawState.startPoint.y;
                setAreas(currentAreas => currentAreas.map(area => {
                    const startPos = drawState.moveStartPositions!.get(area.id);
                    if (startPos) return { ...area, x: startPos.x + dx, y: startPos.y + dy };
                    return area;
                }));
            }
        };

        if (interactionThrottle.current) cancelAnimationFrame(interactionThrottle.current);
        interactionThrottle.current = requestAnimationFrame(performUpdate);
    };

    const handleMouseUp = (e?: React.MouseEvent) => {
        if (drawState?.isDrawing && e && manualDrawType) {
            const pos = getRelativeCoords(e); const { startPoint } = drawState;
            const width = Math.abs(pos.x - startPoint.x); const height = Math.abs(pos.y - startPoint.y);
            if (width > MIN_AREA_SIZE && height > MIN_AREA_SIZE) {
                const newArea: Area = { id: Date.now(), name: `領域${areas.length + 1}`, type: manualDrawType, x: Math.min(pos.x, startPoint.x), y: Math.min(pos.y, startPoint.y), width, height, pageIndex: activePageIndex };
                commitAreas([...areas, newArea]); setSelectedAreaIds(new Set([newArea.id]));
            }
        } else if(drawState?.isMoving || drawState?.isResizing) commitAreas(areas);
        setDrawState(null); setPanState(null);
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey || e.deltaX !== 0) {
            e.preventDefault();
            const delta = -e.deltaY * 0.01;
            setZoom(prev => Math.min(5, Math.max(0.1, prev + delta)));
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName.match(/INPUT|TEXTAREA/)) return;
            if (e.code === 'Space') { e.preventDefault(); setIsSpacePressed(true); }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
            if (e.key === 'Escape') { setSelectedAreaIds(new Set()); setManualDrawType(null); }
            if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedAreaIds.size > 0) { commitAreas(areas.filter(a => !selectedAreaIds.has(a.id))); setSelectedAreaIds(new Set()); } }
        };
        const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpacePressed(false); };
        window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
        return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
    }, [selectedAreaIds, areas, commitAreas, undo]);

    return (
        <div className="w-full h-full flex gap-4 overflow-hidden">
            <TemplateSidebar areas={areas} setAreas={commitAreas} selectedAreaIds={selectedAreaIds} setSelectedAreaIds={setSelectedAreaIds} apiKey={apiKey} template={template} onTemplateChange={handleTemplateChange} detSettings={detSettings} setDetSettings={setDetSettings} undo={undo} redo={redo} canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1} />
            <main className="flex-1 flex flex-col gap-4 overflow-hidden">
                <TemplateToolbar isAutoDetectMode={isAutoDetectMode} setIsAutoDetectMode={setIsAutoDetectMode} wandTargetType={wandTargetType} setWandTargetType={setWandTargetType} manualDrawType={manualDrawType} setManualDrawType={setManualDrawType} zoom={zoom} onZoomChange={setZoom} undo={undo} redo={redo} canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1} showMarkPoints={showMarkPoints} onToggleMarkPoints={setShowMarkPoints} />
                <div ref={containerRef} className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-900/50 p-4 rounded-lg" onWheel={handleWheel}>
                    <div className="relative" style={{ width: activePage.width * zoom, height: activePage.height * zoom, margin: 'auto' }}>
                        <div className="absolute top-0 left-0" style={{ width: activePage.width, height: activePage.height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                            <img ref={imageRef} src={activePage.imagePath} alt="Template" className="block pointer-events-none select-none" style={{ width: activePage.width, height: activePage.height }}/>
                            <canvas ref={canvasRef} className="absolute top-0 left-0" style={{ cursor: canvasCursor }} onMouseDown={handleMouseDown} onMouseMove={handleInteractionMove} onMouseUp={handleMouseUp} onMouseLeave={() => drawState && handleMouseUp()} />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};
