import React, { useState } from 'react';
import type { SheetLayout } from '../../types';
import { PlusIcon, Trash2Icon, FileUpIcon, FileDownIcon } from '../icons';

interface LayoutSidebarProps {
    layouts: Record<string, SheetLayout>;
    setLayouts: React.Dispatch<React.SetStateAction<Record<string, SheetLayout>>>;
    activeLayoutId: string | null;
    setActiveLayoutId: React.Dispatch<React.SetStateAction<string | null>>;
}

const createDefaultLayout = (name: string, rows = 40, cols = 25): SheetLayout => {
    const createDefaultCell = () => ({
        text: '', rowSpan: 1, colSpan: 1, hAlign: 'left' as const, vAlign: 'top' as const,
        fontWeight: 'normal' as const, fontStyle: 'normal' as const, textDecoration: 'none' as const,
        fontSize: 12, borders: { top: true, bottom: true, left: true, right: true },
    });
    return {
        id: `layout_${Date.now()}`, name, rows, cols,
        rowHeights: Array(rows).fill(24),
        colWidths: Array(cols).fill(80),
        cells: Array.from({ length: rows }, () => Array.from({ length: cols }, createDefaultCell)),
    };
};

export const LayoutSidebar: React.FC<LayoutSidebarProps> = ({ layouts, setLayouts, activeLayoutId, setActiveLayoutId }) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newLayoutName, setNewLayoutName] = useState('');

    const handleCreateLayout = () => {
        if (!newLayoutName.trim()) return;
        const newLayout = createDefaultLayout(newLayoutName.trim());
        setLayouts(prev => ({ ...prev, [newLayout.id]: newLayout }));
        setActiveLayoutId(newLayout.id);
        setIsCreateModalOpen(false);
        setNewLayoutName('');
    };

    const handleDeleteLayout = (id: string) => {
        if (window.confirm(`レイアウト「${layouts[id].name}」を削除しますか？`)) {
            setLayouts(prev => {
                const newLayouts = { ...prev };
                delete newLayouts[id];
                return newLayouts;
            });
        }
    };

    const handleImportLayout = async () => {
        const result = await window.electronAPI.invoke('import-sheet-layout');
        if (result.success && result.data) {
            const importedLayout = result.data as SheetLayout;
            const newId = `layout_${Date.now()}`;
            importedLayout.id = newId;
            importedLayout.name = `${importedLayout.name} (インポート)`;
            const rows = importedLayout.rows || importedLayout.cells?.length || 20;
            const cols = importedLayout.cols || importedLayout.cells?.[0]?.length || 10;
            if (!importedLayout.rowHeights || importedLayout.rowHeights.length !== rows) {
                importedLayout.rowHeights = Array(rows).fill(30);
            }
            if (!importedLayout.colWidths || importedLayout.colWidths.length !== cols) {
                importedLayout.colWidths = Array(cols).fill(80);
            }
            setLayouts(prev => ({...prev, [newId]: importedLayout}));
            setActiveLayoutId(newId);
        } else if (result.error) {
            alert(`インポートに失敗しました: ${result.error}`);
        }
    };

    const handleExportLayout = async () => {
        if (!activeLayoutId || !layouts[activeLayoutId]) return;
        const result = await window.electronAPI.invoke('export-sheet-layout', {
            layoutName: layouts[activeLayoutId].name,
            layoutData: layouts[activeLayoutId],
        });
        if (result.success) {
            alert(`エクスポートしました: ${result.path}`);
        } else if (result.error) {
            alert(`エクスポートに失敗しました: ${result.error}`);
        }
    };

    return (
        <>
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
                        <h3 className="text-lg font-semibold">新しい解答用紙レイアウトを作成</h3>
                        <input type="text" value={newLayoutName} onChange={e => setNewLayoutName(e.target.value)} className="w-full p-2 border rounded-md" placeholder="レイアウト名" autoFocus />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 rounded-md">キャンセル</button>
                            <button onClick={handleCreateLayout} className="px-4 py-2 bg-sky-600 text-white rounded-md">作成</button>
                        </div>
                    </div>
                </div>
             )}
            <aside className="w-80 flex-shrink-0 flex flex-col gap-4 bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                <h3 className="text-lg font-semibold border-b pb-2 dark:border-slate-700">レイアウト一覧</h3>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {/* FIX: Explicitly type the map function parameter to 'SheetLayout' to resolve property access errors. */}
                    {Object.values(layouts).map((layout: SheetLayout) => (
                        <div key={layout.id} className={`flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${activeLayoutId === layout.id ? 'bg-sky-50 dark:bg-sky-900/50' : ''}`}>
                            <span onClick={() => setActiveLayoutId(layout.id)} className="flex-1 truncate">{layout.name}</span>
                            <button onClick={() => handleDeleteLayout(layout.id)} className="p-1 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-500"><Trash2Icon className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
                <div className="flex flex-col gap-2">
                    <button onClick={() => setIsCreateModalOpen(true)} className="w-full flex items-center justify-center gap-2 p-2 bg-sky-600 text-white rounded-md"><PlusIcon className="w-5 h-5"/>新規作成</button>
                    <button onClick={handleImportLayout} className="w-full flex items-center justify-center gap-2 p-2 bg-slate-200 dark:bg-slate-700 rounded-md"><FileUpIcon className="w-5 h-5"/>インポート</button>
                    <button onClick={handleExportLayout} disabled={!activeLayoutId} className="w-full flex items-center justify-center gap-2 p-2 bg-slate-200 dark:bg-slate-700 rounded-md disabled:opacity-50"><FileDownIcon className="w-5 h-5"/>エクスポート</button>
                </div>
            </aside>
        </>
    );
};