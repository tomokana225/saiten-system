import React, { useMemo } from 'react';
import type { StudentResult, Point, AllScores, ReportLayoutSettings, QuestionStats } from '../../types';

interface PrintableIndividualReportProps {
    results: StudentResult[];
    points: Point[];
    scores: AllScores;
    settings: ReportLayoutSettings;
    questionStats: QuestionStats[];
}

// Helper to calculate normal distribution path
const getNormalDistributionPath = (width: number, height: number, mean: number, stdDev: number) => {
    let path = "";
    for (let x = 0; x <= width; x += 2) {
        const xVal = 20 + (x / width) * 60; // Map x (0-width) to deviation (20-80)
        const yVal = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((xVal - mean) / stdDev, 2));
        // Scale y to height (max density approx 0.04 for mean=50, stdDev=10)
        const plotY = height - (yVal / 0.045) * height;
        path += `${x === 0 ? "M" : "L"} ${x} ${plotY} `;
    }
    return path + `L ${width} ${height} L 0 ${height} Z`;
};

const StandardDistributionGraph = ({ standardScore, width = 200, height = 80 }: { standardScore: string, width?: number, height?: number }) => {
    const score = parseFloat(standardScore) || 50;
    const path = useMemo(() => getNormalDistributionPath(width, height, 50, 10), [width, height]);
    const xPos = Math.max(0, Math.min(width, ((score - 20) / 60) * width)); // Clamp between 20-80

    return (
        <div className="flex flex-col items-center">
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                {/* Background Zones */}
                <path d={path} fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
                
                {/* Mean Line */}
                <line x1={width / 2} y1={0} x2={width / 2} y2={height} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 2" />
                
                {/* Student Position */}
                <line x1={xPos} y1={0} x2={xPos} y2={height} stroke="#ef4444" strokeWidth="2" />
                <circle cx={xPos} cy={0} r="4" fill="#ef4444" />
                
                {/* Labels */}
                <text x={0} y={height + 12} fontSize="10" fill="#64748b">20</text>
                <text x={width / 2} y={height + 12} fontSize="10" fill="#64748b" textAnchor="middle">50</text>
                <text x={width} y={height + 12} fontSize="10" fill="#64748b" textAnchor="end">80</text>
            </svg>
            <div className="text-xs font-bold text-slate-500 mt-1">偏差値分布</div>
        </div>
    );
};

const PerformanceGraph = ({ points, studentScores, questionStats, height = 100 }: { points: Point[], studentScores: any, questionStats: QuestionStats[], height?: number }) => {
    if (points.length === 0) return null;

    return (
        <div className="w-full h-full flex items-end gap-1 pt-4" style={{ height: `${height}px` }}>
            {points.map((point, i) => {
                const stat = questionStats.find(s => s.id === point.id);
                const avgRate = stat ? stat.averageScore / stat.fullMarks : 0;
                const myScore = studentScores?.[point.id]?.score ?? 0;
                const myRate = myScore / point.points;
                
                const isAboveAvg = myRate >= avgRate;
                const barColor = isAboveAvg ? '#4ade80' : '#facc15'; // Green or Yellow

                return (
                    <div key={point.id} className="flex-1 flex flex-col items-center group relative h-full">
                        <div className="w-full relative flex-1 bg-slate-100 rounded-t-sm overflow-hidden flex items-end">
                            {/* Average Line/Block (Shadow) */}
                            <div 
                                className="absolute bottom-0 w-full bg-slate-300/50 border-t border-slate-400 border-dashed"
                                style={{ height: `${avgRate * 100}%` }}
                            />
                            {/* Student Bar */}
                            <div 
                                className="w-full transition-all relative"
                                style={{ height: `${myRate * 100}%`, backgroundColor: barColor }}
                            >
                                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] text-slate-600 font-bold opacity-0 group-hover:opacity-100">{Math.round(myRate*100)}%</span>
                            </div>
                        </div>
                        <div className="text-[8px] text-slate-500 truncate w-full text-center mt-1" title={point.label}>
                            {i + 1}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export const PrintableIndividualReport = React.forwardRef<HTMLDivElement, PrintableIndividualReportProps>(
    ({ results, points, scores, settings, questionStats }, ref) => {
        
        const chunk = <T,>(arr: T[], size: number): T[][] =>
            Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
                arr.slice(i * size, i * size + size)
            );

        const resultChunks = chunk(results, settings.reportsPerPage);
        
        const getPageStyle = (): React.CSSProperties => {
            return settings.orientation === 'landscape'
                ? { width: '297mm', height: '209mm' } 
                : { width: '210mm', height: '296mm' };
        };

        const getContainerStyle = (index: number): React.CSSProperties => {
            const baseStyle: React.CSSProperties = {
                boxSizing: 'border-box',
                padding: '10mm',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                backgroundColor: 'white',
                position: 'relative'
            };

            if (settings.reportsPerPage === 1) return { ...baseStyle, width: '100%', height: '100%' };
            
            const isLandscape = settings.orientation === 'landscape';
            
            if (settings.reportsPerPage === 2) {
                return {
                    ...baseStyle,
                    width: isLandscape ? '50%' : '100%',
                    height: isLandscape ? '100%' : '50%',
                    borderRight: (isLandscape && index % 2 === 0) ? '1px dashed #ccc' : 'none',
                    borderBottom: (!isLandscape && index % 2 === 0) ? '1px dashed #ccc' : 'none',
                    padding: '8mm'
                };
            }
            // 4 per page
            return {
                ...baseStyle,
                width: '50%',
                height: '50%',
                borderRight: (index % 2 === 0) ? '1px dashed #ccc' : 'none',
                borderBottom: (index < 2) ? '1px dashed #ccc' : 'none',
                padding: '5mm'
            };
        };

        return (
            <div ref={ref} className="printable-area printable-content bg-white text-slate-800 font-sans">
                {resultChunks.map((chunk, pageIndex) => (
                    <div
                        key={`page-${pageIndex}`}
                        className="mx-auto page-break-after flex flex-wrap content-start"
                        style={getPageStyle()}
                    >
                        {chunk.map((result: StudentResult, idx) => {
                            const studentScores = scores[result.id];
                            const studentStats = questionStats; 
                            // Split points into columns for the table
                            const itemsPerCol = Math.ceil(points.length / settings.questionTableColumns);
                            const pointColumns = Array.from({ length: settings.questionTableColumns }, (_, c) => 
                                points.slice(c * itemsPerCol, (c + 1) * itemsPerCol)
                            );

                            return (
                                <div key={result.id} style={getContainerStyle(idx)}>
                                    {/* Header */}
                                    <div className="flex justify-between items-end border-b-2 border-slate-800 pb-2 mb-4">
                                        <h1 className="text-2xl font-bold tracking-wider">個人成績表</h1>
                                        <div className="text-sm font-semibold">
                                            <span>{result.class}</span> <span className="mx-1">-</span> <span>{result.number}</span> <span className="ml-2 text-lg">{result.name}</span>
                                        </div>
                                    </div>

                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-4 gap-4 mb-6">
                                        <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
                                            <div className="text-xs text-slate-500 font-bold mb-1">合計点</div>
                                            <div className="text-3xl font-bold text-slate-800">{result.totalScore} <span className="text-xs font-normal text-slate-400">/ {questionStats.reduce((sum, q)=>sum+q.fullMarks, 0)}</span></div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
                                            <div className="text-xs text-slate-500 font-bold mb-1">組順位</div>
                                            <div className="text-xl font-bold text-slate-800">{result.classRank ?? '-'} <span className="text-xs font-normal">位</span></div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
                                            <div className="text-xs text-slate-500 font-bold mb-1">学年順位</div>
                                            <div className="text-xl font-bold text-slate-800">{result.rank ?? '-'} <span className="text-xs font-normal">位</span></div>
                                        </div>
                                        <div className={`bg-slate-50 border border-slate-200 rounded p-2 text-center relative overflow-hidden ${parseFloat(result.standardScore) >= 60 ? 'bg-green-50 border-green-200' : ''}`}>
                                            <div className="text-xs text-slate-500 font-bold mb-1">偏差値</div>
                                            <div className="text-3xl font-bold text-slate-800">{result.standardScore}</div>
                                        </div>
                                    </div>

                                    {/* Main Content Area */}
                                    <div className="flex-1 flex gap-6 overflow-hidden">
                                        {/* Left: Detailed Scores */}
                                        <div className="flex-1 flex gap-4 overflow-hidden">
                                            {pointColumns.map((colPoints, cIdx) => (
                                                <div key={cIdx} className="flex-1 flex flex-col h-full overflow-hidden">
                                                    <table className="w-full text-sm border-collapse border border-slate-300">
                                                        <thead>
                                                            <tr className="bg-slate-100 text-slate-600 text-xs">
                                                                <th className="border border-slate-300 px-2 py-1 text-left">問題</th>
                                                                <th className="border border-slate-300 px-2 py-1 w-12 text-right">得点</th>
                                                                <th className="border border-slate-300 px-2 py-1 w-10 text-right text-slate-400 font-normal">満点</th>
                                                                <th className="border border-slate-300 px-2 py-1 w-12 text-right text-slate-400 font-normal">平均</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {colPoints.map((point) => {
                                                                const score = studentScores?.[point.id]?.score;
                                                                const stat = questionStats.find(s => s.id === point.id);
                                                                const avg = stat ? stat.averageScore.toFixed(1) : '-';
                                                                return (
                                                                    <tr key={point.id} className="border-b border-slate-200">
                                                                        <td className="border-x border-slate-300 px-2 py-1 text-xs truncate max-w-[80px]">{point.label}</td>
                                                                        <td className="border-x border-slate-300 px-2 py-1 text-right font-bold">{score ?? 0}</td>
                                                                        <td className="border-x border-slate-300 px-2 py-1 text-right text-slate-400 text-xs">{point.points}</td>
                                                                        <td className="border-x border-slate-300 px-2 py-1 text-right text-slate-500 text-xs bg-slate-50">{avg}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Right: Analysis (Only for 1 or 2 reports per page) */}
                                        {settings.reportsPerPage <= 2 && (
                                            <div className="w-1/3 flex flex-col gap-6">
                                                {/* Deviation Graph */}
                                                <div className="bg-white rounded-lg p-2 border border-slate-200 flex flex-col items-center justify-center">
                                                    <StandardDistributionGraph standardScore={result.standardScore} width={160} height={60} />
                                                </div>

                                                {/* Performance Graph (Only for 1 report per page or landscape 2) */}
                                                {(settings.reportsPerPage === 1 || settings.orientation === 'landscape') && (
                                                    <div className="flex-1 min-h-[100px] border border-slate-200 rounded p-2 bg-white flex flex-col">
                                                        <div className="text-xs font-bold text-slate-500 mb-1 text-center">問題別達成度 (棒:あなた / 影:平均)</div>
                                                        <PerformanceGraph points={points} studentScores={studentScores} questionStats={questionStats} height={120} />
                                                    </div>
                                                )}

                                                {/* Teacher's Comment Box */}
                                                <div className="flex-1 min-h-[80px] border-2 border-slate-300 rounded p-2">
                                                    <div className="text-xs font-bold text-slate-400 mb-1">先生からのコメント</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="mt-2 text-[10px] text-right text-slate-400">
                                        AI Grading Assistant - {new Date().toLocaleDateString()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    }
);
