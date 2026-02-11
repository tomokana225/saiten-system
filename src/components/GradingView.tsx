
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { AllScores, ScoreData, GradingFilter, Annotation, Point, Area } from '../types';
import { AreaType, ScoringStatus } from '../types';
import { callGeminiAPIBatch } from '../api/gemini';
import { QuestionSidebar } from './grading/QuestionSidebar';
import { GradingHeader } from './grading/GradingHeader';
import { StudentAnswerGrid } from './grading/StudentAnswerGrid';
import { AnnotationEditor } from './AnnotationEditor';
import { useProject } from '../context/ProjectContext';
import { analyzeMarkSheetSnippet, findNearestAlignedRefArea } from '../utils';

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

export const GradingView: React.FC<{ apiKey: string }> = ({ apiKey }) => {
    const { activeProject, studentsWithInfo, handleScoresChange, updateActiveProject } = useProject();
    const { template, areas, points, scores, aiSettings } = activeProject!;
    const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
    const [filter, setFilter] = useState<GradingFilter>('ALL');
    const [isGrading, setIsGrading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
    
    // These states are managed via local UI but should ideally be in context for consistency
    const [autoAlign, setAutoAlign] = useState(true);
    const [isImageEnhanced, setIsImageEnhanced] = useState(false);

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
                    
                    // CRITICAL: Pass template.alignmentMarkIdealCorners if autoAlign is active
                    // so that recognition happens in the same warped space as the visual snippet.
                    const res = await analyzeMarkSheetSnippet(
                        studentImage, 
                        area, 
                        point, 
                        aiSettings.markSheetSensitivity,
                        refR, 
                        refB,
                        autoAlign ? template.alignmentMarkIdealCorners : undefined
                    );
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
                <GradingHeader 
                    selectedArea={answerAreas.find(a => a.id === selectedAreaId)} 
                    onStartAIGrading={() => selectedAreaId && handleStartGrading([selectedAreaId])} 
                    onStartMarkSheetGrading={() => selectedAreaId && handleStartGrading([selectedAreaId])} 
                    onStartAIGradingAll={() => handleStartGrading(answerAreas.filter(a => a.type === AreaType.ANSWER).map(a => a.id))} 
                    isGrading={isGrading} isGradingAll={false} progress={progress} 
                    filter={filter} onFilterChange={setFilter} apiKey={apiKey} columnCount={4} onColumnCountChange={() => {}} onBulkScore={() => {}} aiGradingMode="auto" onAiGradingModeChange={() => {}} answerFormat="" onAnswerFormatChange={() => {}} 
                    isImageEnhanced={isImageEnhanced} onToggleImageEnhancement={() => setIsImageEnhanced(!isImageEnhanced)} 
                    autoAlign={autoAlign} onToggleAutoAlign={() => setAutoAlign(!autoAlign)} 
                    aiSettings={aiSettings}
                    onAiSettingsChange={(updater) => updateActiveProject(prev => ({ ...prev, aiSettings: updater(prev.aiSettings), lastModified: Date.now() }))}
                />
                <StudentAnswerGrid students={studentsWithInfo} selectedAreaId={selectedAreaId!} template={template} areas={areas} points={points} scores={scores} onScoreChange={(sid, aid, data) => handleScoresChange(prev => ({ ...prev, [sid]: { ...prev[sid], [aid]: { ...prev[sid]?.[aid], ...data } }}))} onStartAnnotation={() => {}} onPanCommit={() => {}} gradingStatus={{}} columnCount={4} focusedStudentId={null} onStudentFocus={() => {}} partialScoreInput="" correctedImages={{}} 
                    isImageEnhanced={isImageEnhanced} autoAlign={autoAlign} aiSettings={aiSettings} />
            </main>
        </div>
    );
};
