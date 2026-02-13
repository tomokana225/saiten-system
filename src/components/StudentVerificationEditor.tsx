
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Student, Area } from '../types';
import { AreaType } from '../types';
import { AnswerSnippet } from './AnswerSnippet';
import { 
    Trash2Icon, PlusIcon, GripVerticalIcon, ArrowRightIcon, 
    SparklesIcon, SpinnerIcon, EyeIcon, AlertCircleIcon, 
    RotateCcwIcon, ArrowDownFromLineIcon, CheckCircle2Icon, SettingsIcon, FileStackIcon, ListIcon, BoxSelectIcon
} from './icons';
import { useProject } from '../context/ProjectContext';

// Type to store debug information about the grid detection
interface DetectionDebugInfo {
    points: { x: number; y: number; filled: boolean; ratio: number }[];
    rows: number[];
    cols: number[];
    rowBoundaries: number[];
    colBoundaries: number[];
    orientation: 'vertical' | 'horizontal';
    scanZones?: { x: number, y: number, w: number, h: number, label: string }[];
    rois?: { x: number, y: number, w: number, h: number }[];
}

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
            if (!inPeak) { inPeak = true; peakSum = 0; peakMass = 0; }
            peakSum += i * val;
            peakMass += val;
        } else {
            if (inPeak) { inPeak = false; if (peakMass > 0) peaks.push(peakSum / peakMass); }
        }
    }
    if (inPeak && peakMass > 0) peaks.push(peakSum / peakMass);
    return peaks;
};

const analyzeStudentIdMark = async (imagePath: string, mainArea: Area, markThreshold: number, refRightArea?: Area, refBottomArea?: Area): Promise<{ indices: number[] | null, debugInfo: DetectionDebugInfo }> => {
    const debugInfo: DetectionDebugInfo = { points: [], rows: [], cols: [], rowBoundaries: [], colBoundaries: [], orientation: 'horizontal', scanZones: [], rois: [] };
    try {
        const result = await window.electronAPI.invoke('get-image-details', imagePath);
        if (!result.success || !result.details?.url) return { indices: null, debugInfo };
        const img = new Image();
        img.src = result.details.url;
        await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { indices: null, debugInfo };
        ctx.drawImage(img, 0, 0);
        
        const getCropData = (area: Area) => {
            let sx = Math.floor(area.x); let sy = Math.floor(area.y); let sw = Math.floor(area.width); let sh = Math.floor(area.height);
            if (sx < 0) { sw += sx; sx = 0; } if (sy < 0) { sh += sy; sy = 0; }
            if (sx + sw > canvas.width) sw = canvas.width - sx; if (sy + sh > canvas.height) sh = canvas.height - sy;
            if (sw <= 0 || sh <= 0) return null;
            return { imageData: ctx.getImageData(sx, sy, sw, sh), sx, sy, sw, h: sh };
        };
        const mainCrop = getCropData(mainArea);
        if (!mainCrop) return { indices: null, debugInfo };

        const isDark = (imgData: ImageData, x: number, y: number, threshold = markThreshold) => {
            const idx = (y * imgData.width + x) * 4;
            if (idx < 0 || idx >= imgData.data.length) return false;
            const gray = 0.299 * imgData.data[idx] + 0.587 * imgData.data[idx + 1] + 0.114 * imgData.data[idx + 2];
            return gray < threshold;
        };
        const getProjection = (imgData: ImageData, scanXStart: number, scanXEnd: number, scanYStart: number, scanYEnd: number, direction: 'row' | 'col') => {
            const size = direction === 'row' ? imgData.height : imgData.width;
            const profile = new Array(size).fill(0);
            if (direction === 'row') {
                for (let y = 0; y < imgData.height; y++) {
                    let darkCount = 0;
                    for (let x = scanXStart; x < scanXEnd; x++) if (isDark(imgData, x, y, 160)) darkCount++;
                    profile[y] = darkCount;
                }
            } else {
                for (let x = 0; x < imgData.width; x++) {
                    let darkCount = 0;
                    for (let y = scanYStart; y < scanYEnd; y++) if (isDark(imgData, x, y, 160)) darkCount++;
                    profile[x] = darkCount;
                }
            }
            return profile;
        };

        let rowCenters: number[] = [];
        if (refRightArea) {
            const refCrop = getCropData(refRightArea);
            if (refCrop) {
                const profile = getProjection(refCrop.imageData, 0, refCrop.sw, 0, refCrop.h, 'row');
                rowCenters = findPeaksInProfile(profile, refCrop.h, 0.30).map(y => (refCrop.sy + y) - mainCrop.sy);
                debugInfo.scanZones?.push({ x: refCrop.sx - mainCrop.sx, y: refCrop.sy - mainCrop.sy, w: refCrop.sw, h: refCrop.h, label: 'User Ref Right' });
            }
        } else {
            const scanXStart = Math.floor(mainCrop.sw * 0.85);
            const profile = getProjection(mainCrop.imageData, scanXStart, mainCrop.sw, 0, mainCrop.h, 'row');
            rowCenters = findPeaksInProfile(profile, mainCrop.h, 0.35);
            debugInfo.scanZones?.push({ x: scanXStart, y: 0, w: mainCrop.sw - scanXStart, h: mainCrop.h, label: 'Auto Ref Right' });
        }

        let colCenters: number[] = [];
        if (refBottomArea) {
            const refCrop = getCropData(refBottomArea);
            if (refCrop) {
                const profile = getProjection(refCrop.imageData, 0, refCrop.sw, 0, refCrop.h, 'col');
                colCenters = findPeaksInProfile(profile, refCrop.sw, 0.30).map(x => (refCrop.sx + x) - mainCrop.sx);
                debugInfo.scanZones?.push({ x: refCrop.sx - mainCrop.sx, y: refCrop.sy - mainCrop.sy, w: refCrop.sw, h: refCrop.h, label: 'User Ref Bottom' });
            }
        } else {
            const scanYStart = Math.floor(mainCrop.h * 0.85);
            const profile = getProjection(mainCrop.imageData, 0, mainCrop.sw, scanYStart, mainCrop.h, 'col');
            colCenters = findPeaksInProfile(profile, mainCrop.sw, 0.35);
            debugInfo.scanZones?.push({ x: 0, y: scanYStart, w: mainCrop.sw, h: mainCrop.h - scanYStart, label: 'Auto Ref Bottom' });
        }

        if (rowCenters.length < 1) rowCenters = [mainCrop.h / 6, mainCrop.h / 2, mainCrop.h * 5/6];
        if (colCenters.length < 1) for(let i=0; i<10; i++) colCenters.push(mainCrop.sw / 10 * i + mainCrop.sw / 20);

        const rowBoundaries: number[] = [];
        const colBoundaries: number[] = [];
        if (rowCenters.length > 0) {
            const firstStep = rowCenters.length > 1 ? (rowCenters[1] - rowCenters[0]) : (mainCrop.h / rowCenters.length);
            rowBoundaries.push(Math.max(0, rowCenters[0] - firstStep/2));
            for(let i=0; i < rowCenters.length - 1; i++) rowBoundaries.push((rowCenters[i] + rowCenters[i+1]) / 2);
            rowBoundaries.push(mainCrop.h);
        }
        if (colCenters.length > 0) {
            const firstStep = colCenters.length > 1 ? (colCenters[1] - colCenters[0]) : (mainCrop.sw / colCenters.length);
            colBoundaries.push(Math.max(0, colCenters[0] - firstStep/2));
            for(let i=0; i < colCenters.length - 1; i++) colBoundaries.push((colCenters[i] + colCenters[i+1]) / 2);
            colBoundaries.push(mainCrop.sw);
        }
        
        debugInfo.rows = rowCenters; debugInfo.cols = colCenters; debugInfo.rowBoundaries = rowBoundaries; debugInfo.colBoundaries = colBoundaries;

        const indices: number[] = [];
        for (let r = 0; r < rowCenters.length; r++) {
            const rowScores: {colIdx: number, darkness: number}[] = [];
            const cellTop = rowBoundaries[r]; const cellHeight = (rowBoundaries[r+1] || mainCrop.h) - cellTop;
            for (let c = 0; c < colCenters.length; c++) {
                const cellLeft = colBoundaries[c]; const cellWidth = (colBoundaries[c+1] || mainCrop.sw) - cellLeft;
                const roiW = Math.max(2, cellWidth * 0.4); const roiH = Math.max(2, cellHeight * 0.4);
                const roiX = cellLeft + (cellWidth - roiW) / 2; const roiY = cellTop + (cellHeight - roiH) / 2;
                debugInfo.rois?.push({ x: roiX, y: roiY, w: roiW, h: roiH });
                const { filled, darkPixels, ratio } = checkFill(roiX, roiY, roiW, roiH, mainCrop.imageData.data, mainCrop.sw, markThreshold);
                debugInfo.points.push({ x: roiX + roiW/2, y: roiY + roiH/2, filled, ratio });
                rowScores.push({ colIdx: c, darkness: darkPixels });
            }
            rowScores.sort((a, b) => b.darkness - a.darkness);
            const winner = rowScores[0]; const runnerUp = rowScores[1];
            const cellLeft = colBoundaries[winner.colIdx]; const cellWidth = (colBoundaries[winner.colIdx+1] || mainCrop.sw) - cellLeft;
            const roiW = Math.max(2, cellWidth * 0.4); const roiH = Math.max(2, cellHeight * 0.4);
            const roiX = cellLeft + (cellWidth - roiW) / 2; const roiY = cellTop + (cellHeight - roiH) / 2;
            const { filled: isWinnerFilled } = checkFill(roiX, roiY, roiW, roiH, mainCrop.imageData.data, mainCrop.sw, markThreshold);
            if (isWinnerFilled && (rowScores.length < 2 || winner.darkness > runnerUp.darkness * 1.1)) indices.push(winner.colIdx);
            else indices.push(-1);
        }
        return { indices: indices.some(i => i !== -1) ? indices : null, debugInfo };
    } catch (e) { return { indices: null, debugInfo }; }
};

function checkFill(startX: number, startY: number, w: number, h: number, data: Uint8ClampedArray, imageWidth: number, threshold: number) {
    let darkPixels = 0; let totalPixels = 0;
    const endX = startX + w; const endY = startY + h;
    for (let y = Math.floor(startY); y < endY; y++) {
        for (let x = Math.floor(startX); x < endX; x++) {
            const idx = (y * imageWidth + x) * 4;
            if (idx < 0 || idx >= data.length) continue;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            if (gray < threshold) darkPixels++;
            totalPixels++;
        }
    }
    const ratio = totalPixels > 0 ? darkPixels / totalPixels : 0;
    return { filled: ratio > 0.30, darkPixels, ratio };
}

const GridOverlay = ({ debugInfo, width, height }: { debugInfo: DetectionDebugInfo, width: number, height: number }) => {
    if (!debugInfo) return null;
    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 50 }}>
            {debugInfo.scanZones?.map((z, i) => <rect key={`zone-${i}`} x={z.x} y={z.y} width={z.w} height={z.h} fill="rgba(0, 255, 255, 0.05)" stroke={z.label.includes('User') ? "lime" : "cyan"} strokeDasharray="4 2" />)}
            {debugInfo.rois?.map((r, i) => <rect key={`roi-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="rgba(255, 255, 0, 0.5)" strokeWidth="1" />)}
            {debugInfo.rowBoundaries.map((y, i) => <line key={`row-line-${i}`} x1="0" y1={y} x2={width} y2={y} stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1" strokeDasharray="2 2" />)}
            {debugInfo.colBoundaries.map((x, i) => <line key={`col-line-${i}`} x1={x} y1="0" x2={x} y2={height} stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1" strokeDasharray="2 2" />)}
            {debugInfo.points.map((p, i) => (
                <g key={`pt-${i}`}>
                    <circle cx={p.x} cy={p.y} r={Math.max(2, Math.min(width, height) * 0.01)} fill={p.filled ? "rgba(0, 255, 0, 0.8)" : "rgba(255, 0, 0, 0.3)"}/>
                </g>
            ))}
        </svg>
    );
};

export const StudentVerificationEditor = () => {
    const { activeProject, handleStudentSheetsChange, handleStudentInfoChange, uploadFilesRaw } = useProject();
    const { uploadedSheets, studentInfo: studentInfoList, template, areas } = activeProject!;

    const [draggedInfoIndex, setDraggedInfoIndex] = useState<number | null>(null);
    const [dragOverInfoIndex, setDragOverInfoIndex] = useState<number | null>(null);
    const [isSorting, setIsSorting] = useState(false);
    const [showDebugGrid, setShowDebugGrid] = useState(false);
    const [showMovedHighlight, setShowMovedHighlight] = useState(true);
    const [markThreshold, setMarkThreshold] = useState(130);
    const [debugInfos, setDebugInfos] = useState<Record<string, DetectionDebugInfo>>({}); // Key: "sheetId-pageIndex"
    const [sheetMessages, setSheetMessages] = useState<Record<string, string>>({}); // Key: sheetId
    const [detectedIds, setDetectedIds] = useState<Record<string, string>>({}); // Key: sheetId, Value: detected number string
    const [movedStudentIndices, setMovedStudentIndices] = useState<Set<number>>(new Set());
    
    // Manual assignment inputs for unmatched sheets
    const [manualAssignInputs, setManualAssignInputs] = useState<Record<string, { class: string, number: string }>>({});

    // Default to template pages, but allow user override for 1-sided template with 2-sided scans
    const [pagesPerStudentOverride, setPagesPerStudentOverride] = useState<number>(() => {
        return template?.pages?.length || 1;
    });

    // MEMO: Find ALL student ID areas (possibly on different pages)
    const studentIdAreas = useMemo(() => areas.filter(a => a.type === AreaType.STUDENT_ID_MARK), [areas]);

    const getRefsForArea = useCallback((targetArea: Area) => {
        const pageIdx = targetArea.pageIndex || 0;
        const refRight = areas.find(a => a.type === AreaType.STUDENT_ID_REF_RIGHT && (a.pageIndex || 0) === pageIdx);
        const refBottom = areas.find(a => a.type === AreaType.STUDENT_ID_REF_BOTTOM && (a.pageIndex || 0) === pageIdx);
        return { refRight, refBottom };
    }, [areas]);

    const pagesPerStudent = pagesPerStudentOverride;
    const numRows = Math.max(uploadedSheets.length, studentInfoList.length);

    // --- Image Manipulation Logic ---

    const handleReorderImages = (mode: 'interleaved' | 'stacked' | 'stacked-reverse') => {
        const flatImages: string[] = [];
        uploadedSheets.forEach(s => s.images.forEach(img => { if (img) flatImages.push(img); }));
        
        const P = pagesPerStudent;
        if (P <= 1) return;

        const N = flatImages.length;
        const S = Math.ceil(N / P);
        
        const newSheets: Student[] = [];

        if (mode === 'interleaved') {
            for (let i = 0; i < N; i += P) {
                const chunk = flatImages.slice(i, i + P);
                while (chunk.length < P) chunk.push(null);
                
                const sIdx = Math.floor(i / P);
                const existingSheet = uploadedSheets[sIdx];
                newSheets.push({
                    id: existingSheet ? existingSheet.id : `reordered-${Date.now()}-${sIdx}`,
                    originalName: existingSheet ? existingSheet.originalName : `Student ${sIdx + 1}`,
                    filePath: chunk[0],
                    images: chunk
                });
            }
        } else {
            for (let s = 0; s < S; s++) {
                const studentImages: (string | null)[] = [];
                for (let p = 0; p < P; p++) {
                    const stackStart = p * S;
                    let idx = stackStart + s;

                    if (mode === 'stacked-reverse' && p % 2 !== 0) {
                        idx = stackStart + (S - 1 - s);
                    }

                    studentImages.push(idx < N ? flatImages[idx] : null);
                }
                
                const existingSheet = uploadedSheets[s];
                newSheets.push({
                    id: existingSheet ? existingSheet.id : `stacked-${Date.now()}-${s}`,
                    originalName: existingSheet ? existingSheet.originalName : `Student ${s + 1}`,
                    filePath: studentImages[0],
                    images: studentImages
                });
            }
        }
        handleStudentSheetsChange(newSheets);
    };

    const handleChangeGrouping = (newStride: number) => {
        setPagesPerStudentOverride(newStride);
        const flatImages: (string | null)[] = [];
        uploadedSheets.forEach(s => flatImages.push(...s.images));
        
        const newSheets: Student[] = [];
        for (let i = 0; i < flatImages.length; i += newStride) {
            const chunk = flatImages.slice(i, i + newStride);
            while (chunk.length < newStride) chunk.push(null);
            
            const existingSheet = uploadedSheets[newSheets.length];
            newSheets.push({
                id: existingSheet ? existingSheet.id : `rebalanced-${Date.now()}-${i}`,
                originalName: existingSheet ? existingSheet.originalName : `Page ${i}`,
                filePath: chunk[0],
                images: chunk
            });
        }
        handleStudentSheetsChange(newSheets);
    };

    const handleShiftImages = (studentIndex: number, pageIndex: number, direction: 'forward' | 'backward') => {
        const flatImages: (string | null)[] = [];
        uploadedSheets.forEach(s => flatImages.push(...s.images));
        const globalIndex = studentIndex * pagesPerStudent + pageIndex;

        if (direction === 'forward') {
            flatImages.splice(globalIndex, 0, null);
        } else {
            flatImages.splice(globalIndex, 1);
        }
        
        const newSheets: Student[] = [];
        for (let i = 0; i < flatImages.length; i += pagesPerStudent) {
            const chunk = flatImages.slice(i, i + pagesPerStudent);
            while (chunk.length < pagesPerStudent) chunk.push(null);
            
            const existingSheet = uploadedSheets[newSheets.length];
            newSheets.push({
                id: existingSheet ? existingSheet.id : `shifted-${Date.now()}-${i}`,
                originalName: existingSheet ? existingSheet.originalName : `Page ${i}`,
                filePath: chunk[0],
                images: chunk
            });
        }
        handleStudentSheetsChange(newSheets);
    };

    const handleSwapPages = (studentIndex: number) => {
        const newSheets = [...uploadedSheets];
        const student = { ...newSheets[studentIndex] };
        if (student && student.images.length >= 2) {
            student.images = [...student.images].reverse();
            newSheets[studentIndex] = student;
            handleStudentSheetsChange(newSheets);
        }
    };

    const handleAppendSheets = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const files = Array.from(e.target.files) as File[];
        e.target.value = '';

        try {
            const processedFiles = await uploadFilesRaw(files);
            const newSheets: Student[] = [];
            for (let i = 0; i < processedFiles.length; i += pagesPerStudent) {
                const chunk = processedFiles.slice(i, i + pagesPerStudent);
                const images = chunk.map(f => f.path);
                while (images.length < pagesPerStudent) images.push(null);
                
                newSheets.push({
                    id: `appended-${Date.now()}-${i}`,
                    originalName: chunk[0].name,
                    filePath: images[0],
                    images: images
                });
            }

            const updatedSheets = [...uploadedSheets, ...newSheets];
            handleStudentSheetsChange(updatedSheets);
        } catch (err) {
            console.error(err);
            alert('ファイルの追加に失敗しました。');
        }
    };

    const handleManualAssign = (sheetIndex: number) => {
        const sheet = uploadedSheets[sheetIndex];
        if (!sheet) return;
        const input = manualAssignInputs[sheet.id];
        if (!input || !input.class || !input.number) return;

        const targetClass = input.class.trim();
        const targetNumber = input.number.trim();

        const targetStudentIndex = studentInfoList.findIndex(s => s.class === targetClass && s.number === targetNumber);

        if (targetStudentIndex === -1) {
            alert(`名簿に ${targetClass}組 ${targetNumber}番 の生徒が見つかりません。`);
            return;
        }

        const newSheets = [...uploadedSheets];
        while (newSheets.length <= targetStudentIndex) {
            newSheets.push({ id: `empty-fill-${newSheets.length}`, originalName: 'Empty', filePath: null, images: Array(pagesPerStudent).fill(null) });
        }

        const targetSheet = newSheets[targetStudentIndex];
        const targetHasImages = targetSheet && targetSheet.images.some(img => img !== null);
        
        if (targetHasImages) {
            if (!confirm(`${targetClass}組 ${targetNumber}番 には既に解答用紙が割り当てられています。入れ替えますか？`)) {
                return;
            }
        }

        newSheets[targetStudentIndex] = sheet;
        newSheets[sheetIndex] = targetSheet;

        handleStudentSheetsChange(newSheets);
        setManualAssignInputs(prev => {
            const next = { ...prev };
            delete next[sheet.id];
            return next;
        });
        setMovedStudentIndices(prev => new Set([...prev, targetStudentIndex]));
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

    const handleSortGlobal = async () => {
        if (studentIdAreas.length === 0) {
            alert('テンプレート編集画面で「学籍番号」エリアを設定してください。');
            return;
        }
        
        // 1. Flatten all current images (remove nulls to allow clean regrouping)
        const allImages = uploadedSheets.flatMap(s => s.images).filter((img): img is string => img !== null);
        if (allImages.length === 0) return;

        // 2. Regroup into chunks based on current pagesPerStudent setting
        const chunks: (string | null)[][] = [];
        for (let i = 0; i < allImages.length; i += pagesPerStudent) {
            const chunk = allImages.slice(i, i + pagesPerStudent);
            // Pad with null if the last chunk is incomplete
            while (chunk.length < pagesPerStudent) chunk.push(null);
            chunks.push(chunk);
        }

        if (chunks.length === 0) return;

        setIsSorting(true);
        setDebugInfos({}); 
        setMovedStudentIndices(new Set());
        setSheetMessages({}); // Clear previous messages
        setDetectedIds({}); // Clear detected IDs

        let matchCount = 0;
        let mismatchCount = 0;
        const newMovedIndices = new Set<number>();
        const newSheetMessages: Record<string, string> = {};
        const newDetectedIds: Record<string, string> = {};

        try {
            // 3. Analyze all ID areas in each chunk (multi-page scan)
            const analyzedChunks = await Promise.all(chunks.map(async (chunk) => {
                const detectedResults: number[][] = [];
                
                // Scan every defined ID area (could be on different pages)
                for (const area of studentIdAreas) {
                    const pIdx = area.pageIndex || 0;
                    const targetImage = chunk[pIdx];
                    if (targetImage) {
                        const { refRight, refBottom } = getRefsForArea(area);
                        const { indices } = await analyzeStudentIdMark(
                            targetImage, 
                            area, 
                            markThreshold, 
                            refRight, 
                            refBottom
                        );
                        if (indices) detectedResults.push(indices);
                    }
                }

                if (detectedResults.length === 0) return { chunk, indices: null };

                // Consistency Check: Ensure all detected IDs on different pages match
                // We compare the raw index arrays (e.g. [1, 2, 3] for ID 123)
                const firstIdStr = detectedResults[0].join(',');
                const isConsistent = detectedResults.every(res => res.join(',') === firstIdStr);

                if (!isConsistent) {
                    return { chunk, indices: null, isMismatch: true };
                }

                return { chunk, indices: detectedResults[0] }; // Use consistent ID
            }));

            const studentAssignedChunks: Record<number, { images: (string | null)[], detectedId: string }> = {};
            const unmatchedChunks: { chunk: (string | null)[], detectedId?: string }[] = [];

            analyzedChunks.forEach(({ chunk, indices, isMismatch }) => {
                if (isMismatch) {
                    mismatchCount++;
                    unmatchedChunks.push({ chunk }); // ID mismatch between pages
                    return;
                }

                let matchFound = false;
                let detectedIdStr = "";

                if (indices) {
                    const detectedId_TypeA = indices.map(i => i.toString()).join(''); 
                    const detectedId_TypeB = indices.map(i => ((i + 1) % 10).toString()).join(''); 
                    const candidates = [detectedId_TypeA, detectedId_TypeB];
                    
                    // Default best guess to TypeA
                    if (detectedId_TypeA.length >= 3) {
                        const markNumber = detectedId_TypeA.slice(-2);
                        const markClass = detectedId_TypeA.slice(0, -2);
                        detectedIdStr = `${markClass}-${markNumber}`;
                    }

                    // We try to match strictly.
                    // Assumed format: Last 2 digits = Number, Remaining prefix = Class.
                    
                    const matchIndex = studentInfoList.findIndex(info => {
                        const infoNum = info.number.replace(/[^0-9]/g, '');
                        const infoClass = info.class.replace(/[^0-9]/g, '');
                        
                        return candidates.some(detectedId => {
                            if (detectedId.length < 3) return false; // Need at least 1 digit for class + 2 for number
                            
                            const markNumber = detectedId.slice(-2);
                            const markClass = detectedId.slice(0, -2);
                            
                            // Pad roster number to 2 digits for comparison (e.g. "5" -> "05")
                            const paddedInfoNum = infoNum.padStart(2, '0');
                            const normalizedMarkNum = markNumber; // Assumes detection returns exact digits
                            
                            // Strict Match
                            const isNumMatch = parseInt(paddedInfoNum) === parseInt(normalizedMarkNum);
                            const isClassMatch = parseInt(infoClass) === parseInt(markClass);
                            
                            if (isNumMatch && isClassMatch) {
                                // If matched, use this format for display
                                detectedIdStr = `${markClass}-${markNumber}`;
                                return true;
                            }
                            return false;
                        });
                    });

                    if (matchIndex !== -1) {
                        studentAssignedChunks[matchIndex] = { images: chunk, detectedId: detectedIdStr };
                        matchFound = true;
                    }
                }
                
                if (!matchFound) {
                    unmatchedChunks.push({ chunk, detectedId: detectedIdStr });
                }
            });

            // 4. Construct new sheet list
            const newSheets: Student[] = studentInfoList.map((info, index) => {
                const assignment = studentAssignedChunks[index];
                
                if (assignment) {
                    matchCount++;
                    newMovedIndices.add(index);
                    const sheetId = `sorted-${info.id}-${Date.now()}`;
                    newDetectedIds[sheetId] = assignment.detectedId;
                    return {
                        id: sheetId,
                        originalName: `${info.class}-${info.number}`,
                        filePath: assignment.images[0],
                        images: assignment.images
                    };
                } else {
                    // Empty student
                    return {
                        id: `empty-${info.id}-${Date.now()}`,
                        originalName: 'Unassigned',
                        filePath: null,
                        images: Array(pagesPerStudent).fill(null)
                    };
                }
            });

            // 5. Append unmatched chunks at the end
            for (let i = 0; i < unmatchedChunks.length; i++) {
                const { chunk, detectedId } = unmatchedChunks[i];
                const sheetId = `unmatched-${Date.now()}-${i}`;
                newSheets.push({
                    id: sheetId,
                    originalName: 'Unmatched',
                    filePath: chunk[0],
                    images: chunk
                });
                if (detectedId) {
                    newSheetMessages[sheetId] = `名簿なし`;
                    newDetectedIds[sheetId] = detectedId;
                }
            }

            handleStudentSheetsChange(newSheets);
            setMovedStudentIndices(newMovedIndices);
            setSheetMessages(newSheetMessages);
            setDetectedIds(newDetectedIds);
            
            let message = `全画像をスキャンし、${matchCount}名の生徒の解答用紙を並べ替えました。`;
            if (mismatchCount > 0) {
                message += `\n\n⚠️ ${mismatchCount}件の不整合が見つかりました。\n(ページ間で学籍番号が一致しないため、未割り当てとして扱いました)`;
            }
            const notFoundCount = unmatchedChunks.length - mismatchCount;
            if (notFoundCount > 0) {
                message += `\n\n⚠️ ${notFoundCount}件の名簿未登録IDが見つかりました。\n一番下の「未割り当て」リストを確認してください。`;
            }
            alert(message);

        } catch (error) {
            console.error("Sorting error:", error);
            alert("並べ替え中にエラーが発生しました。");
        } finally {
            setIsSorting(false);
        }
    };

    const handleRefreshDebug = async () => {
        if (studentIdAreas.length === 0) return;
        const newDebugInfos: Record<string, DetectionDebugInfo> = {};
        for (const sheet of uploadedSheets) {
            for (const area of studentIdAreas) {
                const pIdx = area.pageIndex || 0;
                const targetImage = sheet.images[pIdx];
                if (targetImage) {
                    const { refRight, refBottom } = getRefsForArea(area);
                    const { debugInfo } = await analyzeStudentIdMark(
                        targetImage, 
                        area,
                        markThreshold,
                        refRight,
                        refBottom
                    );
                    // Store debug info with page index as key suffix to handle multi-page visualization
                    newDebugInfos[`${sheet.id}-${pIdx}`] = debugInfo;
                }
            }
        }
        setDebugInfos(newDebugInfos);
    };

    useEffect(() => {
        if (showDebugGrid && studentIdAreas.length > 0) {
            const timeout = setTimeout(handleRefreshDebug, 500);
            return () => clearTimeout(timeout);
        }
    }, [markThreshold, showDebugGrid, studentIdAreas]);

    return (
         <div className="w-full space-y-4 flex flex-col h-full">
            <div className="flex-shrink-0 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">生徒情報と解答用紙の照合・修正</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">左右のリストをドラッグして順序を調整し、ズレを修正してください。</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md">
                        <span className="text-xs text-slate-500 font-bold whitespace-nowrap">1人あたりの枚数:</span>
                        <div className="flex gap-1">
                            {[1, 2, 3].map(num => (
                                <button 
                                    key={num} 
                                    onClick={() => handleChangeGrouping(num)}
                                    className={`px-2 py-0.5 text-xs rounded border ${pagesPerStudent === num ? 'bg-sky-500 text-white border-sky-500' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'}`}
                                >
                                    {num}枚
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    {pagesPerStudent > 1 && (
                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md">
                            <span className="text-xs text-slate-500 font-bold whitespace-nowrap">並び順:</span>
                            <div className="flex gap-1">
                                <button 
                                    onClick={() => handleReorderImages('interleaved')} 
                                    className="px-2 py-0.5 text-xs rounded border bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50"
                                    title="例: 1人目の1枚目, 2枚目, 2人目の1枚目, 2枚目..."
                                >
                                    1人ずつ
                                </button>
                                <button 
                                    onClick={() => handleReorderImages('stacked')} 
                                    className="px-2 py-0.5 text-xs rounded border bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50"
                                    title="例: 全員の1枚目(正順), 全員の2枚目(正順)..."
                                >
                                    ページごと
                                </button>
                                <button 
                                    onClick={() => handleReorderImages('stacked-reverse')} 
                                    className="px-2 py-0.5 text-xs rounded border bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50"
                                    title="例: 全員の1枚目(正順), 全員の2枚目(逆順)... (ADF両面スキャン時などに使用)"
                                >
                                    ページごと(裏逆)
                                </button>
                            </div>
                        </div>
                    )}

                    {studentIdAreas.length === 0 && (
                        <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                            <AlertCircleIcon className="w-3 h-3"/>
                            テンプレートで「学籍番号」エリアを設定してください
                        </div>
                    )}
                    {studentIdAreas.length > 0 && (
                        <>
                            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md">
                                <span className="text-xs text-slate-500 font-bold whitespace-nowrap">濃さ:</span>
                                <input 
                                    type="range" 
                                    min="50" max="220" 
                                    value={markThreshold} 
                                    onChange={e => setMarkThreshold(Number(e.target.value))}
                                    className="w-16 accent-sky-600"
                                />
                            </div>
                            <button 
                                onClick={() => setShowDebugGrid(!showDebugGrid)} 
                                className={`p-2 rounded-md ${showDebugGrid ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-400'}`}
                                title="認識位置を表示"
                            >
                                <BoxSelectIcon className="w-4 h-4"/>
                            </button>
                            <button 
                                onClick={() => setShowMovedHighlight(!showMovedHighlight)} 
                                className={`p-2 rounded-md ${showMovedHighlight ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'}`}
                                title="移動した生徒を強調表示"
                            >
                                <CheckCircle2Icon className="w-4 h-4"/>
                            </button>
                            <button 
                                onClick={handleSortGlobal} 
                                disabled={isSorting}
                                className="flex items-center space-x-2 px-3 py-2 text-sm bg-purple-600 text-white hover:bg-purple-500 rounded-md transition-colors disabled:opacity-50"
                                title="全画像をスキャンし、学籍番号マークに基づいて再配置・グループ化します"
                            >
                                {isSorting ? <SpinnerIcon className="w-4 h-4"/> : <SparklesIcon className="w-4 h-4"/>}
                                <span>{isSorting ? '読取中...' : '全自動並べ替え'}</span>
                            </button>
                        </>
                    )}
                    <label className="flex items-center space-x-2 px-3 py-2 text-sm bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors cursor-pointer">
                        <PlusIcon className="w-4 h-4" />
                        <span>解答用紙を追加</span>
                        <input type="file" multiple className="hidden" onChange={handleAppendSheets} accept="image/*,application/pdf" />
                    </label>
                </div>
            </div>
            
             <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md">
                <div className="flex gap-4 min-w-[800px]">
                    {/* Left Column: Answer Sheets */}
                    <div className="flex-[2] flex flex-col gap-2">
                        <div className="h-10 flex items-center justify-center font-semibold text-center bg-slate-200 dark:bg-slate-700 rounded-md sticky top-0 z-10">解答用紙 ({uploadedSheets.length}) - ページ調整</div>
                        {Array.from({ length: Math.max(uploadedSheets.length, numRows) }).map((_, studentIdx) => {
                            const sheet = uploadedSheets[studentIdx];
                            const isMoved = showMovedHighlight && movedStudentIndices.has(studentIdx);
                            const errorMessage = sheet ? sheetMessages[sheet.id] : null;
                            const isUnassigned = studentIdx >= studentInfoList.length;
                            const showAssignForm = isUnassigned && sheet && sheet.images.some(i => i !== null);
                            const detectedId = sheet ? detectedIds[sheet.id] : null;
                            
                            // Mock area for full page display
                            const fullPageArea = (pageIdx: number): Area => {
                                const page = template?.pages?.[pageIdx] || template?.pages?.[0];
                                return {
                                    id: -1, name: 'Full Page', type: AreaType.ANSWER,
                                    x: 0, y: 0, width: page?.width || 500, height: page?.height || 700,
                                    pageIndex: pageIdx
                                };
                            };

                            return (
                                <div 
                                    key={sheet?.id || `empty-sheet-${studentIdx}`}
                                    className={`relative flex items-stretch gap-2 p-2 rounded-md border transition-all h-[140px] flex-shrink-0 ${
                                        isMoved 
                                            ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-500' 
                                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                                    }`}
                                >
                                    {detectedId && (
                                        <div className="absolute top-1 left-8 bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded border border-blue-200 font-mono font-bold z-10 shadow-sm pointer-events-none">
                                            ID: {detectedId}
                                        </div>
                                    )}
                                    {showAssignForm && (
                                        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded shadow border border-slate-300 dark:border-slate-600 z-10">
                                            <span className="text-[10px] font-bold text-slate-500">再割当:</span>
                                            <input 
                                                className="w-10 text-xs p-1 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" 
                                                placeholder="組"
                                                value={manualAssignInputs[sheet!.id]?.class || ''}
                                                onChange={e => setManualAssignInputs(p => ({...p, [sheet!.id]: {...(p[sheet!.id]||{number:''}), class: e.target.value}}))}
                                            />
                                            <input 
                                                className="w-10 text-xs p-1 border rounded bg-slate-50 dark:bg-slate-700 dark:border-slate-600" 
                                                placeholder="番"
                                                value={manualAssignInputs[sheet!.id]?.number || ''}
                                                onChange={e => setManualAssignInputs(p => ({...p, [sheet!.id]: {...(p[sheet!.id]||{class:''}), number: e.target.value}}))}
                                            />
                                            <button 
                                                onClick={() => handleManualAssign(studentIdx)}
                                                className="bg-sky-500 text-white text-xs px-2 py-1 rounded hover:bg-sky-600"
                                            >
                                                決定
                                            </button>
                                        </div>
                                    )}
                                    {errorMessage && (
                                        <div className="absolute top-0 right-0 left-0 z-20 bg-red-100 text-red-700 text-xs px-2 py-1 font-bold text-center border-b border-red-200">
                                            <AlertCircleIcon className="w-3 h-3 inline mr-1"/>
                                            {errorMessage}
                                        </div>
                                    )}
                                    <div className="w-6 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 border-r dark:border-slate-700 pr-2 gap-2">
                                        <div className="font-bold text-xs">{studentIdx + 1}</div>
                                        {isMoved && <CheckCircle2Icon className="w-4 h-4 text-orange-500" />}
                                        {pagesPerStudent >= 2 && (
                                            <button 
                                                onClick={() => handleSwapPages(studentIdx)} 
                                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500" 
                                                title="表裏を入れ替え"
                                            >
                                                <RotateCcwIcon className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    
                                    {/* Pages Strip */}
                                    <div className="flex-1 flex gap-2 overflow-x-auto">
                                        {Array.from({ length: pagesPerStudent }).map((_, pageIdx) => {
                                            const image = sheet?.images[pageIdx];
                                            
                                            // Determine target area for preview
                                            let targetArea = areas.find(a => a.type === AreaType.NAME && (a.pageIndex || 0) === pageIdx);
                                            // Fallback to ID mark if available on this page
                                            const idAreaForPage = studentIdAreas.find(a => (a.pageIndex || 0) === pageIdx);
                                            
                                            if (showDebugGrid && idAreaForPage) {
                                                targetArea = idAreaForPage;
                                            } else if (!targetArea && idAreaForPage) {
                                                targetArea = idAreaForPage;
                                            } else if (!targetArea) {
                                                targetArea = fullPageArea(pageIdx);
                                            }
                                            
                                            const isDebugTarget = (showDebugGrid && !!idAreaForPage && targetArea.type === AreaType.STUDENT_ID_MARK);
                                            const debugInfo = sheet && isDebugTarget ? debugInfos[`${sheet.id}-${pageIdx}`] : undefined;

                                            return (
                                                <div key={pageIdx} className="flex-1 min-w-[120px] flex flex-col gap-1">
                                                    <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
                                                        <span>Page {pageIdx + 1}</span>
                                                        <div className="flex gap-1">
                                                            <button onClick={() => handleShiftImages(studentIdx, pageIdx, 'backward')} className="hover:text-red-500" title="この画像を削除して、以降を前へ詰める">
                                                                <Trash2Icon className="w-3 h-3" />
                                                            </button>
                                                            <button onClick={() => handleShiftImages(studentIdx, pageIdx, 'forward')} className="hover:text-sky-500" title="ここに空白を挿入して、以降を後ろへずらす">
                                                                <ArrowRightIcon className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 relative bg-slate-100 dark:bg-slate-900 rounded overflow-hidden border border-slate-200 dark:border-slate-700 group">
                                                        {image ? (
                                                            <>
                                                                <AnswerSnippet 
                                                                    imageSrc={image} 
                                                                    area={targetArea} 
                                                                    template={template}
                                                                    padding={targetArea.type === AreaType.NAME ? 10 : 0} 
                                                                >
                                                                    {isDebugTarget && debugInfo && (
                                                                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                                                                            <GridOverlay debugInfo={debugInfo} width={targetArea.width} height={targetArea.height} />
                                                                        </div>
                                                                    )}
                                                                </AnswerSnippet>
                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                                                            </>
                                                        ) : (
                                                            <div className="flex items-center justify-center h-full text-xs text-slate-400">
                                                                (なし)
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Middle Connector */}
                    <div className="w-8 flex flex-col gap-2 items-center">
                        <div className="h-10 flex-shrink-0"></div> 
                        {Array.from({ length: numRows }).map((_, i) => (
                            <div key={i} className="h-[140px] flex items-center justify-center flex-shrink-0">
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
                                    className={`relative flex items-center gap-2 p-2 rounded-md border transition-all h-[140px] flex-shrink-0 ${
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
                                            <div className="flex-1 grid grid-cols-1 gap-2">
                                                <div className="flex gap-2">
                                                    <span className="text-xs text-slate-500 w-8">組</span>
                                                    <input type="text" value={info.class} onChange={(e) => handleInfoInputChange(index, 'class', e.target.value)} className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-sm"/>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="text-xs text-slate-500 w-8">番号</span>
                                                    <input type="text" value={info.number} onChange={(e) => handleInfoInputChange(index, 'number', e.target.value)} className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-sm"/>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="text-xs text-slate-500 w-8">氏名</span>
                                                    <input type="text" value={info.name} onChange={(e) => handleInfoInputChange(index, 'name', e.target.value)} className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-sm"/>
                                                </div>
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
