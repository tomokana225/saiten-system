
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
    const { template, areas: initialAreas, aiSettings } = activeProject!;

    // Ensure we have a valid page structure even for legacy templates
    const pages = template.pages || (template.filePath ? [{ imagePath: template.filePath, width: template.width, height: template.height }] : []);
    const [activePageIndex, setActivePageIndex] = useState(0);
    const activePage = pages[activePageIndex];

    const [areas, setAreas] = useState<Area[]>(() => migrateAreas(initialAreas));
    const [selectedAreaIds, setSelectedAreaIds] = useState<Set<number>>(new Set());
    const [zoom, setZoom] = useState(1);
    const [activeTool, setActiveTool] = useState<AreaType | 'select' | 'pan' | 'magic-wand'>('select');
    const [drawState, setDrawState] = useState<DrawState | null>(null);
    const [clipboard, setClipboard] = useState<Area[]>([]);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    
    // Panning state
    const [panState, setPanState] = useState<{ isPanning: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const interactionThrottle = useRef<number | null>(null);
    const targetScrollRef = useRef<{left: number, top: number} | null>(null);
    const zoomRef = useRef(zoom);

    useEffect(() => {
        setAreas(migrateAreas(initialAreas));
    }, [initialAreas]);
    
    useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);
    
    // Filter areas for drawing on the current page
    const currentPageAreas = areas.filter(a => (a.pageIndex === undefined ? 0 : a.pageIndex) === activePageIndex);

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
            if (!ctx || !canvas || !activePage) return;

            canvas.width = activePage.width;
            canvas.height = activePage.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            currentPageAreas.forEach(area => {
                const color = areaTypeColors[area.type]?.hex || '#000000';
                ctx.strokeStyle = color;
                // Thicker lines: 3px for normal, 6px for selected
                ctx.lineWidth = selectedAreaIds.has(area.id) ? 6 : 3;
                ctx.strokeRect(area.x, area.y, area.width, area.height);

                // Draw label (Question Number / Classification) inside
                ctx.save();
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.25; // Faint text
                
                // Determine appropriate font size relative to box size
                const fontSize = Math.max(14, Math.min(area.height * 0.5, 120));
                
                if (area.width > 20 && area.height > 20) {
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(area.name, area.x + area.width / 2, area.y + area.height / 2);
                }
                ctx.restore();

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
    }, [currentPageAreas, selectedAreaIds, activePage]);
    
     useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

            if (e.code === 'Space') {
                e.preventDefault(); // Prevent scrolling down
                setIsSpacePressed(true);
            }

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
                    // Check if any pasted items are questions (Marksheet or Answer)
                    const hasQuestion = clipboard.some(a => a.type === AreaTypeEnum.MARK_SHEET || a.type === AreaTypeEnum.ANSWER);
                    
                    if (hasQuestion) {
                         const questionAreas = areas.filter(a => a.type === AreaTypeEnum.MARK_SHEET || a.type === AreaTypeEnum.ANSWER);
                         const existingNumbers = questionAreas.map(a => {
                             if (a.questionNumber !== undefined && isFinite(a.questionNumber)) return a.questionNumber;
                             // Fallback: try to parse "問X"
                             const match = a.name.match(/問(\d+)/);
                             return match ? parseInt(match[1], 10) : 0;
                         });
                         maxQuestionNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
                    }

                    let questionCounter = 0;
                    const pastedAreas: Area[] = clipboard.map((area, index) => {
                         const newArea = {
                            ...area,
                            id: Date.now() + index,
                            name: `${area.name} (コピー)`,
                            x: area.x + 10,
                            y: area.y + 10,
                            pageIndex: activePageIndex // Paste onto current page
                        };
                        if (area.type === AreaTypeEnum.MARK_SHEET || area.type === AreaTypeEnum.ANSWER) {
                            questionCounter++;
                            newArea.questionNumber = maxQuestionNumber + questionCounter;
                            newArea.name = `問${newArea.questionNumber}`;
                        }
                        return newArea;
                    });
                    const newAreaIds = new Set(pastedAreas.map(a => a.id));
                    handleAreasChange([...areas, ...pastedAreas]);
                    setSelectedAreaIds(newAreaIds);
                }
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') setIsSpacePressed(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [selectedAreaIds, areas, handleAreasChange, clipboard, activePageIndex]);

    // Use native event listener for 'wheel' to properly prevent default browser zooming
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault(); // Crucial: Stop the browser from zooming the entire page
                e.stopPropagation();

                const currentZoom = zoomRef.current;
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const pointX = (container.scrollLeft + mouseX) / currentZoom;
                const pointY = (container.scrollTop + mouseY) / currentZoom;
                
                const newZoom = Math.max(0.2, Math.min(5, currentZoom - e.deltaY * 0.005));
                
                targetScrollRef.current = { left: pointX * newZoom - mouseX, top: pointY * newZoom - mouseY };
                setZoom(newZoom);
            }
        };

        // Add listener with passive: false to allow preventDefault()
        container.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            container.removeEventListener('wheel', onWheel);
        };
    }, []);

    useLayoutEffect(() => {
        if (targetScrollRef.current && containerRef.current) {
            const { left, top } = targetScrollRef.current;
            containerRef.current.scrollLeft = left;
            containerRef.current.scrollTop = top;
            targetScrollRef.current = null;
        }
    }, [zoom]);

    // Global mouse move for panning (because mouse might leave the container)
    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (panState && panState.isPanning && containerRef.current) {
                e.preventDefault();
                const dx = e.clientX - panState.startX;
                const dy = e.clientY - panState.startY;
                containerRef.current.scrollLeft = panState.scrollLeft - dx;
                containerRef.current.scrollTop = panState.scrollTop - dy;
            }
        };

        const handleGlobalMouseUp = () => {
            if (panState && panState.isPanning) {
                setPanState(null);
            }
        };

        if (panState && panState.isPanning) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [panState]);


    const getRelativeCoords = (e: React.MouseEvent): { x: number, y: number } => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    };

    // Auto-detection logic (Magic Wand)
    const detectBoxFromPoint = (startX: number, startY: number): { x: number, y: number, w: number, h: number } | null => {
        if (!imageRef.current) return null;
        
        // We need to use the original image data for detection, not what's drawn on canvas which is just overlays
        const img = imageRef.current;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth;
        tempCanvas.height = img.naturalHeight;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return null;
        
        ctx.drawImage(img, 0, 0);
        
        // Ensure coordinates are integers and within bounds
        const x = Math.floor(startX);
        const y = Math.floor(startY);
        if (x < 0 || x >= img.naturalWidth || y < 0 || y >= img.naturalHeight) return null;

        const imageData = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        // BFS to find the white area
        const visited = new Uint8Array(width * height); // 0 = unvisited, 1 = visited
        const queue = [x, y];
        visited[y * width + x] = 1;

        let minX = x, maxX = x, minY = y, maxY = y;
        let pixelCount = 0;
        const MAX_PIXELS = width * height * 0.5; // Safety limit: 50% of image area

        // Threshold for "dark" pixel (border). 
        // We assume the inside is light and borders are dark.
        const THRESHOLD = 160; 

        // Helper to check brightness
        const isLight = (px: number, py: number) => {
            const idx = (py * width + px) * 4;
            // Grayscale
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            return gray > THRESHOLD;
        };

        // If clicked on a dark pixel (border), detection fails or tries to find nearby light pixel
        if (!isLight(x, y)) {
            // Simple retry: check small radius for white pixel? For now, just return null.
            return null;
        }

        while (queue.length > 0) {
            const cy = queue.pop()!; // Stack or queue doesn't matter much for fill, stack is DFS
            const cx = queue.pop()!;

            pixelCount++;
            if (pixelCount > MAX_PIXELS) return null; // Abort if filling too much

            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            // Neighbors (4-way)
            const neighbors = [
                cx + 1, cy,
                cx - 1, cy,
                cx, cy + 1,
                cx, cy - 1
            ];

            for (let i = 0; i < neighbors.length; i += 2) {
                const nx = neighbors[i];
                const ny = neighbors[i+1];

                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const idx = ny * width + nx;
                    if (visited[idx] === 0) {
                        visited[idx] = 1;
                        if (isLight(nx, ny)) {
                            queue.push(nx, ny);
                        }
                        // If dark, it's a border, we stop expansion in this direction but don't add to queue
                    }
                }
            }
        }

        // Final bounds
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;

        if (w < MIN_AREA_SIZE || h < MIN_AREA_SIZE) return null;

        return { x: minX, y: minY, w, h };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // Allow panning with Pan Tool, Spacebar + Click, or Middle Click (button 1)
        const isMiddleClick = e.button === 1;
        const isSpacePan = e.button === 0 && isSpacePressed;
        
        if (activeTool === 'pan' || isMiddleClick || isSpacePan) {
            e.preventDefault();
            if (containerRef.current) {
                setPanState({
                    isPanning: true,
                    startX: e.clientX,
                    startY: e.clientY,
                    scrollLeft: containerRef.current.scrollLeft,
                    scrollTop: containerRef.current.scrollTop
                });
            }
            return;
        }

        const pos = getRelativeCoords(e);

        if (activeTool === 'magic-wand') {
            const detected = detectBoxFromPoint(pos.x, pos.y);
            if (detected) {
                // Determine new question number if applicable
                const questionAreas = areas.filter(a => a.type === AreaTypeEnum.MARK_SHEET || a.type === AreaTypeEnum.ANSWER);
                const existingNumbers = questionAreas.map(a => {
                    if (a.questionNumber !== undefined && isFinite(a.questionNumber)) return a.questionNumber;
                    const match = a.name.match(/問(\d+)/);
                    return match ? parseInt(match[1], 10) : 0;
                });
                const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
                const questionNumber = maxNumber + 1;
                const newName = `問${questionNumber}`;

                const newArea: Area = {
                    id: Date.now(),
                    name: newName,
                    type: AreaTypeEnum.ANSWER, // Default to Answer
                    x: detected.x,
                    y: detected.y,
                    width: detected.w,
                    height: detected.h,
                    questionNumber,
                    pageIndex: activePageIndex
                };
                handleAreasChange([...areas, newArea]);
                setSelectedAreaIds(new Set([newArea.id])); // Select it immediately so user can change type
            }
            return;
        }

        const clickedArea = currentPageAreas.slice().reverse().find(a => pos.x >= a.x && pos.x <= a.x + a.width && pos.y >= a.y && pos.y <= a.y + a.height);
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
        } else if (activeTool !== 'select') {
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
                if (ctx && canvas && activePage) {
                    ctx.clearRect(0,0,canvas.width, canvas.height);
                    currentPageAreas.forEach(area => {
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

                const isQuestionArea = activeTool === AreaTypeEnum.MARK_SHEET || activeTool === AreaTypeEnum.ANSWER;

                if (isQuestionArea) {
                    // Unified numbering for both MarkSheet and Answer types
                    const questionAreas = areas.filter(a => a.type === AreaTypeEnum.MARK_SHEET || a.type === AreaTypeEnum.ANSWER);
                    const existingNumbers = questionAreas.map(a => {
                        if (a.questionNumber !== undefined && isFinite(a.questionNumber)) return a.questionNumber;
                        // Fallback: parse "問X"
                        const match = a.name.match(/問(\d+)/);
                        return match ? parseInt(match[1], 10) : 0;
                    });
                    const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
                    questionNumber = maxNumber + 1;
                    newName = `問${questionNumber}`;
                } else {
                    const typeNameMap: Record<string, string> = {
                        [AreaTypeEnum.NAME]: '氏名',
                        [AreaTypeEnum.SUBTOTAL]: '小計',
                        [AreaTypeEnum.TOTAL]: '合計',
                        [AreaTypeEnum.QUESTION_NUMBER]: '問題番号',
                        [AreaTypeEnum.ALIGNMENT_MARK]: '基準マーク',
                        [AreaTypeEnum.STUDENT_ID_MARK]: '学籍番号'
                    };
                    const prefix = typeNameMap[activeTool as string] || activeTool;
                    const count = areas.filter(a => a.type === activeTool).length;
                    newName = `${prefix}${count + 1}`;
                }

                const newArea: Area = {
                    id: Date.now(), name: newName, type: activeTool as AreaType,
                    x: Math.min(pos.x, startPoint.x), y: Math.min(pos.y, startPoint.y),
                    width, height, questionNumber,
                    pageIndex: activePageIndex // Set page index
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
        if (activeTool === 'pan' || isSpacePressed) cursor = panState?.isPanning ? 'grabbing' : 'grab';
        else if (activeTool === 'magic-wand') cursor = 'crosshair'; // Visual indicator for wand
        else if (activeTool !== 'select') cursor = 'crosshair';
        
        if (activeTool === 'select' && !isSpacePressed) {
            const selectedAreas = currentPageAreas.filter(a => selectedAreaIds.has(a.id));
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
                const hoveredArea = currentPageAreas.slice().reverse().find(a => pos.x >= a.x && pos.x <= a.x + a.width && pos.y >= a.y && pos.y <= a.y + a.height);
                if (hoveredArea) cursor = 'move';
            }
        }
        canvas.style.cursor = cursor;
    }, [activeTool, currentPageAreas, selectedAreaIds, drawState, getResizeHandle, panState, isSpacePressed]);

    if (!activePage) return <div className="p-4">No template loaded</div>;

    return (
        <div className="w-full h-full flex gap-4">
            <TemplateSidebar 
                areas={areas} setAreas={handleAreasChange} 
                selectedAreaIds={selectedAreaIds} setSelectedAreaIds={setSelectedAreaIds} 
                apiKey={apiKey} 
                template={template} 
                onTemplateChange={handleTemplateChange}
            />
            <main className="flex-1 flex flex-col gap-4 overflow-hidden">
                <TemplateToolbar 
                    activeTool={activeTool} 
                    setActiveTool={setActiveTool}
                    zoom={zoom} onZoomChange={setZoom} 
                />
                
                {/* Page Navigation Tabs */}
                {pages.length > 1 && (
                    <div className="flex bg-slate-200 dark:bg-slate-700 rounded-t-lg overflow-hidden">
                        {pages.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setActivePageIndex(idx)}
                                className={`px-4 py-2 text-sm font-medium ${activePageIndex === idx ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 border-t-2 border-sky-500' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                            >
                                {idx + 1}ページ目
                            </button>
                        ))}
                    </div>
                )}

                <div 
                    ref={containerRef}
                    className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-900/50 p-4 rounded-b-lg rounded-tr-lg cursor-default"
                >
                    <div
                        className="relative"
                        style={{ width: activePage.width * zoom, height: activePage.height * zoom, margin: 'auto' }}
                    >
                        <div
                            className="absolute top-0 left-0"
                            style={{ width: activePage.width, height: activePage.height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                        >
                            <img ref={imageRef} src={activePage.imagePath} alt={`Page ${activePageIndex + 1}`} style={{ display: 'block', width: activePage.width, height: activePage.height }}/>
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
