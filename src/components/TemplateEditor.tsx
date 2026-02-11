
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

export interface DetectionSettings {
    minSize: number;
    threshold: number;
    padding: number;
}

const RESIZE_HANDLE_SIZE = 10;
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
    const { template, areas: initialAreas } = activeProject!;

    const [history, setHistory] = useState<Area[][]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const isHistoryAction = useRef(false);

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
    const [clipboard, setClipboard] = useState<Area[]>([]);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    
    const [panState, setPanState] = useState<{ isPanning: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

    const [detSettings, setDetSettings] = useState<DetectionSettings>({
        minSize: 15,
        threshold: 160,
        padding: 0
    });

    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const interactionThrottle = useRef<number | null>(null);
    const targetScrollRef = useRef<{left: number, top: number} | null>(null);
    const zoomRef = useRef(zoom);

    // Dynamic cursor state
    const [canvasCursor, setCanvasCursor] = useState<'default' | 'crosshair' | 'nwse-resize' | 'nesw-resize' | 'ns-resize' | 'ew-resize' | 'move' | 'pointer'>('default');

    useEffect(() => {
        const migrated = migrateAreas(initialAreas);
        setAreas(migrated);
        setHistory([migrated]);
        setHistoryIndex(0);
    }, [activeProject?.id]);

    useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);

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
            isHistoryAction.current = true;
            setHistoryIndex(prev => prev - 1);
            setAreas(prevState);
            handleAreasChange(prevState);
        }
    }, [history, historyIndex, handleAreasChange]);

    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const nextState = history[historyIndex + 1];
            isHistoryAction.current = true;
            setHistoryIndex(prev => prev - 1);
            setAreas(nextState);
            handleAreasChange(nextState);
        }
    }, [history, historyIndex, handleAreasChange]);
    
    const currentPageAreas = areas.filter(a => (a.pageIndex === undefined ? 0 : a.pageIndex) === activePageIndex);

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

                if (isSelected) {
                    ctx.fillStyle = '#0ea5e9';
                    const handleSize = RESIZE_HANDLE_SIZE / zoom;
                    const rectHandles = [
                        { x: area.x, y: area.y }, { x: area.x + area.width, y: area.y },
                        { x: area.x, y: area.y + area.height }, { x: area.x + area.width, y: area.y + area.height },
                        { x: area.x + area.width / 2, y: area.y }, { x: area.x + area.width / 2, y: area.y + area.height },
                        { x: area.x, y: area.y + area.height / 2 }, { x: area.x + area.width, y: area.y + area.height / 2 },
                    ];
                    rectHandles.forEach(h => ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize));
                }
            });
        };
        draw();
    }, [currentPageAreas, selectedAreaIds, activePage, zoom]);
    
     useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
            if (e.code === 'Space') { e.preventDefault(); setIsSpacePressed(true); }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault(); if (e.shiftKey) redo(); else undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
            if (e.key === 'Escape') { setSelectedAreaIds(new Set()); setManualDrawType(null); }
            else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedAreaIds.size > 0) { commitAreas(areas.filter(a => !selectedAreaIds.has(a.id))); setSelectedAreaIds(new Set()); }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                e.preventDefault(); if (selectedAreaIds.size > 0) setClipboard(areas.filter(a => selectedAreaIds.has(a.id)));
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                if (clipboard.length > 0) {
                    let maxQuestionNumber = 0;
                    const hasQuestion = clipboard.some(a => a.type === AreaTypeEnum.MARK_SHEET || a.type === AreaTypeEnum.ANSWER);
                    if (hasQuestion) {
                         const existingNumbers = areas.filter(a => a.type === AreaTypeEnum.MARK_SHEET || a.type === AreaTypeEnum.ANSWER).map(a => {
                             if (a.questionNumber !== undefined) return a.questionNumber;
                             const match = a.name.match(/問(\d+)/); return match ? parseInt(match[1], 10) : 0;
                         });
                         maxQuestionNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
                    }
                    const pastedAreas: Area[] = clipboard.map((area, index) => {
                         const newArea = { ...area, id: Date.now() + index, name: `${area.name} (コピー)`, x: area.x + 10, y: area.y + 10, pageIndex: activePageIndex };
                        if (area.type === AreaTypeEnum.MARK_SHEET || area.type === AreaTypeEnum.ANSWER) { newArea.questionNumber = ++maxQuestionNumber; newArea.name = `問${newArea.questionNumber}`; }
                        return newArea;
                    });
                    commitAreas([...areas, ...pastedAreas]);
                    setSelectedAreaIds(new Set(pastedAreas.map(a => a.id)));
                }
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpacePressed(false); };
        window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
        return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
    }, [selectedAreaIds, areas, commitAreas, clipboard, activePageIndex, undo, redo]);

    useEffect(() => {
        const container = containerRef.current; if (!container) return;
        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault(); e.stopPropagation();
                const currentZoom = zoomRef.current; const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
                const pointX = (container.scrollLeft + mouseX) / currentZoom;
                const pointY = (container.scrollTop + mouseY) / currentZoom;
                const newZoom = Math.max(0.2, Math.min(5, currentZoom - e.deltaY * 0.005));
                targetScrollRef.current = { left: pointX * newZoom - mouseX, top: pointY * newZoom - mouseY };
                setZoom(newZoom);
            }
        };
        container.addEventListener('wheel', onWheel, { passive: false });
        return () => container.removeEventListener('wheel', onWheel);
    }, []);

    useLayoutEffect(() => {
        if (targetScrollRef.current && containerRef.current) {
            const { left, top } = targetScrollRef.current;
            containerRef.current.scrollLeft = left; containerRef.current.scrollTop = top;
            targetScrollRef.current = null;
        }
    }, [zoom]);

    const getRelativeCoords = (e: React.MouseEvent | MouseEvent): { x: number, y: number } => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    };

    const detectBoxFromPoint = (startX: number, startY: number): { x: number, y: number, w: number, h: number } | null => {
        if (!imageRef.current) return null;
        const img = imageRef.current; const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth; tempCanvas.height = img.naturalHeight;
        const ctx = tempCanvas.getContext('2d'); if (!ctx) return null;
        ctx.drawImage(img, 0, 0); const x = Math.floor(startX); const y = Math.floor(startY);
        if (x < 0 || x >= img.naturalWidth || y < 0 || y >= img.naturalHeight) return null;
        const imageData = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
        const data = imageData.data; const width = imageData.width; const height = imageData.height;
        const visited = new Uint8Array(width * height); const queue = [x, y]; visited[y * width + x] = 1;
        let minX = x, maxX = x, minY = y, maxY = y; let pixelCount = 0; const MAX_PIXELS = width * height * 0.5;
        const THRESHOLD = detSettings.threshold; 
        const isLight = (px: number, py: number) => {
            const idx = (py * width + px) * 4;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            return gray > THRESHOLD;
        };
        if (!isLight(x, y)) return null;
        while (queue.length > 0) {
            const cy = queue.pop()!; const cx = queue.pop()!; pixelCount++; if (pixelCount > MAX_PIXELS) return null;
            if (cx < minX) minX = cx; if (cx > maxX) maxX = cx; if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
            const neighbors = [cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1];
            for (let i = 0; i < neighbors.length; i += 2) {
                const nx = neighbors[i]; const ny = neighbors[i+1];
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const idx = ny * width + nx; if (visited[idx] === 0) { visited[idx] = 1; if (isLight(nx, ny)) queue.push(nx, ny); }
                }
            }
        }
        const padding = detSettings.padding; const minS = detSettings.minSize;
        const w = (maxX - minX + 1) + (padding * 2); const h = (maxY - minY + 1) + (padding * 2);
        if (w < minS || h < minS) return null; return { x: minX - padding, y: minY - padding, w, h };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const isMiddleClick = e.button === 1; const isSpacePan = e.button === 0 && isSpacePressed;
        if (isMiddleClick || isSpacePan) {
            if (containerRef.current) setPanState({ isPanning: true, startX: e.clientX, startY: e.clientY, scrollLeft: containerRef.current.scrollLeft, scrollTop: containerRef.current.scrollTop });
            return;
        }

        const pos = getRelativeCoords(e);
        const isDoubleClick = e.detail >= 2;

        if (isAutoDetectMode && !isDoubleClick) {
            const detected = detectBoxFromPoint(pos.x, pos.y);
            if (detected) {
                let newName: string; let questionNumber: number | undefined;
                if (wandTargetType === AreaTypeEnum.MARK_SHEET || wandTargetType === AreaTypeEnum.ANSWER) {
                    const existingNumbers = areas.filter(a => a.type === AreaTypeEnum.MARK_SHEET || a.type === AreaTypeEnum.ANSWER).map(a => {
                        if (a.questionNumber !== undefined) return a.questionNumber;
                        const match = a.name.match(/問(\d+)/); return match ? parseInt(match[1], 10) : 0;
                    });
                    questionNumber = (existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0) + 1; newName = `問${questionNumber}`;
                } else {
                    const prefix = wandTargetType; const count = areas.filter(a => a.type === wandTargetType).length; newName = `${prefix}${count + 1}`;
                }
                const newArea: Area = { id: Date.now(), name: newName, type: wandTargetType, x: detected.x, y: detected.y, width: detected.w, height: detected.h, questionNumber, pageIndex: activePageIndex };
                commitAreas([...areas, newArea]); setSelectedAreaIds(new Set([newArea.id]));
            }
            return;
        }

        const clickedArea = currentPageAreas.slice().reverse().find(a => pos.x >= a.x && pos.x <= a.x + a.width && pos.y >= a.y && pos.y <= a.y + a.height);
        
        if (clickedArea) {
            const handle = selectedAreaIds.has(clickedArea.id) ? getResizeHandle(clickedArea, pos.x, pos.y) : null;
            
            if (isDoubleClick) {
                // Unified: Double click starts moving (maintaining size)
                const moveStartPositions = new Map<number, { x: number; y: number }>();
                const targetIds = selectedAreaIds.has(clickedArea.id) ? selectedAreaIds : new Set([clickedArea.id]);
                setSelectedAreaIds(targetIds);
                targetIds.forEach(id => {
                    const area = areas.find(a => a.id === id);
                    if (area) moveStartPositions.set(id, { x: area.x, y: area.y });
                });
                setDrawState({ isResizing: false, isMoving: true, isDrawing: false, startPoint: pos, resizeHandle: null, moveStartArea: clickedArea, moveStartPositions });
            } else if (handle) {
                // Single click on handle: Resize
                setDrawState({ isResizing: true, isMoving: false, isDrawing: false, startPoint: pos, resizeHandle: handle.name, moveStartArea: clickedArea });
            } else {
                // Single click in area: Select (default resize mode if dragged)
                if (e.shiftKey) {
                    const newSet = new Set(selectedAreaIds); if (newSet.has(clickedArea.id)) newSet.delete(clickedArea.id); else newSet.add(clickedArea.id);
                    setSelectedAreaIds(newSet);
                } else {
                    setSelectedAreaIds(new Set([clickedArea.id]));
                }
                // Allow resizing by dragging area if not double-clicked
                setDrawState({ isResizing: true, isMoving: false, isDrawing: false, startPoint: pos, resizeHandle: 'bottom-right', moveStartArea: clickedArea });
            }
        } else {
            // Click on empty space: Draw if manual draw type selected
            if (manualDrawType) {
                setDrawState({ isDrawing: true, isResizing: false, isMoving: false, startPoint: pos, resizeHandle: null, moveStartArea: null });
                setCanvasCursor('crosshair');
            } else {
                setSelectedAreaIds(new Set());
            }
        }
    };
    
    const handleInteractionMove = (e: React.MouseEvent) => {
        const pos = getRelativeCoords(e);
        
        // Dynamic cursor updates when NOT dragging
        if (!drawState && !panState) {
            if (isSpacePressed) {
                setCanvasCursor('pointer');
            } else {
                const clickedArea = currentPageAreas.slice().reverse().find(a => pos.x >= a.x && pos.x <= a.x + a.width && pos.y >= a.y && pos.y <= a.y + a.height);
                if (clickedArea) {
                    const handle = selectedAreaIds.has(clickedArea.id) ? getResizeHandle(clickedArea, pos.x, pos.y) : null;
                    if (handle) {
                        setCanvasCursor(handle.cursor);
                    } else {
                        setCanvasCursor('pointer');
                    }
                } else if (manualDrawType) {
                    setCanvasCursor('crosshair');
                } else {
                    setCanvasCursor('default');
                }
            }
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
            } else if (drawState.isDrawing) {
                const { startPoint } = drawState;
                const x = Math.min(pos.x, startPoint.x); const y = Math.min(pos.y, startPoint.y);
                const width = Math.abs(pos.x - startPoint.x); const height = Math.abs(pos.y - startPoint.y);
                const ctx = canvasRef.current?.getContext('2d');
                if (ctx && activePage) {
                    ctx.clearRect(0,0,canvasRef.current!.width, canvasRef.current!.height);
                    currentPageAreas.forEach(area => {
                        ctx.strokeStyle = areaTypeColors[area.type]?.hex || '#000000';
                        ctx.lineWidth = selectedAreaIds.has(area.id) ? 4 : 2; ctx.strokeRect(area.x, area.y, area.width, area.height);
                    });
                    ctx.strokeStyle = areaTypeColors[manualDrawType!]?.hex || '#0ea5e9';
                    ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height);
                }
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
                let newName: string; let questionNumber: number | undefined;
                if (manualDrawType === AreaTypeEnum.MARK_SHEET || manualDrawType === AreaTypeEnum.ANSWER) {
                    const existingNumbers = areas.filter(a => a.type === AreaTypeEnum.MARK_SHEET || a.type === AreaTypeEnum.ANSWER).map(a => {
                        if (a.questionNumber !== undefined) return a.questionNumber;
                        const match = a.name.match(/問(\d+)/); return match ? parseInt(match[1], 10) : 0;
                    });
                    questionNumber = (existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0) + 1; newName = `問${questionNumber}`;
                } else {
                    const prefix = manualDrawType; const count = areas.filter(a => a.type === manualDrawType).length; newName = `${prefix}${count + 1}`;
                }
                const newArea: Area = { id: Date.now(), name: newName, type: manualDrawType, x: Math.min(pos.x, startPoint.x), y: Math.min(pos.y, startPoint.y), width, height, questionNumber, pageIndex: activePageIndex };
                commitAreas([...areas, newArea]); setSelectedAreaIds(new Set([newArea.id]));
            }
        } else if(drawState?.isMoving || drawState?.isResizing) {
            commitAreas(areas);
        }
        setDrawState(null); setPanState(null);
    };

    return (
        <div className="w-full h-full flex gap-4 overflow-hidden">
            <TemplateSidebar 
                areas={areas} setAreas={commitAreas} 
                selectedAreaIds={selectedAreaIds} setSelectedAreaIds={setSelectedAreaIds} 
                apiKey={apiKey} template={template} onTemplateChange={handleTemplateChange}
                detSettings={detSettings} setDetSettings={setDetSettings}
                undo={undo} redo={redo} canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1}
            />
            <main className="flex-1 flex flex-col gap-4 overflow-hidden">
                <TemplateToolbar 
                    isAutoDetectMode={isAutoDetectMode} setIsAutoDetectMode={setIsAutoDetectMode}
                    wandTargetType={wandTargetType} setWandTargetType={setWandTargetType}
                    manualDrawType={manualDrawType} setManualDrawType={setManualDrawType}
                    zoom={zoom} onZoomChange={setZoom} 
                    undo={undo} redo={redo} canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1}
                />
                
                {pages.length > 1 && (
                    <div className="flex bg-slate-200 dark:bg-slate-700 rounded-t-lg overflow-hidden shrink-0">
                        {pages.map((_, idx) => (
                            <button key={idx} onClick={() => setActivePageIndex(idx)} className={`px-4 py-2 text-xs font-bold transition-colors ${activePageIndex === idx ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 border-t-2 border-sky-500' : 'text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-600'}`}>
                                {idx + 1}ページ目
                            </button>
                        ))}
                    </div>
                )}

                <div ref={containerRef} className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-900/50 p-4 rounded-b-lg rounded-tr-lg">
                    <div className="relative" style={{ width: activePage.width * zoom, height: activePage.height * zoom, margin: 'auto' }}>
                        <div className="absolute top-0 left-0" style={{ width: activePage.width, height: activePage.height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                            <img ref={imageRef} src={activePage.imagePath} alt="Template" className="block pointer-events-none select-none" style={{ width: activePage.width, height: activePage.height }}/>
                            <canvas 
                                ref={canvasRef} 
                                className="absolute top-0 left-0"
                                style={{ cursor: canvasCursor }}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleInteractionMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={() => drawState && handleMouseUp()}
                            />
                        </div>
                    </div>
                </div>
                <div className="shrink-0 flex items-center justify-between px-2 py-1 bg-white dark:bg-slate-800 rounded-lg text-[10px] text-slate-500 border border-slate-200 dark:border-slate-700">
                    <div className="flex gap-4">
                        <span>描画: ドラッグして枠を作成</span>
                        <span>移動: 枠をダブルクリックしてドラッグ</span>
                        <span>リサイズ: 枠をドラッグ、またはハンドルのドラッグ</span>
                    </div>
                    <div>パン: Space + ドラッグ / マウス中ボタン</div>
                </div>
            </main>
        </div>
    );
};
