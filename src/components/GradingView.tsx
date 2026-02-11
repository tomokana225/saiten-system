
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { AllScores, ScoreData, GradingFilter, Annotation, Point, Area } from '../types';
import { AreaType, ScoringStatus } from '../types';
import { callGeminiAPIBatch } from '../api/gemini';
import { QuestionSidebar } from './grading/QuestionSidebar';
import { GradingHeader } from './grading/GradingHeader';
import { StudentAnswerGrid } from './grading/StudentAnswerGrid';
import { AnnotationEditor } from './AnnotationEditor';
import { useProject } from '../context/ProjectContext';

const cropImage = async (imagePath: string, area: import('../types').Area): Promise<string> => {
    const result = await window.electronAPI.invoke('get-image-details', imagePath);
    if (!result.success || !result.details?.url) return '';
    const dataUrl = result.details.url;
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = area.width; canvas.height = area.height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
            resolve(canvas.toDataURL('image/png').split(',')[1]);
        };
        img.src = dataUrl;
    });
};

const findPeaks = (profile: number[], thresholdRatio = 0.35): number[] => {
    const peaks: number[] = [];
    let inPeak = false; let sum = 0; let mass = 0;
    const max = Math.max(...profile); const threshold = max * thresholdRatio;
    for (let i = 0; i < profile.length; i++) {
        if (profile[i] > threshold) {
            if (!inPeak) { inPeak = true; sum = 0; mass = 0; }
            sum += i * profile[i]; mass += profile[i];
        } else if (inPeak) {
            inPeak = false; if (mass > 0) peaks.push(sum / mass);
        }
    }
    if (inPeak && mass > 0) peaks.push(sum / mass);
    return peaks;
};

// Find the reference area that is most closely aligned with the target area
const findNearestAlignedRefArea = (target: Area, candidates: Area[], type: AreaType): Area | undefined => {
    const pageIndex = target.pageIndex || 0;
    const alignedCandidates = candidates.filter(c => c.type === type && (c.pageIndex || 0) === pageIndex);
    
    if (alignedCandidates.length === 0) return undefined;

    return alignedCandidates.sort((a, b) => {
        if (type === AreaType.MARKSHEET_REF_RIGHT) {
            // Must overlap vertically, find closest horizontally to the right
            const vOverlapA = Math.max(0, Math.min(target.y + target.height, a.y + a.height) - Math.max(target.y, a.y));
            const vOverlapB = Math.max(0, Math.min(target.y + target.height, b.y + b.height) - Math.max(target.y, b.y));
            if (vOverlapA > 0 && vOverlapB === 0) return -1;
            if (vOverlapB > 0 && vOverlapA === 0) return 1;
            return (a.x - target.x) - (b.x - target.x);
        } else {
            // Must overlap horizontally, find closest vertically below
            const hOverlapA = Math.max(0, Math.min(target.x + target.width, a.x + a.width) - Math.max(target.x, a.x));
            const hOverlapB = Math.max(0, Math.min(target.x + target.width, b.x + b.width) - Math.max(target.x, b.x));
            if (hOverlapA > 0 && hOverlapB === 0) return -1;
            if (hOverlapB > 0 && hOverlapA === 0) return 1;
            return (a.y - target.y) - (b.y - target.y);
        }
    })[0];
};

const analyzeMarkSheetSnippet = async (imagePath: string, area: Area, point: Point, refR?: Area, refB?: Area): Promise<{ index: number | number[], positions: {x:number,y:number}[] }> => {
    const result = await window.electronAPI.invoke('get-image-details', imagePath);
    if (!result.success || !result.details?.url) return { index: -1, positions: [] };
    const img = new Image(); img.src = result.details.url;
    await new Promise(r => img.onload = r);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);

    const getProj = (a: Area, dir: 'x' | 'y') => {
        const sx = Math.floor(a.x); const sy = Math.floor(a.y);
        const sw = Math.floor(a.width); const sh = Math.floor(a.height);
        if (sw <= 0 || sh <= 0) return [];
        const data = ctx.getImageData(sx, sy, sw, sh).data;
        const size = dir === 'x' ? sw : sh;
        const profile = new Array(size).fill(0);
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const idx = (y * sw + x) * 4;
                // Use a standard threshold for marker detection
                if ((0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2]) < 150) {
                    if (dir === 'x') profile[x]++; else profile[y]++;
                }
            }
        }
        return profile;
    };

    let options = point.markSheetOptions || 4;
    const isH = point.markSheetLayout === 'horizontal';
    let rows: number[] = [], cols: number[] = [];

    // 1. Determine Scan Grid from Reference Areas
    if (isH) {
        // Horizontal questions: Use Bottom markers for column centers, Answer Area for row center
        rows = [area.y + area.height / 2];
        if (refB) {
            const peaks = findPeaks(getProj(refB, 'x'));
            if (peaks.length > 0) {
                cols = peaks.map(px => refB.x + px);
                options = cols.length; // Override options based on detected markers
            }
        }
        if (cols.length === 0) {
            // Fallback to even distribution
            for(let i=0; i<options; i++) cols.push(area.x + (area.width/options) * (i+0.5));
        }
    } else {
        // Vertical questions: Use Right markers for row centers, Answer Area for column center
        cols = [area.x + area.width / 2];
        if (refR) {
            const peaks = findPeaks(getProj(refR, 'y'));
            if (peaks.length > 0) {
                rows = peaks.map(py => refR.y + py);
                options = rows.length; // Override options based on detected markers
            }
        }
        if (rows.length === 0) {
            // Fallback to even distribution
            for(let i=0; i<options; i++) rows.push(area.y + (area.height/options) * (i+0.5));
        }
    }

    // 2. Perform Fill Check at Grid Intersections
    const pos: {x:number,y:number}[] = [];
    const marks: number[] = [];
    const roi = 10; // Region of interest size in pixels
    for (let i = 0; i < options; i++) {
        const cx = isH ? cols[i] : cols[0];
        const cy = isH ? rows[0] : rows[i];
        pos.push({ x: cx, y: cy });
        
        let dark = 0;
        const data = ctx.getImageData(cx - roi/2, cy - roi/2, roi, roi).data;
        for(let k=0; k<data.length; k+=4) {
            if((0.299*data[k]+0.587*data[k+1]+0.114*data[k+2]) < 170) dark++;
        }
        
        // Threshold: 30% fill
        if (dark > (roi * roi * 0.30)) marks.push(i);
    }

    return { 
        index: marks.length === 1 ? marks[0] : marks.length > 1 ? marks : -1, 
        positions: pos 
    };
};

export const GradingView: React.FC<{ apiKey: string }> = ({ apiKey }) => {
    const { activeProject, studentsWithInfo, handleScoresChange } = useProject();
    const { template, areas, points, scores, aiSettings } = activeProject!;
    const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
    const [filter, setFilter] = useState<GradingFilter>('ALL');
    const [isGrading, setIsGrading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });

    const answerAreas = useMemo(() => areas.filter(a => a.type === AreaType.ANSWER || a.type === AreaType.MARK_SHEET), [areas]);

    const handleStartGrading = async (areaIds: number[]) => {
        setIsGrading(true);
        const validStudents = studentsWithInfo.filter(s => s.images.length > 0);
        const total = validStudents.length * areaIds.length;
        let current = 0;
        setProgress({ current, total, message: '採点準備中...' });

        for (const areaId of areaIds) {
            const area = areas.find(a => a.id === areaId)!;
            const point = points.find(p => p.id === areaId)!;
            const pageIdx = area.pageIndex || 0;

            if (area.type === AreaType.MARK_SHEET) {
                // AUTO DISCOVERY of reference areas aligned with this question
                let refR = findNearestAlignedRefArea(area, areas, AreaType.MARKSHEET_REF_RIGHT);
                let refB = findNearestAlignedRefArea(area, areas, AreaType.MARKSHEET_REF_BOTTOM);
                
                setProgress(p => ({ ...p, message: `${point.label} のマークを認識中...` }));

                for (const student of validStudents) {
                    const studentImage = student.images[pageIdx];
                    if (!studentImage) {
                        current++; continue;
                    }
                    
                    const res = await analyzeMarkSheetSnippet(studentImage, area, point, refR, refB);
                    const isCorrect = typeof res.index === 'number' && res.index === point.correctAnswerIndex;
                    
                    handleScoresChange(prev => ({
                        ...prev,
                        [student.id]: { 
                            ...prev[student.id], 
                            [areaId]: { 
                                status: isCorrect ? ScoringStatus.CORRECT : (res.index === -1 ? ScoringStatus.UNSCORED : ScoringStatus.INCORRECT), 
                                score: isCorrect ? point.points : 0, 
                                detectedPositions: res.positions, 
                                detectedMarkIndex: res.index 
                            }
                        }
                    }));
                    setProgress(p => ({ ...p, current: ++current }));
                }
            } else {
                const masterImage = template.pages[pageIdx].imagePath;
                const masterSnippet = await cropImage(masterImage, area);
                setProgress(p => ({ ...p, message: `${point.label} をAI採点中...` }));

                for (let i = 0; i < validStudents.length; i += aiSettings.batchSize) {
                    const batch = validStudents.slice(i, i + aiSettings.batchSize);
                    const studentSnippets = await Promise.all(batch.map(async s => ({ 
                        studentId: s.id, 
                        base64: await cropImage(s.images[pageIdx]!, area) 
                    })));
                    const res = await callGeminiAPIBatch(masterSnippet, studentSnippets, point, 'auto', '', aiSettings.gradingMode, aiSettings.aiModel);
                    if (res.results) {
                        handleScoresChange(prev => {
                            const next = { ...prev };
                            res.results.forEach((r: any) => { 
                                if(!next[r.studentId]) next[r.studentId] = {}; 
                                next[r.studentId][areaId] = { status: r.status, score: r.score }; 
                            });
                            return next;
                        });
                    }
                    current += batch.length; setProgress(p => ({ ...p, current }));
                }
            }
        }
        setIsGrading(false);
        setProgress({ current: 0, total: 0, message: '' });
    };

    if (!selectedAreaId && answerAreas.length > 0) setSelectedAreaId(answerAreas[0].id);

    return (
        <div className="flex h-full gap-4">
            <QuestionSidebar answerAreas={answerAreas} points={points} scores={scores} students={studentsWithInfo} selectedAreaId={selectedAreaId} onSelectArea={setSelectedAreaId} isDisabled={isGrading} />
            <main className="flex-1 flex flex-col gap-4 overflow-hidden">
                <GradingHeader selectedArea={answerAreas.find(a => a.id === selectedAreaId)} onStartAIGrading={() => selectedAreaId && handleStartGrading([selectedAreaId])} onStartMarkSheetGrading={() => selectedAreaId && handleStartGrading([selectedAreaId])} onStartAIGradingAll={() => handleStartGrading(answerAreas.filter(a => a.type === AreaType.ANSWER).map(a => a.id))} isGrading={isGrading} isGradingAll={false} progress={progress} filter={filter} onFilterChange={setFilter} apiKey={apiKey} columnCount={4} onColumnCountChange={() => {}} onBulkScore={() => {}} aiGradingMode="auto" onAiGradingModeChange={() => {}} answerFormat="" onAnswerFormatChange={() => {}} isImageEnhanced={false} onToggleImageEnhancement={() => {}} autoAlign={true} onToggleAutoAlign={() => {}} />
                <StudentAnswerGrid students={studentsWithInfo} selectedAreaId={selectedAreaId!} template={template} areas={areas} points={points} scores={scores} onScoreChange={(sid, aid, data) => handleScoresChange(prev => ({ ...prev, [sid]: { ...prev[sid], [aid]: { ...prev[sid]?.[aid], ...data } }}))} onStartAnnotation={() => {}} onPanCommit={() => {}} gradingStatus={{}} columnCount={4} focusedStudentId={null} onStudentFocus={() => {}} partialScoreInput="" correctedImages={{}} isImageEnhanced={false} autoAlign={true} />
            </main>
        </div>
    );
};
