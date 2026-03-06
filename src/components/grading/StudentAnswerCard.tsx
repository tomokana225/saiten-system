
import React from 'react';
import type { Student, Area, Point, ScoreData, Template, AISettings } from '../../types';
import { ScoringStatus, AreaType } from '../../types';
import { AnswerSnippet } from '../AnswerSnippet';
import { AnnotationOverlay } from '../AnnotationOverlay';
import { CircleCheckIcon, XIcon as XCircleIcon, TriangleIcon, SpinnerIcon, PencilIcon } from '../icons';

interface MarkSheetOverlayProps {
    area: Area;
    point: Point;
    scoreData?: ScoreData;
}

const MarkSheetOverlay: React.FC<MarkSheetOverlayProps> = ({ area, point, scoreData }) => {
    if (!point.markSheetOptions || point.correctAnswerIndex === undefined || !scoreData?.detectedPositions) return null;
    
    const detectedMarkIndex = scoreData.detectedMarkIndex;
    const detectedPositions = scoreData.detectedPositions;

    return (
        <div className="absolute inset-0 pointer-events-none">
            {detectedPositions.map((pos, i) => {
                const isCorrectAnswer = i === point.correctAnswerIndex;
                
                let isDetectedAsMarked = false;
                if (Array.isArray(detectedMarkIndex)) {
                    isDetectedAsMarked = detectedMarkIndex.includes(i);
                } else {
                    isDetectedAsMarked = i === detectedMarkIndex;
                }

                const isIncorrectMark = isDetectedAsMarked && !isCorrectAnswer;
                
                const left = `${((pos.x - area.x) / area.width) * 100}%`;
                const top = `${((pos.y - area.y) / area.height) * 100}%`;

                return (
                    <React.Fragment key={`opt-${i}`}>
                        <div 
                            style={{
                                position: 'absolute',
                                left,
                                top,
                                width: '6px',
                                height: '6px',
                                backgroundColor: '#22c55e',
                                borderRadius: '50%',
                                transform: 'translate(-50%, -50%)',
                                boxShadow: '0 0 3px rgba(0,0,0,0.8)',
                                zIndex: 40
                            }}
                        />
                        <div style={{ position: 'absolute', left, top: 0, bottom: 0, width: '1px', backgroundColor: 'rgba(34, 197, 94, 0.1)', zIndex: 30 }} />
                        <div style={{ position: 'absolute', top, left: 0, right: 0, height: '1px', backgroundColor: 'rgba(34, 197, 94, 0.1)', zIndex: 30 }} />

                        {(isCorrectAnswer || isIncorrectMark) && (
                            <div 
                                style={{
                                    position: 'absolute',
                                    left,
                                    top,
                                    width: '32px',
                                    height: '32px',
                                    transform: 'translate(-50%, -50%)',
                                    border: isCorrectAnswer ? '4px solid rgba(34, 197, 94, 0.8)' : '4px solid rgba(239, 68, 68, 0.8)',
                                    borderRadius: '4px',
                                    backgroundColor: isCorrectAnswer ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    zIndex: 20
                                }}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

interface StudentAnswerCardProps {
    student: Student & { class: string; number: string; name: string };
    template: Template;
    area: Area;
    areas: Area[];
    point: Point;
    scoreData?: ScoreData;
    onScoreChange: (studentId: string, areaId: number, newScoreData: Partial<ScoreData>) => void;
    onStartAnnotation: (studentId: string, areaId: number) => void;
    onPanCommit: (studentId: string, areaId: number, offset: { x: number, y: number }) => void;
    status?: 'pending' | 'grading' | 'done' | 'error';
    isFocused: boolean;
    onFocus: (studentId: string) => void;
    partialScoreInput: string;
    isImageEnhanced?: boolean;
    autoAlign?: boolean;
    aiSettings: AISettings;
    renderMode?: 'table' | 'grid';
}

export const StudentAnswerCard: React.FC<StudentAnswerCardProps> = ({
    student, template, area, areas, point, scoreData, onScoreChange, onStartAnnotation, onPanCommit, status,
    isFocused, onFocus, partialScoreInput, isImageEnhanced, autoAlign, renderMode = 'grid'
}) => {
    const currentStatus = scoreData?.status || ScoringStatus.UNSCORED;
    const pageIndex = area.pageIndex || 0;
    const imageSrc = student.images[pageIndex] || null;
    const hasImage = !!imageSrc;

    const searchZones = React.useMemo(() => {
        if (!areas) return undefined;
        const marks = areas.filter(a => a.type === AreaType.ALIGNMENT_MARK && (a.pageIndex || 0) === pageIndex);
        if (marks.length !== 4) return undefined;
        
        const sortedByY = [...marks].sort((a, b) => a.y - b.y);
        const topTwo = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottomTwo = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x);
        
        return {
            tl: topTwo[0],
            tr: topTwo[1],
            br: bottomTwo[1],
            bl: bottomTwo[0]
        };
    }, [areas, pageIndex]);

    const handleStatusChange = (newStatus: ScoringStatus) => {
        if (!hasImage) return;
        let newScore: number | null = null;
        switch (newStatus) {
            case ScoringStatus.CORRECT: newScore = point.points; break;
            case ScoringStatus.INCORRECT: newScore = 0; break;
            case ScoringStatus.PARTIAL: newScore = scoreData?.score ?? Math.round(point.points / 2); break;
            case ScoringStatus.UNSCORED: newScore = null; break;
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
        handleStatusChange(currentStatus === ScoringStatus.CORRECT ? ScoringStatus.INCORRECT : ScoringStatus.CORRECT);
    };

    const displayScore = partialScoreInput ? `${partialScoreInput}_` : (scoreData?.score ?? '-');

    if (renderMode === 'table') {
        return (
            <tr 
                id={`student-card-${student.id}`} 
                onClick={() => onFocus(student.id)} 
                className={`group border-b border-slate-100 dark:border-slate-800 transition-colors cursor-pointer ${isFocused ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-900/10'}`}
            >
                <td className="p-3 align-top">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 font-medium">{student.class}-{student.number}</span>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[150px]">{student.name}</span>
                    </div>
                </td>
                <td className="p-3 align-top">
                    <div className="relative w-full max-w-xl bg-slate-100 dark:bg-slate-900 rounded overflow-hidden" style={{ aspectRatio: `${area.width} / ${area.height}`, minHeight: '60px', maxHeight: '120px' }}>
                        {status === 'grading' && (
                            <div className="absolute inset-0 bg-sky-500/10 flex items-center justify-center z-10">
                                <SpinnerIcon className="w-5 h-5 text-sky-500" />
                            </div>
                        )}
                        <AnswerSnippet 
                            imageSrc={imageSrc} 
                            area={area} 
                            template={template} 
                            pannable={isFocused} 
                            onClick={handleAnswerClick} 
                            manualPanOffset={scoreData?.manualPanOffset} 
                            onPanCommit={(offset) => onPanCommit(student.id, area.id, offset)} 
                            padding={15} 
                            isEnhanced={isImageEnhanced} 
                            useAlignment={autoAlign}
                            alignmentSettings={template.alignmentDetectionSettings}
                            searchZones={searchZones}
                            manualCorners={student.manualAlignmentCorners?.[pageIndex]}
                        >
                            <AnnotationOverlay annotations={scoreData?.annotations || []} />
                            <MarkSheetOverlay area={area} point={point} scoreData={scoreData} />
                        </AnswerSnippet>
                    </div>
                    {scoreData?.aiComment && (
                        <div className="mt-1 px-1.5 py-0.5 bg-sky-50 dark:bg-sky-900/30 border border-sky-100 dark:border-sky-800 rounded text-[10px] text-sky-700 dark:text-sky-300 italic max-w-xl" title={scoreData.aiComment}>
                            AI: {scoreData.aiComment}
                        </div>
                    )}
                </td>
                <td className="p-3 align-top text-center">
                    <div className="flex flex-col items-center gap-1">
                        {currentStatus === ScoringStatus.PARTIAL && hasImage ? (
                            <div className="flex items-center justify-center">
                                <input 
                                    type="number" 
                                    className="w-12 h-7 text-center border border-slate-300 dark:border-slate-600 rounded text-sm font-bold bg-white dark:bg-slate-700" 
                                    value={scoreData?.score ?? ''} 
                                    onClick={(e) => e.stopPropagation()} 
                                    onChange={handlePartialInput} 
                                    min={0} 
                                    max={point.points}
                                />
                                <span className="text-[10px] text-slate-500 ml-1">/ {point.points}</span>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                <span className={`text-sm font-bold ${!hasImage ? 'text-slate-300' : currentStatus === ScoringStatus.CORRECT ? 'text-green-600' : currentStatus === ScoringStatus.INCORRECT ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}>
                                    {displayScore}
                                </span>
                                <span className="text-[10px] text-slate-400">/ {point.points}</span>
                            </div>
                        )}
                    </div>
                </td>
                <td className="p-3 align-top text-right">
                    <div className="flex items-center justify-end gap-1">
                        <button disabled={!hasImage} onClick={(e) => { e.stopPropagation(); handleStatusChange(ScoringStatus.CORRECT); }} title="正解 (J)" className={`p-1.5 rounded-full transition-colors ${!hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' : currentStatus === ScoringStatus.CORRECT ? 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400' : 'text-slate-400 hover:bg-green-100 dark:hover:bg-green-900/50'}`}><CircleCheckIcon className="w-5 h-5" /></button>
                        <button disabled={!hasImage} onClick={(e) => { e.stopPropagation(); handleStatusChange(ScoringStatus.INCORRECT); }} title="不正解 (F)" className={`p-1.5 rounded-full transition-colors ${!hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' : currentStatus === ScoringStatus.INCORRECT ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400' : 'text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/50'}`}><XCircleIcon className="w-5 h-5" /></button>
                        <button disabled={!hasImage} onClick={(e) => { e.stopPropagation(); handleStatusChange(ScoringStatus.PARTIAL); }} title="部分点" className={`p-1.5 rounded-full transition-colors ${!hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' : currentStatus === ScoringStatus.PARTIAL ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400' : 'text-slate-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/50'}`}><TriangleIcon className="w-5 h-5" /></button>
                        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                        <button disabled={!hasImage} onClick={(e) => { e.stopPropagation(); onStartAnnotation(student.id, area.id); }} title="添削" className={`p-1.5 rounded-full transition-colors ${!hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' : 'text-slate-400 hover:bg-sky-100 dark:hover:bg-sky-900/50'}`}><PencilIcon className="w-5 h-5"/></button>
                    </div>
                </td>
            </tr>
        );
    }

    return (
         <div id={`student-card-${student.id}`} onClick={() => onFocus(student.id)} className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border ${isFocused ? 'border-sky-500 ring-2 ring-sky-500' : 'border-slate-200 dark:border-slate-700'} p-2 space-y-2 relative transition-all`}>
            {status === 'grading' && <div className="absolute inset-0 bg-sky-500/10 flex items-center justify-center rounded-lg z-10"><SpinnerIcon className="w-6 h-6 text-sky-500" /></div>}
            <div className="flex justify-between items-center">
                <h5 className="font-semibold text-xs truncate">{student.class}-{student.number} {student.name}</h5>
                <div className="flex items-center gap-1">
                    {currentStatus === ScoringStatus.PARTIAL && hasImage ? (
                        <div className="flex items-center">
                            <input type="number" className="w-12 h-6 text-right border border-slate-300 dark:border-slate-600 rounded text-sm px-1 bg-white dark:bg-slate-700 font-bold" value={scoreData?.score ?? ''} onClick={(e) => e.stopPropagation()} onChange={handlePartialInput} min={0} max={point.points}/>
                            <span className="text-xs text-slate-500 ml-1">/ {point.points}</span>
                        </div>
                    ) : (
                        <p className={`font-bold text-sm ${isFocused && partialScoreInput ? 'text-sky-500' : ''} ${!hasImage ? 'text-slate-400' : ''}`}>{displayScore} / {point.points}</p>
                    )}
                </div>
            </div>
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
                    isEnhanced={isImageEnhanced} 
                    useAlignment={autoAlign}
                    alignmentSettings={template.alignmentDetectionSettings}
                    searchZones={searchZones}
                    manualCorners={student.manualAlignmentCorners?.[pageIndex]}
                >
                    <AnnotationOverlay annotations={scoreData?.annotations || []} />
                    <MarkSheetOverlay area={area} point={point} scoreData={scoreData} />
                </AnswerSnippet>
            </div>
            {scoreData?.aiComment && (
                <div className="px-1 py-0.5 bg-sky-50 dark:bg-sky-900/30 border border-sky-100 dark:border-sky-800 rounded text-[10px] text-sky-700 dark:text-sky-300 italic line-clamp-2" title={scoreData.aiComment}>
                    AI: {scoreData.aiComment}
                </div>
            )}
            <div className="flex items-center justify-around gap-1">
                <button disabled={!hasImage} onClick={(e) => { e.stopPropagation(); handleStatusChange(ScoringStatus.CORRECT); }} title="正解 (J)" className={`p-1 rounded-full transition-colors ${!hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' : currentStatus === ScoringStatus.CORRECT ? 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400' : 'text-slate-400 hover:bg-green-100 dark:hover:bg-green-900/50'}`}><CircleCheckIcon className="w-5 h-5" /></button>
                <button disabled={!hasImage} onClick={(e) => { e.stopPropagation(); handleStatusChange(ScoringStatus.INCORRECT); }} title="不正解 (F)" className={`p-1 rounded-full transition-colors ${!hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' : currentStatus === ScoringStatus.INCORRECT ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400' : 'text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/50'}`}><XCircleIcon className="w-5 h-5" /></button>
                <button disabled={!hasImage} onClick={(e) => { e.stopPropagation(); handleStatusChange(ScoringStatus.PARTIAL); }} title="部分点" className={`p-1 rounded-full transition-colors ${!hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' : currentStatus === ScoringStatus.PARTIAL ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400' : 'text-slate-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/50'}`}><TriangleIcon className="w-5 h-5" /></button>
                <div className="border-l h-5 border-slate-200 dark:border-slate-600 mx-1"></div>
                <button disabled={!hasImage} onClick={(e) => { e.stopPropagation(); onStartAnnotation(student.id, area.id); }} title="添削" className={`p-1 rounded-full transition-colors ${!hasImage ? 'opacity-30 cursor-not-allowed text-slate-400' : 'text-slate-400 hover:bg-sky-100 dark:hover:bg-sky-900/50'}`}><PencilIcon className="w-5 h-5"/></button>
            </div>
        </div>
    );
};
