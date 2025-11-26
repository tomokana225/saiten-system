import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import type { Template, Area, AreaType } from '../types';
import { AreaType as AreaTypeEnum } from '../types';
import { TemplateSidebar, areaTypeColors } from './template_editor/TemplateSidebar';
import { TemplateToolbar } from './template_editor/TemplateToolbar';
import { useProject } from '../context/ProjectContext';

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

const RESIZE_HANDLE_SIZE = 8;
const MIN_AREA_SIZE = 10;

const migrateAreas = (areasToMigrate: Area[]): Area[] => {
    return areasToMigrate.map(area => {
        if (area.type === AreaTypeEnum.MARK_SHEET && area.questionNumber === undefined) {
            const match = area.name.match(/\d+/);
            return {
                ...area,
                questionNumber: match ? parseInt(match[0], 10) : undefined
            };
        }
        return area;
    });
};

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ apiKey }) => {
    const { activeProject, handleAreasChange, handleTemplateChange } = useProject();
    const { template, areas: initialAreas } = activeProject!;

    const [areas, setAreas] = useState<Area[]>(() => migrateAreas(initialAreas));
    const [selectedAreaIds, setSelectedAreaIds] = useState<Set<number>>(new Set());
    const [zoom, setZoom] = useState(1);
    const [activeTool, setActiveTool] = useState<AreaType | 'select' | 'pan'>('select');
    const [drawState, setDrawState] = useState<DrawState | null>(null);
    const [clipboard, setClipboard] = useState<Area[]>([]);

    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const interactionThrottle = useRef<number | null>(null);
    const targetScrollRef = useRef<{left: number, top: number} | null>(null);

    useEffect(() => {
        setAreas(migrateAreas(initialAreas));
    }, [initialAreas]);
    
    const getResizeHandle = useCallback((area: Area, x: number, y: number) => {
        const handleSize = RESIZE_HANDLE_SIZE / zoom;
        const handles = [
            { name: 'top-left', x: area.x, y: area.y, cursor: 'nwse-resize' },
            { name: 'top-right', x: area.x + area.width, y: area.y, cursor: 'nesw-resize' },
            { name: 'bottom-left', x: area.x, y: area.y + area.height, cursor: 'nesw-resize' },
            { name: 'bottom-right', x: area.x + area.width, y: area.y + area.height, cursor: 'nwse-resize' },
            { name: 'top', x: area.x + area.width / 2, y: area.y, cursor: 'ns-resize' },
            { name: 'bottom', x: area.x + area.width / 2, y: area.y + area.height, cursor: 'ns-resize' },
            { name: 'left', x: area.x, y: area.y + area.height / 2, cursor: 'ew-resize' },
            { name: 'right', x: area.x + area.width, y: area.y + area.height / 2, cursor: 'ew-resize' },
        ];

        for (const handle of handles) {
            if (Math.abs(x - handle.x) < handleSize && Math.abs(y - handle.y) < handleSize) {
                return handle;
            }
        }
        return null;
    }, [zoom]);

    useEffect(() => {
        const draw = () => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!ctx || !canvas) return;

            canvas.width = template.width;
            canvas.height = template.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            areas.forEach(area => {
                ctx.strokeStyle = areaTypeColors[area.type]?.hex || '#000000';
                ctx.lineWidth = selectedAreaIds.has(area.id) ? 4 : 2;
                ctx.strokeRect(area.x, area.y, area.width, area.height);

                if (selectedAreaIds.has(area.id)) {
                    ctx.fillStyle = '#0ea5e9';
                    const handleSize = RESIZE_HANDLE_SIZE;
                    const handles = [
                        { x: area.x, y: area.y }, { x: area.x + area.width, y: area.y },
                        { x: area.x, y: area.y + area.height }, { x: area.x + area.width, y: area.y + area.height },
                        { x: area.x + area.width / 2, y: area.y }, { x: area.x + area.width / 2, y: area.y + area.height },
                        { x: area.x, y: area.y + area.height / 2 }, { x: area.x + area.width, y: area.y + area.height / 2 },
                    ];
                    handles.forEach(h => ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize));
                }
            });
        };
        draw();
    }, [areas, selectedAreaIds, template.width, template.height]);
    
     useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

            if (e.key === 'Escape') {
                setActiveTool('select');
                setDrawState(null);
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedAreaIds.size > 0) {
                    const newAreas = areas.filter(a => !selectedAreaIds.has(a.id));
                    handleAreasChange(newAreas);
                    setSelectedAreaIds(new Set());
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                if (selectedAreaIds.size > 0) {
                    const copiedAreas = areas.filter(a => selectedAreaIds.has(a.id));
                    setClipboard(copiedAreas);
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                if (clipboard.length > 0) {
                    let maxQuestionNumber = 0;
                    if (clipboard.some(a => a.type === AreaTypeEnum.MARK_SHEET)) {
                         const markSheetAreas = areas.filter(a => a.type === AreaTypeEnum.MARK_SHEET);
                         const existingNumbers = markSheetAreas.map(a => a.questionNumber).filter((n): n is number => n !== undefined && isFinite(n));
                         maxQuestionNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
                    }
                    let markSheetCounter = 0;
                    const pastedAreas: Area[] = clipboard.map((area, index) => {
                         const newArea = {
                            ...area,
                            id: Date.now() + index,
                            name: `${area.name} (コピー)`,
                            x: area.x + 10,
                            y: area.y + 10,
                        };
                        if (area.type === AreaTypeEnum.MARK_SHEET) {
                            markSheetCounter++;
                            newArea.questionNumber = maxQuestionNumber + markSheetCounter;
                            newArea.name = `マークシート${newArea.questionNumber}`;
                        }
                        return newArea;
                    });
                    const newAreaIds = new Set(pastedAreas.map(a => a.id));
                    handleAreasChange([...areas, ...pastedAreas]);
                    setSelectedAreaIds(newAreaIds);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedAreaIds, areas, handleAreasChange, clipboard]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const pointX = (container.scrollLeft + mouseX) / zoom;
            const pointY = (container.scrollTop + mouseY) / zoom;
            const newZoom = Math.max(0.2, Math.min(5, zoom - e.deltaY * 0.005));
            targetScrollRef.current = { left: pointX * newZoom - mouseX, top: pointY * newZoom - mouseY };
            setZoom(newZoom);
        }
    }, [zoom]);

    useLayoutEffect(() => {
        if (targetScrollRef.current && containerRef.current) {
            const { left, top } = targetScrollRef.current;
            containerRef.current.scrollLeft = left;
            containerRef.current.scrollTop = top;
            targetScrollRef.current = null;
        }
    }, [zoom]);

    const getRelativeCoords = (e: React.MouseEvent): { x: number, y: number } => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const pos = getRelativeCoords(e);
        const clickedArea = areas.slice().reverse().find(a => pos.x >= a.x && pos.x <= a.x + a.width && pos.y >= a.y && pos.y <= a.y + a.height);
        if (activeTool === 'select' && clickedArea) {
            const resizeHandleData = selectedAreaIds.has(clickedArea.id) ? getResizeHandle(clickedArea, pos.x, pos.y) : null;
            if (resizeHandleData) {
                setSelectedAreaIds(new Set([clickedArea.id]));
                setDrawState({ isResizing: true, isMoving: false, isDrawing: false, startPoint: pos, resizeHandle: resizeHandleData.name, moveStartArea: clickedArea });
            } else {
                let nextSelectedAreaIds = selectedAreaIds;
                if (e.shiftKey) {
                    const newSet = new Set(selectedAreaIds);
                    if (newSet.has(clickedArea.id)) newSet.delete(clickedArea.id);
                    else newSet.add(clickedArea.id);
                    nextSelectedAreaIds = newSet;
                    setSelectedAreaIds(newSet);
                } else {
                    if (!selectedAreaIds.has(clickedArea.id)) {
                        nextSelectedAreaIds = new Set([clickedArea.id]);
                        setSelectedAreaIds(nextSelectedAreaIds);
                    }
                }
                const moveStartPositions = new Map<number, { x: number; y: number }>();
                nextSelectedAreaIds.forEach(id => {
                    const area = areas.find(a => a.id === id);
                    if (area) moveStartPositions.set(id, { x: area.x, y: area.y });
                });
                setDrawState({ isResizing: false, isMoving: true, isDrawing: false, startPoint: pos, resizeHandle: null, moveStartArea: clickedArea, moveStartPositions });
            }
        } else if (activeTool === 'select' && !clickedArea) {
            setSelectedAreaIds(new Set());
            setDrawState(null);
        } else if (activeTool !== 'select' && activeTool !== 'pan') {
            setDrawState({ isDrawing: true, isResizing: false, isMoving: false, startPoint: pos, resizeHandle: null, moveStartArea: null });
        }
    };
    
    const handleInteractionMove = (e: React.MouseEvent) => {
        if (!drawState) return;
        const performUpdate = () => {
            const pos = getRelativeCoords(e);
            if (drawState.isResizing && drawState.moveStartArea) {
                setAreas(currentAreas => currentAreas.map(area => {
                    if (area.id !== drawState.moveStartArea!.id) return area;
                    const newArea = { ...area };
                    const { resizeHandle } = drawState;
                    if (resizeHandle?.includes('right')) newArea.width = Math.max(MIN_AREA_SIZE, pos.x - newArea.x);
                    if (resizeHandle?.includes('bottom')) newArea.height = Math.max(MIN_AREA_SIZE, pos.y - newArea.y);
                    if (resizeHandle?.includes('left')) {
                        const newWidth = newArea.x + newArea.width - pos.x;
                        if (newWidth > MIN_AREA_SIZE) {
                            newArea.width = newWidth;
                            newArea.x = pos.x;
                        }
                    }
                    if (resizeHandle?.includes('top')) {
                        const newHeight = newArea.y + newArea.height - pos.y;
                        if (newHeight > MIN_AREA_SIZE) {
                            newArea.height = newHeight;
                            newArea.y = pos.y;
                        }
                    }
                    return newArea;
                }));
            } else if (drawState.isMoving && drawState.moveStartPositions) {
                const dx = pos.x - drawState.startPoint.x;
                const dy = pos.y - drawState.startPoint.y;
                setAreas(currentAreas => currentAreas.map(area => {
                    const startPos = drawState.moveStartPositions!.get(area.id);
                    if (startPos) return { ...area, x: startPos.x + dx, y: startPos.y + dy };
                    return area;
                }));
            } else if (drawState.isDrawing) {
                const { startPoint } = drawState;
                const x = Math.min(pos.x, startPoint.x);
                const y = Math.min(pos.y, startPoint.y);
                const width = Math.abs(pos.x - startPoint.x);
                const height = Math.abs(pos.y - startPoint.y);
                const canvas = canvasRef.current;
                const ctx = canvas?.getContext('2d');
                if (ctx && canvas) {
                    ctx.clearRect(0,0,canvas.width, canvas.height);
                    areas.forEach(area => {
                        ctx.strokeStyle = areaTypeColors[area.type]?.hex || '#000000';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(area.x, area.y, area.width, area.height);
                    });
                    ctx.strokeStyle = areaTypeColors[activeTool as AreaType]?.hex || '#007bff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, width, height);
                }
            }
        };
        if (interactionThrottle.current) cancelAnimationFrame(interactionThrottle.current);
        interactionThrottle.current = requestAnimationFrame(performUpdate);
    };

    const handleMouseUp = (e?: React.MouseEvent) => {
        if (drawState?.isDrawing && e) {
            const pos = getRelativeCoords(e);
            const { startPoint } = drawState;
            const width = Math.abs(pos.x - startPoint.x);
            const height = Math.abs(pos.y - startPoint.y);
            if (width > MIN_AREA_SIZE && height > MIN_AREA_SIZE) {
                let newName: string;
                let questionNumber: number | undefined;
                if (activeTool === AreaTypeEnum.MARK_SHEET) {
                    const markSheetAreas = areas.filter(a => a.type === AreaTypeEnum.MARK_SHEET);
                    const existingNumbers = markSheetAreas.map(a => a.questionNumber).filter((n): n is number => n !== undefined && isFinite(n));
                    const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
                    questionNumber = maxNumber + 1;
                    newName = `マークシート${questionNumber}`;
                } else {
                    newName = `${activeTool}${areas.filter(a => a.type === activeTool).length + 1}`;
                }
                const newArea: Area = {
                    id: Date.now(), name: newName, type: activeTool as AreaType,
                    x: Math.min(pos.x, startPoint.x), y: Math.min(pos.y, startPoint.y),
                    width, height, questionNumber,
                };
                handleAreasChange([...areas, newArea]);
            }
        } else if(drawState?.isMoving || drawState?.isResizing) {
            handleAreasChange(areas);
        }
        setDrawState(null);
    };

    const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
        if (drawState) return;
        const pos = getRelativeCoords(e);
        const canvas = canvasRef.current;
        if (!canvas) return;
        let cursor = 'default';
        if (activeTool === 'pan') cursor = 'grab';
        else if (activeTool !== 'select') cursor = 'crosshair';
        if (activeTool === 'select') {
            const selectedAreas = areas.filter(a => selectedAreaIds.has(a.id));
            let handleFound = false;
            for (const area of selectedAreas) {
                const handle = getResizeHandle(area, pos.x, pos.y);
                if (handle) {
                    cursor = handle.cursor;
                    handleFound = true;
                    break;
                }
            }
            if (!handleFound) {
                const hoveredArea = areas.slice().reverse().find(a => pos.x >= a.x && pos.x <= a.x + a.width && pos.y >= a.y && pos.y <= a.y + a.height);
                if (hoveredArea) cursor = 'move';
            }
        }
        canvas.style.cursor = cursor;
    }, [activeTool, areas, selectedAreaIds, drawState, getResizeHandle]);

    return (
        <div className="w-full h-full flex gap-4">
            <TemplateSidebar 
                areas={areas} setAreas={handleAreasChange} 
                selectedAreaIds={selectedAreaIds} setSelectedAreaIds={setSelectedAreaIds} 
                apiKey={apiKey} 
                template={template} 
                onTemplateChange={handleTemplateChange}
            />
            <main className="flex-1 flex flex-col gap-4">
                <TemplateToolbar 
                    activeTool={activeTool} 
                    setActiveTool={setActiveTool}
                    zoom={zoom} onZoomChange={setZoom} 
                />
                <div 
                    ref={containerRef}
                    onWheel={handleWheel}
                    className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-900/50 p-4 rounded-lg"
                >
                    <div
                        className="relative"
                        style={{ width: template.width * zoom, height: template.height * zoom, margin: 'auto' }}
                    >
                        <div
                            className="absolute top-0 left-0"
                            style={{ width: template.width, height: template.height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                        >
                            <img ref={imageRef} src={template.filePath} alt="Test Template" style={{ display: 'block', width: template.width, height: template.height }}/>
                            <canvas 
                                ref={canvasRef} 
                                className="absolute top-0 left-0"
                                onMouseDown={handleMouseDown}
                                onMouseMove={(e) => { handleCanvasMouseMove(e); handleInteractionMove(e); }}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={() => drawState && handleMouseUp()}
                            />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};
