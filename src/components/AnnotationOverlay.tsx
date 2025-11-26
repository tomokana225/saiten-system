import React from 'react';
import type { Annotation } from '../types';

interface AnnotationOverlayProps {
    annotations: Annotation[];
}

export const AnnotationOverlay: React.FC<AnnotationOverlayProps> = ({ annotations }) => {
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

    const generateWavePath = (points: { x: number; y: number }[]): string => {
        if (points.length < 2) return '';
        
        let path = `M ${points[0].x * 100} ${points[0].y * 100}`;
        // Amplitude is set relative to the 100x100 viewBox
        const amplitude = 2;

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
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
                {annotations.map(anno => {
                    switch (anno.tool) {
                        case 'pen':
                            return <path key={anno.id} d={generatePenPath(anno.points)} stroke={anno.color} strokeWidth={anno.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
                        case 'wave':
                            return <path key={anno.id} d={generateWavePath(anno.points)} stroke={anno.color} strokeWidth={anno.strokeWidth} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>;
                        case 'circle':
                            return <ellipse key={anno.id} cx={(anno.x + anno.width / 2) * 100} cy={(anno.y + anno.height / 2) * 100} rx={anno.width / 2 * 100} ry={anno.height / 2 * 100} stroke={anno.color} strokeWidth={anno.strokeWidth} fill="none" vectorEffect="non-scaling-stroke"/>;
                        case 'text':
                            return <text key={anno.id} x={anno.x * 100} y={anno.y * 100} fill={anno.color} fontSize={anno.fontSize} dominantBaseline="hanging" style={{ whiteSpace: 'pre' }}>{anno.text}</text>;
                        default:
                            return null;
                    }
                })}
            </svg>
        </div>
    );
};