import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Student, StudentInfo, Area, Template } from '../types';
import { AreaType } from '../types';
import { fileToArrayBuffer } from '../utils';
import { AnswerSnippet } from './AnswerSnippet';
import { Trash2Icon, PlusIcon, GripVerticalIcon, XIcon, UploadCloudIcon, ArrowDownFromLineIcon, ArrowRightIcon, SparklesIcon, SpinnerIcon, EyeIcon, AlertCircleIcon } from './icons';
import { useProject } from '../context/ProjectContext';

// Type to store debug information about the grid detection
interface DetectionDebugInfo {
    points: { x: number; y: number; filled: boolean }[];
    rows: number[]; // Y coordinates of centers
    cols: number[]; // X coordinates of centers
    rowBoundaries: number[]; // Y coordinates of lines
    colBoundaries: number[]; // X coordinates of lines
    orientation: 'vertical' | 'horizontal';
}

const analyzeStudentIdMark = async (imagePath: string, area: Area): Promise<{ indices: number[] | null, debugInfo: DetectionDebugInfo }> => {
    const debugInfo: DetectionDebugInfo = { points: [], rows: [], cols: [], rowBoundaries: [], colBoundaries: [], orientation: 'vertical' };
    
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
        
        // Safe Cropping Logic
        let sx = Math.floor(area.x);
        let sy = Math.floor(area.y);
        let sw = Math.floor(area.width);
        let sh = Math.floor(area.height);

        // Clamp values to be within image bounds
        if (sx < 0) { sw += sx; sx = 0; }
        if (sy < 0) { sh += sy; sy = 0; }
        if (sx + sw > canvas.width) sw = canvas.width - sx;
        if (sy + sh > canvas.height) sh = canvas.height - sy;

        if (sw <= 0 || sh <= 0) {
             console.warn("Invalid crop area for Student ID analysis (out of bounds)");
             return { indices: null, debugInfo };
        }

        const imageData = ctx.getImageData(sx, sy, sw, sh);
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        // Binarize helper
        const isDark = (x: number, y: number, threshold = 140) => {
            const idx = (y * width + x) * 4;
            if (idx < 0 || idx >= data.length) return false;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            return gray < threshold;
        };

        // --- Logic to detect Timing Marks / Grid Structure ---
        
        // 1. Detect Rows (Y-axis peaks)
        const rowProjectionProfile: number[] = new Array(height).fill(0);
        const scanXStart = Math.floor(width * 0.1);
        const scanXEnd = Math.ceil(width * 0.9);

        for (let y = 0; y < height; y++) {
            let darkCount = 0;
            for (let x = scanXStart; x < scanXEnd; x++) {
                if (isDark(x, y)) darkCount++;
            }
            rowProjectionProfile[y] = darkCount;
        }

        const rowCenters: number[] = [];
        let inPeak = false;
        let peakSum = 0; 
        let peakMass = 0;
        
        const maxRowVal = Math.max(...rowProjectionProfile);
        const rowThreshold = Math.max(5, maxRowVal * 0.25); // Require distinct peaks

        for (let y = 0; y < height; y++) {
            const val = rowProjectionProfile[y];
            if (val > rowThreshold) {
                if (!inPeak) {
                    inPeak = true;
                    peakSum = 0;
                    peakMass = 0;
                }
                peakSum += y * val;
                peakMass += val;
            } else {
                if (inPeak) {
                    inPeak = false;
                    if (peakMass > 0) rowCenters.push(peakSum / peakMass);
                }
            }
        }

        // 2. Detect Cols (X-axis peaks)
        const colProjectionProfile: number[] = new Array(width).fill(0);
        const scanYStart = Math.floor(height * 0.1);
        const scanYEnd = Math.ceil(height * 0.9);

        for (let x = 0; x < width; x++) {
            let darkCount = 0;
            for (let y = scanYStart; y < scanYEnd; y++) {
                if (isDark(x, y)) darkCount++;
            }
            colProjectionProfile[x] = darkCount;
        }

        const colCenters: number[] = [];
        inPeak = false;
        peakSum = 0;
        peakMass = 0;
        
        const maxColVal = Math.max(...colProjectionProfile);
        const colThreshold = Math.max(5, maxColVal * 0.25);

        for (let x = 0; x < width; x++) {
            const val = colProjectionProfile[x];
            if (val > colThreshold) {
                if (!inPeak) {
                    inPeak = true;
                    peakSum = 0;
                    peakMass = 0;
                }
                peakSum += x * val;
                peakMass += val;
            } else {
                if (inPeak) {
                    inPeak = false;
                    if (peakMass > 0) colCenters.push(peakSum / peakMass);
                }
            }
        }

        // --- Determine Orientation and Apply Fallback Grid ---
        
        let orientation: 'vertical' | 'horizontal' = 'vertical';
        
        // Simple Heuristic: 
        // Horizontal Layout: Wide (Width > Height), 10 cols (0-9)
        // Vertical Layout: Tall (Height > Width), 10 rows (0-9)
        
        if (width > height * 1.2) {
            orientation = 'horizontal';
        } else if (height > width * 1.2) {
            orientation = 'vertical';
        } else {
            // If square-ish, trust the detection counts
            if (colCenters.length >= 8 && rowCenters.length < 8) orientation = 'horizontal';
            else orientation = 'vertical';
        }

        // --- Forced Grid Generation if detection is spotty ---
        
        if (orientation === 'vertical') {
            // Expect 10 rows (0-9)
            if (rowCenters.length < 8 || rowCenters.length > 12) {
                // Force 10 even rows
                rowCenters.length = 0;
                const step = height / 10;
                for(let i=0; i<10; i++) rowCenters.push(step * i + step/2);
            }
            // Columns: Expect roughly the number of digits in ID (e.g., 3-8 cols)
            // If detection completely failed (e.g. < 1), estimate based on aspect ratio assuming square cells
            if (colCenters.length < 1) {
                 const estimatedCols = Math.max(1, Math.round(width / (height / 10)));
                 const step = width / estimatedCols;
                 for(let i=0; i<estimatedCols; i++) colCenters.push(step * i + step/2);
            }
        } else {
            // Expect 10 columns (0-9)
            if (colCenters.length < 8 || colCenters.length > 12) {
                // Force 10 even cols
                colCenters.length = 0;
                const step = width / 10;
                for(let i=0; i<10; i++) colCenters.push(step * i + step/2);
            }
            // Rows: Expect student ID digits
            if (rowCenters.length < 1) {
                 const estimatedRows = Math.max(1, Math.round(height / (width / 10)));
                 const step = height / estimatedRows;
                 for(let i=0; i<estimatedRows; i++) rowCenters.push(step * i + step/2);
            }
        }
        
        // Calculate Grid Boundaries for Visualization
        const rowBoundaries: number[] = [];
        const colBoundaries: number[] = [];
        
        // Create boundaries based on centers (approximate)
        if (rowCenters.length > 0) {
            const rowStep = rowCenters.length > 1 ? (rowCenters[rowCenters.length-1] - rowCenters[0]) / (rowCenters.length - 1) : height;
            // Start half a step before first center
            const startY = rowCenters[0] - rowStep/2;
            for(let i=0; i<=rowCenters.length; i++) rowBoundaries.push(startY + i*rowStep);
        }
        if (colCenters.length > 0) {
            const colStep = colCenters.length > 1 ? (colCenters[colCenters.length-1] - colCenters[0]) / (colCenters.length - 1) : width;
            const startX = colCenters[0] - colStep/2;
            for(let i=0; i<=colCenters.length; i++) colBoundaries.push(startX + i*colStep);
        }

        debugInfo.rows = rowCenters;
        debugInfo.cols = colCenters;
        debugInfo.rowBoundaries = rowBoundaries;
        debugInfo.colBoundaries = colBoundaries;
        debugInfo.orientation = orientation;

        const indices: number[] = [];

        if (orientation === 'horizontal') {
            // Horizontal Layout: Rows are digits, Cols are values 0-9
            for (let r = 0; r < rowCenters.length; r++) {
                const centerY = rowCenters[r];
                const rowScores: {colIdx: number, darkness: number}[] = [];

                for (let c = 0; c < colCenters.length; c++) {
                    const centerX = colCenters[c];
                    const { filled, darkPixels } = checkFill(width, height, centerX, centerY, data, isDark);
                    
                    debugInfo.points.push({ x: centerX, y: centerY, filled });
                    rowScores.push({ colIdx: c, darkness: darkPixels });
                }

                rowScores.sort((a, b) => b.darkness - a.darkness);
                const winner = rowScores[0];
                const runnerUp = rowScores[1];

                // Heuristic: Darkest needs to be somewhat dark, and darker than runner up
                // Use a relative threshold based on cell size
                const cellArea = (width / colCenters.length) * (height / rowCenters.length);
                const minDarkness = cellArea * 0.05; // 5% fill

                if (winner.darkness > minDarkness && (rowScores.length < 2 || winner.darkness > runnerUp.darkness * 1.1)) {
                    indices.push(winner.colIdx);
                } else {
                    indices.push(-1); 
                }
            }

        } else {
            // Vertical Layout: Cols are digits, Rows are values 0-9
            for (let c = 0; c < colCenters.length; c++) {
                const centerX = colCenters[c];
                const colScores: {rowIdx: number, darkness: number}[] = [];

                for (let r = 0; r < rowCenters.length; r++) {
                    const centerY = rowCenters[r];
                    const { filled, darkPixels } = checkFill(width, height, centerX, centerY, data, isDark);
                    
                    debugInfo.points.push({ x: centerX, y: centerY, filled });
                    colScores.push({ rowIdx: r, darkness: darkPixels });
                }

                colScores.sort((a, b) => b.darkness - a.darkness);
                const winner = colScores[0];
                const runnerUp = colScores[1];
                
                const cellArea = (width / colCenters.length) * (height / rowCenters.length);
                const minDarkness = cellArea * 0.05;

                if (winner.darkness > minDarkness && (colScores.length < 2 || winner.darkness > runnerUp.darkness * 1.1)) {
                    indices.push(winner.rowIdx);
                } else {
                    indices.push(-1);
                }
            }
        }
        
        return { indices: indices.some(i => i !== -1) ? indices : null, debugInfo };
        
    } catch (e) {
        console.error("Student ID Analysis Error:", e);
        return { indices: null, debugInfo };
    }
};

// Helper for pixel sampling
function checkFill(width: number, height: number, centerX: number, centerY: number, data: Uint8ClampedArray, isDark: (x:number, y:number)=>boolean) {
    const sampleRadius = Math.max(2, Math.min(width, height) * 0.02); 
    let darkPixels = 0;
    let totalPixels = 0;

    const startY = Math.max(0, Math.floor(centerY - sampleRadius));
    const endY = Math.min(height, Math.ceil(centerY + sampleRadius));
    const startX = Math.max(0, Math.floor(centerX - sampleRadius));
    const endX = Math.min(width, Math.ceil(centerX + sampleRadius));

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            if (isDark(x, y)) darkPixels++;
            totalPixels++;
        }
    }
    const isFilled = totalPixels > 0 && (darkPixels / totalPixels) > 0.25; // 25% threshold
    return { filled: isFilled, darkPixels };
}

const GridOverlay = ({ debugInfo, width, height }: { debugInfo: DetectionDebugInfo, width: number, height: number }) => {
    if (!debugInfo) return null;

    const isHorizontal = debugInfo.orientation === 'horizontal';
    
    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 50 }}>
            {/* Draw Grid Lines */}
            {debugInfo.rowBoundaries.map((y, i) => (
                <line key={`row-line-${i}`} x1="0" y1={y} x2={width} y2={y} stroke="rgba(0, 255, 255, 0.5)" strokeWidth="1" />
            ))}
            {debugInfo.colBoundaries.map((x, i) => (
                <line key={`col-line-${i}`} x1={x} y1="0" x2={x} y2={height} stroke="rgba(255, 0, 255, 0.5)" strokeWidth="1" />
            ))}

            {/* Draw Center Points/Labels */}
            {debugInfo.rows.map((y, i) => (
                !isHorizontal && <text key={`row-lbl-${i}`} x="2" y={y + 3} fill="cyan" fontSize={Math.min(12, height/12)} fontWeight="bold" style={{ textShadow: '1px 1px 1px black' }}>{i}</text>
            ))}
            {debugInfo.cols.map((x, i) => (
                isHorizontal && <text key={`col-lbl-${i}`} x={x - 3} y="10" fill="magenta" fontSize={Math.min(12, width/12)} fontWeight="bold" style={{ textShadow: '1px 1px 1px black' }}>{i}</text>
            ))}
            
            {/* Draw Detection Points */}
            {debugInfo.points.map((p, i) => (
                <circle 
                    key={i} 
                    cx={p.x} 
                    cy={p.y} 
                    r={Math.max(2, Math.min(width, height) * 0.015)} 
                    fill={p.filled ? "rgba(0, 255, 0, 0.6)" : "rgba(255, 0, 0, 0.1)"}
                    stroke={p.filled ? "lime" : "transparent"} 
                    strokeWidth="1"
                />
            ))}
            
            <g transform="translate(2, 2)">
                <rect x="0" y="0" width="130" height="30" fill="rgba(0,0,0,0.7)" rx="4" />
                <text x="6" y="12" fill="white" fontSize="9" fontWeight="bold">
                    {isHorizontal ? '横 (列=0~9)' : '縦 (行=0~9)'}
                </text>
                <text x="6" y="24" fill="white" fontSize="9">
                    検出: {debugInfo.rows.length}行 x {debugInfo.cols.length}列
                </text>
            </g>
        </svg>
    );
};

export const StudentVerificationEditor = () => {
    const { activeProject, handleStudentSheetsChange, handleStudentInfoChange } = useProject();
    const { uploadedSheets, studentInfo: studentInfoList, template, areas } = activeProject!;

    const [draggedSheetIndex, setDraggedSheetIndex] = useState<number | null>(null);
    const [draggedInfoIndex, setDraggedInfoIndex] = useState<number | null>(null);
    const [dragOverSheetIndex, setDragOverSheetIndex] = useState<number | null>(null);
    const [dragOverInfoIndex, setDragOverInfoIndex] = useState<number | null>(null);
    const [isSorting, setIsSorting] = useState(false);
    const [showDebugGrid, setShowDebugGrid] = useState(false);
    const [debugInfos, setDebugInfos] = useState<Record<string, DetectionDebugInfo>>({});

    const nameArea = useMemo(() => areas.find(a => a.type === AreaType.NAME), [areas]);
    const studentIdArea = useMemo(() => areas.find(a => a.type === AreaType.STUDENT_ID_MARK), [areas]);
    const createBlankSheet = (): Student => ({ id: `blank-sheet-${Date.now()}-${Math.random()}`, originalName: '（空の行）', filePath: null });
    
    const numRows = Math.max(uploadedSheets.length, studentInfoList.length);

    // --- Sheets Operations ---

    const handleAppendSheets = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        const newSheetData = await Promise.all(files.map(async (file: File) => {
            const buffer = await fileToArrayBuffer(file);
            const filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName: file.name });
            return { id: `${file.name}-${file.lastModified}`, originalName: file.name, filePath };
        }));
        handleStudentSheetsChange([...uploadedSheets, ...newSheetData]);
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
        if (uploadedSheets.filter(s => s.filePath).length === 0) return;

        setIsSorting(true);
        setDebugInfos({}); 
        let matchCount = 0;

        try {
            // 1. Analyze all valid sheets to get raw indices
            const sheetsWithIndices = await Promise.all(uploadedSheets.map(async (sheet) => {
                if (!sheet.filePath) return { sheet, indices: null };
                const { indices, debugInfo } = await analyzeStudentIdMark(sheet.filePath, studentIdArea);
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
                        // 1. Standard 0-9: index 0 is '0', index 9 is '9' (or vice versa)
                        //    Usually vertical: 0 at top.
                        //    Horizontal often: 1, 2, ... 9, 0 (index 0 is '1', index 9 is '0')
                        
                        const detectedId_TypeA = indices.map(i => i.toString()).join(''); // Direct index
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
            if (sheet.filePath) {
                const { debugInfo } = await analyzeStudentIdMark(sheet.filePath, studentIdArea);
                newDebugInfos[sheet.id] = debugInfo;
            }
        }
        setDebugInfos(newDebugInfos);
    };

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
                    {studentIdArea && (
                        <>
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
                        <span>解答用紙を追加</span>
                        <input type="file" multiple className="hidden" onChange={handleAppendSheets} accept="image/*" />
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
                                            <div className="text-slate-400 dark:text-slate-500 w-6 flex-shrink-0"><GripVerticalIcon className="w-6 h-6" /></div>
                                            <div className="flex-1 h-full relative overflow-hidden rounded bg-slate-100 dark:bg-slate-900">
                                                {sheet.filePath ? (
                                                    <div className="relative w-full h-full">
                                                        {targetArea ? (
                                                            <AnswerSnippet 
                                                                imageSrc={sheet.filePath} 
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
                                                    <div className="flex items-center justify-center h-full text-xs text-slate-400">空の行</div>
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