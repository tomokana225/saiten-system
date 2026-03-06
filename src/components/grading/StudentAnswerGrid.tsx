
import React, { useMemo } from 'react';
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
    aiSettings: AISettings;
}

export const StudentAnswerGrid: React.FC<StudentAnswerGridProps> = ({
    students, selectedAreaId, template, areas, points, scores, onScoreChange, onStartAnnotation, onPanCommit, gradingStatus,
    columnCount, focusedStudentId, onStudentFocus, partialScoreInput, correctedImages, isImageEnhanced, autoAlign,
    aiSettings
}) => {
    
    const selectedArea = useMemo(() => areas.find(a => a.id === selectedAreaId), [areas, selectedAreaId]);
    const selectedPoint = useMemo(() => points.find(p => p.id === selectedAreaId), [points, selectedAreaId]);

    const masterImageSrc = useMemo(() => {
        if (!selectedArea || !template) return null;
        const pageIndex = selectedArea.pageIndex || 0;
        return template.pages?.[pageIndex]?.imagePath || template.filePath;
    }, [selectedArea, template]);

    const gridStyle = useMemo(() => {
        if (columnCount === 0) {
            return { gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' };
        }
        return { gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` };
    }, [columnCount]);

    // Use Table view only if columnCount is 1
    const isTableView = columnCount === 1;

    return (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 p-2 sm:p-4">
                {isTableView ? (
                    <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-48">生徒情報</th>
                                <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">解答画像</th>
                                <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-32 text-center">得点</th>
                                <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-48 text-right">採点操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Model Answer Row */}
                            <tr className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800">
                                <td className="p-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                                        <span className="text-xs font-bold text-sky-600 dark:text-sky-400">模範解答</span>
                                    </div>
                                </td>
                                <td className="p-3">
                                    <div className="max-w-md h-20 bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-700 overflow-hidden">
                                        {template && selectedArea ? (
                                            <AnswerSnippet
                                                imageSrc={masterImageSrc}
                                                imageWidth={template.width}
                                                imageHeight={template.height}
                                                area={selectedArea}
                                                template={template}
                                                pannable={false}
                                                alignmentSettings={template.alignmentDetectionSettings}
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-400 text-[10px]">読み込み中...</div>
                                        )}
                                    </div>
                                </td>
                                <td className="p-3 text-center">
                                    <span className="text-sm font-bold text-slate-400">{selectedPoint?.points} / {selectedPoint?.points}</span>
                                </td>
                                <td className="p-3 text-right">
                                    <span className="text-[10px] text-slate-400 font-medium">基準画像</span>
                                </td>
                            </tr>

                            {students.map(student => {
                                if (!selectedArea || !selectedPoint) return null;
                                return (
                                    <StudentAnswerCard
                                        key={student.id}
                                        student={student}
                                        template={template}
                                        area={selectedArea}
                                        areas={areas}
                                        point={selectedPoint}
                                        scoreData={scores[student.id]?.[selectedAreaId]}
                                        onScoreChange={onScoreChange}
                                        onStartAnnotation={onStartAnnotation}
                                        onPanCommit={onPanCommit}
                                        status={gradingStatus[student.id]?.[selectedAreaId]}
                                        isFocused={focusedStudentId === student.id}
                                        onFocus={onStudentFocus}
                                        partialScoreInput={focusedStudentId === student.id ? partialScoreInput : ''}
                                        isImageEnhanced={isImageEnhanced}
                                        autoAlign={autoAlign}
                                        aiSettings={aiSettings}
                                        renderMode="table"
                                    />
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="grid gap-4" style={gridStyle}>
                         {/* Model Answer Card in Grid */}
                         <div className="bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-2 space-y-2">
                            <div className="flex justify-between items-center">
                                <h5 className="font-bold text-xs text-sky-600 dark:text-sky-400">模範解答 (基準)</h5>
                                <p className="font-bold text-sm text-slate-400">{selectedPoint?.points} / {selectedPoint?.points}</p>
                            </div>
                            <div className="relative w-full bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-700 overflow-hidden" style={{ aspectRatio: selectedArea ? `${selectedArea.width} / ${selectedArea.height}` : '16/9', minHeight: '60px' }}>
                                {template && selectedArea ? (
                                    <AnswerSnippet
                                        imageSrc={masterImageSrc}
                                        imageWidth={template.width}
                                        imageHeight={template.height}
                                        area={selectedArea}
                                        template={template}
                                        pannable={false}
                                        alignmentSettings={template.alignmentDetectionSettings}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-slate-400 text-[10px]">読み込み中...</div>
                                )}
                            </div>
                        </div>

                        {students.map(student => {
                            if (!selectedArea || !selectedPoint) return null;
                            return (
                                <StudentAnswerCard
                                    key={student.id}
                                    student={student}
                                    template={template}
                                    area={selectedArea}
                                    areas={areas}
                                    point={selectedPoint}
                                    scoreData={scores[student.id]?.[selectedAreaId]}
                                    onScoreChange={onScoreChange}
                                    onStartAnnotation={onStartAnnotation}
                                    onPanCommit={onPanCommit}
                                    status={gradingStatus[student.id]?.[selectedAreaId]}
                                    isFocused={focusedStudentId === student.id}
                                    onFocus={onStudentFocus}
                                    partialScoreInput={focusedStudentId === student.id ? partialScoreInput : ''}
                                    isImageEnhanced={isImageEnhanced}
                                    autoAlign={autoAlign}
                                    aiSettings={aiSettings}
                                    renderMode="grid"
                                />
                            );
                        })}
                    </div>
                )}
                {students.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                        <p className="text-sm">この条件に一致する答案はありません。</p>
                    </div>
                )}
            </div>
        </div>
    );
};
