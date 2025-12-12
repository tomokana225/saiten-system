import React, { useMemo } from 'react';
import type { StudentResult, Point, AllScores, ReportLayoutSettings, QuestionStats } from '../../types';

interface PrintableIndividualReportProps {
    results: StudentResult[];
    allResults: StudentResult[];
    points: Point[];
    scores: AllScores;
    settings: ReportLayoutSettings;
    questionStats: QuestionStats[];
}

const DetailedDistributionGraph = ({ allScores, myScore, width = 200, height = 80, fontSize = 10 }: { allScores: string[], myScore: string, width?: number, height?: number, fontSize?: number }) => {
    // 1. Prepare bins (20-25, 25-30, ... 75-80)
    const bins = Array.from({ length: 13 }, (_, i) => 20 + i * 5); // 20, 25, ... 80
    const counts = new Array(bins.length - 1).fill(0);
    const myVal = parseFloat(myScore) || 50;
    
    // 2. Count
    allScores.forEach(s => {
        const val = parseFloat(s);
        if (!isNaN(val)) {
            const binIdx = Math.floor((val - 20) / 5);
            if (binIdx >= 0 && binIdx < counts.length) {
                counts[binIdx]++;
            } else if (binIdx >= counts.length) {
                counts[counts.length - 1]++; // Cap at max
            } else if (binIdx < 0) {
                counts[0]++; // Cap at min
            }
        }
    });

    const maxCount = Math.max(...counts, 1);
    const barWidth = width / counts.length;
    const myBinIdx = Math.min(Math.max(0, Math.floor((myVal - 20) / 5)), counts.length - 1);

    return (
        <div className="flex flex-col items-center w-full h-full">
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                {/* Bars */}
                {counts.map((count, i) => {
                    const barHeight = (count / maxCount) * (height - fontSize - 4); // Reserve space for labels
                    const x = i * barWidth;
                    const y = height - (fontSize + 4) - barHeight;
                    const isMyBin = i === myBinIdx;
                    return (
                        <g key={i}>
                            <rect 
                                x={x + 1} 
                                y={y} 
                                width={Math.max(0, barWidth - 2)} 
                                height={barHeight} 
                                fill={isMyBin ? "#ef4444" : "#e2e8f0"} 
                                rx="2"
                            />
                            {/* Count Label on top if count > 0 */}
                            {count > 0 && (
                                <text x={x + barWidth/2} y={y - 2} fontSize={Math.max(8, fontSize - 2)} textAnchor="middle" fill="#64748b">{count}</text>
                            )}
                        </g>
                    );
                })}
                
                {/* X Axis Labels */}
                <line x1={0} y1={height - fontSize - 2} x2={width} y2={height - fontSize - 2} stroke="#cbd5e1" strokeWidth="1" />
                {[20, 40, 60, 80].map(val => {
                    const x = ((val - 20) / 60) * width;
                    return (
                        <text key={val} x={x} y={height} fontSize={fontSize} fill="#94a3b8" textAnchor="middle">{val}</text>
                    );
                })}
            </svg>
            <div className={`font-bold text-slate-500 mt-1 text-center w-full truncate`} style={{ fontSize: fontSize }}>偏差値分布 <span className="text-red-500 text-[0.9em]">(赤:あなた)</span></div>
        </div>
    );
};

const PerformanceGraph = ({ points, studentScores, questionStats, height = 100, fontSize = 8 }: { points: Point[], studentScores: any, questionStats: QuestionStats[], height?: number, fontSize?: number }) => {
    if (points.length === 0) return null;

    return (
        <div className="w-full h-full flex items-end gap-[1px] pt-2" style={{ height: `${height}px` }}>
            {points.map((point, i) => {
                const stat = questionStats.find(s => s.id === point.id);
                const avgRate = stat ? stat.averageScore / stat.fullMarks : 0;
                const myScore = studentScores?.[point.id]?.score ?? 0;
                const myRate = point.points > 0 ? myScore / point.points : 0;
                
                const isAboveAvg = myRate >= avgRate;
                const barColor = isAboveAvg ? '#4ade80' : '#facc15'; // Green or Yellow

                return (
                    <div key={point.id} className="flex-1 flex flex-col items-center group relative h-full min-w-[4px]">
                        <div className="w-full relative flex-1 bg-slate-100 rounded-t-[1px] overflow-hidden flex items-end">
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
                                {/* Only show tooltip on hover or if space permits */}
                                <span className="hidden group-hover:block absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] text-slate-600 font-bold bg-white px-1 rounded shadow z-10 whitespace-nowrap">
                                    {Math.round(myRate*100)}%
                                </span>
                            </div>
                        </div>
                        <div className="text-slate-500 truncate w-full text-center mt-[1px] leading-none" style={{ fontSize: fontSize }} title={point.label}>
                            {i + 1}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export const PrintableIndividualReport = React.forwardRef<HTMLDivElement, PrintableIndividualReportProps>(
    ({ results, allResults, points, scores, settings, questionStats }, ref) => {
        
        const chunk = <T,>(arr: T[], size: number): T[][] =>
            Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
                arr.slice(i * size, i * size + size)
            );

        const resultChunks = chunk(results, settings.reportsPerPage);
        
        const validResults = useMemo(() => allResults.filter(r => !r.isAbsent), [allResults]);
        const allStandardScores = useMemo(() => validResults.map(r => r.standardScore), [validResults]);

        // Calculate Grade Average
        const gradeAverage = useMemo(() => {
            if (validResults.length === 0) return '-';
            const sum = validResults.reduce((acc, r) => acc + r.totalScore, 0);
            return (sum / validResults.length).toFixed(1);
        }, [validResults]);

        // Calculate Class Averages
        const classAverages = useMemo(() => {
            const totals: Record<string, { sum: number; count: number }> = {};
            validResults.forEach(r => {
                if (!totals[r.class]) totals[r.class] = { sum: 0, count: 0 };
                totals[r.class].sum += r.totalScore;
                totals[r.class].count++;
            });
            return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, (v.sum / v.count).toFixed(1)]));
        }, [validResults]);

        // Determine layout density based on reports per page
        const density = settings.reportsPerPage === 4 ? 'high' : settings.reportsPerPage === 2 ? 'medium' : 'low';

        const s = useMemo(() => {
            if (density === 'high') {
                return {
                    padding: '3mm',
                    headerMb: 'mb-1',
                    titleSize: 'text-sm',
                    infoSize: 'text-[9px]',
                    cardGridGap: 'gap-1',
                    cardMb: 'mb-2',
                    cardPadding: 'p-0.5',
                    cardTitle: 'text-[8px]',
                    cardValue: 'text-sm',
                    mainGap: 'gap-2',
                    colGap: 'gap-2',
                    tableText: 'text-[8px]',
                    tableHeadText: 'text-[8px]',
                    tableHeaderBg: 'bg-slate-50',
                    cellPadding: 'px-1 py-[1px]',
                    graphGap: 'gap-1',
                    graphHeight: 50,
                    graphFontSize: 8,
                    commentHeight: 'min-h-[30px]',
                    commentTitle: 'text-[8px]',
                    footerText: 'text-[8px]',
                    overflow: 'overflow-hidden',
                    mainOverflow: 'overflow-hidden',
                    avgInfoSize: 'text-[8px]',
                    graphWidth: 100,
                    mainHeight: 'h-full',
                };
            } else if (density === 'medium') {
                return {
                    padding: '6mm',
                    headerMb: 'mb-3',
                    titleSize: 'text-xl',
                    infoSize: 'text-xs',
                    cardGridGap: 'gap-3',
                    cardMb: 'mb-4',
                    cardPadding: 'p-1.5',
                    cardTitle: 'text-[10px]',
                    cardValue: 'text-xl',
                    mainGap: 'gap-4',
                    colGap: 'gap-3',
                    tableText: 'text-[10px]',
                    tableHeadText: 'text-[9px]',
                    tableHeaderBg: 'bg-slate-100',
                    cellPadding: 'px-1.5 py-0.5',
                    graphGap: 'gap-3',
                    graphHeight: 80,
                    graphFontSize: 9,
                    commentHeight: 'min-h-[60px]',
                    commentTitle: 'text-[10px]',
                    footerText: 'text-[9px]',
                    overflow: 'overflow-hidden',
                    mainOverflow: 'overflow-hidden',
                    avgInfoSize: 'text-[9px]',
                    graphWidth: 150,
                    mainHeight: 'h-full',
                };
            }
            // Low density (1 per page)
            return {
                padding: '10mm',
                headerMb: 'mb-4',
                titleSize: 'text-2xl',
                infoSize: 'text-sm',
                cardGridGap: 'gap-4',
                cardMb: 'mb-6',
                cardPadding: 'p-2',
                cardTitle: 'text-xs',
                cardValue: 'text-3xl',
                mainGap: 'gap-6',
                colGap: 'gap-4',
                tableText: 'text-sm',
                tableHeadText: 'text-xs',
                tableHeaderBg: 'bg-slate-100',
                cellPadding: 'px-2 py-1',
                graphGap: 'gap-6',
                graphHeight: 120,
                graphFontSize: 10,
                commentHeight: 'min-h-[80px]',
                commentTitle: 'text-xs',
                footerText: 'text-[10px]',
                overflow: 'overflow-visible',
                mainOverflow: 'overflow-visible',
                avgInfoSize: 'text-xs',
                graphWidth: 250,
                mainHeight: 'h-full',
            };
        }, [density]);

        const getPageStyle = (): React.CSSProperties => {
            return settings.orientation === 'landscape'
                ? { width: '297mm', height: '209mm' } 
                : { width: '210mm', height: '296mm' };
        };

        const getContainerStyle = (index: number): React.CSSProperties => {
            const baseStyle: React.CSSProperties = {
                boxSizing: 'border-box',
                padding: s.padding,
                display: 'flex',
                flexDirection: 'column',
                overflow: s.overflow,
                backgroundColor: 'white',
                position: 'relative',
                border: 'none', // Reset borders
            };

            if (settings.reportsPerPage === 1) {
                // Use minHeight to allow growth for single page reports
                return { ...baseStyle, width: '100%', minHeight: '100%', height: 'auto' };
            }
            
            const isLandscape = settings.orientation === 'landscape';
            
            // Borders for multi-up layout
            const borderStyle = '1px dashed #ccc';

            if (settings.reportsPerPage === 2) {
                return {
                    ...baseStyle,
                    width: isLandscape ? '50%' : '100%',
                    height: isLandscape ? '100%' : '50%',
                    borderRight: (isLandscape && index % 2 === 0) ? borderStyle : 'none',
                    borderBottom: (!isLandscape && index % 2 === 0) ? borderStyle : 'none',
                };
            }
            // 4 per page
            return {
                ...baseStyle,
                width: '50%',
                height: '50%',
                borderRight: (index % 2 === 0) ? borderStyle : 'none',
                borderBottom: (index < 2) ? borderStyle : 'none',
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
                            
                            // Split points into columns for the table
                            const itemsPerCol = Math.ceil(points.length / settings.questionTableColumns);
                            const pointColumns = Array.from({ length: settings.questionTableColumns }, (_, c) => 
                                points.slice(c * itemsPerCol, (c + 1) * itemsPerCol)
                            );

                            const classAvg = classAverages[result.class] || '-';

                            return (
                                <div key={result.id} style={getContainerStyle(idx)}>
                                    {/* Header */}
                                    <div className={`flex justify-between items-end border-b-2 border-slate-800 pb-1 ${s.headerMb}`}>
                                        <h1 className={`${s.titleSize} font-bold tracking-wider leading-none`}>個人成績表</h1>
                                        <div className={`${s.infoSize} font-semibold leading-none`}>
                                            <span>{result.class}</span> <span className="mx-1">-</span> <span>{result.number}</span> <span className="ml-2">{result.name}</span>
                                        </div>
                                    </div>

                                    {/* Summary Cards */}
                                    <div className={`grid grid-cols-4 ${s.cardGridGap} ${s.cardMb} flex-shrink-0`}>
                                        <div className={`bg-slate-50 border border-slate-200 rounded ${s.cardPadding} text-center flex flex-col justify-center`}>
                                            <div className={`${s.cardTitle} text-slate-500 font-bold mb-0.5`}>合計点</div>
                                            <div className={`${s.cardValue} font-bold text-slate-800 leading-tight`}>{result.totalScore} <span className="text-[0.5em] font-normal text-slate-400">/ {questionStats.reduce((sum, q)=>sum+q.fullMarks, 0)}</span></div>
                                            <div className={`mt-0.5 flex justify-center gap-2 ${s.avgInfoSize} text-slate-500 leading-none`}>
                                                <span title="学年平均">平均:{gradeAverage}</span>
                                                <span title="組平均">(組:{classAvg})</span>
                                            </div>
                                        </div>
                                        <div className={`bg-slate-50 border border-slate-200 rounded ${s.cardPadding} text-center flex flex-col justify-center`}>
                                            <div className={`${s.cardTitle} text-slate-500 font-bold mb-0.5`}>組順位</div>
                                            <div className={`${s.cardValue} font-bold text-slate-800 leading-tight`}>{result.classRank ?? '-'} <span className="text-[0.5em] font-normal">位</span></div>
                                        </div>
                                        <div className={`bg-slate-50 border border-slate-200 rounded ${s.cardPadding} text-center flex flex-col justify-center`}>
                                            <div className={`${s.cardTitle} text-slate-500 font-bold mb-0.5`}>学年順位</div>
                                            <div className={`${s.cardValue} font-bold text-slate-800 leading-tight`}>{result.rank ?? '-'} <span className="text-[0.5em] font-normal">位</span></div>
                                        </div>
                                        <div className={`bg-slate-50 border border-slate-200 rounded ${s.cardPadding} text-center relative overflow-hidden flex flex-col justify-center ${parseFloat(result.standardScore) >= 60 ? 'bg-green-50 border-green-200' : ''}`}>
                                            <div className={`${s.cardTitle} text-slate-500 font-bold mb-0.5`}>偏差値</div>
                                            <div className={`${s.cardValue} font-bold text-slate-800 leading-tight`}>{result.standardScore}</div>
                                        </div>
                                    </div>

                                    {/* Main Content Area */}
                                    <div className={`flex-1 flex ${s.mainGap} ${s.mainOverflow} min-h-0`}>
                                        {/* Left: Detailed Scores */}
                                        {settings.showScoreTable && (
                                            <div className={`flex-1 flex ${s.colGap} ${s.mainOverflow}`}>
                                                {pointColumns.map((colPoints, cIdx) => (
                                                    <div key={cIdx} className={`flex-1 flex flex-col ${s.mainHeight} overflow-hidden border border-slate-200 rounded-sm`}>
                                                        <table className="w-full border-collapse">
                                                            <thead className="sticky top-0 z-10">
                                                                <tr className={`${s.tableHeaderBg} text-slate-600 ${s.tableHeadText}`}>
                                                                    <th className={`border-b border-r border-slate-300 ${s.cellPadding} text-left font-medium w-auto`}>問題</th>
                                                                    <th className={`border-b border-r border-slate-300 ${s.cellPadding} text-right font-medium w-[15%]`}>点</th>
                                                                    <th className={`border-b border-r border-slate-300 ${s.cellPadding} text-right text-slate-400 font-normal w-[12%]`}>満</th>
                                                                    <th className={`border-b border-r border-slate-300 ${s.cellPadding} text-right text-slate-400 font-normal w-[12%]`}>平</th>
                                                                    {settings.showQuestionCorrectRate && <th className={`border-b border-slate-300 ${s.cellPadding} text-center text-slate-400 font-normal w-[25%]`}>正答率</th>}
                                                                </tr>
                                                            </thead>
                                                            <tbody className={`${s.tableText}`}>
                                                                {colPoints.map((point) => {
                                                                    const score = studentScores?.[point.id]?.score;
                                                                    const stat = questionStats.find(s => s.id === point.id);
                                                                    const avg = stat ? stat.averageScore.toFixed(1) : '-';
                                                                    const correctRate = stat ? stat.correctRate : 0;
                                                                    
                                                                    return (
                                                                        <tr key={point.id} className="border-b border-slate-200 last:border-b-0">
                                                                            <td className={`border-r border-slate-200 ${s.cellPadding} truncate max-w-[60px]`}>{point.label}</td>
                                                                            <td className={`border-r border-slate-200 ${s.cellPadding} text-right font-bold`}>{score ?? 0}</td>
                                                                            <td className={`border-r border-slate-200 ${s.cellPadding} text-right text-slate-400`}>{point.points}</td>
                                                                            <td className={`border-r border-slate-200 ${s.cellPadding} text-right text-slate-500 bg-slate-50`}>{avg}</td>
                                                                            {settings.showQuestionCorrectRate && (
                                                                                <td className={`${s.cellPadding} text-center align-middle`}>
                                                                                    <div className="flex items-center gap-1 h-full min-h-[8px]">
                                                                                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                                            <div 
                                                                                                className={`h-full ${correctRate >= 70 ? 'bg-sky-400' : correctRate >= 40 ? 'bg-sky-300' : 'bg-red-300'}`} 
                                                                                                style={{ width: `${correctRate}%` }}
                                                                                            />
                                                                                        </div>
                                                                                        <span className="text-[0.8em] text-slate-500 w-5 text-right leading-none">{Math.round(correctRate)}%</span>
                                                                                    </div>
                                                                                </td>
                                                                            )}
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Right: Analysis (Only for 1 or 2 reports per page) */}
                                        {settings.reportsPerPage <= 2 && (
                                            <div className={`w-[35%] flex flex-col ${s.graphGap}`}>
                                                {/* Deviation Graph */}
                                                {settings.showStandardScoreGraph && (
                                                    <div className="bg-white rounded p-1 border border-slate-200 flex flex-col items-center justify-center flex-shrink-0" style={{ height: s.graphHeight + 10 }}>
                                                        <DetailedDistributionGraph allScores={allStandardScores} myScore={result.standardScore} width={s.graphWidth} height={s.graphHeight} fontSize={s.graphFontSize} />
                                                    </div>
                                                )}

                                                {/* Performance Graph */}
                                                {settings.showPerformanceGraph && (settings.reportsPerPage === 1 || settings.orientation === 'landscape') && (
                                                    <div className="flex-1 min-h-0 border border-slate-200 rounded p-1 bg-white flex flex-col">
                                                        <div className={`${s.cardTitle} font-bold text-slate-500 text-center flex-shrink-0 mb-1`}>問題別達成度 (棒:あなた/影:平均)</div>
                                                        <div className="flex-1 min-h-0">
                                                            <PerformanceGraph points={points} studentScores={studentScores} questionStats={questionStats} height={undefined} fontSize={s.graphFontSize} />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Teacher's Comment Box */}
                                                {settings.showTeacherComment && (
                                                    <div className={`flex-shrink-0 ${s.commentHeight} border border-slate-300 rounded p-1`}>
                                                        <div className={`${s.commentTitle} font-bold text-slate-400`}>先生からのコメント</div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className={`mt-1 text-right text-slate-400 ${s.footerText} flex-shrink-0`}>
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