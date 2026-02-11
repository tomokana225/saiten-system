
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
    if (!result.success || !result.details?.url) {
        console.error("Failed to get image data URL for cropping:", result.error);
        return '';
    }
    const dataUrl = result.details.url;
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = area.width;
            canvas.height = area.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Could not get canvas context'));
            ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
            resolve(canvas.toDataURL('image/png').split(',')[1]);
        };
        img.onerror = (err) => reject(err);
        img.src = dataUrl;
    });
};

const findPeaksInProfile = (profile: number[], thresholdRatio: number = 0.35): number[] => {
    const peaks: number[] = [];
    let inPeak = false; let peakSum = 0; let peakMass = 0;
    const maxVal = Math.max(...profile); const threshold = Math.max(5, maxVal * thresholdRatio);
    for (let i = 0; i < profile.length; i++) {
        const val = profile[i];
        if (val > threshold) {
            if (!inPeak) { inPeak = true; peakSum = 0; peakMass = 0; }
            peakSum += i * val; peakMass += val;
        } else {
            if (inPeak) { inPeak = false; if (peakMass > 0) peaks.push(peakSum / peakMass); }
        }
    }
    if (inPeak && peakMass > 0) peaks.push(peakSum / peakMass);
    return peaks;
};

const analyzeMarkSheetSnippetAdvanced = async (
    imagePath: string, 
    mainArea: Area, 
    point: Point, 
    refRightArea?: Area, 
    refBottomArea?: Area,
    markThreshold: number = 160
): Promise<{ index: number | number[], positions: {x: number, y: number}[] }> => {
    return new Promise(async (resolve) => {
        const result = await window.electronAPI.invoke('get-image-details', imagePath);
        if (!result.success || !result.details?.url) return resolve({ index: -1, positions: [] });
        
        const img = new Image();
        img.src = result.details.url;
        await new Promise((res) => { img.onload = res; img.onerror = res; });
        
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve({ index: -1, positions: [] });
        ctx.drawImage(img, 0, 0);

        const getProjection = (area: Area, direction: 'row' | 'col') => {
            const data = ctx.getImageData(area.x, area.y, area.width, area.height).data;
            const size = direction === 'row' ? area.height : area.width;
            const profile = new Array(size).fill(0);
            for (let y = 0; y < area.height; y++) {
                for (let x = 0; x < area.width; x++) {
                    const idx = (y * area.width + x) * 4;
                    const gray = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
                    if (gray < markThreshold) {
                        if (direction === 'row') profile[y]++; else profile[x]++;
                    }
                }
            }
            return profile;
        };

        const options = point.markSheetOptions || 4;
        const isHorizontal = point.markSheetLayout === 'horizontal';
        
        // 1. Determine Grid Coordinates
        let rowCenters: number[] = [];
        let colCenters: number[] = [];

        if (isHorizontal) {
            // Horizontal layout: usually 1 row, multiple columns
            rowCenters = [mainArea.y + mainArea.height / 2];
            if (refBottomArea) {
                const profile = getProjection(refBottomArea, 'col');
                colCenters = findPeaksInProfile(profile, 0.3).map(x => refBottomArea.x + x);
            } else {
                for(let i=0; i<options; i++) colCenters.push(mainArea.x + (mainArea.width / options) * (i + 0.5));
            }
        } else {
            // Vertical layout: multiple rows, 1 column
            colCenters = [mainArea.x + mainArea.width / 2];
            if (refRightArea) {
                const profile = getProjection(refRightArea, 'row');
                rowCenters = findPeaksInProfile(profile, 0.3).map(y => refRightArea.y + y);
            } else {
                for(let i=0; i<options; i++) rowCenters.push(mainArea.y + (mainArea.height / options) * (i + 0.5));
            }
        }

        // Ensure we have correct number of centers
        if (!isHorizontal && rowCenters.length !== options) {
            rowCenters = []; for(let i=0; i<options; i++) rowCenters.push(mainArea.y + (mainArea.height / options) * (i + 0.5));
        }
        if (isHorizontal && colCenters.length !== options) {
            colCenters = []; for(let i=0; i<options; i++) colCenters.push(mainArea.x + (mainArea.width / options) * (i + 0.5));
        }

        // 2. Sample Each Point
        const scanPositions: {x: number, y: number}[] = [];
        const darknessScores: number[] = [];
        const roiSize = 6;

        for (let i = 0; i < options; i++) {
            const cx = isHorizontal ? colCenters[i] : colCenters[0];
            const cy = isHorizontal ? rowCenters[0] : rowCenters[i];
            scanPositions.push({ x: cx, y: cy });

            let darkCount = 0;
            const roiData = ctx.getImageData(cx - roiSize/2, cy - roiSize/2, roiSize, roiSize).data;
            for(let k=0; k < roiData.length; k+=4) {
                const gray = 0.299 * roiData[k] + 0.587 * roiData[k+1] + 0.114 * roiData[k+2];
                if (gray < markThreshold) darkCount++;
            }
            darknessScores.push(darkCount);
        }

        // 3. Evaluate results
        const marks: number[] = [];
        const fillThreshold = (roiSize * roiSize) * 0.3; // 30% fill
        darknessScores.forEach((s, idx) => { if (s > fillThreshold) marks.push(idx); });

        if (marks.length === 1) resolve({ index: marks[0], positions: scanPositions });
        else if (marks.length > 1) resolve({ index: marks, positions: scanPositions });
        else resolve({ index: -1, positions: scanPositions });
    });
};

interface GradingViewProps {
    apiKey: string;
}

export const GradingView: React.FC<GradingViewProps> = ({ apiKey }) => {
    const { activeProject, studentsWithInfo, handleScoresChange } = useProject();
    const { template, areas, points, scores, aiSettings } = activeProject!;

    const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
    const [filter, setFilter] = useState<GradingFilter>('ALL');
    const [columnCount, setColumnCount] = useState(4);
    
    const [isGrading, setIsGrading] = useState(false);
    const [isGradingAll, setIsGradingAll] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });

    const [correctedImages, setCorrectedImages] = useState<Record<string, string>>({});

    const [annotatingStudent, setAnnotatingStudent] = useState<{ studentId: string, areaId: number } | null>(null);
    const [focusedStudentId, setFocusedStudentId] = useState<string | null>(null);
    const [partialScoreInput, setPartialScoreInput] = useState('');

    const [aiGradingMode, setAiGradingMode] = useState<'auto' | 'strict'>('auto');
    const [answerFormat, setAnswerFormat] = useState('');
    const [isImageEnhanced, setIsImageEnhanced] = useState(false);
    const [autoAlign, setAutoAlign] = useState(false);

    const answerAreas = useMemo(() => areas.filter(a => a.type === AreaType.ANSWER || a.type === AreaType.MARK_SHEET), [areas]);

    useEffect(() => {
        if (answerAreas.length > 0 && !selectedAreaId) {
            setSelectedAreaId(answerAreas[0].id);
        }
    }, [answerAreas, selectedAreaId]);
    

    const updateScore = useCallback((studentId: string, areaId: number, newScoreData: Partial<ScoreData>) => {
        handleScoresChange(prevScores => {
            const studentScores = prevScores[studentId] || {};
            const existingScoreData = studentScores[areaId] || { status: ScoringStatus.UNSCORED, score: null };
            return {
                ...prevScores,
                [studentId]: { ...studentScores, [areaId]: { ...existingScoreData, ...newScoreData } },
            };
        });
    }, [handleScoresChange]);

    const filteredStudents = useMemo(() => {
        if (!selectedAreaId) return studentsWithInfo;
        if (filter === 'ALL') return studentsWithInfo;
        if (filter === 'SCORED') return studentsWithInfo.filter(s => scores[s.id]?.[selectedAreaId!]?.status && scores[s.id]?.[selectedAreaId!]?.status !== ScoringStatus.UNSCORED);
        return studentsWithInfo.filter(s => (scores[s.id]?.[selectedAreaId!]?.status || ScoringStatus.UNSCORED) === filter);
    }, [studentsWithInfo, filter, scores, selectedAreaId]);

    useEffect(() => {
        setFocusedStudentId(null);
    }, [selectedAreaId, filter]);

    const handleStartGrading = async (areaIds: number[]) => {
        const isGradingAllMode = areaIds.length > 1;
        if(isGradingAllMode) setIsGradingAll(true);
        else setIsGrading(true);
        
        const studentsToGrade = studentsWithInfo.filter(s => s.images && s.images.length > 0);
        const totalGradingTasks = studentsToGrade.length * areaIds.length;
        let completedTasks = 0;
        setProgress({ current: 0, total: totalGradingTasks, message: '準備中...' });

        const templatePages = template.pages || (template.filePath ? [{ imagePath: template.filePath, width: template.width, height: template.height }] : []);

        for (const areaId of areaIds) {
            const area = areas.find(a => a.id === areaId);
            const point = points.find(p => p.id === areaId);
            if (!area || !point) {
                 completedTasks += studentsToGrade.length;
                 setProgress(p => ({ ...p, current: completedTasks }));
                 continue;
            }

            const pageIndex = area.pageIndex || 0;
            const masterImage = templatePages[pageIndex]?.imagePath;

            setProgress(p => ({ ...p, message: `問題「${point.label}」を採点中...` }));

            if (area.type === AreaType.MARK_SHEET) {
                const refRight = point.markRefRightAreaId ? areas.find(a => a.id === point.markRefRightAreaId) : undefined;
                const refBottom = point.markRefBottomAreaId ? areas.find(a => a.id === point.markRefBottomAreaId) : undefined;

                const updates: { studentId: string; areaId: number; scoreData: ScoreData }[] = [];
                for (const student of studentsToGrade) {
                    const studentImage = student.images[pageIndex];
                    if (!studentImage) continue;
                    
                    const { index: detectedIndex, positions } = await analyzeMarkSheetSnippetAdvanced(
                        studentImage, area, point, refRight, refBottom
                    );
                    
                    let status = ScoringStatus.INCORRECT;
                    if (typeof detectedIndex === 'number' && detectedIndex === point.correctAnswerIndex) status = ScoringStatus.CORRECT;
                        
                    const score = status === ScoringStatus.CORRECT ? point.points : 0;
                    updates.push({ studentId: student.id, areaId, scoreData: { status, score, detectedMarkIndex: detectedIndex, detectedPositions: positions }});
                    completedTasks++;
                    setProgress(p => ({ ...p, current: completedTasks }));
                }
                 handleScoresChange(prevScores => {
                    const newScores = { ...prevScores };
                    updates.forEach(({studentId, areaId, scoreData}) => {
                        if (!newScores[studentId]) newScores[studentId] = {};
                        newScores[studentId][areaId] = scoreData;
                    });
                    return newScores;
                });

            } else { 
                if (!masterImage) { completedTasks += studentsToGrade.length; setProgress(p => ({ ...p, current: completedTasks })); continue; }
                const masterSnippet = await cropImage(masterImage, area);
                if (!masterSnippet) { completedTasks += studentsToGrade.length; setProgress(p => ({ ...p, current: completedTasks })); continue; }
                const studentSnippets = await Promise.all(
                    studentsToGrade.map(async (student) => ({ studentId: student.id, base64: student.images[pageIndex] ? await cropImage(student.images[pageIndex]!, area) : null }))
                );
                const validSnippets = studentSnippets.filter(s => s.base64 !== null) as { studentId: string, base64: string }[];

                for (let i = 0; i < validSnippets.length; i += aiSettings.batchSize) {
                    const batch = validSnippets.slice(i, i + aiSettings.batchSize);
                    const result = await callGeminiAPIBatch(masterSnippet, batch, point, aiGradingMode, answerFormat, aiSettings.gradingMode, aiSettings.aiModel || 'gemini-3-flash-preview');
                    if (result.results) {
                        handleScoresChange(prevScores => {
                            const newScores = { ...prevScores };
                            result.results.forEach((res: any) => { if (!newScores[res.studentId]) newScores[res.studentId] = {}; newScores[res.studentId][areaId] = { status: res.status, score: res.score }; });
                            return newScores;
                        });
                    }
                    completedTasks += batch.length;
                    setProgress(p => ({ ...p, current: completedTasks }));
                }
            }
        }
        if(isGradingAllMode) setIsGradingAll(false); else setIsGrading(false);
        setProgress({ current: 0, total: 0, message: '' });
    };

    const handleStartAIGrading = () => { if (selectedAreaId) handleStartGrading([selectedAreaId]); };
    const handleStartAIGradingAll = () => {
        const idsToGrade = answerAreas.filter(a => a.type === AreaType.ANSWER).map(a => a.id);
        if (idsToGrade.length > 0) handleStartGrading(idsToGrade);
    };
    const handleStartMarkSheetGrading = () => { if (selectedAreaId) handleStartGrading([selectedAreaId]); };
    
    const handleBulkScore = (status: ScoringStatus.CORRECT | ScoringStatus.INCORRECT) => {
        if (!selectedAreaId) return;
        const point = points.find(p => p.id === selectedAreaId);
        if (!point) return;
        const score = status === ScoringStatus.CORRECT ? point.points : 0;
        handleScoresChange(prevScores => {
            const newScores = { ...prevScores };
            filteredStudents.forEach(student => {
                if (!newScores[student.id]) newScores[student.id] = {};
                newScores[student.id][selectedAreaId] = { status, score };
            });
            return newScores;
        });
    };

    const handleSaveAnnotations = (annotations: Annotation[]) => {
        if (annotatingStudent) updateScore(annotatingStudent.studentId, annotatingStudent.areaId, { annotations });
        setAnnotatingStudent(null);
    };

    const handlePanCommit = (studentId: string, areaId: number, offset: {x: number, y: number}) => {
        updateScore(studentId, areaId, { manualPanOffset: offset });
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (annotatingStudent || (e.target as HTMLElement).tagName.match(/INPUT|TEXTAREA/)) return;
            if (!focusedStudentId || !selectedAreaId) return;
            const area = areas.find(a => a.id === selectedAreaId);
            const pageIndex = area?.pageIndex || 0;
            const isStudentValid = (idx: number) => { if (idx < 0 || idx >= filteredStudents.length) return false; const s = filteredStudents[idx]; return s && s.images && !!s.images[pageIndex]; };
            const findNextValid = (startIndex: number): number => { for (let i = startIndex; i < filteredStudents.length; i++) if (isStudentValid(i)) return i; return -1; };
            const findPrevValid = (startIndex: number): number => { for (let i = startIndex; i >= 0; i--) if (isStudentValid(i)) return i; return -1; };
            const currentIndex = filteredStudents.findIndex(s => s.id === focusedStudentId);
            if (currentIndex === -1) return;
            let nextIndex = -1;
            switch (e.key) {
                case 'ArrowRight': nextIndex = findNextValid(currentIndex + 1); if (nextIndex === -1) nextIndex = currentIndex; break;
                case 'ArrowLeft': nextIndex = findPrevValid(currentIndex - 1); if (nextIndex === -1) nextIndex = currentIndex; break;
                case 'ArrowDown': { const targetIndex = currentIndex + columnCount; if (targetIndex < filteredStudents.length) nextIndex = isStudentValid(targetIndex) ? targetIndex : findNextValid(targetIndex); else nextIndex = currentIndex; break; }
                case 'ArrowUp': { const targetIndex = currentIndex - columnCount; if (targetIndex >= 0) nextIndex = isStudentValid(targetIndex) ? targetIndex : findPrevValid(targetIndex); else nextIndex = currentIndex; break; }
                case 'j': case 'J': updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.CORRECT, score: points.find(p => p.id === selectedAreaId)?.points || 0 }); nextIndex = findNextValid(currentIndex + 1); break;
                case 'f': case 'F': updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.INCORRECT, score: 0 }); nextIndex = findNextValid(currentIndex + 1); break;
                case 'a': case 'A': e.preventDefault(); setAnnotatingStudent({ studentId: focusedStudentId, areaId: selectedAreaId }); break;
                case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9': {
                    e.preventDefault(); const newInput = partialScoreInput + e.key; const maxPoints = points.find(p => p.id === selectedAreaId)?.points || 0;
                    updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.PARTIAL, score: Math.min(parseInt(newInput, 10), maxPoints) }); setPartialScoreInput(newInput); break;
                }
                case 'Backspace': {
                    e.preventDefault(); const croppedInput = partialScoreInput.slice(0, -1); setPartialScoreInput(croppedInput);
                    const maxPoints = points.find(p => p.id === selectedAreaId)?.points || 0;
                    if (croppedInput === '') updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.PARTIAL, score: null });
                    else updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.PARTIAL, score: Math.min(parseInt(croppedInput, 10), maxPoints) }); break;
                }
                case 'Enter': if (partialScoreInput) { setPartialScoreInput(''); nextIndex = findNextValid(currentIndex + 1); } break;
                default: return;
            }
            if (nextIndex !== -1 && nextIndex !== currentIndex && nextIndex < filteredStudents.length) {
                e.preventDefault(); const nextStudentId = filteredStudents[nextIndex].id; setFocusedStudentId(nextStudentId);
                document.getElementById(`student-card-${nextStudentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedStudentId, selectedAreaId, filteredStudents, columnCount, updateScore, partialScoreInput, points, annotatingStudent, areas]);

    useEffect(() => { setPartialScoreInput(''); }, [focusedStudentId]);

    const annotatingStudentData = useMemo(() => {
        if (!annotatingStudent) return null;
        const student = studentsWithInfo.find(s => s.id === annotatingStudent.studentId);
        const area = areas.find(a => a.id === annotatingStudent.areaId);
        const initialAnnotations = scores[annotatingStudent.studentId]?.[annotatingStudent.areaId]?.annotations || [];
        if (!student || !area) return null;
        return { student, area, initialAnnotations };
    }, [annotatingStudent, studentsWithInfo, areas, scores]);

    if (!selectedAreaId) return <div className="flex items-center justify-center h-full">問題を選択してください。</div>;

    return (
        <div className="flex h-full gap-4">
            <QuestionSidebar answerAreas={answerAreas} points={points} scores={scores} students={studentsWithInfo} selectedAreaId={selectedAreaId} onSelectArea={setSelectedAreaId} isDisabled={isGrading || isGradingAll} />
            <main className="flex-1 flex flex-col gap-4 overflow-hidden">
                <GradingHeader selectedArea={answerAreas.find(a => a.id === selectedAreaId)} onStartAIGrading={handleStartAIGrading} onStartMarkSheetGrading={handleStartMarkSheetGrading} onStartAIGradingAll={handleStartAIGradingAll} isGrading={isGrading} isGradingAll={isGradingAll} progress={progress} filter={filter} onFilterChange={setFilter} apiKey={apiKey} columnCount={columnCount} onColumnCountChange={setColumnCount} onBulkScore={handleBulkScore} aiGradingMode={aiGradingMode} onAiGradingModeChange={setAiGradingMode} answerFormat={answerFormat} onAnswerFormatChange={setAnswerFormat} isImageEnhanced={isImageEnhanced} onToggleImageEnhancement={() => setIsImageEnhanced(!isImageEnhanced)} autoAlign={autoAlign} onToggleAutoAlign={() => setAutoAlign(!autoAlign)} />
                <StudentAnswerGrid students={filteredStudents} selectedAreaId={selectedAreaId} template={template} areas={areas} points={points} scores={scores} onScoreChange={updateScore} onStartAnnotation={(studentId, areaId) => setAnnotatingStudent({ studentId, areaId })} onPanCommit={handlePanCommit} gradingStatus={{}} columnCount={columnCount} focusedStudentId={focusedStudentId} onStudentFocus={setFocusedStudentId} partialScoreInput={partialScoreInput} correctedImages={correctedImages} isImageEnhanced={isImageEnhanced} autoAlign={autoAlign} />
            </main>
            {annotatingStudentData && (
                 <AnnotationEditor student={annotatingStudentData.student} area={annotatingStudentData.area} template={template!} initialAnnotations={annotatingStudentData.initialAnnotations} onSave={handleSaveAnnotations} onClose={() => setAnnotatingStudent(null)} />
            )}
        </div>
    );
};
