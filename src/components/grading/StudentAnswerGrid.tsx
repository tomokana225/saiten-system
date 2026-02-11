
import React, { useMemo } from 'react';
// Added AISettings to import
import type { Student, Template, Area, Point, AllScores, ScoreData, AISettings } from '../../types';
import { StudentAnswerCard } from './StudentAnswerCard';
import { AnswerSnippet } from '../AnswerSnippet';

interface StudentAnswerGridProps {
    students: (Student & { class: string; number: string; name: string })[];
    selectedAreaId: number;
    template: Template;
    areas: Area[];
    points: Point[];
    scores: AllScores;
    onScoreChange: (studentId: string, areaId: number, newScoreData: Partial<ScoreData>) => void;
    onStartAnnotation: (studentId: string, areaId: number) => void;
    onPanCommit: (studentId: string, areaId: number, offset: { x: number, y: number }) => void;
    gradingStatus: { [studentId: string]: { [areaId: number]: 'pending' | 'grading' | 'error' | 'done' } };
    columnCount: number;
    focusedStudentId: string | null;
    onStudentFocus: (studentId: string) => void;
    partialScoreInput: string;
    correctedImages: Record<string, string>;
    isImageEnhanced?: boolean;
    autoAlign?: boolean;
    // Added missing aiSettings prop
    aiSettings: AISettings;
}

export const StudentAnswerGrid: React.FC<StudentAnswerGridProps> = ({
    students, selectedAreaId, template, areas, points, scores, onScoreChange, onStartAnnotation, onPanCommit, gradingStatus,
    columnCount, focusedStudentId, onStudentFocus, partialScoreInput, correctedImages, isImageEnhanced, autoAlign,
    // Destructured aiSettings
    aiSettings
}) => {
    
    const selectedArea = useMemo(() => areas.find(a => a.id === selectedAreaId), [areas, selectedAreaId]);
    const selectedPoint = useMemo(() => points.find(p => p.id === selectedAreaId), [points, selectedAreaId]);

    // Determine which page's image to use for the "Model Answer" snippet
    const masterImageSrc = useMemo(() => {
        if (!selectedArea || !template) return null;
        const pageIndex = selectedArea.pageIndex || 0;
        return template.pages?.[pageIndex]?.imagePath || template.filePath;
    }, [selectedArea, template]);

    return (
        <div className="flex-1 overflow-y-auto space-y-4 p-1">
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
                <div className="p-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg">
                    <h4 className="text-sm font-semibold mb-1 text-center text-slate-600 dark:text-slate-400">模範解答</h4>
                    {template && selectedArea ? (
                        <AnswerSnippet
                            imageSrc={masterImageSrc}
                            imageWidth={template.width} // Note: This might need to be page width if pages differ
                            imageHeight={template.height}
                            area={selectedArea}
                            template={template}
                            pannable={false}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-20 text-slate-400 text-xs">読み込み中...</div>
                    )}
                </div>

                {students.map(student => {
                    // Add a guard clause to prevent rendering if essential data is missing, which prevents crashes.
                    if (!selectedArea || !selectedPoint) {
                        return null;
                    }
                    return (
                        <StudentAnswerCard
                            key={student.id}
                            student={student}
                            template={template}
                            area={selectedArea}
                            point={selectedPoint}
                            scoreData={scores[student.id]?.[selectedAreaId]}
                            onScoreChange={onScoreChange}
                            onStartAnnotation={onStartAnnotation}
                            onPanCommit={onPanCommit}
                            status={gradingStatus[student.id]?.[selectedAreaId]}
                            isFocused={focusedStudentId === student.id}
                            onFocus={onStudentFocus}
                            partialScoreInput={focusedStudentId === student.id ? partialScoreInput : ''}
                            correctedImages={correctedImages}
                            isImageEnhanced={isImageEnhanced}
                            autoAlign={autoAlign}
                            // Pass aiSettings to StudentAnswerCard
                            aiSettings={aiSettings}
                        />
                    );
                })}
            </div>
             {students.length === 0 && (
                <div className="flex items-center justify-center h-full text-slate-500">
                    <p>この条件に一致する答案はありません。</p>
                </div>
            )}
        </div>
    );
};
