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
    rows: number[]; // Y coordinates
    cols: number[]; // X coordinates
}

const analyzeStudentIdMark = async (imagePath: string, area: Area): Promise<{ idString: string | null, debugInfo: DetectionDebugInfo }> => {
    const debugInfo: DetectionDebugInfo = { points: [], rows: [], cols: [] };
    
    try {
        const result = await window.electronAPI.invoke('get-image-details', imagePath);
        if (!result.success || !result.details?.url) return { idString: null, debugInfo };
        
        const dataUrl = result.details.url;
        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
        
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { idString: null, debugInfo };
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(area.x, area.y, area.width, area.height);
        const data = imageData.data;
        const width = area.width;
        const height = area.height;

        // Binarize helper
        const isDark = (x: number, y: number, threshold = 128) => {
            const idx = (y * width + x) * 4;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            return gray < threshold;
        };

        // --- Logic to detect Timing Marks (Reference Marks) ---
        
        // 1. Detect Rows by scanning the RIGHTMOST strip (e.g. last 15%)
        // We project horizontally within this strip to find vertical positions (Y).
        const rightStripStart = Math.floor(width * 0.85);
        const rowProjectionProfile: number[] = new Array(height).fill(0);
        
        for (let y = 0; y < height; y++) {
            let darkCount = 0;
            for (let x = rightStripStart; x < width; x++) {
                if (isDark(x, y)) darkCount++;
            }
            rowProjectionProfile[y] = darkCount;
        }

        // Find Peaks in Y (Rows)
        const rowCenters: number[] = [];
        let inPeak = false;
        let peakStart = 0;
        let peakSum = 0; // weighted sum for centroid
        let peakMass = 0; // total mass
        // Adaptive threshold for the strip: average darkness * 1.5
        const stripAvg = rowProjectionProfile.reduce((a, b) => a + b, 0) / height;
        const rowThreshold = Math.max(5, stripAvg * 1.5); 

        for (let y = 0; y < height; y++) {
            const val = rowProjectionProfile[y];
            if (val > rowThreshold) {
                if (!inPeak) {
                    inPeak = true;
                    peakStart = y;
                    peakSum = 0;
                    peakMass = 0;
                }
                peakSum += y * val;
                peakMass += val;
            } else {
                if (inPeak) {
                    inPeak = false;
                    // Centroid
                    if (peakMass > 0) rowCenters.push(peakSum / peakMass);
                }
            }
        }

        // 2. Detect Cols by scanning the BOTTOM strip (e.g. last 15%)
        // We project vertically within this strip to find horizontal positions (X).
        const bottomStripStart = Math.floor(height * 0.85);
        const colProjectionProfile: number[] = new Array(width).fill(0);

        for (let x = 0; x < width; x++) {
            let darkCount = 0;
            for (let y = bottomStripStart; y < height; y++) {
                if (isDark(x, y)) darkCount++;
            }
            colProjectionProfile[x] = darkCount;
        }

        // Find Peaks in X (Cols)
        const colCenters: number[] = [];
        inPeak = false;
        peakStart = 0;
        peakSum = 0;
        peakMass = 0;
        const colStripAvg = colProjectionProfile.reduce((a, b) => a + b, 0) / width;
        const colThreshold = Math.max(5, colStripAvg * 1.5);

        for (let x = 0; x < width; x++) {
            const val = colProjectionProfile[x];
            if (val > colThreshold) {
                if (!inPeak) {
                    inPeak = true;
                    peakStart = x;
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

        // --- Fallback & Filtering ---
        let finalRowCenters = rowCenters;
        let finalColCenters = colCenters;

        // If detection failed (too few marks), fallback to uniform grid
        if (rowCenters.length < 5) { // Expecting roughly 10 digits
             finalRowCenters = [];
             const rowHeight = height / 10;
             for(let i=0; i<10; i++) finalRowCenters.push(rowHeight * i + rowHeight/2);
        } else {
            // Sort just in case
            finalRowCenters.sort((a,b) => a - b);
            // If we detected too many (noise), try to filter or just take top 10 if spaced evenly
            // For now, let's assume detection is decent or fallback handles it.
            if (finalRowCenters.length > 10) {
                // If more than 10, maybe we caught some frame edges. 
                // A smart logic would be to find the most regular sequence of 10.
                // Simplified: Take the 10 largest peaks? Or just the middle ones?
                // Let's rely on the user to adjust crop area if it's too noisy.
            }
        }

        if (colCenters.length < 2) { // Expecting at least column marks
            finalColCenters = [];
            const colWidth = width / 4; // Assume 4 digits default
            for(let i=0; i<4; i++) finalColCenters.push(colWidth * i + colWidth/2);
        } else {
            finalColCenters.sort((a,b) => a - b);
        }

        debugInfo.rows = finalRowCenters;
        debugInfo.cols = finalColCenters;

        // --- Reading the Grid ---
        let idString = '';
        // Note: The timing marks on the bottom usually align with the columns.
        // The timing marks on the right align with the rows (0-9).
        // We iterate through columns, and for each column, find the darkest row.
        
        // Safety check: ensure we don't go out of bounds if marks are weird
        const numColsToRead = Math.min(finalColCenters.length, 10); // reasonable cap

        for (let c = 0; c < numColsToRead; c++) {
            const centerX = finalColCenters[c];
            
            const columnScores: {rowIdx: number, darkness: number}[] = [];

            for (let r = 0; r < finalRowCenters.length; r++) {
                const centerY = finalRowCenters[r];
                
                // Sample a small box around the intersection (centerX, centerY)
                // Since timing marks are at the edge, the intersection is the bubble center.
                const sampleRadius = Math.min(width, height) * 0.015; 
                let darkPixels = 0;
                let totalPixels = 0;

                const startY = Math.max(0, Math.floor(centerY - sampleRadius));
                const endY = Math.min(height, Math.floor(centerY + sampleRadius));
                const startX = Math.max(0, Math.floor(centerX - sampleRadius));
                const endX = Math.min(width, Math.floor(centerX + sampleRadius));

                for (let y = startY; y < endY; y++) {
                    for (let x = startX; x < endX; x++) {
                        if (isDark(x, y)) darkPixels++;
                        totalPixels++;
                    }
                }
                
                const isFilled = totalPixels > 0 && (darkPixels / totalPixels) > 0.4; 
                debugInfo.points.push({ x: centerX, y: centerY, filled: isFilled });
                
                columnScores.push({ rowIdx: r, darkness: darkPixels });
            }

            // Find best row in this column
            columnScores.sort((a, b) => b.darkness - a.darkness);
            const winner = columnScores[0];
            const runnerUp = columnScores[1];
            
            // Confidence check: Winner should be significantly darker than runner up and absolute darkness
            if (winner.darkness > 5 && (columnScores.length < 2 || winner.darkness > runnerUp.darkness * 1.5)) {
                // Assuming rows are 0, 1, 2... 9 from top to bottom
                // If the timing marks map strictly to 0-9 rows.
                // Sometimes rows are 1-9 then 0. 
                // Standard: 0 at top? Or 1 at top?
                // Let's assume 0 at top for index 0. If common format is [0,1,2...9], index is digit.
                idString += winner.rowIdx.toString();
            } else {
                idString += '?';
            }
        }
        
        return { idString: idString.includes('?') ? null : idString, debugInfo };
        
    } catch (e) {
        console.error("Student ID Analysis Error:", e);
        return { idString: null, debugInfo };
    }
};

const GridOverlay = ({ debugInfo, width, height }: { debugInfo: DetectionDebugInfo, width: number, height: number }) => {
    // Show grid even if points are missing (fallback mode) to help debug alignment
    if (!debugInfo) return null;

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 50 }}>
            {/* Draw grid lines for debugging if rows/cols detected */}
            {debugInfo.rows.map((y, i) => (
                <line key={`row-${i}`} x1="0" y1={y} x2={width} y2={y} stroke="rgba(255, 99, 71, 0.7)" strokeWidth="1" strokeDasharray="2 2"/>
            ))}
            {debugInfo.cols.map((x, i) => (
                <line key={`col-${i}`} x1={x} y1="0" x2={x} y2={height} stroke="rgba(255, 99, 71, 0.7)" strokeWidth="1" strokeDasharray="2 2"/>
            ))}
            
            {/* Draw intersection points */}
            {debugInfo.points.map((p, i) => (
                <circle 
                    key={i} 
                    cx={p.x} 
                    cy={p.y} 
                    r={Math.min(width, height) * 0.015} 
                    fill={p.filled ? "rgba(0, 255, 0, 0.8)" : "rgba(255, 0, 0, 0.4)"} 
                    stroke="white"
                    strokeWidth="1"
                />
            ))}
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
        // Ensure existence
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
        setDebugInfos({}); // Clear old debug info
        let matchCount = 0;

        try {
            // 1. Analyze all valid sheets
            const sheetsWithIds = await Promise.all(uploadedSheets.map(async (sheet) => {
                if (!sheet.filePath) return { sheet, id: null };
                const { idString, debugInfo } = await analyzeStudentIdMark(sheet.filePath, studentIdArea);
                setDebugInfos(prev => ({ ...prev, [sheet.id]: debugInfo }));
                return { sheet, id: idString };
            }));

            // 2. Prepare new sheet array aligned with studentInfo
            const newSheets: Student[] = new Array(studentInfoList.length).fill(null);
            const remainingSheets: Student[] = [];

            // 3. Match
            sheetsWithIds.forEach(({ sheet, id }) => {
                if (id) {
                    // Try to match id (e.g. "1310") to Class/Number (e.g. "1-3", "10" => "1310")
                    const matchIndex = studentInfoList.findIndex(info => {
                        const targetId = (info.class + info.number).replace(/[^0-9]/g, '');
                        return targetId === id;
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

            // 4. Fill gaps in newSheets with remainingSheets or blank placeholders
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
            
            // Append any left over remainingSheets
            finalSheets.push(...remainingSheets);

            handleStudentSheetsChange(finalSheets);
            // Do not auto-enable debug grid so name area stays visible for verification
            // if (!showDebugGrid) setShowDebugGrid(true); 
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
        // Just refresh visual debug info for existing sheets without sorting
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
                                                        <AnswerSnippet 
                                                            imageSrc={sheet.filePath} 
                                                            area={showDebugGrid && studentIdArea ? studentIdArea : nameArea} 
                                                            template={template} 
                                                        >
                                                            {showDebugGrid && debugInfo && studentIdArea && (
                                                                <div style={{ 
                                                                    position: 'absolute', 
                                                                    left: studentIdArea.x, 
                                                                    top: studentIdArea.y, 
                                                                    width: studentIdArea.width, 
                                                                    height: studentIdArea.height, 
                                                                    pointerEvents: 'none' 
                                                                }}>
                                                                    <GridOverlay debugInfo={debugInfo} width={studentIdArea.width} height={studentIdArea.height} />
                                                                </div>
                                                            )}
                                                        </AnswerSnippet>
                                                        
                                                        {showDebugGrid && !debugInfo && (
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