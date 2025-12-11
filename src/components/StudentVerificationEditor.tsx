import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Student, StudentInfo, Area, Template } from '../types';
import { AreaType } from '../types';
import { fileToArrayBuffer } from '../utils';
import { AnswerSnippet } from './AnswerSnippet';
import { Trash2Icon, PlusIcon, GripVerticalIcon, XIcon, UploadCloudIcon, ArrowDownFromLineIcon, ArrowRightIcon, SparklesIcon, SpinnerIcon, EyeIcon, AlertCircleIcon, InfoIcon, SettingsIcon } from './icons';
import { useProject } from '../context/ProjectContext';

// Type to store debug information about the grid detection
interface DetectionDebugInfo {
    points: { x: number; y: number; filled: boolean; ratio: number }[]; // Added ratio
    rows: number[]; // Y coordinates of centers
    cols: number[]; // X coordinates of centers
    rowBoundaries: number[]; // Y coordinates of lines
    colBoundaries: number[]; // X coordinates of lines
    orientation: 'vertical' | 'horizontal';
    scanZones?: { x: number, y: number, w: number, h: number, label: string }[];
    rois?: { x: number, y: number, w: number, h: number }[]; // Added ROIs for visualization
}

// ... (Detection helper functions kept as is) ...
// For brevity, assuming the analyzeStudentIdMark logic uses imagePath directly.
// We need to make sure we pass the correct image path (Front page usually) to it.

// Helper to find peaks in a projection profile
const findPeaksInProfile = (profile: number[], length: number, thresholdRatio: number = 0.35): number[] => {
    const peaks: number[] = [];
    let inPeak = false;
    let peakSum = 0;
    let peakMass = 0;
    
    const maxVal = Math.max(...profile);
    const threshold = Math.max(5, maxVal * thresholdRatio);

    for (let i = 0; i < length; i++) {
        const val = profile[i];
        if (val > threshold) {
            if (!inPeak) {
                inPeak = true;
                peakSum = 0;
                peakMass = 0;
            }
            peakSum += i * val;
            peakMass += val;
        } else {
            if (inPeak) {
                inPeak = false;
                if (peakMass > 0) peaks.push(peakSum / peakMass);
            }
        }
    }
    if (inPeak && peakMass > 0) {
        peaks.push(peakSum / peakMass);
    }
    return peaks;
};

const analyzeStudentIdMark = async (imagePath: string, mainArea: Area, markThreshold: number, refRightArea?: Area, refBottomArea?: Area): Promise<{ indices: number[] | null, debugInfo: DetectionDebugInfo }> => {
    const debugInfo: DetectionDebugInfo = { points: [], rows: [], cols: [], rowBoundaries: [], colBoundaries: [], orientation: 'horizontal', scanZones: [], rois: [] };
    
    try {
        const result = await window.electronAPI.invoke('get-image-details', imagePath);
        if (!result.success || !result.details?.url) return { indices: null, debugInfo };
        
        const dataUrl = result.details.url;
        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
        
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { indices: null, debugInfo };
        
        ctx.drawImage(img, 0, 0);
        
        // --- Helper: Crop Logic ---
        const getCropData = (area: Area) => {
            let sx = Math.floor(area.x);
            let sy = Math.floor(area.y);
            let sw = Math.floor(area.width);
            let sh = Math.floor(area.height);

            if (sx < 0) { sw += sx; sx = 0; }
            if (sy < 0) { sh += sy; sy = 0; }
            if (sx + sw > canvas.width) sw = canvas.width - sx;
            if (sy + sh > canvas.height) sh = canvas.height - sy;
            
            if (sw <= 0 || sh <= 0) return null;
            return {
                imageData: ctx.getImageData(sx, sy, sw, sh),
                sx, sy, sw, sh
            };
        };

        const mainCrop = getCropData(mainArea);
        if (!mainCrop) return { indices: null, debugInfo };

        // Helper: Binarize check relative to a specific image data buffer
        const isDark = (imgData: ImageData, x: number, y: number, threshold = markThreshold) => {
            const idx = (y * imgData.width + x) * 4;
            if (idx < 0 || idx >= imgData.data.length) return false;
            const gray = 0.299 * imgData.data[idx] + 0.587 * imgData.data[idx + 1] + 0.114 * imgData.data[idx + 2];
            return gray < threshold;
        };

        // Helper: Projection on arbitrary image data
        const getProjection = (
            imgData: ImageData,
            scanXStart: number, scanXEnd: number, 
            scanYStart: number, scanYEnd: number, 
            direction: 'row' | 'col'
        ) => {
            const size = direction === 'row' ? imgData.height : imgData.width;
            const profile = new Array(size).fill(0);
            
            if (direction === 'row') {
                for (let y = 0; y < imgData.height; y++) {
                    let darkCount = 0;
                    for (let x = scanXStart; x < scanXEnd; x++) {
                        if (isDark(imgData, x, y, 160)) darkCount++; // Use fixed threshold for structure detection
                    }
                    profile[y] = darkCount;
                }
            } else {
                for (let x = 0; x < imgData.width; x++) {
                    let darkCount = 0;
                    for (let y = scanYStart; y < scanYEnd; y++) {
                        if (isDark(imgData, x, y, 160)) darkCount++; // Use fixed threshold for structure detection
                    }
                    profile[x] = darkCount;
                }
            }
            return profile;
        };

        // --- 1. Detect Rows (Y-Coordinates) ---
        let rowCenters: number[] = [];
        
        if (refRightArea) {
            const refCrop = getCropData(refRightArea);
            if (refCrop) {
                const profile = getProjection(refCrop.imageData, 0, refCrop.sw, 0, refCrop.sh, 'row');
                const localPeaks = findPeaksInProfile(profile, refCrop.sh, 0.30);
                rowCenters = localPeaks.map(y => (refCrop.sy + y) - mainCrop.sy);
                debugInfo.scanZones?.push({ x: refCrop.sx - mainCrop.sx, y: refCrop.sy - mainCrop.sy, w: refCrop.sw, h: refCrop.sh, label: 'User Ref Right' });
            }
        } else {
            const scanXStart = Math.floor(mainCrop.sw * 0.85);
            const profile = getProjection(mainCrop.imageData, scanXStart, mainCrop.sw, 0, mainCrop.sh, 'row');
            rowCenters = findPeaksInProfile(profile, mainCrop.sh, 0.35);
            debugInfo.scanZones?.push({ x: scanXStart, y: 0, w: mainCrop.sw - scanXStart, h: mainCrop.sh, label: 'Auto Ref Right' });
        }

        // --- 2. Detect Columns (X-Coordinates) ---
        let colCenters: number[] = [];

        if (refBottomArea) {
            const refCrop = getCropData(refBottomArea);
            if (refCrop) {
                const profile = getProjection(refCrop.imageData, 0, refCrop.sw, 0, refCrop.sh, 'col');
                const localPeaks = findPeaksInProfile(profile, refCrop.sw, 0.30);
                colCenters = localPeaks.map(x => (refCrop.sx + x) - mainCrop.sx);
                debugInfo.scanZones?.push({ x: refCrop.sx - mainCrop.sx, y: refCrop.sy - mainCrop.sy, w: refCrop.sw, h: refCrop.sh, label: 'User Ref Bottom' });
            }
        } else {
            const scanYStart = Math.floor(mainCrop.sh * 0.85);
            const profile = getProjection(mainCrop.imageData, 0, mainCrop.sw, scanYStart, mainCrop.sh, 'col');
            colCenters = findPeaksInProfile(profile, mainCrop.sw, 0.35);
            debugInfo.scanZones?.push({ x: 0, y: scanYStart, w: mainCrop.sw, h: mainCrop.sh - scanYStart, label: 'Auto Ref Bottom' });
        }

        // --- Fallback / Adjustment if nothing found ---
        if (rowCenters.length < 1) {
             const step = mainCrop.sh / 3; // Default to 3 rows
             rowCenters = [step * 0.5, step * 1.5, step * 2.5];
        }
        if (colCenters.length < 1) {
             const step = mainCrop.sw / 10; // Default to 10 cols
             for(let i=0; i<10; i++) colCenters.push(step * i + step/2);
        }

        // Calculate Grid Boundaries for Visualization
        const rowBoundaries: number[] = [];
        const colBoundaries: number[] = [];
        
        if (rowCenters.length > 0) {
            const firstStep = rowCenters.length > 1 ? (rowCenters[1] - rowCenters[0]) : (mainCrop.sh / rowCenters.length);
            rowBoundaries.push(Math.max(0, rowCenters[0] - firstStep/2));
            for(let i=0; i < rowCenters.length - 1; i++) {
                rowBoundaries.push((rowCenters[i] + rowCenters[i+1]) / 2);
            }
            const lastStep = rowCenters.length > 1 ? (rowCenters[rowCenters.length-1] - rowCenters[rowCenters.length-2]) : firstStep;
            rowBoundaries.push(Math.min(mainCrop.sh, rowCenters[rowCenters.length-1] + lastStep/2));
        }

        if (colCenters.length > 0) {
            const firstStep = colCenters.length > 1 ? (colCenters[1] - colCenters[0]) : (mainCrop.sw / colCenters.length);
            colBoundaries.push(Math.max(0, colCenters[0] - firstStep/2));
            for(let i=0; i < colCenters.length - 1; i++) {
                colBoundaries.push((colCenters[i] + colCenters[i+1]) / 2);
            }
            const lastStep = colCenters.length > 1 ? (colCenters[colCenters.length-1] - colCenters[colCenters.length-2]) : firstStep;
            colBoundaries.push(Math.min(mainCrop.sw, colCenters[colCenters.length-1] + lastStep/2));
        }

        debugInfo.rows = rowCenters;
        debugInfo.cols = colCenters;
        debugInfo.rowBoundaries = rowBoundaries;
        debugInfo.colBoundaries = colBoundaries;
        debugInfo.orientation = 'horizontal'; 

        const indices: number[] = [];

        // Grid Analysis: Use ROI in center of cell
        for (let r = 0; r < rowCenters.length; r++) {
            const rowScores: {colIdx: number, darkness: number}[] = [];
            
            // Safe boundary access
            const cellTop = rowBoundaries[r];
            const cellBottom = rowBoundaries[r+1] || mainCrop.sh;
            const cellHeight = cellBottom - cellTop;

            for (let c = 0; c < colCenters.length; c++) {
                const cellLeft = colBoundaries[c];
                const cellRight = colBoundaries[c+1] || mainCrop.sw;
                const cellWidth = cellRight - cellLeft;

                // Define ROI: Center 40% of the cell
                const roiW = Math.max(2, cellWidth * 0.4);
                const roiH = Math.max(2, cellHeight * 0.4);
                const roiX = cellLeft + (cellWidth - roiW) / 2;
                const roiY = cellTop + (cellHeight - roiH) / 2;

                debugInfo.rois?.push({ x: roiX, y: roiY, w: roiW, h: roiH });

                const { filled, darkPixels, ratio } = checkFill(
                    roiX, roiY, roiW, roiH, 
                    mainCrop.imageData.data, mainCrop.sw, markThreshold
                );
                
                debugInfo.points.push({ x: roiX + roiW/2, y: roiY + roiH/2, filled, ratio });
                rowScores.push({ colIdx: c, darkness: darkPixels });
            }

            rowScores.sort((a, b) => b.darkness - a.darkness);
            const winner = rowScores[0];
            const runnerUp = rowScores[1];

            // Use the filled status from checkFill for the winner as a primary check
            // Recalculate filled status for winner specifically to be sure
            const cellLeft = colBoundaries[winner.colIdx];
            const cellRight = colBoundaries[winner.colIdx+1] || mainCrop.sw;
            const cellWidth = cellRight - cellLeft;
            const roiW = Math.max(2, cellWidth * 0.4);
            const roiH = Math.max(2, cellHeight * 0.4);
            const roiX = cellLeft + (cellWidth - roiW) / 2;
            const roiY = cellTop + (cellHeight - roiH) / 2;
            
            const { filled: isWinnerFilled } = checkFill(roiX, roiY, roiW, roiH, mainCrop.imageData.data, mainCrop.sw, markThreshold);

            // Logic: Winner must be filled AND significantly darker than runner up (if any)
            if (isWinnerFilled && (rowScores.length < 2 || winner.darkness > runnerUp.darkness * 1.1)) {
                indices.push(winner.colIdx);
            } else {
                indices.push(-1); 
            }
        }
        
        return { indices: indices.some(i => i !== -1) ? indices : null, debugInfo };
        
    } catch (e) {
        console.error("Student ID Analysis Error:", e);
        return { indices: null, debugInfo };
    }
};

// Updated checkFill with ROI rect
function checkFill(startX: number, startY: number, w: number, h: number, data: Uint8ClampedArray, imageWidth: number, threshold: number) {
    let darkPixels = 0;
    let totalPixels = 0;
    
    const endX = startX + w;
    const endY = startY + h;

    for (let y = Math.floor(startY); y < endY; y++) {
        for (let x = Math.floor(startX); x < endX; x++) {
            const idx = (y * imageWidth + x) * 4;
            if (idx < 0 || idx >= data.length) continue;
            // Grayscale
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            if (gray < threshold) darkPixels++;
            totalPixels++;
        }
    }
    const ratio = totalPixels > 0 ? darkPixels / totalPixels : 0;
    // 30% fill required within the small ROI (center of mark)
    const isFilled = ratio > 0.30; 
    return { filled: isFilled, darkPixels, ratio };
}

const GridOverlay = ({ debugInfo, width, height }: { debugInfo: DetectionDebugInfo, width: number, height: number }) => {
    if (!debugInfo) return null;

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 50 }}>
            {/* Draw Scan Zones (Debug) relative to main area */}
            {debugInfo.scanZones?.map((z, i) => (
                <rect key={`zone-${i}`} x={z.x} y={z.y} width={z.w} height={z.h} fill="rgba(0, 255, 255, 0.05)" stroke={z.label.includes('User') ? "lime" : "cyan"} strokeDasharray="4 2" />
            ))}

            {/* Draw ROIs */}
            {debugInfo.rois?.map((r, i) => (
                <rect key={`roi-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="rgba(255, 255, 0, 0.5)" strokeWidth="1" />
            ))}

            {/* Draw Grid Lines (Boundaries) */}
            {debugInfo.rowBoundaries.map((y, i) => (
                <line key={`row-line-${i}`} x1="0" y1={y} x2={width} y2={y} stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1" strokeDasharray="2 2" />
            ))}
            {debugInfo.colBoundaries.map((x, i) => (
                <line key={`col-line-${i}`} x1={x} y1="0" x2={x} y2={height} stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1" strokeDasharray="2 2" />
            ))}

            {/* Labels */}
            {debugInfo.rows.map((y, i) => (
                <text key={`row-lbl-${i}`} x={width - 15} y={y + 3} fill="cyan" fontSize={Math.min(10, height/15)} fontWeight="bold" style={{ textShadow: '1px 1px 1px black' }}>Row{i}</text>
            ))}
            {debugInfo.cols.map((x, i) => {
                let label = i.toString();
                if (debugInfo.cols.length === 10) {
                    label = ((i + 1) % 10).toString();
                }
                return <text key={`col-lbl-${i}`} x={x - 3} y={height - 5} fill="magenta" fontSize={Math.min(10, width/15)} fontWeight="bold" style={{ textShadow: '1px 1px 1px black' }}>{label}</text>;
            })}
            
            {/* Draw Detected/Filled Points */}
            {debugInfo.points.map((p, i) => (
                <g key={`pt-${i}`}>
                    <circle 
                        cx={p.x} 
                        cy={p.y} 
                        r={Math.max(2, Math.min(width, height) * 0.01)} 
                        fill={p.filled ? "rgba(0, 255, 0, 0.8)" : "rgba(255, 0, 0, 0.3)"}
                    />
                    <text x={p.x} y={p.y} fontSize={8} fill="white" textAnchor="middle" dy={10}>{(p.ratio*100).toFixed(0)}%</text>
                </g>
            ))}
            
            <g transform="translate(2, 2)">
                <rect x="0" y="0" width="160" height="46" fill="rgba(0,0,0,0.7)" rx="4" />
                <text x="6" y="12" fill="white" fontSize="9" fontWeight="bold">
                    マークシート検出
                </text>
                <text x="6" y="24" fill="white" fontSize="9">
                    右端(行): {debugInfo.rows.length}点 / 下端(列): {debugInfo.cols.length}点
                </text>
                 <text x="6" y="36" fill="#ccc" fontSize="8">
                    {debugInfo.scanZones?.some(z => z.label.includes('User')) ? '※ユーザー指定の基準範囲を使用' : '※自動検出モード'}
                </text>
            </g>
        </svg>
    );
};

export const StudentVerificationEditor = () => {
    const { activeProject, handleStudentSheetsChange, handleStudentInfoChange, handleStudentSheetsUpload } = useProject();
    const { uploadedSheets, studentInfo: studentInfoList, template, areas } = activeProject!;

    const [draggedSheetIndex, setDraggedSheetIndex] = useState<number | null>(null);
    const [draggedInfoIndex, setDraggedInfoIndex] = useState<number | null>(null);
    const [dragOverSheetIndex, setDragOverSheetIndex] = useState<number | null>(null);
    const [dragOverInfoIndex, setDragOverInfoIndex] = useState<number | null>(null);
    const [isSorting, setIsSorting] = useState(false);
    const [showDebugGrid, setShowDebugGrid] = useState(false);
    const [markThreshold, setMarkThreshold] = useState(130); // Default sensitivity
    const [debugInfos, setDebugInfos] = useState<Record<string, DetectionDebugInfo>>({});

    const nameArea = useMemo(() => areas.find(a => a.type === AreaType.NAME), [areas]);
    const studentIdArea = useMemo(() => areas.find(a => a.type === AreaType.STUDENT_ID_MARK), [areas]);
    const studentIdRefRight = useMemo(() => areas.find(a => a.type === AreaType.STUDENT_ID_REF_RIGHT), [areas]);
    const studentIdRefBottom = useMemo(() => areas.find(a => a.type === AreaType.STUDENT_ID_REF_BOTTOM), [areas]);

    // Usually name/id mark is on the first page
    const studentIdPageIdx = studentIdArea ? studentIdArea.pageIndex : 0;
    const nameAreaPageIdx = nameArea ? nameArea.pageIndex : 0;

    const createBlankSheet = (): Student => ({ id: `blank-sheet-${Date.now()}-${Math.random()}`, originalName: '（空の行）', filePath: null, images: [] });
    
    const numRows = Math.max(uploadedSheets.length, studentInfoList.length);

    // --- Sheets Operations ---

    const handleAppendSheets = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        // Use the context function to handle multi-page logic correctly
        handleStudentSheetsUpload(files); 
        e.target.value = '';
    };

    const handleInsertBlankSheet = (index: number) => {
        const newSheets = [...uploadedSheets];
        newSheets.splice(index, 0, createBlankSheet());
        handleStudentSheetsChange(newSheets);
    };

    const handleDeleteSheet = (index: number) => {
        const newSheets = [...uploadedSheets];
        newSheets.splice(index, 1);
        handleStudentSheetsChange(newSheets);
    };

    const handleSheetDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
        e.preventDefault();
        if (draggedSheetIndex === null || draggedSheetIndex === dropIndex) {
            setDraggedSheetIndex(null);
            setDragOverSheetIndex(null);
            return;
        }
        const newSheets = [...uploadedSheets];
        const draggedItem = newSheets[draggedSheetIndex];
        newSheets.splice(draggedSheetIndex, 1);
        newSheets.splice(dropIndex, 0, draggedItem);
        handleStudentSheetsChange(newSheets);
        setDraggedSheetIndex(null);
        setDragOverSheetIndex(null);
    };

    // --- Info Operations ---

    const handleInsertBlankInfo = (index: number) => {
        const newInfo = [...studentInfoList];
        newInfo.splice(index, 0, { id: `new-info-${Date.now()}-${Math.random()}`, class: '', number: '', name: '' });
        handleStudentInfoChange(newInfo);
    };

    const handleDeleteInfo = (index: number) => {
        const newInfo = [...studentInfoList];
        newInfo.splice(index, 1);
        handleStudentInfoChange(newInfo);
    };

    const handleInfoInputChange = (index: number, field: string, value: string) => {
        const newInfo = [...studentInfoList];
        while (newInfo.length <= index) {
            newInfo.push({ id: `new-info-${Date.now()}-${Math.random()}`, class: '', number: '', name: '' });
        }
        newInfo[index] = { ...newInfo[index], [field]: value };
        handleStudentInfoChange(newInfo);
    };

    const handleInfoDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
        e.preventDefault();
        if (draggedInfoIndex === null || draggedInfoIndex === dropIndex) {
            setDraggedInfoIndex(null);
            setDragOverInfoIndex(null);
            return;
        }
        const newInfo = [...studentInfoList];
        const draggedItem = newInfo[draggedInfoIndex];
        newInfo.splice(draggedInfoIndex, 1);
        newInfo.splice(dropIndex, 0, draggedItem);
        handleStudentInfoChange(newInfo);
        setDraggedInfoIndex(null);
        setDragOverInfoIndex(null);
    };

    const handleSortByStudentIdMark = async () => {
        if (!studentIdArea) {
            alert('テンプレート編集画面で「学籍番号」エリアを設定してください。');
            return;
        }
        if (uploadedSheets.filter(s => s.images.length > 0).length === 0) return;

        setIsSorting(true);
        setDebugInfos({}); 
        let matchCount = 0;

        try {
            // 1. Analyze all valid sheets
            const sheetsWithIndices = await Promise.all(uploadedSheets.map(async (sheet) => {
                const targetImage = sheet.images[studentIdPageIdx];
                if (!targetImage) return { sheet, indices: null };
                const { indices, debugInfo } = await analyzeStudentIdMark(
                    targetImage, 
                    studentIdArea,
                    markThreshold,
                    studentIdRefRight, 
                    studentIdRefBottom
                );
                setDebugInfos(prev => ({ ...prev, [sheet.id]: debugInfo }));
                return { sheet, indices };
            }));

            // 2. Prepare new sheet array aligned with studentInfo
            const newSheets: Student[] = new Array(studentInfoList.length).fill(null);
            const remainingSheets: Student[] = [];

            // 3. Match
            sheetsWithIndices.forEach(({ sheet, indices }) => {
                if (indices) {
                    const matchIndex = studentInfoList.findIndex(info => {
                        // Generate candidates based on common layouts
                        
                        const detectedId_TypeA = indices.map(i => i.toString()).join(''); // Direct index (0->0)
                        const detectedId_TypeB = indices.map(i => ((i + 1) % 10).toString()).join(''); // 1..9,0 mapping (idx 0->1, idx 9->0)

                        const candidates = [detectedId_TypeA, detectedId_TypeB];
                        
                        // Check match for any candidate
                        return candidates.some(detectedId => {
                            // Standard matching (Concatenation)
                            const simpleCombined = (info.class + info.number).replace(/[^0-9]/g, '');
                            if (simpleCombined === detectedId) return true;

                            // Flexible 4-Digit Format Matching (Grade/Class + Number)
                            // e.g. Detected "1310" -> Grade 1, Class 3, Number 10
                            if (detectedId.length >= 3) {
                                const markNumber = detectedId.slice(-2); 
                                const markClassPart = detectedId.slice(0, -2); 

                                const infoNumStr = info.number.replace(/[^0-9]/g, '');
                                const infoNumPadded = infoNumStr.padStart(2, '0');

                                if (infoNumPadded !== markNumber) return false;

                                const infoClassNums = info.class.replace(/[^0-9]/g, '');
                                // Check if class info contains the detected class part
                                if (infoClassNums.includes(markClassPart)) return true;
                            }
                            return false;
                        });
                    });

                    if (matchIndex !== -1 && !newSheets[matchIndex]) {
                        newSheets[matchIndex] = sheet;
                        matchCount++;
                    } else {
                        remainingSheets.push(sheet);
                    }
                } else {
                    remainingSheets.push(sheet);
                }
            });

            // 4. Fill gaps
            const finalSheets: Student[] = [];
            for (let i = 0; i < studentInfoList.length; i++) {
                if (newSheets[i]) {
                    finalSheets.push(newSheets[i]);
                } else if (remainingSheets.length > 0) {
                    finalSheets.push(remainingSheets.shift()!);
                } else {
                    finalSheets.push(createBlankSheet()); 
                }
            }
            
            finalSheets.push(...remainingSheets);

            handleStudentSheetsChange(finalSheets);
            alert(`${matchCount}件の解答用紙をマッチングしました。「認識位置を表示」チェックボックスでマーク読み取り状況を確認できます。`);

        } catch (error) {
            console.error("Sorting error:", error);
            alert("並べ替え中にエラーが発生しました。");
        } finally {
            setIsSorting(false);
        }
    };

    const handleRefreshDebug = async () => {
        if (!studentIdArea) return;
        const newDebugInfos: Record<string, DetectionDebugInfo> = {};
        for (const sheet of uploadedSheets) {
            const targetImage = sheet.images[studentIdPageIdx];
            if (targetImage) {
                const { debugInfo } = await analyzeStudentIdMark(
                    targetImage, 
                    studentIdArea,
                    markThreshold,
                    studentIdRefRight,
                    studentIdRefBottom
                );
                newDebugInfos[sheet.id] = debugInfo;
            }
        }
        setDebugInfos(newDebugInfos);
    };

    // Re-run debug analysis when threshold changes (debounced if needed, but for now direct)
    useEffect(() => {
        if (showDebugGrid && studentIdArea) {
            const timeout = setTimeout(handleRefreshDebug, 500);
            return () => clearTimeout(timeout);
        }
    }, [markThreshold]);

    return (
         <div className="w-full space-y-4 flex flex-col h-full">
            <div className="flex-shrink-0 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">生徒情報と解答用紙の照合・修正</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">左右のリストをドラッグして順序を調整し、ズレを修正してください。</p>
                </div>
                <div className="flex items-center gap-2">
                    {!studentIdArea && (
                        <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                            <AlertCircleIcon className="w-3 h-3"/>
                            テンプレートで「学籍番号」エリアを設定してください
                        </div>
                    )}
                    {studentIdArea && !studentIdRefRight && !studentIdRefBottom && (
                         <div className="flex items-center gap-1 text-xs text-sky-600 bg-sky-50 px-2 py-1 rounded" title="「学籍番号基準(右/下)」エリアを設定すると、読み取り精度が向上します">
                            <InfoIcon className="w-3 h-3"/>
                            認識位置を調整可能
                        </div>
                    )}
                    {studentIdArea && (
                        <>
                            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md">
                                <span className="text-xs text-slate-500 font-bold whitespace-nowrap">濃さ判定:</span>
                                <input 
                                    type="range" 
                                    min="50" max="220" 
                                    value={markThreshold} 
                                    onChange={e => setMarkThreshold(Number(e.target.value))}
                                    className="w-24 accent-sky-600"
                                    title={`閾値: ${markThreshold} (低いほど濃いマークのみ検出)`}
                                />
                                <span className="text-xs text-slate-500 w-6 text-right">{markThreshold}</span>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mr-2 cursor-pointer bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700">
                                <input 
                                    type="checkbox" 
                                    checked={showDebugGrid} 
                                    onChange={e => { 
                                        setShowDebugGrid(e.target.checked); 
                                        if(e.target.checked && Object.keys(debugInfos).length === 0) handleRefreshDebug(); 
                                    }} 
                                    className="rounded text-sky-600"
                                />
                                <EyeIcon className="w-4 h-4"/>
                                <span>認識位置を表示</span>
                            </label>
                            <button 
                                onClick={handleSortByStudentIdMark} 
                                disabled={isSorting}
                                className="flex items-center space-x-2 px-3 py-2 text-sm bg-purple-600 text-white hover:bg-purple-500 rounded-md transition-colors disabled:opacity-50"
                            >
                                {isSorting ? <SpinnerIcon className="w-4 h-4"/> : <SparklesIcon className="w-4 h-4"/>}
                                <span>{isSorting ? '読取中...' : '学籍番号マークで並べ替え'}</span>
                            </button>
                        </>
                    )}
                    <label className="flex items-center space-x-2 px-3 py-2 text-sm bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors cursor-pointer">
                        <PlusIcon className="w-4 h-4" />
                        <span>解答用紙を追加 (PDF可)</span>
                        <input type="file" multiple className="hidden" onChange={handleAppendSheets} accept="image/*,application/pdf" />
                    </label>
                </div>
            </div>
            
             <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md">
                <div className="flex gap-4 min-w-[800px]">
                    {/* Left Column: Answer Sheets */}
                    <div className="flex-1 flex flex-col gap-2">
                        <div className="h-10 flex items-center justify-center font-semibold text-center bg-slate-200 dark:bg-slate-700 rounded-md sticky top-0 z-10">解答用紙 ({uploadedSheets.length})</div>
                        {Array.from({ length: Math.max(uploadedSheets.length, numRows) }).map((_, index) => {
                            const sheet = uploadedSheets[index];
                            const isDraggable = !!sheet;
                            const debugInfo = sheet ? debugInfos[sheet.id] : undefined;
                            
                            const targetArea = showDebugGrid && studentIdArea ? studentIdArea : nameArea;
                            const targetImage = sheet ? (showDebugGrid && studentIdArea ? sheet.images[studentIdPageIdx] : sheet.images[nameAreaPageIdx]) : null;

                            return (
                                <div 
                                    key={sheet?.id || `empty-sheet-${index}`}
                                    className={`relative flex items-center gap-2 p-2 rounded-md border transition-all h-28 flex-shrink-0 ${
                                        sheet ? 'bg-white dark:bg-slate-800 border-transparent cursor-grab active:cursor-grabbing hover:shadow-md' : 'bg-transparent border-dashed border-slate-300'
                                    } ${dragOverSheetIndex === index ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30' : ''}`}
                                    draggable={isDraggable}
                                    onDragStart={(e) => { setDraggedSheetIndex(index); e.dataTransfer.effectAllowed = 'move'; }}
                                    onDragEnter={(e) => { e.preventDefault(); if(isDraggable) setDragOverSheetIndex(index); }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDragLeave={() => setDragOverSheetIndex(null)}
                                    onDrop={(e) => handleSheetDrop(e, index)}
                                >
                                    {sheet ? (
                                        <>
                                            <div className="text-slate-400 dark:text-slate-500 w-6 flex-shrink-0 flex flex-col items-center">
                                                <GripVerticalIcon className="w-6 h-6" />
                                                <span className="text-[10px]">{sheet.images.filter(i=>i).length}枚</span>
                                            </div>
                                            <div className="flex-1 h-full relative overflow-hidden rounded bg-slate-100 dark:bg-slate-900">
                                                {targetImage ? (
                                                    <div className="relative w-full h-full">
                                                        {targetArea ? (
                                                            <AnswerSnippet 
                                                                imageSrc={targetImage} 
                                                                area={targetArea} 
                                                                template={template} 
                                                            >
                                                                {showDebugGrid && debugInfo && studentIdArea && (
                                                                    <div style={{ 
                                                                        position: 'absolute', 
                                                                        left: 0, 
                                                                        top: 0, 
                                                                        width: '100%', 
                                                                        height: '100%', 
                                                                        pointerEvents: 'none' 
                                                                    }}>
                                                                        <GridOverlay debugInfo={debugInfo} width={studentIdArea.width} height={studentIdArea.height} />
                                                                    </div>
                                                                )}
                                                            </AnswerSnippet>
                                                        ) : (
                                                            <div className="flex items-center justify-center h-full text-xs text-slate-400 p-2 text-center">
                                                                {showDebugGrid ? '「学籍番号」' : '「氏名」'}エリアが<br/>設定されていません
                                                            </div>
                                                        )}
                                                        
                                                        {showDebugGrid && !debugInfo && studentIdArea && (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white text-xs pointer-events-none">未スキャン</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-xs text-slate-400">画像なし</div>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <button onClick={() => handleInsertBlankSheet(index)} className="p-1 text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="ここに空行を挿入"><ArrowDownFromLineIcon className="w-4 h-4"/></button>
                                                <button onClick={() => handleDeleteSheet(index)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="この用紙を削除"><Trash2Icon className="w-4 h-4"/></button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex-1 flex justify-center">
                                            <button onClick={() => handleInsertBlankSheet(index)} className="text-xs text-slate-400 hover:text-sky-500">+ 空行を追加</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Middle Connector */}
                    <div className="w-8 flex flex-col gap-2 items-center">
                        <div className="h-10 flex-shrink-0"></div> {/* Spacer for header alignment */}
                        {Array.from({ length: numRows }).map((_, i) => (
                            <div key={i} className="h-28 flex items-center justify-center flex-shrink-0">
                                <ArrowRightIcon className={`w-4 h-4 ${uploadedSheets[i] && studentInfoList[i] ? 'text-sky-500' : 'text-slate-300 dark:text-slate-700'}`} />
                            </div>
                        ))}
                    </div>

                    {/* Right Column: Student Info */}
                    <div className="flex-1 flex flex-col gap-2">
                        <div className="h-10 flex items-center justify-center font-semibold text-center bg-slate-200 dark:bg-slate-700 rounded-md sticky top-0 z-10">生徒情報 ({studentInfoList.length})</div>
                        {Array.from({ length: Math.max(studentInfoList.length, numRows) }).map((_, index) => {
                            const info = studentInfoList[index];
                            const isDraggable = !!info;
                            return (
                                <div 
                                    key={info?.id || `empty-info-${index}`}
                                    className={`relative flex items-center gap-2 p-2 rounded-md border transition-all h-28 flex-shrink-0 ${
                                        info ? 'bg-white dark:bg-slate-800 border-transparent cursor-grab active:cursor-grabbing hover:shadow-md' : 'bg-transparent border-dashed border-slate-300'
                                    } ${dragOverInfoIndex === index ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30' : ''}`}
                                    draggable={isDraggable}
                                    onDragStart={(e) => { setDraggedInfoIndex(index); e.dataTransfer.effectAllowed = 'move'; }}
                                    onDragEnter={(e) => { e.preventDefault(); if(isDraggable) setDragOverInfoIndex(index); }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDragLeave={() => setDragOverInfoIndex(null)}
                                    onDrop={(e) => handleInfoDrop(e, index)}
                                >
                                    {info ? (
                                        <>
                                            <div className="text-slate-400 dark:text-slate-500 w-6 flex-shrink-0"><GripVerticalIcon className="w-6 h-6" /></div>
                                            <div className="flex-1 grid grid-cols-3 gap-2">
                                                <input type="text" value={info.class} onChange={(e) => handleInfoInputChange(index, 'class', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-sm self-center" placeholder="組"/>
                                                <input type="text" value={info.number} onChange={(e) => handleInfoInputChange(index, 'number', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-sm self-center" placeholder="番号"/>
                                                <input type="text" value={info.name} onChange={(e) => handleInfoInputChange(index, 'name', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-sm self-center" placeholder="氏名"/>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <button onClick={() => handleInsertBlankInfo(index)} className="p-1 text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="ここに空行を挿入"><ArrowDownFromLineIcon className="w-4 h-4"/></button>
                                                <button onClick={() => handleDeleteInfo(index)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="この情報を削除"><Trash2Icon className="w-4 h-4"/></button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex-1 flex justify-center">
                                            <button onClick={() => handleInsertBlankInfo(index)} className="text-xs text-slate-400 hover:text-sky-500">+ 空行を追加</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};