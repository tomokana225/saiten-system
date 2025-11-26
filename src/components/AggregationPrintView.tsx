import React, { useState, useRef, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import type { StudentResult, Point, AllScores, ReportLayoutSettings, QuestionStats } from '../types';
import { XIcon, PrintIcon } from './icons';
import { PrintableIndividualReport } from './printables/PrintableIndividualReport';

interface AggregationPrintViewProps {
    results: StudentResult[];
    points: Point[];
    scores: AllScores;
    questionStats: QuestionStats[];
    onClose: () => void;
}

export const AggregationPrintView: React.FC<AggregationPrintViewProps> = ({ results, points, scores, questionStats, onClose }) => {
    const printRef = useRef<HTMLDivElement>(null);
    const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set(['ALL']));
    const [sortOrder, setSortOrder] = useState<'rank' | 'number'>('rank');
    const [reportLayoutSettings, setReportLayoutSettings] = useState<ReportLayoutSettings>({
        orientation: 'portrait',
        reportsPerPage: 1,
        questionTableColumns: 1,
    });

    const uniqueClasses = useMemo(() => Array.from(new Set(results.map(r => r.class).filter(Boolean))).sort(), [results]);

    const handleClassSelectionChange = (className: string) => {
        setSelectedClasses(prev => {
            const newSet = new Set(prev);
            if (className === 'ALL') {
                if (newSet.has('ALL') || (uniqueClasses.length > 0 && uniqueClasses.every(c => newSet.has(c)))) {
                    return new Set(); // uncheck all
                } else {
                    return new Set(['ALL', ...uniqueClasses]); // check all
                }
            } else {
                newSet.delete('ALL'); // uncheck 'ALL' if a specific class is toggled
                if (newSet.has(className)) {
                    newSet.delete(className);
                } else {
                    newSet.add(className);
                }
                // Check if all specific classes are selected, then check 'ALL'
                if (uniqueClasses.length > 0 && uniqueClasses.every(c => newSet.has(c))) {
                    newSet.add('ALL');
                }
            }
            return newSet;
        });
    };

    const isAllSelected = selectedClasses.has('ALL') || (uniqueClasses.length > 0 && uniqueClasses.every(c => selectedClasses.has(c)));

    const sortedAndFilteredResults = useMemo(() => {
        const filtered = isAllSelected ? results : results.filter(r => selectedClasses.has(r.class));
    
        if (sortOrder === 'number') {
            return [...filtered].sort((a, b) => {
                const classCompare = a.class.localeCompare(b.class);
                if (classCompare !== 0) return classCompare;
                const numA = parseInt(a.number, 10);
                const numB = parseInt(b.number, 10);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                return a.number.localeCompare(b.number);
            });
        }
        // `results` prop is already sorted by rank
        return filtered;
    }, [results, selectedClasses, isAllSelected, sortOrder]);


    const printOptions = {
        content: () => printRef.current,
        onBeforePrint: async () => {
            if (reportLayoutSettings.orientation === 'landscape') {
                document.body.classList.add('printing-landscape');
            }
        },
        onAfterPrint: () => {
            document.body.classList.remove('printing-landscape');
        },
    };

    const handlePrint = useReactToPrint(printOptions as any);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
            <header className="bg-white dark:bg-slate-800 p-2 flex justify-between items-center print-preview-controls">
                <h2 className="text-lg font-semibold ml-4">個人成績表 印刷プレビュー</h2>
                <div className="flex items-center gap-4">
                    <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-500">
                        <PrintIcon className="w-5 h-5"/>
                        印刷
                    </button>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">
                        <XIcon className="w-6 h-6"/>
                    </button>
                </div>
            </header>
            <main className="flex-1 flex overflow-hidden">
                <div className="flex-1 bg-slate-300 dark:bg-slate-950/80 overflow-auto p-4">
                    {sortedAndFilteredResults.length > 0 ? (
                        <PrintableIndividualReport ref={printRef} results={sortedAndFilteredResults} points={points} scores={scores} settings={reportLayoutSettings} questionStats={questionStats} />
                    ) : (
                        <div className="flex items-center justify-center h-full text-white">
                            <p>印刷対象の生徒がいません。オプションを選択してください。</p>
                        </div>
                    )}
                </div>
                <aside className="w-80 bg-slate-100 dark:bg-slate-900 p-4 space-y-4 overflow-y-auto print-preview-controls">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">印刷オプション</h3>
                    <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50">
                        <label className="font-medium text-sm text-slate-700 dark:text-slate-300">並び順</label>
                        <div className="flex items-center gap-2 mt-1">
                            <button key="rank" onClick={() => setSortOrder('rank')} className={`px-3 py-1 text-xs rounded-md flex-1 ${sortOrder === 'rank' ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>点数順</button>
                            <button key="number" onClick={() => setSortOrder('number')} className={`px-3 py-1 text-xs rounded-md flex-1 ${sortOrder === 'number' ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>番号順</button>
                        </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50">
                        <label className="font-medium text-sm text-slate-700 dark:text-slate-300">用紙の向き</label>
                        <div className="flex items-center gap-2 mt-1">
                            {(['portrait', 'landscape'] as const).map(o => (
                                <button key={o} onClick={() => setReportLayoutSettings(s => ({ ...s, orientation: o }))} className={`px-3 py-1 text-xs rounded-md flex-1 ${reportLayoutSettings.orientation === o ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>{o === 'portrait' ? '縦' : '横'}</button>
                            ))}
                        </div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50">
                        <label className="font-medium text-sm text-slate-700 dark:text-slate-300">1枚あたりの人数</label>
                        <div className="flex items-center gap-2 mt-1">
                            {([1, 2, 4] as const).map(num => (
                                <button key={num} onClick={() => setReportLayoutSettings(s => ({ ...s, reportsPerPage: num }))} className={`px-3 py-1 text-xs rounded-md flex-1 ${reportLayoutSettings.reportsPerPage === num ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>{num}人</button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50">
                        <label className="font-medium text-sm text-slate-700 dark:text-slate-300">問題別得点表の列数</label>
                        <div className="flex items-center gap-2 mt-1">
                            {([1, 2, 3] as const).map(num => (
                                <button key={num} onClick={() => setReportLayoutSettings(s => ({ ...s, questionTableColumns: num }))} className={`px-3 py-1 text-xs rounded-md flex-1 ${reportLayoutSettings.questionTableColumns === num ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>{num}列</button>
                            ))}
                        </div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50 flex flex-col">
                        <label className="font-medium text-sm text-slate-700 dark:text-slate-300">印刷するクラス</label>
                        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                            <div className="flex items-center">
                                <input
                                    id="class-all"
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={() => handleClassSelectionChange('ALL')}
                                    className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                />
                                <label htmlFor="class-all" className="ml-2 text-sm">すべて選択</label>
                            </div>
                            {uniqueClasses.map(className => (
                                <div key={className} className="flex items-center">
                                    <input
                                        id={`class-${className}`}
                                        type="checkbox"
                                        checked={selectedClasses.has(className)}
                                        onChange={() => handleClassSelectionChange(className)}
                                        className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <label htmlFor={`class-${className}`} className="ml-2 text-sm">{className}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
};