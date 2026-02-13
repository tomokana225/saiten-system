
import React, { useState, useMemo } from 'react';
import type { GradingProject, Student, StudentInfo, AllScores, StudentResult, ScoreData, Point, QuestionStats } from '../types';
import * as xlsx from 'xlsx';
import { FileDownIcon, PrintIcon, ListIcon, PieChartIcon } from './icons';
import { AggregationPrintView } from './AggregationPrintView';
import { AreaType, ScoringStatus } from '../types';

interface GradeAggregationViewProps {
    projects: Record<string, GradingProject>;
}

interface AggregatedData {
    aggregatedResults: StudentResult[];
    points: Point[];
    answerPoints: Point[];
    allScores: AllScores;
    questionStats: QuestionStats[];
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


export const GradeAggregationView: React.FC<GradeAggregationViewProps> = ({ projects }) => {
    const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
    const [isPrintViewOpen, setIsPrintViewOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'list' | 'analysis'>('list');

    const handleToggleProject = (projectId: string) => {
        setSelectedProjectIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(projectId)) {
                newSet.delete(projectId);
            } else {
                newSet.add(projectId);
            }
            return newSet;
        });
    };

    const { aggregatedResults, points, answerPoints, allScores, questionStats } = useMemo((): AggregatedData => {
        const emptyResult: AggregatedData = { aggregatedResults: [], points: [], answerPoints: [], allScores: {}, questionStats: [] };
        if (selectedProjectIds.size < 1) return emptyResult;

        const selectedProjects = (Array.from(selectedProjectIds) as string[])
            .map((id: string) => projects[id])
            .filter((p): p is GradingProject => !!p);

        if (selectedProjects.length === 0) return emptyResult;

        const combinedScores: AllScores = {};
        const combinedStudentsMap = new Map<string, Student & StudentInfo>();
        
        // Helper to determine if a score entry is meaningful (has been graded)
        const isMeaningfulScore = (s: ScoreData) => s.status !== ScoringStatus.UNSCORED && s.score !== null;

        selectedProjects.forEach(proj => {
            if (!proj) return;
            
            // 1. Deep Merge Scores to prevent overwriting valid scores with empty ones
            Object.entries(proj.scores).forEach(([studentId, areaScores]) => {
                if (!combinedScores[studentId]) {
                    combinedScores[studentId] = { ...areaScores };
                } else {
                    Object.entries(areaScores).forEach(([areaIdStr, scoreData]) => {
                        const areaId = Number(areaIdStr);
                        const existingScore = combinedScores[studentId][areaId];
                        // Overwrite if new data is meaningful or we don't have data yet
                        if (isMeaningfulScore(scoreData) || !existingScore) {
                            combinedScores[studentId][areaId] = scoreData;
                        }
                    });
                }
            });

            // 2. Deduplicate Students using a Map
            proj.studentInfo.forEach((info, index) => {
                const sheet = proj.uploadedSheets[index];
                const hasImages = sheet && sheet.images && sheet.images.some(img => img !== null);
                const studentObj = { ...info, ...(sheet || { id: `missing-${info.id}`, originalName: 'N/A', filePath: null, images: [] }) };

                const existing = combinedStudentsMap.get(info.id);
                if (!existing) {
                    combinedStudentsMap.set(info.id, studentObj);
                } else {
                    // If we already have this student, prefer the one with answer sheet images
                    const existingHasImages = existing.images && existing.images.some(img => img !== null);
                    if (!existingHasImages && hasImages) {
                        combinedStudentsMap.set(info.id, studentObj);
                    }
                }
            });
        });
        
        const combinedStudents = Array.from(combinedStudentsMap.values());
        
        const referencePoints = selectedProjects[0].points;
        const answerPoints = referencePoints.filter(p => selectedProjects[0].areas.some(a => a.id === p.id && (a.type === AreaType.ANSWER || a.type === AreaType.MARK_SHEET)));
        const validPointIds = new Set(answerPoints.map(p => p.id));

        const allStudentsWithDetails = combinedStudents.map(student => {
            const studentScores = combinedScores[student.id] || {};
            // Only sum scores that correspond to valid answer areas in the reference project
            const totalScore = Object.entries(studentScores).reduce((sum, [pId, scoreData]) => {
                if (validPointIds.has(Number(pId))) {
                    return sum + (scoreData.score || 0);
                }
                return sum;
            }, 0);
            return { ...student, totalScore };
        });

        const allTotalScores = allStudentsWithDetails.map(s => s.totalScore);
        const totalStudents = allTotalScores.length;
        const sumScores = allTotalScores.reduce((sum, score) => sum + score, 0);
        const mean = totalStudents > 0 ? sumScores / totalStudents : 0;
        const variance = totalStudents > 0 ? allTotalScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / totalStudents : 0;
        const stdDev = Math.sqrt(variance);

        let resultsWithOverallRank = allStudentsWithDetails.map(student => {
            const standardScore = stdDev === 0 ? "50.0" : (((10 * (student.totalScore - mean)) / stdDev) + 50).toFixed(1);
            return { ...student, standardScore, rank: 0, classRank: 0, subtotals: {} };
        });

        resultsWithOverallRank.sort((a, b) => b.totalScore - a.totalScore);
        resultsWithOverallRank.forEach((result, index) => {
            result.rank = index > 0 && result.totalScore === resultsWithOverallRank[index - 1].totalScore ? resultsWithOverallRank[index - 1].rank : index + 1;
        });
        
        const resultsByClass: { [className: string]: (typeof resultsWithOverallRank) } = {};
        resultsWithOverallRank.forEach(result => {
            if (result.class) {
                if (!resultsByClass[result.class]) resultsByClass[result.class] = [];
                resultsByClass[result.class].push(result);
            }
        });
        Object.values(resultsByClass).forEach(classGroup => {
            classGroup.sort((a, b) => b.totalScore - a.totalScore);
            classGroup.forEach((result, index) => {
                result.classRank = index > 0 && result.totalScore === classGroup[index - 1].totalScore ? classGroup[index - 1].classRank : index + 1;
            });
        });

        const calculatedQuestionStats: QuestionStats[] = answerPoints.map(point => {
            let correctCount = 0, partialCount = 0, incorrectCount = 0, unscoredCount = 0, totalScore = 0;
            resultsWithOverallRank.forEach((result: StudentResult) => {
                const scoreData = combinedScores[result.id]?.[point.id];
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

        return { aggregatedResults: resultsWithOverallRank as StudentResult[], points: referencePoints, answerPoints, allScores: combinedScores, questionStats: calculatedQuestionStats };
    }, [selectedProjectIds, projects]);
    
    const handleExportCSV = () => {
        const headers = ['クラス', '番号', '氏名', '合計点', '組順位', '学年順位', '偏差値', ...answerPoints.map(p => p.label)];
        const data = aggregatedResults.map(result => {
            const studentScores = answerPoints.map(point => allScores[result.id]?.[point.id]?.score ?? '');
            return [result.class, result.number, result.name, result.totalScore, result.classRank, result.rank, result.standardScore, ...studentScores];
        });

        const csvContent = [headers.join(','), ...data.map(row => row.join(','))].join('\n');
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', '学年集計結果.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="w-full h-full flex flex-col gap-4">
             {isPrintViewOpen && (
                <AggregationPrintView
                    results={aggregatedResults}
                    points={points}
                    scores={allScores}
                    questionStats={questionStats}
                    onClose={() => setIsPrintViewOpen(false)}
                />
            )}
            <p className="text-slate-600 dark:text-slate-400">
                同じテストをクラスごとに採点したプロジェクトを複数選択して、学年全体の成績を集計します。
            </p>
            <div className="flex-1 flex gap-6 overflow-hidden">
                <aside className="w-80 flex-shrink-0 flex flex-col gap-4 bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                    <h3 className="text-lg font-semibold border-b pb-2 dark:border-slate-700">集計するテストを選択</h3>
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {Object.values(projects).map((p: GradingProject) => (
                            <label key={p.id} className="flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 has-[:checked]:bg-sky-50 dark:has-[:checked]:bg-sky-900/50">
                                <input
                                    type="checkbox"
                                    checked={selectedProjectIds.has(p.id)}
                                    onChange={() => handleToggleProject(p.id)}
                                    className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                />
                                <div>
                                    <span className="font-medium">{p.name}</span>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{p.studentInfo.length} 名</p>
                                </div>
                            </label>
                        ))}
                    </div>
                </aside>
                <main className="flex-1 flex flex-col gap-4 overflow-hidden">
                    <header className="flex-shrink-0 flex justify-between items-center">
                        <div className="flex items-center gap-1 p-1 bg-slate-200 dark:bg-slate-900 rounded-lg">
                            <button onClick={() => setActiveTab('list')} className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'list' ? 'bg-white dark:bg-slate-700 shadow' : 'hover:bg-slate-100/50 dark:hover:bg-slate-800/50'}`}><ListIcon className="w-4 h-4"/> 成績一覧</button>
                            <button onClick={() => setActiveTab('analysis')} className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'analysis' ? 'bg-white dark:bg-slate-700 shadow' : 'hover:bg-slate-100/50 dark:hover:bg-slate-800/50'}`}><PieChartIcon className="w-4 h-4"/> 問題別分析</button>
                        </div>
                        <div className="flex items-center gap-2">
                             <button onClick={() => setIsPrintViewOpen(true)} disabled={aggregatedResults.length === 0} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors disabled:opacity-50">
                                <PrintIcon className="w-4 h-4" />
                                個人成績表を印刷
                            </button>
                            <button onClick={handleExportCSV} disabled={aggregatedResults.length === 0} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors disabled:opacity-50">
                                <FileDownIcon className="w-4 h-4" />
                                CSVでエクスポート
                            </button>
                        </div>
                    </header>
                    <div className="flex-1 overflow-auto">
                        {aggregatedResults.length > 0 ? (
                            activeTab === 'list' ? (
                                <div className="overflow-auto bg-white dark:bg-slate-800 rounded-lg shadow">
                                    <table className="w-full text-sm text-left border-collapse">
                                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-100 dark:bg-slate-700 sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                <th className="px-4 py-3 whitespace-nowrap">学年順位</th>
                                                <th className="px-4 py-3 whitespace-nowrap w-16">クラス</th>
                                                <th className="px-4 py-3 whitespace-nowrap w-16">番号</th>
                                                <th className="px-4 py-3 whitespace-nowrap min-w-[12rem]">氏名</th>
                                                <th className="px-4 py-3 text-right whitespace-nowrap">合計点</th>
                                                <th className="px-4 py-3 text-right whitespace-nowrap">組順位</th>
                                                <th className="px-4 py-3 text-right whitespace-nowrap">偏差値</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                            {aggregatedResults.map(result => (
                                                <tr key={result.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                                    <td className="px-4 py-2 text-center font-bold whitespace-nowrap">{result.rank}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap">{result.class}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap">{result.number}</td>
                                                    <td className="px-4 py-2 font-medium whitespace-nowrap">{result.name}</td>
                                                    <td className="px-4 py-2 text-right font-bold whitespace-nowrap">{result.totalScore}</td>
                                                    <td className="px-4 py-2 text-right whitespace-nowrap">{result.classRank}</td>
                                                    <td className="px-4 py-2 text-right whitespace-nowrap">{result.standardScore}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <QuestionAnalysisView stats={questionStats} totalStudents={aggregatedResults.length} />
                            )
                        ) : (
                            <div className="flex items-center justify-center h-full bg-white dark:bg-slate-800 rounded-lg shadow">
                                <p className="text-slate-500 dark:text-slate-400">左のリストから集計するテストを2つ以上選択してください。</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};
