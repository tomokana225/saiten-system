import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { SheetLayout, SheetCell } from '../../types';
import {
    MergeIcon, SplitIcon, BoldIcon, ItalicIcon, UnderlineIcon, AlignLeftIcon, AlignCenterIcon, AlignRightIcon,
    AlignVerticalJustifyStartIcon, AlignVerticalJustifyCenterIcon, AlignVerticalJustifyEndIcon,
    Redo2Icon, Undo2Icon, BorderTopIcon, BorderBottomIcon, BorderLeftIcon, BorderRightIcon
} from '../icons';

const useHistory = <T,>(initialState: T, onStateChange: (state: T) => void) => {
    const [history, setHistory] = useState<T[]>([initialState]);
    const [index, setIndex] = useState(0);

    const setState = (newState: T) => {
        const newHistory = history.slice(0, index + 1);
        newHistory.push(newState);
        setHistory(newHistory);
        setIndex(newHistory.length - 1);
        onStateChange(newState);
    };
    
    const resetHistory = (state: T) => {
        setHistory([state]);
        setIndex(0);
    }

    const undo = () => {
        if (index > 0) {
            const prevState = history[index - 1];
            setIndex(index - 1);
            onStateChange(prevState);
        }
    };

    const redo = () => {
        if (index < history.length - 1) {
            const nextState = history[index + 1];
            setIndex(index + 1);
            onStateChange(nextState);
        }
    };

    const canUndo = index > 0;
    const canRedo = index < history.length - 1;

    return { setState, undo, redo, canUndo, canRedo, resetHistory };
};

const createDefaultCell = (): SheetCell => ({
    text: '', rowSpan: 1, colSpan: 1, hAlign: 'left', vAlign: 'top',
    fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none',
    fontSize: 12, borders: { top: true, bottom: true, left: true, right: true },
});


export const LayoutEditor = ({ layout, onLayoutChange }: { layout: SheetLayout, onLayoutChange: (updater: (layout: SheetLayout) => SheetLayout) => void }) => {
    const [selectedCells, setSelectedCells] = useState<{ start: { r: number, c: number }, end: { r: number, c: number } } | null>(null);
    const [editingCell, setEditingCell] = useState<{ r: number, c: number } | null>(null);
    const tableRef = useRef<HTMLTableElement>(null);

    const { setState, undo, redo, canUndo, canRedo, resetHistory } = useHistory(layout, (newLayout) => {
        onLayoutChange(() => newLayout);
    });
    
    useEffect(() => {
        resetHistory(layout);
    }, [layout.id]);

    const handleCellMouseDown = (r: number, c: number) => {
        if (editingCell?.r === r && editingCell?.c === c) return;
        setEditingCell(null);
        setSelectedCells({ start: { r, c }, end: { r, c } });
    };

    const handleCellMouseMove = (e: React.MouseEvent, r: number, c: number) => {
        if (selectedCells && e.buttons === 1) {
            setSelectedCells({ ...selectedCells, end: { r, c } });
        }
    };

    const handleCellDoubleClick = (r: number, c: number) => {
        setSelectedCells(null);
        setEditingCell({ r, c });
    };

    const selectionRange = useMemo(() => {
        if (!selectedCells) return null;
        const { start, end } = selectedCells;
        return {
            minR: Math.min(start.r, end.r), maxR: Math.max(start.r, end.r),
            minC: Math.min(start.c, end.c), maxC: Math.max(start.c, end.c),
        };
    }, [selectedCells]);

    const handleCellChange = (r: number, c: number, newText: string) => {
        const newLayout = JSON.parse(JSON.stringify(layout)) as SheetLayout;
        newLayout.cells[r][c]!.text = newText;
        onLayoutChange(() => newLayout); // Direct change without history for live typing
    };
    
    const handleCellBlur = () => {
        setState(layout); // Commit final text change to history
        setEditingCell(null);
    };

    const handleMerge = () => {
        if (!selectionRange) return;
        const { minR, maxR, minC, maxC } = selectionRange;
        const newLayout = JSON.parse(JSON.stringify(layout)) as SheetLayout;
        const newRowSpan = maxR - minR + 1;
        const newColSpan = maxC - minC + 1;
        
        const firstCell = newLayout.cells[minR][minC]!;
        firstCell.rowSpan = newRowSpan;
        firstCell.colSpan = newColSpan;
        
        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                if (r === minR && c === minC) continue;
                newLayout.cells[r][c] = null;
            }
        }
        setState(newLayout);
    };
    
    const handleSplit = () => {
        if (!selectionRange) return;
        const { minR, minC } = selectionRange;
        const cellToSplit = layout.cells[minR][minC];
        if (!cellToSplit || (cellToSplit.rowSpan === 1 && cellToSplit.colSpan === 1)) return;
        
        const newLayout = JSON.parse(JSON.stringify(layout)) as SheetLayout;
        const { rowSpan, colSpan } = cellToSplit;

        for (let r = minR; r < minR + rowSpan; r++) {
            for (let c = minC; c < minC + colSpan; c++) {
                newLayout.cells[r][c] = createDefaultCell();
            }
        }
        setState(newLayout);
    };

    const updateSelectedCells = (updater: (cell: SheetCell) => Partial<SheetCell>) => {
        if (!selectionRange) return;
        const { minR, maxR, minC, maxC } = selectionRange;
        const newLayout = JSON.parse(JSON.stringify(layout)) as SheetLayout;
        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                const cell = newLayout.cells[r][c];
                if (cell) {
                    Object.assign(cell, updater(cell));
                }
            }
        }
        setState(newLayout);
    };

    const handleBorderChange = (border: 'top' | 'bottom' | 'left' | 'right') => {
        const firstSelectedCell = selectionRange ? layout.cells[selectionRange.minR][selectionRange.minC] : null;
        const isCurrentlySet = firstSelectedCell?.borders?.[border] ?? false;
        updateSelectedCells(() => ({ borders: { ...firstSelectedCell?.borders, [border]: !isCurrentlySet } }));
    };

    const selectedCellProps = selectionRange ? layout.cells[selectionRange.minR][selectionRange.minC] : null;

    return (
        <div className="h-full flex flex-col gap-2">
            <div className="flex-shrink-0 flex items-center justify-between border-b pb-2 dark:border-slate-700">
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-md">
                     <button onClick={undo} disabled={!canUndo} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"><Undo2Icon className="w-5 h-5" /></button>
                     <button onClick={redo} disabled={!canRedo} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"><Redo2Icon className="w-5 h-5" /></button>
                     <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1"></div>
                     <button onClick={handleMerge} disabled={!selectionRange || (selectionRange.minR === selectionRange.maxR && selectionRange.minC === selectionRange.maxC)} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"><MergeIcon className="w-5 h-5" /></button>
                     <button onClick={handleSplit} disabled={!selectionRange || !selectedCellProps || (selectedCellProps.rowSpan === 1 && selectedCellProps.colSpan === 1)} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"><SplitIcon className="w-5 h-5" /></button>
                </div>
            </div>
            <div className="flex-1 flex gap-4 overflow-hidden">
                <div className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-900/50 p-4" onMouseUp={() => { if(editingCell) handleCellBlur(); }}>
                    <table ref={tableRef} className="border-collapse bg-white" style={{ tableLayout: 'fixed' }}>
                         <tbody>
                            {layout.cells.map((row, r) => (
                                <tr key={r} style={{ height: `${layout.rowHeights[r]}px` }}>
                                    {row.map((cell, c) => {
                                        if (!cell) return null;
                                        const isSelected = selectionRange && r >= selectionRange.minR && r <= selectionRange.maxR && c >= selectionRange.minC && c <= selectionRange.maxC;
                                        const isEditing = editingCell?.r === r && editingCell?.c === c;
                                        const style: React.CSSProperties = {
                                            width: `${layout.colWidths[c]}px`,
                                            textAlign: cell.hAlign, verticalAlign: cell.vAlign,
                                            fontWeight: cell.fontWeight, fontStyle: cell.fontStyle, textDecoration: cell.textDecoration,
                                            fontSize: `${cell.fontSize}pt`,
                                            borderTop: cell.borders?.top ? '1px solid #ccc' : 'none',
                                            borderBottom: cell.borders?.bottom ? '1px solid #ccc' : 'none',
                                            borderLeft: cell.borders?.left ? '1px solid #ccc' : 'none',
                                            borderRight: cell.borders?.right ? '1px solid #ccc' : 'none',
                                            padding: '4px', overflow: 'hidden', wordWrap: 'break-word',
                                            backgroundColor: isEditing ? 'white' : (isSelected ? 'rgba(59, 130, 246, 0.2)' : (cell.backgroundColor || 'white'))
                                        };
                                        return (
                                            <td key={c} colSpan={cell.colSpan} rowSpan={cell.rowSpan} style={style}
                                                onMouseDown={() => handleCellMouseDown(r, c)}
                                                onMouseMove={(e) => handleCellMouseMove(e, r, c)}
                                                onDoubleClick={() => handleCellDoubleClick(r, c)}>
                                                {isEditing ? (
                                                    <textarea
                                                        value={cell.text}
                                                        onChange={(e) => handleCellChange(r, c, e.target.value)}
                                                        onBlur={handleCellBlur}
                                                        autoFocus
                                                        className="w-full h-full p-0 m-0 border-none outline-none resize-none bg-transparent"
                                                        style={{ fontSize: `${cell.fontSize}pt`, textAlign: cell.hAlign }}
                                                    />
                                                ) : cell.text}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                 {selectionRange && selectedCellProps && (
                    <aside className="w-72 flex-shrink-0 flex flex-col gap-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg">
                         <h4 className="font-semibold">書式設定</h4>
                         <div className="space-y-3">
                             <div>
                                 <label className="text-xs">テキストの配置</label>
                                 <div className="flex items-center gap-1 p-1 bg-slate-200 dark:bg-slate-700 rounded-md mt-1">
                                     <button onClick={() => updateSelectedCells(() => ({ hAlign: 'left' }))} className={`p-1 rounded ${selectedCellProps.hAlign === 'left' ? 'bg-white dark:bg-slate-600' : ''}`}><AlignLeftIcon className="w-5 h-5"/></button>
                                     <button onClick={() => updateSelectedCells(() => ({ hAlign: 'center' }))} className={`p-1 rounded ${selectedCellProps.hAlign === 'center' ? 'bg-white dark:bg-slate-600' : ''}`}><AlignCenterIcon className="w-5 h-5"/></button>
                                     <button onClick={() => updateSelectedCells(() => ({ hAlign: 'right' }))} className={`p-1 rounded ${selectedCellProps.hAlign === 'right' ? 'bg-white dark:bg-slate-600' : ''}`}><AlignRightIcon className="w-5 h-5"/></button>
                                     <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1"></div>
                                     <button onClick={() => updateSelectedCells(() => ({ vAlign: 'top' }))} className={`p-1 rounded ${selectedCellProps.vAlign === 'top' ? 'bg-white dark:bg-slate-600' : ''}`}><AlignVerticalJustifyStartIcon className="w-5 h-5"/></button>
                                     <button onClick={() => updateSelectedCells(() => ({ vAlign: 'middle' }))} className={`p-1 rounded ${selectedCellProps.vAlign === 'middle' ? 'bg-white dark:bg-slate-600' : ''}`}><AlignVerticalJustifyCenterIcon className="w-5 h-5"/></button>
                                     <button onClick={() => updateSelectedCells(() => ({ vAlign: 'bottom' }))} className={`p-1 rounded ${selectedCellProps.vAlign === 'bottom' ? 'bg-white dark:bg-slate-600' : ''}`}><AlignVerticalJustifyEndIcon className="w-5 h-5"/></button>
                                 </div>
                             </div>
                             <div>
                                 <label className="text-xs">文字スタイル</label>
                                  <div className="flex items-center gap-1 p-1 bg-slate-200 dark:bg-slate-700 rounded-md mt-1">
                                     <button onClick={() => updateSelectedCells(c => ({ fontWeight: c.fontWeight === 'bold' ? 'normal' : 'bold' }))} className={`p-1 rounded ${selectedCellProps.fontWeight === 'bold' ? 'bg-white dark:bg-slate-600' : ''}`}><BoldIcon className="w-5 h-5"/></button>
                                     <button onClick={() => updateSelectedCells(c => ({ fontStyle: c.fontStyle === 'italic' ? 'normal' : 'italic' }))} className={`p-1 rounded ${selectedCellProps.fontStyle === 'italic' ? 'bg-white dark:bg-slate-600' : ''}`}><ItalicIcon className="w-5 h-5"/></button>
                                     <button onClick={() => updateSelectedCells(c => ({ textDecoration: c.textDecoration === 'underline' ? 'none' : 'underline' }))} className={`p-1 rounded ${selectedCellProps.textDecoration === 'underline' ? 'bg-white dark:bg-slate-600' : ''}`}><UnderlineIcon className="w-5 h-5"/></button>
                                     <input type="number" value={selectedCellProps.fontSize} onChange={e => updateSelectedCells(() => ({ fontSize: parseInt(e.target.value) || 12 }))} className="w-16 ml-2 p-1 text-xs rounded-md bg-white dark:bg-slate-600"/>
                                 </div>
                             </div>
                              <div>
                                 <label className="text-xs">罫線</label>
                                 <div className="flex items-center gap-1 p-1 bg-slate-200 dark:bg-slate-700 rounded-md mt-1">
                                    <button onClick={() => handleBorderChange('top')} className={`p-1 rounded ${selectedCellProps.borders?.top ? 'bg-white dark:bg-slate-600' : ''}`}><BorderTopIcon className="w-5 h-5"/></button>
                                    <button onClick={() => handleBorderChange('bottom')} className={`p-1 rounded ${selectedCellProps.borders?.bottom ? 'bg-white dark:bg-slate-600' : ''}`}><BorderBottomIcon className="w-5 h-5"/></button>
                                    <button onClick={() => handleBorderChange('left')} className={`p-1 rounded ${selectedCellProps.borders?.left ? 'bg-white dark:bg-slate-600' : ''}`}><BorderLeftIcon className="w-5 h-5"/></button>
                                    <button onClick={() => handleBorderChange('right')} className={`p-1 rounded ${selectedCellProps.borders?.right ? 'bg-white dark:bg-slate-600' : ''}`}><BorderRightIcon className="w-5 h-5"/></button>
                                 </div>
                             </div>
                         </div>
                    </aside>
                )}
            </div>
        </div>
    );
};