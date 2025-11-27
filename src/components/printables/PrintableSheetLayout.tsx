import React from 'react';
import type { SheetLayout } from '../../types';

export const PrintableSheetLayout = React.forwardRef<HTMLDivElement, { layout: SheetLayout }>(({ layout }, ref) => {
    const printStyles = `
        @media print {
            .print-table {
                border-collapse: collapse;
                width: 100%;
                table-layout: fixed;
            }
            .print-table td {
                color: black !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    `;

    return (
        <div ref={ref} className="bg-white text-black printable-area">
            <style>{printStyles}</style>
            <div className="w-[210mm] h-[297mm] p-[10mm] box-border" style={{ margin: '0 auto' }}>
                <table className="print-table">
                    <tbody>
                        {layout.cells.map((row, r) => (
                            <tr key={r} style={{ height: `${layout.rowHeights[r] / 96 * 25.4}mm` }}>
                                {row.map((cell, c) => {
                                    if (!cell) return null;
                                    const borderStyleBase = `${cell.borderWidth || 1}px ${cell.borderStyle || 'solid'} ${cell.borderColor || '#000'}`;
                                    const style: React.CSSProperties = {
                                        width: `${layout.colWidths[c] / 96 * 25.4}mm`,
                                        textAlign: cell.hAlign,
                                        verticalAlign: cell.vAlign,
                                        fontWeight: cell.fontWeight,
                                        fontStyle: cell.fontStyle,
                                        textDecoration: cell.textDecoration,
                                        fontSize: `${cell.fontSize}pt`,
                                        borderTop: cell.borders?.top ? borderStyleBase : 'none',
                                        borderBottom: cell.borders?.bottom ? borderStyleBase : 'none',
                                        borderLeft: cell.borders?.left ? borderStyleBase : 'none',
                                        borderRight: cell.borders?.right ? borderStyleBase : 'none',
                                        backgroundColor: cell.backgroundColor || 'transparent',
                                        padding: '4px',
                                        overflow: 'hidden',
                                        wordWrap: 'break-word',
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