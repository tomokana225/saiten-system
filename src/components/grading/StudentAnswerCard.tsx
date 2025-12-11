import React from 'react';
import type { Student, Area, Point, ScoreData, Template } from '../../types';
import { ScoringStatus } from '../../types';
import { AnswerSnippet } from '../AnswerSnippet';
import { AnnotationOverlay } from '../AnnotationOverlay';
import { CircleCheckIcon, XIcon as XCircleIcon, TriangleIcon, SpinnerIcon, PencilIcon } from '../icons';

interface MarkSheetOverlayProps {
    point: Point;
    detectedMarkIndex: number | number[] | undefined;
}

const MarkSheetOverlay: React.FC<MarkSheetOverlayProps> = ({ point, detectedMarkIndex }) => {
    if (!point.markSheetOptions || point.correctAnswerIndex === undefined) return null;
    
    const options = Array.from({ length: point.markSheetOptions });
    const isHorizontal = point.markSheetLayout === 'horizontal';

    return (
        <div className={`absolute inset-0 flex ${isHorizontal ? 'flex-row' : 'flex-col'} pointer-events-none`}>
            {options.map((_, i) => {
                const isCorrectAnswer = i === point.correctAnswerIndex;
                
                let isDetectedAnswer = false;
                if (Array.isArray(detectedMarkIndex)) {
                    isDetectedAnswer = detectedMarkIndex.includes(i);
                } else if (detectedMarkIndex !== undefined && detectedMarkIndex >= 0) {
                    isDetectedAnswer = i === detectedMarkIndex;
                }

                const isIncorrectMark = isDetectedAnswer && !isCorrectAnswer;
                
                let style: React.CSSProperties = {
                    borderWidth: '0px',
                    backgroundColor: 'transparent',
                    position: 'relative'
                };

                // Visual Logic:
                // 1. Correct Answer: Green frame
                // 2. Incorrectly marked answer: Red frame
                
                if (isCorrectAnswer) {
                    style = {
                        border: '3px solid rgba(34, 197, 94, 0.9)', // Green
                        boxShadow: '0 0 4px rgba(34, 197, 94, 0.5) inset',
                    };
                } else if (isIncorrectMark) {
                    style = {
                        border: '3px solid rgba(239, 68, 68, 0.9)', // Red
                        boxShadow: '0 0 4px rgba(239, 68, 68, 0.5) inset',
                    };
                }

                return (
                    <div key={i} className="flex-1 transition-colors" style={style}>
                    </div>
                );
            })}
        </div>
    );
};


interface StudentAnswerCardProps {
    student: Student & { class: string; number: string; name: string };
    template: Template;
    area: Area;
    point: Point;
    scoreData?: ScoreData;
    onScoreChange: (studentId: string, areaId: number, newScoreData: Partial<ScoreData>) => void;
    onStartAnnotation: (studentId: string, areaId: number) => void;
    onPanCommit: (studentId: string, areaId: number, offset: { x: number, y: number }) => void;
    status?: 'pending' | 'grading' | 'done' | 'error';
    isFocused: boolean;
    onFocus: (studentId: string) => void;
    partialScoreInput: string;
    correctedImages: Record<string, string>;
}

export const StudentAnswerCard: React.FC<StudentAnswerCardProps> = ({
    student, template, area, point, scoreData, onScoreChange, onStartAnnotation, onPanCommit, status,
    isFocused, onFocus, partialScoreInput, correctedImages
}) => {
    const currentStatus = scoreData?.status || ScoringStatus.UNSCORED;

    // Determine correct image based on page index
    const pageIndex = area.pageIndex || 0;
    const imageSrc = student.images[pageIndex] || null;
    const hasImage = !!imageSrc;

    const handleStatusChange = (newStatus: ScoringStatus) => {
        if (!hasImage) return; // Prevent change if no image
        let newScore: number | null = null;
        switch (newStatus) {
            case ScoringStatus.CORRECT:
                newScore = point.points;
                break;
            case ScoringStatus.INCORRECT:
                newScore = 0;
                break;
            case ScoringStatus.PARTIAL:
                newScore = scoreData?.score ?? Math.round(point.points / 2);
                break;
            case ScoringStatus.UNSCORED:
                newScore = null;
                break;
        }
        onScoreChange(student.id, area.id, { status: newStatus, score: newScore, annotations: scoreData?.annotations });
    };
    
    const handlePartialInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!hasImage) return;
        const val = e.target.value;
        const newScore = val === '' ? 0 : Math.min(Math.max(0, parseInt(val, 10)), point.points);
        onScoreChange(student.id, area.id, { status: ScoringStatus.PARTIAL, score: newScore });
    };

    const handleAnswerClick = () => {
        if (!hasImage) return;
        if (currentStatus === ScoringStatus.CORRECT) {
            handleStatusChange(ScoringStatus.INCORRECT);
        } else {
            handleStatusChange(ScoringStatus.CORRECT);
        }
    };

    const displayScore = partialScoreInput ? `${partialScoreInput}_` : (scoreData?.score ?? '-');

    return (
         <div id={`student-card-${student.id}`} onClick={() => onFocus(student.id)} className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border ${isFocused ? 'border-sky-500 ring-2 ring-sky-500' : 'border-slate-200 dark:border-slate-700'} p-2 space-y-2 relative transition-all`}>
            {status === 'grading' && <div className="absolute inset-0 bg-sky-500/10 flex items-center justify-center rounded-lg"><SpinnerIcon className="w-6 h-6 text-sky-500" /></div>}
            
            <div className="flex justify-between items-center">
                <h5 className="font-semibold text-xs truncate">{student.class}-{student.number} {student.name}</h5>
                <div className="flex items-center gap-1">
                    {currentStatus === ScoringStatus.PARTIAL && hasImage ? (
                        <div className="flex items-center">
                            <input 
                                type="number" 
                                className="w-12 h-6 text-right border border-slate-300 dark:border-slate-600 rounded text-sm px-1 bg-white dark:bg-slate-700 font-bold"
                                value={scoreData?.score ?? ''}
                                onClick={(e) => e.stopPropagation()}
                                onChange={handlePartialInput}
                                min={0}
                                max={point.points}
                            />
                            <span className="text-xs text-slate-500 ml-1">/ {point.points}</span>
                        </div>
                    ) : (
                        <p className={`font-bold text-sm ${isFocused && partialScoreInput ? 'text-sky-500' : ''} ${!hasImage ? 'text-slate-400' : ''}`}>
                            {displayScore} / {point.points}
                        </p>
                    )}
                </div>
            </div>
            
            {/* Aspect ratio set to match area, with fallback min-height */}
            <div className="relative w-full bg-slate-100 dark:bg-slate-900 rounded overflow-hidden" style={{ aspectRatio: `${area.width} / ${area.height}`, minHeight: '60px' }}>
                <AnswerSnippet 
                    imageSrc={imageSrc}
                    area={area}
                    template={template}
                    pannable={isFocused}
                    onClick={handleAnswerClick}
                    manualPanOffset={scoreData?.manualPanOffset}
                    onPanCommit={(offset) => onPanCommit(student.id, area.id, offset)}
                    padding={15}
                >
                    <AnnotationOverlay annotations={scoreData?.annotations || []} />
                    <MarkSheetOverlay point={point} detectedMarkIndex={scoreData?.detectedMarkIndex} />
                </AnswerSnippet>
            </div>

            <div className="flex items-center justify-around gap-1">
                <button 
                    disabled={!hasImage}
                    onClick={(e) => { e.stopPropagation(); handleStatusChange(ScoringStatus.CORRECT); }} 
                    title="正解 (J)" 
                    className={`p-1 rounded-full transition-colors ${
                        !hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' : 
                        currentStatus === ScoringStatus.CORRECT ? 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400' : 'text-slate-400 hover:bg-green-100 dark:hover:bg-green-900/50'
                    }`}
                >
                    <CircleCheckIcon className="w-5 h-5" />
                </button>
                <button 
                    disabled={!hasImage}
                    onClick={(e) => { e.stopPropagation(); handleStatusChange(ScoringStatus.INCORRECT); }} 
                    title="不正解 (F)" 
                    className={`p-1 rounded-full transition-colors ${
                        !hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' :
                        currentStatus === ScoringStatus.INCORRECT ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400' : 'text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/50'
                    }`}
                >
                    <XCircleIcon className="w-5 h-5" />
                </button>
                <button 
                    disabled={!hasImage}
                    onClick={(e) => { e.stopPropagation(); handleStatusChange(ScoringStatus.PARTIAL); }} 
                    title="部分点" 
                    className={`p-1 rounded-full transition-colors ${
                        !hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' :
                        currentStatus === ScoringStatus.PARTIAL ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400' : 'text-slate-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/50'
                    }`}
                >
                    <TriangleIcon className="w-5 h-5" />
                </button>
                <div className="border-l h-5 border-slate-200 dark:border-slate-600 mx-1"></div>
                <button 
                    disabled={!hasImage}
                    onClick={(e) => { e.stopPropagation(); onStartAnnotation(student.id, area.id); }} 
                    title="添削" 
                    className={`p-1 rounded-full transition-colors ${!hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' : 'text-slate-400 hover:bg-sky-100 dark:hover:bg-sky-900/50'}`}
                >
                    <PencilIcon className="w-5 h-5"/>
                </button>
            </div>
        </div>
    );
};