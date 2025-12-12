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

const analyzeMarkSheetSnippet = async (base64: string, point: Point): Promise<number | number[]> => {
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
            
            const roiAverages: number[] = [];

            // 1. Calculate average brightness for the CENTER ROI of each option
            for (let i = 0; i < options; i++) {
                const xStart = Math.floor(isHorizontal ? i * segmentWidth : 0);
                const yStart = Math.floor(isHorizontal ? 0 : i * segmentHeight);
                
                // Define ROI: Center 50% of the segment to avoid borders and noise
                // "1ブロックの中の中心に四角を作って"
                const roiMarginX = segmentWidth * 0.25; 
                const roiMarginY = segmentHeight * 0.25;
                
                const roiX = Math.floor(xStart + roiMarginX);
                const roiY = Math.floor(yStart + roiMarginY);
                const roiW = Math.ceil(segmentWidth * 0.5);
                const roiH = Math.ceil(segmentHeight * 0.5);

                let totalBrightness = 0;
                let pixelCount = 0;

                for (let y = roiY; y < roiY + roiH; y++) {
                    for (let x = roiX; x < roiX + roiW; x++) {
                        // Boundary check
                        if (x < 0 || x >= img.width || y < 0 || y >= img.height) continue;

                        const idx = (y * img.width + x) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        // Simple grayscale
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        totalBrightness += gray;
                        pixelCount++;
                    }
                }
                
                roiAverages[i] = pixelCount > 0 ? totalBrightness / pixelCount : 255;
            }

            // 2. Determine "Paper White" baseline
            // We assume at least one option is NOT marked (empty). 
            // The brightest option represents the paper color.
            const paperBrightness = Math.max(...roiAverages);

            // 3. Find thresholds
            const thresholdRatio = 0.80; 
            const minDiff = 30;

            const markedIndices: number[] = [];
            
            roiAverages.forEach((brightness, index) => {
                const isDarkEnough = (brightness < paperBrightness * thresholdRatio) && ((paperBrightness - brightness) > minDiff);
                if (isDarkEnough) {
                    markedIndices.push(index);
                }
            });

            if (markedIndices.length === 0) {
                resolve(-1); // No mark detected
            } else if (markedIndices.length === 1) {
                resolve(markedIndices[0]); // Single mark
            } else {
                resolve(markedIndices); // Multiple marks
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
    const [isImageEnhanced, setIsImageEnhanced] = useState(false);

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

    // Removed auto-focus logic to prevent scroll interference. 
    // Users must click to focus and enable image panning.
    useEffect(() => {
        setFocusedStudentId(null);
    }, [selectedAreaId, filter]);

    const handleStartGrading = async (areaIds: number[]) => {
        const isGradingAllMode = areaIds.length > 1;
        if(isGradingAllMode) setIsGradingAll(true);
        else setIsGrading(true);
        
        // Filter out students who don't have images
        const studentsToGrade = studentsWithInfo.filter(s => s.images && s.images.length > 0);
        
        const totalGradingTasks = studentsToGrade.length * areaIds.length;
        let completedTasks = 0;
        setProgress({ current: 0, total: totalGradingTasks, message: '準備中...' });

        // Ensure template has pages
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

            // Branch logic for different area types
            if (area.type === AreaType.MARK_SHEET) {
                // Local Image Analysis for Mark Sheets
                const updates: { studentId: string; areaId: number; scoreData: ScoreData }[] = [];
                for (const student of studentsToGrade) {
                    const studentImage = student.images[pageIndex];
                    if (!studentImage) continue;
                    
                    const studentSnippet = await cropImage(studentImage, area);
                    if (!studentSnippet) continue;
                    
                    const detectedMarkResult = await analyzeMarkSheetSnippet(studentSnippet, point);
                    
                    let status = ScoringStatus.INCORRECT;
                    let detectedMarkIndex: number | number[] | undefined = undefined;

                    // If single valid mark found
                    if (typeof detectedMarkResult === 'number') {
                        if (detectedMarkResult >= 0) {
                             if (detectedMarkResult === point.correctAnswerIndex) {
                                 status = ScoringStatus.CORRECT;
                             }
                             detectedMarkIndex = detectedMarkResult;
                        } else {
                            // -1 (no mark)
                            status = ScoringStatus.INCORRECT;
                            detectedMarkIndex = undefined; 
                        }
                    } else if (Array.isArray(detectedMarkResult)) {
                        // Multiple marks -> Incorrect
                        status = ScoringStatus.INCORRECT;
                        detectedMarkIndex = detectedMarkResult;
                    }
                        
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
                if (!masterImage) {
                     completedTasks += studentsToGrade.length;
                     setProgress(p => ({ ...p, current: completedTasks }));
                     continue;
                }
                
                const masterSnippet = await cropImage(masterImage, area);
                if (!masterSnippet) {
                    completedTasks += studentsToGrade.length;
                    setProgress(p => ({ ...p, current: completedTasks }));
                    continue;
                }
                const studentSnippets = await Promise.all(
                    studentsToGrade.map(async (student) => {
                        const studentImage = student.images[pageIndex];
                        return {
                            studentId: student.id,
                            base64: studentImage ? await cropImage(studentImage, area) : null
                        };
                    })
                );
                
                const validSnippets = studentSnippets.filter(s => s.base64 !== null) as { studentId: string, base64: string }[];

                for (let i = 0; i < validSnippets.length; i += aiSettings.batchSize) {
                    const batch = validSnippets.slice(i, i + aiSettings.batchSize);
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
            
            const area = areas.find(a => a.id === selectedAreaId);
            const pageIndex = area?.pageIndex || 0;

            const isStudentValid = (idx: number) => {
                if (idx < 0 || idx >= filteredStudents.length) return false;
                const s = filteredStudents[idx];
                return s && s.images && !!s.images[pageIndex];
            };

            const findNextValid = (startIndex: number): number => {
                for (let i = startIndex; i < filteredStudents.length; i++) {
                    if (isStudentValid(i)) return i;
                }
                return -1;
            };

            const findPrevValid = (startIndex: number): number => {
                for (let i = startIndex; i >= 0; i--) {
                    if (isStudentValid(i)) return i;
                }
                return -1;
            };

            const currentIndex = filteredStudents.findIndex(s => s.id === focusedStudentId);
            if (currentIndex === -1) return;
            
            let nextIndex = -1;
            switch (e.key) {
                case 'ArrowRight': 
                    nextIndex = findNextValid(currentIndex + 1);
                    if (nextIndex === -1 && currentIndex < filteredStudents.length - 1) {
                        // If no more valid students, stay or wrap? Currently just stops at last valid.
                    } else if (nextIndex === -1) {
                        nextIndex = currentIndex;
                    }
                    break;
                case 'ArrowLeft': 
                    nextIndex = findPrevValid(currentIndex - 1);
                    if (nextIndex === -1) nextIndex = currentIndex;
                    break;
                case 'ArrowDown': {
                    const targetIndex = currentIndex + columnCount;
                    if (targetIndex < filteredStudents.length) {
                        if (isStudentValid(targetIndex)) {
                            nextIndex = targetIndex;
                        } else {
                            // If target slot is invalid, search forward from there
                            nextIndex = findNextValid(targetIndex);
                        }
                    } else {
                        nextIndex = currentIndex; // Stay if out of bounds
                    }
                    break;
                }
                case 'ArrowUp': {
                    const targetIndex = currentIndex - columnCount;
                    if (targetIndex >= 0) {
                        if (isStudentValid(targetIndex)) {
                            nextIndex = targetIndex;
                        } else {
                            // If target slot is invalid, search backward from there
                            nextIndex = findPrevValid(targetIndex);
                        }
                    } else {
                        nextIndex = currentIndex;
                    }
                    break;
                }
                case 'j': case 'J': 
                    updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.CORRECT, score: points.find(p => p.id === selectedAreaId)?.points || 0 });
                    nextIndex = findNextValid(currentIndex + 1);
                    break;
                case 'f': case 'F': 
                    updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.INCORRECT, score: 0 });
                    nextIndex = findNextValid(currentIndex + 1);
                    break;
                case 'a': case 'A': e.preventDefault(); setAnnotatingStudent({ studentId: focusedStudentId, areaId: selectedAreaId }); break;
                case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9': {
                    e.preventDefault();
                    const newInput = partialScoreInput + e.key;
                    const maxPoints = points.find(p => p.id === selectedAreaId)?.points || 0;
                    const newScore = Math.min(parseInt(newInput, 10), maxPoints);
                    
                    updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.PARTIAL, score: newScore });
                    setPartialScoreInput(newInput);
                    break;
                }
                case 'Backspace': {
                    e.preventDefault();
                    const croppedInput = partialScoreInput.slice(0, -1);
                    setPartialScoreInput(croppedInput);
                    
                    const maxPoints = points.find(p => p.id === selectedAreaId)?.points || 0;
                    if (croppedInput === '') {
                        updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.PARTIAL, score: null });
                    } else {
                        const newScore = Math.min(parseInt(croppedInput, 10), maxPoints);
                        updateScore(focusedStudentId, selectedAreaId, { status: ScoringStatus.PARTIAL, score: newScore });
                    }
                    break;
                }
                case 'Enter':
                    if (partialScoreInput) {
                        setPartialScoreInput('');
                        nextIndex = findNextValid(currentIndex + 1);
                    }
                    break;
                default: return;
            }
            if (nextIndex !== -1 && nextIndex !== currentIndex && nextIndex < filteredStudents.length) {
                e.preventDefault();
                const nextStudentId = filteredStudents[nextIndex].id;
                setFocusedStudentId(nextStudentId);
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

    if (!selectedAreaId) {
        return <div className="flex items-center justify-center h-full">問題を選択してください。</div>;
    }

    return (
        <div className="flex h-full gap-4">
            <QuestionSidebar answerAreas={answerAreas} points={points} scores={scores} students={studentsWithInfo} selectedAreaId={selectedAreaId} onSelectArea={setSelectedAreaId} isDisabled={isGrading || isGradingAll} />
            <main className="flex-1 flex flex-col gap-4 overflow-hidden">
                <GradingHeader selectedArea={answerAreas.find(a => a.id === selectedAreaId)} onStartAIGrading={handleStartAIGrading} onStartMarkSheetGrading={handleStartMarkSheetGrading} onStartAIGradingAll={handleStartAIGradingAll} isGrading={isGrading} isGradingAll={isGradingAll} progress={progress} filter={filter} onFilterChange={setFilter} apiKey={apiKey} columnCount={columnCount} onColumnCountChange={setColumnCount} onBulkScore={handleBulkScore} aiGradingMode={aiGradingMode} onAiGradingModeChange={setAiGradingMode} answerFormat={answerFormat} onAnswerFormatChange={setAnswerFormat} isImageEnhanced={isImageEnhanced} onToggleImageEnhancement={() => setIsImageEnhanced(!isImageEnhanced)} />
                <StudentAnswerGrid students={filteredStudents} selectedAreaId={selectedAreaId} template={template} areas={areas} points={points} scores={scores} onScoreChange={updateScore} onStartAnnotation={(studentId, areaId) => setAnnotatingStudent({ studentId, areaId })} onPanCommit={handlePanCommit} gradingStatus={{}} columnCount={columnCount} focusedStudentId={focusedStudentId} onStudentFocus={setFocusedStudentId} partialScoreInput={partialScoreInput} correctedImages={correctedImages} isImageEnhanced={isImageEnhanced} />
            </main>
            {annotatingStudentData && (
                 <AnnotationEditor student={annotatingStudentData.student} area={annotatingStudentData.area} template={template!} initialAnnotations={annotatingStudentData.initialAnnotations} onSave={handleSaveAnnotations} onClose={() => setAnnotatingStudent(null)} />
            )}
        </div>
    );
};