import React from 'react';
import type { Area, Point, AllScores, Student } from '../../types';
import { ScoringStatus } from '../../types';

interface QuestionSidebarProps {
    answerAreas: Area[];
    points: Point[];
    scores: AllScores;
    students: Student[];
    selectedAreaId: number | null;
    onSelectArea: (areaId: number) => void;
    isDisabled?: boolean;
}

export const QuestionSidebar: React.FC<QuestionSidebarProps> = ({
    answerAreas, points, scores, students, selectedAreaId, onSelectArea, isDisabled
}) => {

    const getStatsForArea = (areaId: number) => {
        let scoredCount = 0;
        let correctCount = 0;
        students.forEach(student => {
            const status = scores[student.id]?.[areaId]?.status;
            if (status && status !== ScoringStatus.UNSCORED) {
                scoredCount++;
                if (status === ScoringStatus.CORRECT) {
                    correctCount++;
                }
            }
        });
        return { scoredCount, correctCount };
    };

    return (
        <aside className="w-72 flex-shrink-0 flex flex-col gap-4 bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold border-b pb-2 dark:border-slate-700">問題一覧</h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {answerAreas.map(area => {
                    const point = points.find(p => p.id === area.id);
                    if (!point) return null;

                    const { scoredCount, correctCount } = getStatsForArea(area.id);
                    const progress = students.length > 0 ? (scoredCount / students.length) * 100 : 0;
                    const correctRate = scoredCount > 0 ? (correctCount / scoredCount) * 100 : 0;

                    return (
                        <button
                            key={area.id}
                            onClick={() => onSelectArea(area.id)}
                            disabled={isDisabled}
                            className={`w-full text-left p-3 rounded-md transition-colors ${selectedAreaId === area.id ? 'bg-sky-100 dark:bg-sky-900/50' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'} ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="font-semibold">{point.label}</span>
                                <span className="text-xs text-slate-500">{point.points}点</span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mt-2">
                                <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                            </div>
                            <div className="flex justify-between items-center mt-1 text-xs text-slate-500 dark:text-slate-400">
                                <span>採点進捗: {scoredCount}/{students.length}</span>
                                <span>正答率: {correctRate.toFixed(0)}%</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
};
