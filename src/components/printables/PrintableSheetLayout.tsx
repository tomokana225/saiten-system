import React from 'react';
import type { SheetLayout } from '../../types';

export const PrintableSheetLayout = React.forwardRef<HTMLDivElement, { layout: SheetLayout }>(({ layout }, ref) => {
    // Enhanced print styles for high fidelity
    const printStyles = `
        @media print {
            @page {
                margin: 0;
                size: auto;
            }
            body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                margin: 0;
                padding: 0;
            }
            .printable-area {
                width: 100vw;
                height: 100vh;
                background-color: white;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .sheet-container {
                /* Ensure it fits on paper */
                width: 100%;
                height: 100%; 
                padding: 10mm; /* Default print margin */
                box-sizing: border-box;
            }
            .print-table {
                border-collapse: collapse;
                width: 100%;
                table-layout: fixed; /* Crucial for exact column widths */
                font-family: "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
            }
            .print-table td {
                border-style: solid;
                border-color: black;
                /* Ensure borders print */
                box-sizing: border-box;
                overflow: hidden;
            }
            .print-table td:empty::after {
                content: "\\00a0"; /* Non-breaking space to preserve height */
            }
        }
        /* Styles for screen preview */
        @media screen {
            .printable-area {
                background: white;
                color: black;
            }
            .sheet-container {
                padding: 10mm;
                box-sizing: border-box;
                width: 210mm; /* A4 width */
                min-height: 297mm; /* A4 height */
                margin: 0 auto;
                background: white;
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
            .print-table {
                border-collapse: collapse;
                width: 100%;
                table-layout: fixed;
            }
        }
    `;

    return (
        <div ref={ref} className="printable-area">
            <style>{printStyles}</style>
            <div className="sheet-container">
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
                                        
                                        borderTop: cell.borders?.top ? borderStyleBase(cell.borderWidth, cell.borderStyle, cell.borderColor) : 'none',
                                        borderBottom: cell.borders?.bottom ? borderStyleBase(cell.borderWidth, cell.borderStyle, cell.borderColor) : 'none',
                                        borderLeft: cell.borders?.left ? borderStyleBase(cell.borderWidth, cell.borderStyle, cell.borderColor) : 'none',
                                        borderRight: cell.borders?.right ? borderStyleBase(cell.borderWidth, cell.borderStyle, cell.borderColor) : 'none',
                                        
                                        backgroundColor: cell.backgroundColor || 'transparent',
                                        padding: '2px 4px',
                                        whiteSpace: 'pre-wrap',
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