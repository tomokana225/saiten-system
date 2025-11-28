import React from 'react';
import type { SheetLayout } from '../../types';

export const PrintableSheetLayout = React.forwardRef<HTMLDivElement, { layout: SheetLayout }>(({ layout }, ref) => {
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
                width: 100%;
                height: 100%; 
                padding: 10mm;
                box-sizing: border-box;
            }
            .print-table {
                border-collapse: collapse;
                width: 100%;
                table-layout: fixed; 
                font-family: "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
            }
            .print-table td {
                border-style: solid;
                border-color: black;
                box-sizing: border-box;
                overflow: hidden;
            }
            .print-table td:empty::after {
                content: "\\00a0";
            }
        }
        @media screen {
            .printable-area {
                background: white;
                color: black;
            }
            .sheet-container {
                padding: 10mm;
                box-sizing: border-box;
                width: 210mm; 
                min-height: 297mm; 
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

    const renderEnglishGrid = (metadata: any) => {
        const { wordCount, wordsPerLine, lineHeightRatio } = metadata;
        const rows = Math.ceil(wordCount / (wordsPerLine || 10));
        const cols = wordsPerLine || 10; // Default cols if undefined
        
        // Dynamic gap calculation
        // Base gap: 4px. Scale with ratio.
        const rowGap = lineHeightRatio ? Math.max(4, (lineHeightRatio - 1) * 20) : 8;

        return (
            <div style={{ 
                width: '100%', 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-evenly', // Distribute rows evenly in vertical space
                padding: '4px',
                gap: `${rowGap}px`
            }}>
                {Array.from({ length: rows }).map((_, r) => {
                    // Determine how many words in this specific row
                    // Last row might have fewer words
                    const startIdx = r * cols;
                    const endIdx = Math.min(startIdx + cols, wordCount);
                    const currentCols = endIdx - startIdx;

                    return (
                        <div key={r} style={{ 
                            width: '100%',
                            display: 'flex',
                            alignItems: 'flex-end', // Align bottom borders
                            gap: '8px', // Gap between word slots
                            flex: 1 // Allow row to take available height
                        }}>
                            {Array.from({ length: cols }).map((_, c) => {
                                // Render slots. If index >= wordCount, render invisible placeholder to keep alignment?
                                // Or just render up to currentCols?
                                // To keep grid aligned, rendering placeholders is better if justified, but here flex-start + fixed width cells or flex-1?
                                // Let's use flex-1 to fill width.
                                
                                const idx = startIdx + c;
                                const isPlaceholder = idx >= wordCount;
                                
                                return (
                                    <div key={c} style={{ 
                                        flex: 1, 
                                        borderBottom: isPlaceholder ? 'none' : '1px dashed #333', 
                                        height: '100%',
                                        minHeight: '16px',
                                        boxSizing: 'border-box',
                                        position: 'relative'
                                    }}></div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        );
    };

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
                                        padding: cell.type === 'english-grid' ? '0' : '2px 4px',
                                        whiteSpace: 'pre-wrap',
                                    };
                                    
                                    return (
                                        <td key={c} colSpan={cell.colSpan} rowSpan={cell.rowSpan} style={style}>
                                            {cell.type === 'english-grid' ? renderEnglishGrid(cell.metadata) : cell.text}
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