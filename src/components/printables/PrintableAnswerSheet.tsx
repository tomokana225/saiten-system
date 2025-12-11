import React from 'react';
import type { StudentResult, Template, Area, Point, AllScores, LayoutSettings, Annotation, TextAnnotation } from '../../types';
import { AreaType, ScoringStatus } from '../../types';

// This component renders annotations (drawings/text) on top of the answer sheet for printing.
const AnnotationOverlayForPrint: React.FC<{ annotations: Annotation[], width: number, height: number }> = ({ annotations, width, height }) => {
    if (!annotations || annotations.length === 0) {
        return null;
    }

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

    const shapes = annotations.filter(a => a.tool !== 'text');
    const texts = annotations.filter(a => a.tool === 'text') as TextAnnotation[];

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <svg
                width="100%"
                height="100%"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
            >
                {shapes.map(anno => {
                    switch (anno.tool) {
                        case 'pen':
                            return <path key={anno.id} d={generatePenPath(anno.points)} stroke={anno.color} strokeWidth={anno.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
                        case 'wave':
                             return <path key={anno.id} d={generateWavePath(anno.points, anno.strokeWidth)} stroke={anno.color} strokeWidth={anno.strokeWidth} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>;
                        case 'circle':
                            return <ellipse key={anno.id} cx={(anno.x + anno.width / 2) * 100} cy={(anno.y + anno.height / 2) * 100} rx={anno.width / 2 * 100} ry={anno.height / 2 * 100} stroke={anno.color} strokeWidth={anno.strokeWidth} fill="none" vectorEffect="non-scaling-stroke"/>;
                        default:
                            return null;
                    }
                })}
            </svg>
            {texts.map(anno => (
                <div 
                    key={anno.id} 
                    style={{
                        position: 'absolute',
                        left: `${anno.x * 100}%`,
                        top: `${anno.y * 100}%`,
                        color: anno.color,
                        fontSize: `${anno.fontSize}px`,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.2,
                        fontFamily: 'sans-serif',
                    }}
                >
                    {anno.text}
                </div>
            ))}
        </div>
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

        const templatePages = template.pages || (template.filePath ? [{ imagePath: template.filePath, width: template.width, height: template.height }] : []);

        return (
            <div ref={ref} className="printable-area printable-content bg-white text-black">
                {results.map((student, studentIndex) => (
                    <React.Fragment key={student.id}>
                        {templatePages.map((page, pageIndex) => {
                            // Dimensions
                            const isPageLandscape = page.width > page.height;
                            const pageWidth = isPageLandscape ? 297 : 210;
                            const pageHeight = isPageLandscape ? 210 : 297;
                            const padding = 5; // padding in mm per side
                            const availableWidth = pageWidth - (padding * 2);
                            const availableHeight = pageHeight - (padding * 2);

                            const pageAspectRatio = availableWidth / availableHeight;
                            const templateAspectRatio = page.width / page.height;

                            let imageContainerWidth, imageContainerHeight;
                            if (templateAspectRatio > pageAspectRatio) {
                                imageContainerWidth = availableWidth;
                                imageContainerHeight = availableWidth / templateAspectRatio;
                            } else {
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

                            // Use student image for this page, fallback to template blank page
                            const imageSrc = student.images[pageIndex] || page.imagePath;
                            
                            // Filter areas that belong to this page
                            const pageAreas = areas.filter(a => (a.pageIndex || 0) === pageIndex);

                            return (
                                <div
                                    key={`${student.id}-page-${pageIndex}`}
                                    className="page-break-after"
                                    style={{ 
                                        ...pageStyle, 
                                        pageBreakAfter: (studentIndex === results.length - 1 && pageIndex === templatePages.length - 1) ? 'auto' : 'always' 
                                    }}
                                >
                                    <div style={imageContainerStyle}>
                                        <img src={imageSrc} alt={`Answer sheet for ${student.name} p${pageIndex+1}`} className="absolute top-0 left-0 w-full h-full" />
                                        <div className="absolute top-0 left-0 w-full h-full">
                                            {pageAreas.map(area => {
                                                const getBaseStyleForArea = (targetArea: Area): React.CSSProperties => ({
                                                    position: 'absolute',
                                                    left: `${(targetArea.x / page.width) * 100}%`,
                                                    top: `${(targetArea.y / page.height) * 100}%`,
                                                    width: `${(targetArea.width / page.width) * 100}%`,
                                                    height: `${(targetArea.height / page.height) * 100}%`,
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

                                                        const pointStyle: React.CSSProperties = {
                                                            ...getBaseStyleForArea(area),
                                                            ...cornerAlignMap[settings.point.corner],
                                                            fontSize: `${settings.point.fontSize}px`,
                                                            color: getPointColor(point),
                                                            transform: `translate(${settings.point.hOffset || 0}%, ${settings.point.vOffset || 0}%)`,
                                                        };

                                                        let mark = null;
                                                        if (settings.mark.show && scoreData) {
                                                            let markChar = '';
                                                            let markColor = '';
                                                            if (scoreData.status === ScoringStatus.CORRECT) { markChar = '◯'; markColor = settings.mark.correctColor; }
                                                            else if (scoreData.status === ScoringStatus.INCORRECT) { markChar = '☓'; markColor = settings.mark.incorrectColor; }
                                                            else if (scoreData.status === ScoringStatus.PARTIAL) { markChar = '△'; markColor = settings.mark.partialColor; }

                                                            if (markChar) {
                                                                const isQuestionNumberMode = settings.mark.positioningMode === 'question_number_area';
                                                                const targetArea = isQuestionNumberMode && point.questionNumberAreaId
                                                                    ? areas.find(a => a.id === point.questionNumberAreaId) || area
                                                                    : area;
                                                                
                                                                // Check if target area is on current page. 
                                                                // If question number is on another page, we might fallback to answer area or skip mark?
                                                                // For now, fallback to area if target not on current page.
                                                                const targetPageIdx = targetArea.pageIndex || 0;
                                                                const effectiveTargetArea = targetPageIdx === pageIndex ? targetArea : area;

                                                                const baseHOffset = isQuestionNumberMode ? -45 : 0;
                                                                const finalHOffset = baseHOffset + settings.mark.hOffset;

                                                                const markStyle: React.CSSProperties = {
                                                                    ...getBaseStyleForArea(effectiveTargetArea),
                                                                    padding: 0,
                                                                    justifyContent: 'center', 
                                                                    alignItems: 'center',
                                                                    fontSize: `${settings.mark.fontSize}px`,
                                                                    color: markColor,
                                                                    opacity: settings.mark.opacity,
                                                                    transform: `translate(${finalHOffset}%, ${settings.mark.vOffset}%)`,
                                                                    whiteSpace: 'nowrap',
                                                                    pointerEvents: 'none',
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
                                                    case AreaType.NAME: {
                                                        if (settings.studentInfo.show) {
                                                            const infoText = `${student.class} ${student.number} ${student.name}`;
                                                            const style: React.CSSProperties = {
                                                                position: 'absolute',
                                                                left: `${(area.x / page.width) * 100}%`,
                                                                top: `${((area.y + area.height) / page.height) * 100}%`,
                                                                width: `${(area.width / page.width) * 100}%`,
                                                                marginTop: `${settings.studentInfo.vOffset}px`,
                                                                textAlign: 'center',
                                                                fontSize: `${settings.studentInfo.fontSize}px`,
                                                                color: settings.studentInfo.color,
                                                                whiteSpace: 'nowrap',
                                                                pointerEvents: 'none',
                                                                lineHeight: '1.2',
                                                            };
                                                            return <div key={`${area.id}-info`} style={style}>{infoText}</div>;
                                                        }
                                                        return null;
                                                    }
                                                    default:
                                                        return null;
                                                }
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        );
    }
);