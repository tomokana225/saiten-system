import React from 'react';
import type { StudentResult, Template, Area, Point, AllScores, LayoutSettings, Annotation } from '../../types';
import { AreaType, ScoringStatus } from '../../types';

// This component is a bit complex due to SVG rendering.
// It renders annotations (drawings/text) on top of the answer sheet.
const AnnotationOverlayForPrint: React.FC<{ annotations: Annotation[], width: number, height: number }> = ({ annotations, width, height }) => {
    if (!annotations || annotations.length === 0) {
        return null;
    }

    // Unify logic with AnnotationOverlay.tsx to ensure stability. Use a 0-100 viewBox.
    const generatePenPath = (points: { x: number; y: number }[]): string => {
        if (points.length < 2) {
            return points.length === 1 ? `M ${points[0].x * 100} ${points[0].y * 100} L ${points[0].x * 100} ${points[0].y * 100}` : '';
        }
        let path = `M ${points[0].x * 100} ${points[0].y * 100}`;
        for (let i = 1; i < points.length; i++) {
            path += ` L ${points[i].x * 100} ${points[i].y * 100}`;
        }
        return path;
    };

    const generateWavePath = (points: { x: number; y: number }[], strokeWidth: number): string => {
        if (points.length < 2) return '';
        let path = `M ${points[0].x * 100} ${points[0].y * 100}`;
        const amplitude = 2; // Fixed amplitude in viewBox units
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];
            const midX = (p1.x * 100 + p2.x * 100) / 2;
            const midY = (p1.y * 100 + p2.y * 100) / 2;
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const perpAngle = angle + Math.PI / 2;
            const ctrlPoint = {
                x: midX + amplitude * Math.cos(perpAngle),
                y: midY + amplitude * Math.sin(perpAngle),
            };
            path += ` Q ${ctrlPoint.x} ${ctrlPoint.y}, ${p2.x * 100} ${p2.y * 100}`;
        }
        return path;
    };


    return (
        <svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
        >
            {annotations.map(anno => {
                switch (anno.tool) {
                    case 'pen':
                        return <path key={anno.id} d={generatePenPath(anno.points)} stroke={anno.color} strokeWidth={anno.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
                    case 'wave':
                         return <path key={anno.id} d={generateWavePath(anno.points, anno.strokeWidth)} stroke={anno.color} strokeWidth={anno.strokeWidth} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>;
                    case 'circle':
                        return <ellipse key={anno.id} cx={(anno.x + anno.width / 2) * 100} cy={(anno.y + anno.height / 2) * 100} rx={anno.width / 2 * 100} ry={anno.height / 2 * 100} stroke={anno.color} strokeWidth={anno.strokeWidth} fill="none" vectorEffect="non-scaling-stroke"/>;
                    case 'text':
                        // Font size may not scale perfectly for printing now, but it will be stable.
                        return <text key={anno.id} x={anno.x * 100} y={anno.y * 100} fill={anno.color} fontSize={anno.fontSize} dominantBaseline="hanging" style={{ whiteSpace: 'pre-wrap' }}>{anno.text}</text>;
                    default:
                        return null;
                }
            })}
        </svg>
    );
};

interface PrintableAnswerSheetProps {
    results: StudentResult[];
    template: Template;
    areas: Area[];
    points: Point[];
    scores: AllScores;
    settings: LayoutSettings;
}

export const PrintableAnswerSheet = React.forwardRef<HTMLDivElement, PrintableAnswerSheetProps>(
    ({ results, template, areas, points, scores, settings }, ref) => {

        const getPointForArea = (area: Area) => points.find(p => p.id === area.id);

        const getPointColor = (point: Point): string => {
            if (point.subtotalIds && point.subtotalIds.length > 0) {
                const subtotalId = point.subtotalIds[0];
                return settings.subtotal.colors[subtotalId] || settings.subtotal.color;
            }
            return settings.point.color;
        };

        const getSubtotalColor = (subtotalId: number): string => {
            return settings.subtotal.colors[subtotalId] || settings.subtotal.color;
        };
        
        const hAlignMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
        const vAlignMap = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

        const cornerAlignMap = {
            'bottom-right': { justifyContent: 'flex-end', alignItems: 'flex-end' },
            'top-right': { justifyContent: 'flex-end', alignItems: 'flex-start' },
            'top-left': { justifyContent: 'flex-start', alignItems: 'flex-start' },
            'bottom-left': { justifyContent: 'flex-start', alignItems: 'flex-end' },
        };

        const isPageLandscape = template.width > template.height;
        const pageWidth = isPageLandscape ? 297 : 210;
        const pageHeight = isPageLandscape ? 210 : 297;
        const padding = 5; // padding in mm per side
        const availableWidth = pageWidth - (padding * 2);
        const availableHeight = pageHeight - (padding * 2);

        const pageAspectRatio = availableWidth / availableHeight;
        const templateAspectRatio = template.width / template.height;

        let imageContainerWidth, imageContainerHeight;
        if (templateAspectRatio > pageAspectRatio) {
            // Limited by width
            imageContainerWidth = availableWidth;
            imageContainerHeight = availableWidth / templateAspectRatio;
        } else {
            // Limited by height
            imageContainerHeight = availableHeight;
            imageContainerWidth = availableHeight * templateAspectRatio;
        }

        const pageStyle: React.CSSProperties = {
            width: `${pageWidth}mm`,
            height: `${pageHeight}mm`,
            margin: 'auto',
            padding: `${padding}mm`,
            boxSizing: 'border-box',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
            overflow: 'hidden',
        };

        const imageContainerStyle: React.CSSProperties = {
            position: 'relative',
            width: `${imageContainerWidth}mm`,
            height: `${imageContainerHeight}mm`,
        };

        return (
            <div ref={ref} className="printable-area printable-content bg-white text-black">
                {results.map((student, index) => (
                    <div
                        key={student.id}
                        className="page-break-after"
                        style={{ ...pageStyle, pageBreakAfter: index < results.length - 1 ? 'always' : 'auto' }}
                    >
                        <div style={imageContainerStyle}>
                            <img src={student.filePath || template.filePath} alt={`Answer sheet for ${student.name}`} className="absolute top-0 left-0 w-full h-full" />
                            <div className="absolute top-0 left-0 w-full h-full">
                                {areas.map(area => {
                                    const getBaseStyleForArea = (targetArea: Area): React.CSSProperties => ({
                                        position: 'absolute',
                                        left: `${(targetArea.x / template.width) * 100}%`,
                                        top: `${(targetArea.y / template.height) * 100}%`,
                                        width: `${(targetArea.width / template.width) * 100}%`,
                                        height: `${(targetArea.height / template.height) * 100}%`,
                                        display: 'flex',
                                        fontWeight: 'bold',
                                        padding: '0.2em 0.5em',
                                        boxSizing: 'border-box',
                                        WebkitPrintColorAdjust: 'exact',
                                        printColorAdjust: 'exact',
                                    });
                                    
                                    const scoreData = scores[student.id]?.[area.id];

                                    switch (area.type) {
                                        case AreaType.ANSWER:
                                        case AreaType.MARK_SHEET: {
                                            const point = getPointForArea(area);
                                            const studentScore = scoreData?.score;
                                            
                                            if (!point || studentScore === null || studentScore === undefined) return null;

                                            // Render score in corner
                                            const pointStyle: React.CSSProperties = {
                                                ...getBaseStyleForArea(area),
                                                ...cornerAlignMap[settings.point.corner],
                                                fontSize: `${settings.point.fontSize}px`,
                                                color: getPointColor(point),
                                                transform: `translate(${settings.point.hOffset || 0}%, ${settings.point.vOffset || 0}%)`,
                                            };

                                            // Render scoring mark (circle, cross)
                                            let mark = null;
                                            if (settings.mark.show && scoreData) {
                                                let markChar = '';
                                                let markColor = '';
                                                if (scoreData.status === ScoringStatus.CORRECT) { markChar = '◯'; markColor = settings.mark.correctColor; }
                                                else if (scoreData.status === ScoringStatus.INCORRECT) { markChar = '☓'; markColor = settings.mark.incorrectColor; }
                                                else if (scoreData.status === ScoringStatus.PARTIAL) { markChar = '△'; markColor = settings.mark.partialColor; }

                                                if (markChar) {
                                                    const targetArea = settings.mark.positioningMode === 'question_number_area' && point.questionNumberAreaId
                                                        ? areas.find(a => a.id === point.questionNumberAreaId) || area
                                                        : area;
                                                    
                                                    const markStyle: React.CSSProperties = {
                                                        ...getBaseStyleForArea(targetArea),
                                                        justifyContent: hAlignMap[settings.mark.hAlign],
                                                        alignItems: vAlignMap[settings.mark.vAlign],
                                                        fontSize: `${settings.mark.fontSize}px`,
                                                        color: markColor,
                                                        opacity: settings.mark.opacity,
                                                        transform: `translate(${settings.mark.hOffset}%, ${settings.mark.vOffset}%)`,
                                                    };
                                                    mark = <div style={markStyle}>{markChar}</div>;
                                                }
                                            }
                                            
                                            const annotations = scores[student.id]?.[area.id]?.annotations;

                                            return (
                                                <React.Fragment key={`${area.id}-details`}>
                                                    {mark}
                                                    <div style={pointStyle}>{studentScore}</div>
                                                    {annotations && <div style={getBaseStyleForArea(area)}><AnnotationOverlayForPrint annotations={annotations} width={area.width} height={area.height}/></div>}
                                                </React.Fragment>
                                            );
                                        }
                                        case AreaType.SUBTOTAL: {
                                            const subtotalScore = student.subtotals[area.id];
                                            if (subtotalScore === undefined) return null;
                                            
                                            const style: React.CSSProperties = {
                                                ...getBaseStyleForArea(area),
                                                justifyContent: hAlignMap[settings.subtotal.hAlign],
                                                alignItems: vAlignMap[settings.subtotal.vAlign],
                                                fontSize: `${settings.subtotal.fontSize}px`,
                                                color: getSubtotalColor(area.id),
                                            };
                                            return <div key={area.id} style={style}>{settings.subtotal.showScore && subtotalScore}</div>;
                                        }
                                        case AreaType.TOTAL: {
                                            const style: React.CSSProperties = {
                                                ...getBaseStyleForArea(area),
                                                justifyContent: hAlignMap[settings.total.hAlign],
                                                alignItems: vAlignMap[settings.total.vAlign],
                                                fontSize: `${settings.total.fontSize}px`,
                                                color: settings.total.color,
                                            };
                                            return <div key={area.id} style={style}>{settings.total.showScore && student.totalScore}</div>;
                                        }
                                        default:
                                            return null;
                                    }
                                })}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }
);