import React, { useState, useEffect } from 'react';
import type { StudentResult, Point, AllScores, ReportLayoutSettings, QuestionStats } from '../../types';

interface PrintableIndividualReportProps {
    results: StudentResult[];
    points: Point[];
    scores: AllScores;
    settings: ReportLayoutSettings;
    questionStats: QuestionStats[];
}

export const PrintableIndividualReport = React.forwardRef<HTMLDivElement, PrintableIndividualReportProps>(
    ({ results, points, scores, settings, questionStats }, ref) => {
        const sortedResults = results;

        const [dynamicStyles, setDynamicStyles] = useState({ tableFontSize: '14px', cellPadding: '4px' });

        useEffect(() => {
            if (points.length === 0) return;

            const itemsPerColumn = Math.ceil(points.length / settings.questionTableColumns);
            if (itemsPerColumn === 0) return;

            let baseFontSize = 14;
            let basePadding = 4; // in px
            let threshold = 25; // Number of questions before scaling down

            switch (settings.reportsPerPage) {
                case 2:
                    baseFontSize = 12;
                    threshold = settings.orientation === 'portrait' ? 18 : 38;
                    basePadding = 3;
                    break;
                case 4:
                    baseFontSize = 10;
                    threshold = settings.orientation === 'portrait' ? 12 : 22;
                    basePadding = 2;
                    break;
                case 1:
                default:
                     threshold = settings.orientation === 'portrait' ? 45 : 30;
                     break;
            }

            let finalFontSize = baseFontSize;
            let finalPadding = basePadding;

            if (itemsPerColumn > threshold) {
                const scale = Math.max(0.7, threshold / itemsPerColumn);
                finalFontSize = Math.max(8, baseFontSize * scale); // Minimum font size of 8px
                finalPadding = Math.max(1, basePadding * scale); // Minimum padding of 1px
            }
            
            setDynamicStyles({
                tableFontSize: `${finalFontSize.toFixed(2)}px`,
                cellPadding: `${finalPadding.toFixed(2)}px`,
            });

        }, [points.length, settings.reportsPerPage, settings.orientation, settings.questionTableColumns]);

        const chunk = <T,>(arr: T[], size: number): T[][] =>
            Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
                arr.slice(i * size, i * size + size)
            );

        const resultChunks = chunk(sortedResults, settings.reportsPerPage);
        
        const { questionTableColumns } = settings;
        const itemsPerColumn = Math.ceil(points.length / questionTableColumns);
        const pointColumns = Array.from({ length: questionTableColumns }, (_, colIndex) => 
            points.slice(colIndex * itemsPerColumn, (colIndex + 1) * itemsPerColumn)
        );

        const getPageStyle = (): React.CSSProperties => {
            return settings.orientation === 'landscape'
                ? { width: '297mm', height: '209mm' } // A4 landscape
                : { width: '210mm', height: '296mm' }; // A4 portrait
        };

        const getReportCardStyle = (): React.CSSProperties => {
            const baseStyle: React.CSSProperties = {
                boxSizing: 'border-box',
                border: '1px solid #ccc',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            };
            switch (settings.reportsPerPage) {
                case 2:
                    return settings.orientation === 'portrait'
                        ? { ...baseStyle, width: '100%', height: '50%' }
                        : { ...baseStyle, width: '50%', height: '100%' };
                case 4:
                    return { ...baseStyle, width: '50%', height: '50%' };
                case 1:
                default:
                    return { ...baseStyle, width: '100%', height: '100%', border: 'none', padding: '2rem' };
            }
        };
        
        const getTitleFontSizeClass = () => {
            switch (settings.reportsPerPage) {
                case 2: return 'text-2xl';
                case 4: return 'text-xl';
                case 1: default: return 'text-3xl';
            }
        };
        const getStatFontSizeClass = () => {
             switch (settings.reportsPerPage) {
                case 2: return 'text-3xl';
                case 4: return 'text-2xl';
                case 1: default: return 'text-4xl';
            }
        };

        return (
            <div ref={ref} className="printable-area printable-content bg-white text-black">
                {resultChunks.map((chunk, pageIndex) => (
                    <div
                        key={`page-${pageIndex}`}
                        className="p-0 mx-auto border-b border-gray-300 page-break-after flex flex-wrap"
                        style={getPageStyle()}
                    >
                        {/* FIX: Explicitly type 'result' to 'StudentResult' to resolve property access errors. */}
                        {chunk.map((result: StudentResult) => (
                             <div key={result.id} style={getReportCardStyle()}>
                                <h1 className={`${getTitleFontSizeClass()} font-bold text-center mb-4`}>個人成績表</h1>
                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    <div><strong>氏名:</strong> {result.name}</div>
                                    <div><strong>クラス:</strong> {result.class}</div>
                                    <div><strong>番号:</strong> {result.number}</div>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-center mb-6">
                                    <div className="p-2 bg-gray-100 rounded-md">
                                        <div className="text-xs text-gray-600">合計点</div>
                                        <div className={`${getStatFontSizeClass()} font-bold`}>{result.totalScore}</div>
                                    </div>
                                    <div className="p-2 bg-gray-100 rounded-md">
                                        <div className="text-xs text-gray-600">組順位</div>
                                        <div className={`${getStatFontSizeClass()} font-bold`}>{result.classRank}</div>
                                    </div>
                                    <div className="p-2 bg-gray-100 rounded-md">
                                        <div className="text-xs text-gray-600">学年順位</div>
                                        <div className={`${getStatFontSizeClass()} font-bold`}>{result.rank}</div>
                                    </div>
                                    <div className="p-2 bg-gray-100 rounded-md">
                                        <div className="text-xs text-gray-600">偏差値</div>
                                        <div className={`${getStatFontSizeClass()} font-bold`}>{result.standardScore}</div>
                                    </div>
                                </div>
                                <h2 className="text-xl font-semibold mb-2">問題別得点</h2>
                                <div className="flex-grow overflow-hidden flex" style={{ gap: '1rem' }}>
                                    {pointColumns.map((columnPoints, colIndex) => (
                                        <div key={colIndex} className="flex-1 overflow-hidden flex flex-col">
                                            <table className="w-full border-collapse" style={{ fontSize: dynamicStyles.tableFontSize }}>
                                                <thead>
                                                    <tr className="bg-gray-200">
                                                        <th className="border text-left" style={{ padding: dynamicStyles.cellPadding }}>問題</th>
                                                        <th className="border text-right" style={{ padding: dynamicStyles.cellPadding }}>得点</th>
                                                        <th className="border text-right" style={{ padding: dynamicStyles.cellPadding }}>満点</th>
                                                        <th className="border text-right" style={{ padding: dynamicStyles.cellPadding }} title="選択されたクラス全体での正答率">学年正答率</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {columnPoints.map(point => {
                                                        const studentScore = scores[result.id]?.[point.id]?.score ?? 0;
                                                        const stat = questionStats.find(s => s.id === point.id);
                                                        const correctRate = stat ? `${stat.correctRate.toFixed(1)}%` : '-';
                                                        return (
                                                        <tr key={point.id} className="border-t">
                                                            <td className="border" style={{ padding: dynamicStyles.cellPadding }}>{point.label}</td>
                                                            <td className="border text-right" style={{ padding: dynamicStyles.cellPadding }}>{studentScore}</td>
                                                            <td className="border text-right" style={{ padding: dynamicStyles.cellPadding }}>{point.points}</td>
                                                            <td className="border text-right" style={{ padding: dynamicStyles.cellPadding }}>{correctRate}</td>
                                                        </tr>
                                                    )})}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        );
    }
);