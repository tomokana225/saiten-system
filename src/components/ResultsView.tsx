import React, { useMemo, useState } from 'react';
import type { StudentResult, Area, Point, AllScores, QuestionStats } from '../types';
import { AreaType, ScoringStatus } from '../types';
import { FileDownIcon, PrintIcon, FileTextIcon, ListIcon, PieChartIcon, ArrowDown01Icon, ArrowDownWideNarrowIcon } from './icons';
import * as xlsx from 'xlsx';
import { useProject } from '../context/ProjectContext';

interface ResultsViewProps {
    onPreviewOpen: (config: { open: boolean, initialTab: 'report' | 'sheets', questionStats: QuestionStats[] }) => void;
}

const PieChart = ({ correct, partial, incorrect }: { correct: number, partial: number, incorrect: number }) => {
    const total = correct + partial + incorrect;
    if (total === 0) return <div className="w-24 h-24 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center"><span className="text-xs">データなし</span></div>;
    const correctDeg = (correct / total) * 360;
    const partialDeg = (partial / total) * 360;
    const gradient = `conic-gradient(#4ade80 0deg ${correctDeg}deg, #facc15 ${correctDeg}deg ${correctDeg + partialDeg}deg, #f87171 ${correctDeg + partialDeg}deg 360deg)`;
    return <div className="w-24 h-24 rounded-full" style={{ background: gradient }} />;
};

const QuestionAnalysisView: React.FC<{ stats: QuestionStats[], totalStudents: number }> = ({ stats, totalStudents }) => {
    if (stats.length === 0) {
        return <p className="text-center p-8 text-slate-500">分析する採点データがありません。</p>;
    }
    const totalCorrect = stats.reduce((sum, s) => sum + s.correctCount, 0);
    const totalPartial = stats.reduce((sum, s) => sum + s.partialCount, 0);
    const totalIncorrect = stats.reduce((sum, s) => sum + s.incorrectCount, 0);
    const totalAnswers = totalCorrect + totalPartial + totalIncorrect;
    const totalPointsPossible = stats.reduce((sum, s) => sum + s.fullMarks, 0) * totalStudents;
    const totalPointsScored = stats.reduce((sum, s) => sum + (s.averageScore * s.totalStudents), 0);
    const overallAverage = totalPointsPossible > 0 ? (totalPointsScored / totalPointsPossible) * 100 : 0;
    
    return (
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg"><h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">テスト全体の平均得点率</h3><p className="text-3xl font-bold text-sky-600 dark:text-sky-400">{overallAverage.toFixed(1)}%</p></div>
                <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg flex items-center justify-center gap-4">
                    <PieChart correct={totalCorrect} partial={totalPartial} incorrect={totalIncorrect} />
                    <div><h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">全体の解答比率</h3><ul className="text-xs space-y-1 text-left"><li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-400"></span>正解: {totalAnswers > 0 ? ((totalCorrect / totalAnswers) * 100).toFixed(1) : 0}%</li><li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-400"></span>部分点: {totalAnswers > 0 ? ((totalPartial / totalAnswers) * 100).toFixed(1) : 0}%</li><li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-400"></span>不正解: {totalAnswers > 0 ? ((totalIncorrect / totalAnswers) * 100).toFixed(1) : 0}%</li></ul></div>
                </div>
                <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg"><h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">総解答数</h3><p className="text-3xl font-bold">{totalAnswers}</p><span className="text-xs">({totalStudents}人 × {stats.length}問)</span></div>
            </div>
            <div>
                <h3 className="text-lg font-semibold mb-2">問題別詳細</h3>
                <div className="space-y-3">
                    {stats.map(stat => (
                        <div key={stat.id} className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md">
                            <div className="flex justify-between items-start">
                                <div><h4 className="font-semibold">{stat.label}</h4><p className="text-xs text-slate-500 dark:text-slate-400">平均点: {stat.averageScore.toFixed(1)} / {stat.fullMarks}点</p></div>
                                <div className="text-right"><p className="font-bold text-emerald-500">{stat.correctRate.toFixed(1)}%</p><p className="text-xs text-slate-500 dark:text-slate-400">正答率</p></div>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 mt-2 flex overflow-hidden">
                                <div className="bg-emerald-400" style={{ width: `${stat.correctRate}%` }} title={`正解: ${stat.correctRate.toFixed(1)}% (${stat.correctCount}人)`}></div>
                                <div className="bg-yellow-400" style={{ width: `${stat.partialRate}%` }} title={`部分点: ${stat.partialRate.toFixed(1)}% (${stat.partialCount}人)`}></div>
                                <div className="bg-red-400" style={{ width: `${stat.incorrectRate}%` }} title={`不正解: ${stat.incorrectRate.toFixed(1)}% (${stat.incorrectCount}人)`}></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const ResultsView = ({ onPreviewOpen }: ResultsViewProps) => {
    const { calculatedResults: results, activeProject } = useProject();
    const { areas, points, scores } = activeProject!;
    const [activeTab, setActiveTab] = useState<'list' | 'analysis'>('list');
    const [sortOrder, setSortOrder] = useState<'number' | 'score'>('number');
    
    const answerPoints = useMemo(() => {
        const answerAreaIds = new Set(areas.filter(a => a.type === AreaType.ANSWER || a.type === AreaType.MARK_SHEET).map(a => a.id));
        return points.filter(p => answerAreaIds.has(p.id));
    }, [areas, points]);

    const sortedResults = useMemo(() => {
        const sorted = [...results];
        if (sortOrder === 'number') {
            sorted.sort((a, b) => {
                const classCompare = a.class.localeCompare(b.class);
                if (classCompare !== 0) return classCompare;
                const numA = parseInt(a.number, 10), numB = parseInt(b.number, 10);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return a.number.localeCompare(b.number);
            });
        } else {
            sorted.sort((a, b) => {
                if (a.isAbsent && !b.isAbsent) return 1;
                if (!a.isAbsent && b.isAbsent) return -1;
                if (a.isAbsent && b.isAbsent) return 0;
                return b.totalScore - a.totalScore;
            });
        }
        return sorted;
    }, [results, sortOrder]);

    const questionStats = useMemo((): QuestionStats[] => {
        // Exclude absent students from stats calculations
        const presentResults = results.filter(r => !r.isAbsent);
        if (presentResults.length === 0) return [];

        return answerPoints.map(point => {
            let correctCount = 0, partialCount = 0, incorrectCount = 0, unscoredCount = 0, totalScore = 0;
            presentResults.forEach(result => {
                const scoreData = scores[result.id]?.[point.id];
                if (scoreData) {
                    totalScore += scoreData.score || 0;
                    switch(scoreData.status) {
                        case ScoringStatus.CORRECT: correctCount++; break;
                        case ScoringStatus.PARTIAL: partialCount++; break;
                        case ScoringStatus.INCORRECT: incorrectCount++; break;
                        default: unscoredCount++; break;
                    }
                } else {
                    unscoredCount++;
                }
            });
            const totalStudents = presentResults.length;
            const gradedStudents = totalStudents - unscoredCount;
            return {
                id: point.id, label: point.label, fullMarks: point.points,
                averageScore: gradedStudents > 0 ? totalScore / gradedStudents : 0,
                correctCount, partialCount, incorrectCount, unscoredCount, totalStudents,
                correctRate: gradedStudents > 0 ? (correctCount / gradedStudents) * 100 : 0,
                partialRate: gradedStudents > 0 ? (partialCount / gradedStudents) * 100 : 0,
                incorrectRate: gradedStudents > 0 ? (incorrectCount / gradedStudents) * 100 : 0,
            };
        });
    }, [results, answerPoints, scores]);

    const handleExportCSV = () => {
        const headers = ['クラス', '番号', '氏名', '合計点', '組順位', '学年順位', '偏差値', ...answerPoints.map(p => p.label)];
        const data = sortedResults.map(result => {
            if (result.isAbsent) {
                const studentScores = answerPoints.map(() => '-');
                return [result.class, result.number, result.name, '欠席', '-', '-', '-', ...studentScores];
            }
            const studentScores = answerPoints.map(point => scores[result.id]?.[point.id]?.score ?? '');
            return [result.class, result.number, result.name, result.totalScore, result.classRank, result.rank, result.standardScore, ...studentScores];
        });
        const csvContent = [headers.join(','), ...data.map(row => row.join(','))].join('\n');
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', '採点結果.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handleExportIndividualReports = () => {
        const wb = xlsx.utils.book_new();
        const summaryHeaders = ['クラス', '番号', '氏名', '合計点', '組順位', '学年順位', '偏差値', ...answerPoints.map(p => p.label)];
        const summaryData = sortedResults.map(result => {
            if (result.isAbsent) {
                const studentScores = answerPoints.map(() => '-');
                return [result.class, result.number, result.name, '欠席', '-', '-', '-', ...studentScores];
            }
            const studentScores = answerPoints.map(point => scores[result.id]?.[point.id]?.score ?? '');
            return [result.class, result.number, result.name, result.totalScore, result.classRank, result.rank, result.standardScore, ...studentScores];
        });
        const summaryWs = xlsx.utils.aoa_to_sheet([summaryHeaders, ...summaryData]);
        summaryWs['!cols'] = summaryHeaders.map(header => ({ wch: Math.max(header.length, 10) }));
        xlsx.utils.book_append_sheet(wb, summaryWs, '総合結果');
        
        // Use numbering order for sheets export generally
        const sortedByNumber = [...results].sort((a, b) => {
            const classCompare = a.class.localeCompare(b.class);
            if (classCompare !== 0) return classCompare;
            const numA = parseInt(a.number, 10), numB = parseInt(b.number, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.number.localeCompare(b.number);
        });

        sortedByNumber.forEach(student => {
            if (student.isAbsent) return; // Skip absent students for individual sheets? Or print blank? Let's skip.

            const studentData: (string | number)[][] = [
                ['氏名', student.name!], ['クラス', student.class!], ['番号', student.number!], [],
                ['合計点', student.totalScore], ['組順位', student.classRank || '-'], ['学年順位', student.rank || '-'], ['偏差値', student.standardScore], [],
                ['問題', '得点', '満点'],
            ];
            answerPoints.forEach(point => {
                const scoreData = scores[student.id]?.[point.id];
                studentData.push([point.label, scoreData?.score ?? 0, point.points]);
            });
            const ws = xlsx.utils.aoa_to_sheet(studentData);
            ws['!cols'] = [ { wch: 20 }, { wch: 10 }, { wch: 10 } ];
            const safeSheetName = `${student.class}-${student.number}-${student.name}`.substring(0, 31).replace(/[:\\/?*[\]]/g, '');
            xlsx.utils.book_append_sheet(wb, ws, safeSheetName);
        });
        xlsx.writeFile(wb, '個人成績表.xlsx');
    };
    
    const handlePreview = (initialTab: 'report' | 'sheets') => {
        onPreviewOpen({ open: true, initialTab, questionStats });
    };

    return (
        <div className="w-full flex flex-col h-full">
            <header className="flex-shrink-0 flex justify-between items-center pb-4">
                <div className="flex items-center gap-1 p-1 bg-slate-200 dark:bg-slate-900 rounded-lg">
                    <button onClick={() => setActiveTab('list')} className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'list' ? 'bg-white dark:bg-slate-700 shadow' : 'hover:bg-slate-100/50 dark:hover:bg-slate-800/50'}`}><ListIcon className="w-4 h-4"/> 成績一覧</button>
                    <button onClick={() => setActiveTab('analysis')} className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'analysis' ? 'bg-white dark:bg-slate-700 shadow' : 'hover:bg-slate-100/50 dark:hover:bg-slate-800/50'}`}><PieChartIcon className="w-4 h-4"/> 問題別分析</button>
                </div>
                <div className="flex items-center gap-2">
                     <button onClick={handleExportIndividualReports} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"><FileTextIcon className="w-4 h-4" />個人成績表をExcelで出力</button>
                    <button onClick={handleExportCSV} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"><FileDownIcon className="w-4 h-4" />CSVでエクスポート</button>
                    <button onClick={() => handlePreview('report')} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"><PrintIcon className="w-4 h-4" />個人成績表をPDF出力</button>
                    <button onClick={() => handlePreview('sheets')} className="flex items-center gap-2 px-3 py-2 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-md transition-colors"><PrintIcon className="w-4 h-4" />添削済み解答用紙を印刷</button>
                </div>
            </header>
            <main className="flex-1 flex flex-col overflow-auto">
                {activeTab === 'list' ? (
                    <div className="overflow-auto bg-white dark:bg-slate-800 rounded-lg shadow">
                        <div className="p-2 border-b dark:border-slate-700 flex justify-end gap-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400 self-center mr-2">並び替え:</span>
                            <button onClick={() => setSortOrder('number')} className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${sortOrder === 'number' ? 'bg-sky-50 dark:bg-sky-900 border-sky-300 text-sky-700 dark:text-sky-300' : 'border-slate-200 dark:border-slate-700'}`}>
                                <ArrowDown01Icon className="w-3 h-3"/> 番号順
                            </button>
                            <button onClick={() => setSortOrder('score')} className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${sortOrder === 'score' ? 'bg-sky-50 dark:bg-sky-900 border-sky-300 text-sky-700 dark:text-sky-300' : 'border-slate-200 dark:border-slate-700'}`}>
                                <ArrowDownWideNarrowIcon className="w-3 h-3"/> 成績順
                            </button>
                        </div>
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-100 dark:bg-slate-700 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 whitespace-nowrap w-16">クラス</th>
                                    <th className="px-4 py-3 whitespace-nowrap w-16">番号</th>
                                    <th className="px-4 py-3 whitespace-nowrap min-w-[12rem]">氏名</th>
                                    <th className="px-4 py-3 text-right whitespace-nowrap">合計点</th>
                                    <th className="px-4 py-3 text-right whitespace-nowrap">組順位</th>
                                    <th className="px-4 py-3 text-right whitespace-nowrap">学年順位</th>
                                    <th className="px-4 py-3 text-right whitespace-nowrap">偏差値</th>
                                    {answerPoints.map(point => (<th key={point.id} className="px-4 py-3 text-right whitespace-nowrap min-w-[4rem]">{point.label}</th>))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {sortedResults.map(result => (
                                    <tr key={result.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${result.isAbsent ? 'text-slate-400 bg-slate-50/50 dark:text-slate-500' : ''}`}>
                                        <td className="px-4 py-2 whitespace-nowrap">{result.class}</td>
                                        <td className="px-4 py-2 whitespace-nowrap">{result.number}</td>
                                        <td className="px-4 py-2 font-medium whitespace-nowrap">{result.name} {result.isAbsent && <span className="ml-2 text-xs bg-slate-200 dark:bg-slate-700 px-1 rounded text-slate-500">欠席</span>}</td>
                                        <td className="px-4 py-2 text-right font-bold whitespace-nowrap">{result.isAbsent ? '-' : result.totalScore}</td>
                                        <td className="px-4 py-2 text-right whitespace-nowrap">{result.isAbsent ? '-' : result.classRank}</td>
                                        <td className="px-4 py-2 text-right whitespace-nowrap">{result.isAbsent ? '-' : result.rank}</td>
                                        <td className="px-4 py-2 text-right whitespace-nowrap">{result.standardScore}</td>
                                        {answerPoints.map(point => (<td key={point.id} className="px-4 py-2 text-right whitespace-nowrap">{result.isAbsent ? '-' : (scores[result.id]?.[point.id]?.score ?? '-')}</td>))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                         {results.length === 0 && <p className="text-center p-8 text-slate-500">採点データがありません。</p>}
                    </div>
                ) : (
                    <QuestionAnalysisView stats={questionStats} totalStudents={results.filter(r => !r.isAbsent).length}/>
                )}
            </main>
        </div>
    );
};