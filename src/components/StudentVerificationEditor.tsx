import React, { useState, useMemo, useEffect } from 'react';
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

// ... (Detection helper functions kept as is - analyzeStudentIdMark, findPeaksInProfile, checkFill, GridOverlay) ...
// Ensure these functions exist in the file scope as they were in the previous version.

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
            return { imageData: ctx.getImageData(sx, sy, sw, sh), sx, sy, sw, sh };
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
                const profile = getProjection(refCrop.imageData, 0, refCrop.sw, 0, refCrop.sh, 'row');
                rowCenters = findPeaksInProfile(profile, refCrop.sh, 0.30).map(y => (refCrop.sy + y) - mainCrop.sy);
                debugInfo.scanZones?.push({ x: refCrop.sx - mainCrop.sx, y: refCrop.sy - mainCrop.sy, w: refCrop.sw, h: refCrop.sh, label: 'User Ref Right' });
            }
        } else {
            const scanXStart = Math.floor(mainCrop.sw * 0.85);
            const profile = getProjection(mainCrop.imageData, scanXStart, mainCrop.sw, 0, mainCrop.sh, 'row');
            rowCenters = findPeaksInProfile(profile, mainCrop.sh, 0.35);
            debugInfo.scanZones?.push({ x: scanXStart, y: 0, w: mainCrop.sw - scanXStart, h: mainCrop.sh, label: 'Auto Ref Right' });
        }

        let colCenters: number[] = [];
        if (refBottomArea) {
            const refCrop = getCropData(refBottomArea);
            if (refCrop) {
                const profile = getProjection(refCrop.imageData, 0, refCrop.sw, 0, refCrop.sh, 'col');
                colCenters = findPeaksInProfile(profile, refCrop.sw, 0.30).map(x => (refCrop.sx + x) - mainCrop.sx);
                debugInfo.scanZones?.push({ x: refCrop.sx - mainCrop.sx, y: refCrop.sy - mainCrop.sy, w: refCrop.sw, h: refCrop.sh, label: 'User Ref Bottom' });
            }
        } else {
            const scanYStart = Math.floor(mainCrop.sh * 0.85);
            const profile = getProjection(mainCrop.imageData, 0, mainCrop.sw, scanYStart, mainCrop.sh, 'col');
            colCenters = findPeaksInProfile(profile, mainCrop.sw, 0.35);
            debugInfo.scanZones?.push({ x: 0, y: scanYStart, w: mainCrop.sw, h: mainCrop.sh - scanYStart, label: 'Auto Ref Bottom' });
        }

        if (rowCenters.length < 1) rowCenters = [mainCrop.sh / 6, mainCrop.sh / 2, mainCrop.sh * 5/6];
        if (colCenters.length < 1) for(let i=0; i<10; i++) colCenters.push(mainCrop.sw / 10 * i + mainCrop.sw / 20);

        const rowBoundaries: number[] = [];
        const colBoundaries: number[] = [];
        if (rowCenters.length > 0) {
            const firstStep = rowCenters.length > 1 ? (rowCenters[1] - rowCenters[0]) : (mainCrop.sh / rowCenters.length);
            rowBoundaries.push(Math.max(0, rowCenters[0] - firstStep/2));
            for(let i=0; i < rowCenters.length - 1; i++) rowBoundaries.push((rowCenters[i] + rowCenters[i+1]) / 2);
            rowBoundaries.push(mainCrop.sh);
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
            const cellTop = rowBoundaries[r]; const cellHeight = (rowBoundaries[r+1] || mainCrop.sh) - cellTop;
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
    const { activeProject, handleStudentSheetsChange, handleStudentInfoChange, handleStudentSheetsUpload } = useProject();
    const { uploadedSheets, studentInfo: studentInfoList, template, areas } = activeProject!;

    const [draggedInfoIndex, setDraggedInfoIndex] = useState<number | null>(null);
    const [dragOverInfoIndex, setDragOverInfoIndex] = useState<number | null>(null);
    const [isSorting, setIsSorting] = useState(false);
    const [showDebugGrid, setShowDebugGrid] = useState(false);
    const [showMovedHighlight, setShowMovedHighlight] = useState(true);
    const [markThreshold, setMarkThreshold] = useState(130);
    const [debugInfos, setDebugInfos] = useState<Record<string, DetectionDebugInfo>>({});
    const [movedStudentIndices, setMovedStudentIndices] = useState<Set<number>>(new Set());
    
    // Default to template pages, but allow user override for 1-sided template with 2-sided scans
    const [pagesPerStudentOverride, setPagesPerStudentOverride] = useState<number>(() => {
        // Simple heuristic: if we have roughly 2x images as students, default to 2?
        // But safe default is template pages.
        return template?.pages?.length || 1;
    });

    const studentIdArea = useMemo(() => areas.find(a => a.type === AreaType.STUDENT_ID_MARK), [areas]);
    const studentIdRefRight = useMemo(() => areas.find(a => a.type === AreaType.STUDENT_ID_REF_RIGHT), [areas]);
    const studentIdRefBottom = useMemo(() => areas.find(a => a.type === AreaType.STUDENT_ID_REF_BOTTOM), [areas]);

    const pagesPerStudent = pagesPerStudentOverride;
    const studentIdPageIdx = studentIdArea ? (studentIdArea.pageIndex || 0) : 0;

    const numRows = Math.max(uploadedSheets.length, studentInfoList.length);

    // --- Image Manipulation Logic ---

    // Reorder images for different scanning patterns
    const handleReorderImages = (mode: 'interleaved' | 'stacked' | 'stacked-reverse') => {
        const flatImages: string[] = [];
        uploadedSheets.forEach(s => s.images.forEach(img => { if (img) flatImages.push(img); }));
        
        const P = pagesPerStudent;
        if (P <= 1) return; // No difference for 1 page/student

        const N = flatImages.length;
        const S = Math.ceil(N / P);
        
        const newSheets: Student[] = [];

        if (mode === 'interleaved') {
            // Standard: Take P images for each student sequentially (1-1, 1-2, 2-1, 2-2...)
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
            // Stacked: Student s gets images [s, s+S, s+2S...]
            for (let s = 0; s < S; s++) {
                const studentImages: (string | null)[] = [];
                for (let p = 0; p < P; p++) {
                    const stackStart = p * S;
                    let idx = stackStart + s; // Default: forward order for this stack

                    // If 'stacked-reverse' mode and it's a "back" side page (assuming alternating 1st=front, 2nd=back)
                    // We treat odd index pages (1, 3...) as reversed stacks.
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
        // If we change stride, we usually assume interleaved re-balance from current state
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
        
        // Re-apply current grouping
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
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        // We use the context handler but we need to ensure it respects our current grouping
        await handleStudentSheetsUpload(files); 
        // Post-upload rebalance if override is active and differs from template logic is hard to inject here
        // without race conditions. We rely on user manually adjusting grouping if needed.
        e.target.value = '';
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
        if (!studentIdArea) {
            alert('テンプレート編集画面で「学籍番号」エリアを設定してください。');
            return;
        }
        // Collect ALL valid images from the current state
        const allImages = uploadedSheets.flatMap(s => s.images).filter(img => img !== null);
        if (allImages.length === 0) return;

        setIsSorting(true);
        setDebugInfos({}); 
        setMovedStudentIndices(new Set()); // Reset highlights

        let matchCount = 0;
        const newMovedIndices = new Set<number>();

        try {
            // 1. Analyze EVERY image independently
            const analyzedImages = await Promise.all(allImages.map(async (image) => {
                if (!image) return { image, indices: null };
                
                // We search for ID on every image using the ID area definition.
                // We ignore pageIndex here and apply the geometry to *every* image to check for marks.
                const { indices, debugInfo } = await analyzeStudentIdMark(
                    image, 
                    studentIdArea,
                    markThreshold,
                    studentIdRefRight, 
                    studentIdRefBottom
                );
                return { image, indices };
            }));

            // 2. Buckets for each student index
            const studentImageBuckets: Record<number, string[]> = {};
            const unmatchedImages: string[] = [];

            analyzedImages.forEach(({ image, indices }) => {
                if (!image) return;

                if (indices) {
                    // Try to match this detected ID to a student in the roster
                    const detectedId_TypeA = indices.map(i => i.toString()).join(''); 
                    const detectedId_TypeB = indices.map(i => ((i + 1) % 10).toString()).join(''); 
                    const candidates = [detectedId_TypeA, detectedId_TypeB];
                    
                    const matchIndex = studentInfoList.findIndex(info => {
                        return candidates.some(detectedId => {
                            const simpleCombined = (info.class + info.number).replace(/[^0-9]/g, '');
                            if (simpleCombined === detectedId) return true;
                            if (detectedId.length >= 3) {
                                const markNumber = detectedId.slice(-2); 
                                const markClassPart = detectedId.slice(0, -2); 
                                const infoNumStr = info.number.replace(/[^0-9]/g, '');
                                const infoNumPadded = infoNumStr.padStart(2, '0');
                                if (infoNumPadded !== markNumber) return false;
                                const infoClassNums = info.class.replace(/[^0-9]/g, '');
                                if (infoClassNums.includes(markClassPart)) return true;
                            }
                            return false;
                        });
                    });

                    if (matchIndex !== -1) {
                        if (!studentImageBuckets[matchIndex]) studentImageBuckets[matchIndex] = [];
                        studentImageBuckets[matchIndex].push(image);
                    } else {
                        unmatchedImages.push(image);
                    }
                } else {
                    unmatchedImages.push(image);
                }
            });

            // 3. Reconstruct Student objects using current grouping
            const newSheets: Student[] = studentInfoList.map((info, index) => {
                const assignedImages = studentImageBuckets[index] || [];
                
                const finalImages = [...assignedImages];
                while (finalImages.length < pagesPerStudent) finalImages.push(null);
                
                if (finalImages.length > pagesPerStudent) {
                    const excess = finalImages.splice(pagesPerStudent);
                    excess.forEach(img => { if(img) unmatchedImages.push(img) });
                }

                if (assignedImages.length > 0) {
                    matchCount++;
                    newMovedIndices.add(index);
                }

                return {
                    id: `sorted-${info.id}-${Date.now()}`,
                    originalName: `${info.class}-${info.number}`,
                    filePath: finalImages[0],
                    images: finalImages
                };
            });

            // 4. Append unmatched images as new rows
            for (let i = 0; i < unmatchedImages.length; i += pagesPerStudent) {
                const chunk = unmatchedImages.slice(i, i + pagesPerStudent);
                while (chunk.length < pagesPerStudent) chunk.push(null);
                newSheets.push({
                    id: `unmatched-${Date.now()}-${i}`,
                    originalName: 'Unmatched',
                    filePath: chunk[0],
                    images: chunk
                });
            }

            handleStudentSheetsChange(newSheets);
            setMovedStudentIndices(newMovedIndices);
            alert(`全画像をスキャンし、${matchCount}名の生徒の解答用紙を並べ替えました。`);

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

    useEffect(() => {
        if (showDebugGrid && studentIdArea) {
            const timeout = setTimeout(handleRefreshDebug, 500);
            return () => clearTimeout(timeout);
        }
    }, [markThreshold, showDebugGrid]);

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

                    {!studentIdArea && (
                        <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                            <AlertCircleIcon className="w-3 h-3"/>
                            テンプレートで「学籍番号」エリアを設定してください
                        </div>
                    )}
                    {studentIdArea && (
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
                            const debugInfo = sheet ? debugInfos[sheet.id] : undefined;
                            const isMoved = showMovedHighlight && movedStudentIndices.has(studentIdx);
                            
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
                                    className={`relative flex items-stretch gap-2 p-2 rounded-md border transition-all min-h-[140px] ${
                                        isMoved 
                                            ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-500' 
                                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                                    }`}
                                >
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
                                            
                                            // Determine the area to show
                                            // 1. Name area on this page?
                                            let targetArea = areas.find(a => a.type === AreaType.NAME && (a.pageIndex || 0) === pageIdx);
                                            // 2. ID area on this page?
                                            if (!targetArea) targetArea = areas.find(a => a.type === AreaType.STUDENT_ID_MARK && (a.pageIndex || 0) === pageIdx);
                                            // 3. Fallback to full page
                                            if (!targetArea) targetArea = fullPageArea(pageIdx);

                                            // If debug is on and we are on ID page, force ID area
                                            if (showDebugGrid && studentIdArea && studentIdArea.pageIndex === pageIdx) {
                                                targetArea = studentIdArea;
                                            }
                                            
                                            const isDebugTarget = (showDebugGrid && studentIdArea && studentIdArea.pageIndex === pageIdx);

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
                                                                    // Add more padding if it's the Name area to give context, but 0 for full page
                                                                    padding={targetArea.type === AreaType.NAME ? 10 : 0} 
                                                                >
                                                                    {isDebugTarget && debugInfo && (
                                                                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                                                                            <GridOverlay debugInfo={debugInfo} width={targetArea.width} height={targetArea.height} />
                                                                        </div>
                                                                    )}
                                                                </AnswerSnippet>
                                                                {/* Overlay Controls for easier access */}
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

                    {/* Right Column: Student Info (Fixed height matching the left side roughly, simplified) */}
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