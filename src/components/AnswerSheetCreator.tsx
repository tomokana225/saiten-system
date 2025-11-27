import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import * as xlsx from 'xlsx';
import type { SheetLayout } from '../types';
import { XIcon, PrintIcon, FileDownIcon } from './icons';
import { LayoutSidebar } from './answer_sheet_creator/LayoutSidebar';
import { LayoutEditor } from './answer_sheet_creator/LayoutEditor';
import { PrintableSheetLayout } from './printables/PrintableSheetLayout';

interface AnswerSheetCreatorProps {
    layouts: Record<string, SheetLayout>;
    setLayouts: React.Dispatch<React.SetStateAction<Record<string, SheetLayout>>>;
}

export const AnswerSheetCreator: React.FC<AnswerSheetCreatorProps> = ({ layouts, setLayouts }) => {
    const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
    const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
    
    const printRef = useRef<HTMLDivElement>(null);
    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        onAfterPrint: () => {},
        onBeforePrint: async () => {},
    } as any);

    const activeLayout = useMemo(() => {
        if (!activeLayoutId || !layouts[activeLayoutId]) return null;
        return layouts[activeLayoutId];
    }, [activeLayoutId, layouts]);

    useEffect(() => {
        if (!activeLayoutId && Object.keys(layouts).length > 0) {
            setActiveLayoutId(Object.keys(layouts)[0]);
        }
        if (activeLayoutId && !layouts[activeLayoutId]) {
            setActiveLayoutId(Object.keys(layouts)[0] || null);
        }
    }, [layouts, activeLayoutId]);

    const updateActiveLayout = (updater: (layout: SheetLayout) => SheetLayout) => {
        if (!activeLayoutId) return;
        setLayouts(prev => ({ ...prev, [activeLayoutId]: updater(prev[activeLayoutId]) }));
    };

    const handleExportExcel = () => {
        if (!activeLayout) return;

        const wb = xlsx.utils.book_new();
        const wsData: any[][] = [];
        const merges: xlsx.Range[] = [];

        activeLayout.cells.forEach((row, r) => {
            const rowData: any[] = [];
            row.forEach((cell, c) => {
                if (!cell) {
                    rowData.push(null);
                    return;
                }
                const cellObj = {
                    v: cell.text,
                    t: 's',
                    s: {
                        alignment: {
                            horizontal: cell.hAlign,
                            vertical: cell.vAlign,
                            wrapText: true
                        },
                        font: {
                            name: 'Meiryo',
                            sz: cell.fontSize,
                            bold: cell.fontWeight === 'bold',
                            italic: cell.fontStyle === 'italic',
                            underline: cell.textDecoration === 'underline'
                        },
                        border: {
                            top: cell.borders.top ? { style: cell.borderStyle || 'thin', color: { rgb: (cell.borderColor || '#000').replace('#', '') } } : undefined,
                            bottom: cell.borders.bottom ? { style: cell.borderStyle || 'thin', color: { rgb: (cell.borderColor || '#000').replace('#', '') } } : undefined,
                            left: cell.borders.left ? { style: cell.borderStyle || 'thin', color: { rgb: (cell.borderColor || '#000').replace('#', '') } } : undefined,
                            right: cell.borders.right ? { style: cell.borderStyle || 'thin', color: { rgb: (cell.borderColor || '#000').replace('#', '') } } : undefined,
                        },
                        fill: cell.backgroundColor ? { fgColor: { rgb: cell.backgroundColor.replace('#', '') } } : undefined
                    }
                };

                rowData.push(cellObj);

                if (cell.rowSpan > 1 || cell.colSpan > 1) {
                    merges.push({
                        s: { r, c },
                        e: { r: r + cell.rowSpan - 1, c: c + cell.colSpan - 1 }
                    });
                }
                for(let i = 1; i < cell.colSpan; i++) rowData.push(null);
            });
            wsData.push(rowData);
        });

        const ws = xlsx.utils.aoa_to_sheet([]);
        ws['!ref'] = xlsx.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: activeLayout.cols - 1, r: activeLayout.rows - 1 } });
        for (let r = 0; r < wsData.length; r++) {
            for (let c = 0; c < wsData[r].length; c++) {
                const cell = wsData[r][c];
                if (cell) {
                    const cellRef = xlsx.utils.encode_cell({ r, c });
                    ws[cellRef] = cell;
                }
            }
        }
        ws['!merges'] = merges;
        if (activeLayout.colWidths) {
            ws['!cols'] = activeLayout.colWidths.map(w => ({ wpx: w }));
        }
        if (activeLayout.rowHeights) {
            ws['!rows'] = activeLayout.rowHeights.map(h => ({ hpx: h }));
        }
        xlsx.utils.book_append_sheet(wb, ws, "解答用紙");
        xlsx.writeFile(wb, `${activeLayout.name}.xlsx`);
    };

    return (
        <div className="w-full h-full flex gap-4 overflow-hidden">
            {isPrintPreviewOpen && activeLayout && (
                 <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
                     <header className="bg-white dark:bg-slate-800 p-2 flex justify-between items-center print-preview-controls">
                        <h2 className="text-lg font-semibold ml-4">印刷プレビュー: {activeLayout.name}</h2>
                        <div className="flex items-center gap-4">
                            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-500"><PrintIcon className="w-5 h-5"/>印刷 (PDF)</button>
                            <button onClick={() => setIsPrintPreviewOpen(false)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><XIcon className="w-6 h-6"/></button>
                        </div>
                    </header>
                    <main className="flex-1 overflow-auto bg-slate-400 dark:bg-slate-950/80 p-4 flex justify-center">
                        <div className="shadow-lg bg-white">
                             <PrintableSheetLayout ref={printRef} layout={activeLayout} />
                        </div>
                    </main>
                 </div>
             )}
            <LayoutSidebar 
                layouts={layouts}
                setLayouts={setLayouts}
                activeLayoutId={activeLayoutId}
                setActiveLayoutId={setActiveLayoutId}
                onPrintPreview={() => setIsPrintPreviewOpen(true)}
            >
                {activeLayout ? (
                    <div className="h-full flex flex-col gap-4 bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                        <div className="flex justify-between items-center border-b pb-2 dark:border-slate-700">
                             <input type="text" value={activeLayout.name} onChange={(e) => updateActiveLayout(l => ({...l, name: e.target.value}))} className="text-xl font-semibold bg-transparent"/>
                             <div className="flex gap-2">
                                <button onClick={handleExportExcel} className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white hover:bg-green-500 rounded-md transition-colors"><FileDownIcon className="w-4 h-4" />Excel出力</button>
                                <button onClick={() => setIsPrintPreviewOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"><PrintIcon className="w-4 h-4" />プレビュー＆印刷</button>
                             </div>
                        </div>
                        <LayoutEditor layout={activeLayout} onLayoutChange={updateActiveLayout} />
                    </div>
                ) : (
                    <div className="flex-1 flex justify-center items-center bg-white dark:bg-slate-800 rounded-lg shadow">
                        <div className="text-center text-slate-500 dark:text-slate-400">
                            <p className="mb-4">左のリストからレイアウトを選択するか、<br/>「新規作成」ボタンから解答用紙を作成してください。</p>
                        </div>
                    </div>
                )}
            </LayoutSidebar>
        </div>
    );
};