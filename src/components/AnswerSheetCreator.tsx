import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import type { SheetLayout } from '../types';
import { XIcon, PrintIcon } from './icons';
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
    // FIX: The type definitions for 'react-to-print' are likely incorrect and missing the 'content' property.
    // Casting to 'any' to bypass the erroneous type check.
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

    return (
        <div className="w-full h-full flex gap-4">
            {isPrintPreviewOpen && activeLayout && (
                 <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
                     <header className="bg-white dark:bg-slate-800 p-2 flex justify-between items-center print-preview-controls">
                        <h2 className="text-lg font-semibold ml-4">印刷プレビュー: {activeLayout.name}</h2>
                        <div className="flex items-center gap-4">
                            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-500"><PrintIcon className="w-5 h-5"/>印刷</button>
                            <button onClick={() => setIsPrintPreviewOpen(false)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><XIcon className="w-6 h-6"/></button>
                        </div>
                    </header>
                    <main className="flex-1 overflow-auto bg-slate-400 dark:bg-slate-950/80 p-4">
                        <PrintableSheetLayout ref={printRef} layout={activeLayout} />
                    </main>
                 </div>
             )}
            <LayoutSidebar 
                layouts={layouts}
                setLayouts={setLayouts}
                activeLayoutId={activeLayoutId}
                setActiveLayoutId={setActiveLayoutId}
            />
            <main className="flex-1 flex flex-col gap-4">
                {activeLayout ? (
                    <div className="h-full flex flex-col gap-4 bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                        <div className="flex justify-between items-center border-b pb-2 dark:border-slate-700">
                             <input type="text" value={activeLayout.name} onChange={(e) => updateActiveLayout(l => ({...l, name: e.target.value}))} className="text-xl font-semibold bg-transparent"/>
                             <button onClick={() => setIsPrintPreviewOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"><PrintIcon className="w-4 h-4" />プレビュー＆印刷</button>
                        </div>
                        <LayoutEditor layout={activeLayout} onLayoutChange={updateActiveLayout} />
                    </div>
                ) : (
                    <div className="flex-1 flex justify-center items-center bg-white dark:bg-slate-800 rounded-lg shadow">
                        <div className="text-center text-slate-500 dark:text-slate-400">
                            <p className="mb-4">左のリストからレイアウトを選択するか、新規作成してください。</p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};