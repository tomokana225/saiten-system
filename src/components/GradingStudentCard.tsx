import React, { useState } from 'react';
import type { Student, Template, Area, Point, ScoreData } from '../types';
import { AreaType, ScoringStatus } from '../types';
import { AnswerSnippet } from './AnswerSnippet';
import { CircleCheckIcon, XIcon, TriangleIcon, SpinnerIcon } from './icons';

interface GradingStudentCardProps {
    student: Student & { class: string; number: string; name: string };
    template: Template;
    areas: Area[];
    points: Point[];
    scores: { [areaId: number]: ScoreData };
    onScoreChange: (studentId: string, areaId: number, newScoreData: ScoreData) => void;
    isGrading: boolean;
    masterSnippets: { [areaId: number]: string | null };
}

export const GradingStudentCard = ({ student, template, areas, points, scores, onScoreChange, isGrading, masterSnippets }: GradingStudentCardProps) => {
    const [isExpanded, setIsExpanded] = useState(true);

    const handleStatusChange = (areaId: number, status: ScoringStatus) => {
        const pointValue = points.find(p => p.id === areaId)?.points || 0;
        let newScore: number | null = null;
        switch (status) {
            case ScoringStatus.CORRECT:
                newScore = pointValue;
                break;
            case ScoringStatus.INCORRECT:
                newScore = 0;
                break;
            case ScoringStatus.PARTIAL:
                // Keep old partial score or default to half
                newScore = scores[areaId]?.score ?? Math.round(pointValue / 2);
                break;
            case ScoringStatus.UNSCORED:
                newScore = null;
                break;
        }
        onScoreChange(student.id, areaId, { status, score: newScore });
    };

    const handlePartialScoreChange = (areaId: number, scoreValue: string) => {
        const pointValue = points.find(p => p.id === areaId)?.points || 0;
        const newScore = Math.max(0, Math.min(pointValue, parseInt(scoreValue, 10) || 0));
        onScoreChange(student.id, areaId, { status: ScoringStatus.PARTIAL, score: newScore });
    };

    const answerAreas = areas.filter(a => a.type === AreaType.ANSWER);

    return (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center p-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isGrading ? 'bg-yellow-400 animate-pulse' : (Object.keys(scores).length > 0 ? 'bg-green-500' : 'bg-slate-400')}`}></div>
                    <h4 className="font-semibold text-lg">{student.class}-{student.number} {student.name}</h4>
                </div>
                {isGrading && <SpinnerIcon className="text-sky-500" />}
            </div>

            {isExpanded && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-4">
                    {answerAreas.map(area => {
                        const point = points.find(p => p.id === area.id);
                        if (!point) return null;
                        const scoreData = scores?.[area.id] || { status: ScoringStatus.UNSCORED, score: null };
                        const masterSnippet = masterSnippets[area.id];

                        return (
                            <div key={area.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md">
                                <div className="space-y-2">
                                    <h5 className="text-sm font-semibold">{point.label} (満点: {point.points})</h5>
                                    {masterSnippet ? <img src={`data:image/png;base64,${masterSnippet}`} alt="Master Answer" className="border border-slate-300 dark:border-slate-600 rounded-md" /> : <div className="text-xs text-slate-500">模範解答なし</div>}
                                </div>
                                <div className="space-y-2">
                                     <h5 className="text-sm font-semibold">生徒の解答</h5>
                                    <AnswerSnippet imageSrc={student.filePath} area={area} />
                                </div>
                                <div className="space-y-3 flex flex-col justify-center">
                                    <div className="flex items-center justify-around gap-2">
                                        <button onClick={() => handleStatusChange(area.id, ScoringStatus.CORRECT)} className={`p-2 rounded-full transition-colors ${scoreData.status === ScoringStatus.CORRECT ? 'bg-green-500 text-white' : 'hover:bg-green-100 dark:hover:bg-green-900/50'}`}>
                                            <CircleCheckIcon className="w-6 h-6" />
                                        </button>
                                        <button onClick={() => handleStatusChange(area.id, ScoringStatus.INCORRECT)} className={`p-2 rounded-full transition-colors ${scoreData.status === ScoringStatus.INCORRECT ? 'bg-red-500 text-white' : 'hover:bg-red-100 dark:hover:bg-red-900/50'}`}>
                                            <XIcon className="w-6 h-6" />
                                        </button>
                                        <button onClick={() => handleStatusChange(area.id, ScoringStatus.PARTIAL)} className={`p-2 rounded-full transition-colors ${scoreData.status === ScoringStatus.PARTIAL ? 'bg-yellow-500 text-white' : 'hover:bg-yellow-100 dark:hover:bg-yellow-900/50'}`}>
                                            <TriangleIcon className="w-6 h-6" />
                                        </button>
                                    </div>
                                    {scoreData.status === ScoringStatus.PARTIAL && (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={scoreData.score ?? ''}
                                                onChange={e => handlePartialScoreChange(area.id, e.target.value)}
                                                min="0"
                                                max={point.points}
                                                className="w-full p-2 text-center bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md"
                                            />
                                            <span className="font-semibold">/ {point.points}</span>
                                        </div>
                                    )}
                                    {scoreData.status !== ScoringStatus.PARTIAL && (
                                        <p className="text-center font-bold text-lg">{scoreData.score ?? '-'}</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};