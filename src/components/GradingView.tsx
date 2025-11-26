import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { AllScores, ScoreData, GradingFilter, Annotation, Point } from '../types';
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

const analyzeMarkSheetSnippet = async (base64: string, point: Point): Promise<number> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return resolve(-1);
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const data = imageData.data;

            const options = point.markSheetOptions || 4;
            const isHorizontal = point.markSheetLayout === 'horizontal';
            const segmentWidth = isHorizontal ? img.width / options : img.width;
            const segmentHeight = isHorizontal ? img.height : img.height / options;
            const darkness = Array(options).fill(0);
            
            const darknessThreshold = 128; 

            for (let i = 0; i < options; i++) {
                const xStart = Math.floor(isHorizontal ? i * segmentWidth : 0);
                const yStart = Math.floor(isHorizontal ? 0 : i * segmentHeight);
                const xEnd = Math.ceil(xStart + segmentWidth);
                const yEnd = Math.ceil(yStart + segmentHeight);

                let darkPixelCount = 0;
                for (let y = yStart; y < yEnd; y++) {
                    for (let x = xStart; x < xEnd; x++) {
                        const idx = (y * img.width + x) * 4;
                        if (idx > data.length - 4) continue;
                        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                        if (gray < darknessThreshold) {
                            darkPixelCount++;
                        }
                    }
                }
                darkness[i] = darkPixelCount;
            }
            
            let darkestIndex = -1, maxDarkness = -1;
            darkness.forEach((d, i) => { if (d > maxDarkness) { maxDarkness = d; darkestIndex = i; } });
            
            const totalPixelsPerSegment = segmentWidth * segmentHeight;
            if (maxDarkness < totalPixelsPerSegment * 0.02) {
                resolve(-1); // No clear mark detected
            } else {
                resolve(darkestIndex);
            }
        };
        img.onerror = () => resolve(-1);
        img.src = `data:image/png;base64,${base64}`;
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
        // When the selected question or the filter changes, reset the focus
        // to the first student in the list to facilitate keyboard grading.
        if (filteredStudents.length > 0) {
            const firstStudentId = filteredStudents[0].id;
            setFocusedStudentId(firstStudentId);
            // Use a timeout to ensure the DOM has updated before scrolling.
            setTimeout(() => {
                document.getElementById(`student-card-${firstStudentId}`)?.scrollIntoView({ block: 'nearest' });
            }, 0);
        } else {
            setFocusedStudentId(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAreaId, filter]);

    const handleStartGrading = async (areaIds: number[]) => {
        const isGradingAllMode = areaIds.length > 1;
        if(isGradingAllMode) setIsGradingAll(true);
        else setIsGrading(true);
        
        const studentsToGrade = studentsWithInfo.filter(s => s.filePath);
        const totalGradingTasks = studentsToGrade.length * areaIds.length;
        let completedTasks = 0;
        setProgress({ current: 0, total: totalGradingTasks, message: '準備中...' });

        for (const areaId of areaIds) {
            const area = areas.find(a => a.id === areaId);
            const point = points.find(p => p.id === areaId);
            if (!area || !point) {
                 completedTasks += studentsToGrade.length;
                 setProgress(p => ({ ...p, current: completedTasks }));
                 continue;
            }

            setProgress(p => ({ ...p, message: `問題「${point.label}」を採点中...` }));

            // Branch logic for different area types
            if (area.type === AreaType.MARK_SHEET) {
                // Local Image Analysis for Mark Sheets
                const updates: { studentId: string; areaId: number; scoreData: ScoreData }[] = [];
                for (const student of studentsToGrade) {
                    if (!student.filePath) continue;
                    const studentSnippet = await cropImage(student.filePath, area);
                    if (!studentSnippet) continue;
                    
                    const detectedMarkIndex = await analyzeMarkSheetSnippet(studentSnippet, point);
                    const status = detectedMarkIndex === point.correctAnswerIndex ? ScoringStatus.CORRECT : ScoringStatus.INCORRECT;
                    const score = status === ScoringStatus.CORRECT ? point.points : 0;
                    
                    updates.push({ studentId: student.id, areaId, scoreData: { status, score, detectedMarkIndex }});
                    
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

            } else { // AI Grading for Descriptive Answers
                const masterSnippet = await cropImage(template.filePath, area);
                if (!masterSnippet) {
                    completedTasks += studentsToGrade.length;
                    setProgress(p => ({ ...p, current: completedTasks }));
                    continue;
                }
                const studentSnippets = await Promise.all(
                    studentsToGrade.map(async (student) => ({
                        studentId: student.id,
                        base64: await cropImage(student.filePath!, area)
                    }))
                );

                for (let i = 0; i < studentSnippets.length; i += aiSettings.batchSize) {
                    const batch = studentSnippets.slice(i, i + aiSettings.batchSize);
                    const result = await callGeminiAPIBatch(apiKey, masterSnippet, batch, point, aiGradingMode, answerFormat, aiSettings.gradingMode);
                    if (result.results) {
                        handleScoresChange(prevScores => {
                            const newScores = { ...prevScores };
                            result.results.forEach((res: any) => {
                                const { studentId, status, score } = res;
                                if (!newScores[studentId]) newScores[studentId] = {};
                                newScores[studentId][areaId] = { status, score };
                            });
                            return newScores;
                        });
                    } else {
                        console.error("AI grading batch failed:", result.error);
                    }
                    completedTasks += batch.length;
                    setProgress(p => ({ ...p, current: completedTasks }));
                }
            }
        }
        if(isGradingAllMode) setIsGradingAll(false);
        else setIsGrading(false);
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
            const currentIndex = filteredStudents.findIndex(s => s.id === focusedStudentId);
            if (currentIndex === -1) return;
            let nextIndex = -1;
            switch (e.key) {
                case 'ArrowRight': nextIndex = (currentIndex + 1) % filteredStudents.length; break;
                case 'ArrowLeft': nextIndex = (currentIndex - 1 + filteredStudents.length) % filteredStudents.length; break;
                case 'ArrowDown': nextIndex = Math.min(currentIndex + columnCount, filteredStudents.length - 1); break;
                case 'ArrowUp': nextIndex = Math.max(currentIndex - columnCount, 0); break;
                case 'j': case 'J': 
                    updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.CORRECT, score: points.find(p => p.id === selectedAreaId)?.points || 0 });
                    if (currentIndex + 1 < filteredStudents.length) {
                        nextIndex = currentIndex + 1;
                    }
                    break;
                case 'f': case 'F': 
                    updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.INCORRECT, score: 0 });
                    if (currentIndex + 1 < filteredStudents.length) {
                        nextIndex = currentIndex + 1;
                    }
                    break;
                case 'a': case 'A': e.preventDefault(); setAnnotatingStudent({ studentId: focusedStudentId, areaId: selectedAreaId }); break;
                case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
                    e.preventDefault();
                    updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.PARTIAL });
                    setPartialScoreInput(prev => prev + e.key);
                    break;
                case 'Backspace':
                    e.preventDefault();
                    if(partialScoreInput) setPartialScoreInput(prev => prev.slice(0, -1));
                    break;
                case 'Enter':
                    if (partialScoreInput) {
                        const score = parseInt(partialScoreInput, 10);
                        const maxPoints = points.find(p => p.id === selectedAreaId)?.points || 0;
                        updateScore(focusedStudentId, selectedAreaId, { score: Math.min(score, maxPoints) });
                        setPartialScoreInput('');
                        if (currentIndex + 1 < filteredStudents.length) {
                            nextIndex = currentIndex + 1;
                        }
                    }
                    break;
                default: return;
            }
            if (nextIndex !== -1 && nextIndex < filteredStudents.length) {
                e.preventDefault();
                const nextStudentId = filteredStudents[nextIndex].id;
                setFocusedStudentId(nextStudentId);
                document.getElementById(`student-card-${nextStudentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedStudentId, selectedAreaId, filteredStudents, columnCount, updateScore, partialScoreInput, points, annotatingStudent]);

    useEffect(() => { setPartialScoreInput(''); }, [focusedStudentId]);

    const annotatingStudentData = useMemo(() => {
        if (!annotatingStudent) return null;
        const student = studentsWithInfo.find(s => s.id === annotatingStudent.studentId);
        const area = areas.find(a => a.id === annotatingStudent.areaId);
        const initialAnnotations = scores[annotatingStudent.studentId]?.[annotatingStudent.areaId]?.annotations || [];
        if (!student || !area) return null;
        return { student, area, initialAnnotations };
    }, [annotatingStudent, studentsWithInfo, areas, scores]);

    if (!selectedAreaId) {
        return <div className="flex items-center justify-center h-full">問題を選択してください。</div>;
    }

    return (
        <div className="flex h-full gap-4">
            <QuestionSidebar answerAreas={answerAreas} points={points} scores={scores} students={studentsWithInfo} selectedAreaId={selectedAreaId} onSelectArea={setSelectedAreaId} isDisabled={isGrading || isGradingAll} />
            <main className="flex-1 flex flex-col gap-4 overflow-hidden">
                <GradingHeader selectedArea={answerAreas.find(a => a.id === selectedAreaId)} onStartAIGrading={handleStartAIGrading} onStartMarkSheetGrading={handleStartMarkSheetGrading} onStartAIGradingAll={handleStartAIGradingAll} isGrading={isGrading} isGradingAll={isGradingAll} progress={progress} filter={filter} onFilterChange={setFilter} apiKey={apiKey} columnCount={columnCount} onColumnCountChange={setColumnCount} onBulkScore={handleBulkScore} aiGradingMode={aiGradingMode} onAiGradingModeChange={setAiGradingMode} answerFormat={answerFormat} onAnswerFormatChange={setAnswerFormat} />
                <StudentAnswerGrid students={filteredStudents} selectedAreaId={selectedAreaId} template={template} areas={areas} points={points} scores={scores} onScoreChange={updateScore} onStartAnnotation={(studentId, areaId) => setAnnotatingStudent({ studentId, areaId })} onPanCommit={handlePanCommit} gradingStatus={{}} columnCount={columnCount} focusedStudentId={focusedStudentId} onStudentFocus={setFocusedStudentId} partialScoreInput={partialScoreInput} correctedImages={correctedImages} />
            </main>
            {annotatingStudentData && (
                 <AnnotationEditor student={annotatingStudentData.student} area={annotatingStudentData.area} template={template!} initialAnnotations={annotatingStudentData.initialAnnotations} onSave={handleSaveAnnotations} onClose={() => setAnnotatingStudent(null)} />
            )}
        </div>
    );
};
