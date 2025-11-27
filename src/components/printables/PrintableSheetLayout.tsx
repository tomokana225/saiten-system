import React from 'react';
import type { SheetLayout } from '../../types';

export const PrintableSheetLayout = React.forwardRef<HTMLDivElement, { layout: SheetLayout }>(({ layout }, ref) => {
    // Enhanced print styles for better fidelity
    const printStyles = `
        @media print {
            @page {
                margin: 0;
                size: auto;
            }
            body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .printable-area {
                width: 100%;
                height: 100%;
                background-color: white;
            }
            .print-table {
                border-collapse: collapse;
                width: 100%;
                table-layout: fixed;
                font-family: "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
            }
            .print-table td {
                /* Force borders and backgrounds */
                border-style: solid;
                border-color: black;
                background-clip: padding-box; 
            }
            /* Ensure empty cells have height */
            .print-table td:empty::after {
                content: "\\00a0";
            }
        }
    `;

    // Calculate dimensions in mm for the wrapper to match paper size
    // Using standard sizes as base, assuming printer will scale or fit to page
    // 96 DPI to mm conversion: val * 25.4 / 96
    const pxToMm = (px: number) => px * 25.4 / 96;

    return (
        <div ref={ref} className="bg-white text-black printable-area">
            <style>{printStyles}</style>
            {/* Wrapper with padding corresponding to page margins (approx 10mm-20mm is standard) */}
            <div className="p-[10mm] box-border w-full h-full">
                <table className="print-table">
                    <colgroup>
                        {layout.colWidths.map((w, i) => (
                            <col key={i} style={{ width: `${w}px` }} />
                        ))}
                    </colgroup>
                    <tbody>
                        {layout.cells.map((row, r) => (
                            <tr key={r} style={{ height: `${layout.rowHeights[r]}px` }}>
                                {row.map((cell, c) => {
                                    if (!cell) return null;
                                    
                                    const borderStyleBase = (width?: number, style?: string, color?: string) => 
                                        `${width || 1}px ${style || 'solid'} ${color || '#000'}`;

                                    const style: React.CSSProperties = {
                                        textAlign: cell.hAlign,
                                        verticalAlign: cell.vAlign,
                                        fontWeight: cell.fontWeight,
                                        fontStyle: cell.fontStyle,
                                        textDecoration: cell.textDecoration,
                                        fontSize: `${cell.fontSize}pt`,
                                        
                                        // Use inline styles for borders to ensure they are applied
                                        borderTop: cell.borders?.top ? borderStyleBase(cell.borderWidth, cell.borderStyle, cell.borderColor) : 'none',
                                        borderBottom: cell.borders?.bottom ? borderStyleBase(cell.borderWidth, cell.borderStyle, cell.borderColor) : 'none',
                                        borderLeft: cell.borders?.left ? borderStyleBase(cell.borderWidth, cell.borderStyle, cell.borderColor) : 'none',
                                        borderRight: cell.borders?.right ? borderStyleBase(cell.borderWidth, cell.borderStyle, cell.borderColor) : 'none',
                                        
                                        backgroundColor: cell.backgroundColor || 'transparent',
                                        padding: '2px 4px',
                                        overflow: 'hidden',
                                        wordWrap: 'break-word',
                                        whiteSpace: 'pre-wrap', // Handle multiline text
                                    };
                                    return (
                                        <td key={c} colSpan={cell.colSpan} rowSpan={cell.rowSpan} style={style}>
                                            {cell.text}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
});