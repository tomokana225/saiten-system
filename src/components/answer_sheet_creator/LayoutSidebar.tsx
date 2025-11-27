import React, { useState } from 'react';
import type { SheetLayout, SheetCell } from '../../types';
import { PlusIcon, Trash2Icon, FileUpIcon, FileDownIcon, XIcon, CalculatorIcon, ListIcon, BoxSelectIcon } from '../icons';

interface LayoutSidebarProps {
    layouts: Record<string, SheetLayout>;
    setLayouts: React.Dispatch<React.SetStateAction<Record<string, SheetLayout>>>;
    activeLayoutId: string | null;
    setActiveLayoutId: React.Dispatch<React.SetStateAction<string | null>>;
}

type PaperSize = 'A4' | 'B5' | 'A3';
type SheetType = 'descriptive' | 'marksheet' | 'grid';

const PAPER_DIMENSIONS: Record<PaperSize, { width: number, height: number }> = {
    'A4': { width: 210, height: 297 }, // mm
    'B5': { width: 176, height: 250 },
    'A3': { width: 297, height: 420 },
};

// Helper to create a base cell
const c = (overrides: Partial<SheetCell> = {}): SheetCell => ({
    text: '', rowSpan: 1, colSpan: 1, hAlign: 'left', vAlign: 'middle',
    fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none',
    fontSize: 11, borders: { top: false, bottom: false, left: false, right: false },
    ...overrides
});

const generateLayout = (name: string, size: PaperSize, type: SheetType, questionCount: number, columns: number): SheetLayout => {
    // 1. Grid Setup (approx 5mm grid base)
    const mmToPx = 3.78; // approx 96dpi
    const widthMm = PAPER_DIMENSIONS[size].width;
    const heightMm = PAPER_DIMENSIONS[size].height;
    
    // Define grid resolution (approx 20-30 cols)
    const totalCols = 24; 
    const colWidthMm = (widthMm - 20) / totalCols; // 20mm total margin
    const rowHeightMm = 7; // Standard row height
    
    const rowsEstimate = Math.ceil((heightMm - 20) / rowHeightMm);
    const cells: (SheetCell | null)[][] = [];
    const rowHeights: number[] = [];

    // Initialize grid
    for (let r = 0; r < rowsEstimate; r++) {
        const row: (SheetCell | null)[] = [];
        for (let col = 0; col < totalCols; col++) {
            row.push(c());
        }
        cells.push(row);
        rowHeights.push(rowHeightMm * mmToPx);
    }

    let currentRow = 0;

    // --- Header Generation (Title, Name, Score) ---
    // Title Row
    cells[currentRow][0] = c({ text: name, colSpan: 16, rowSpan: 2, fontSize: 18, fontWeight: 'bold', hAlign: 'center', borders: { bottom: true, top: true, left: true, right: true } });
    for(let i=1; i<16; i++) cells[currentRow][i] = null;
    cells[currentRow+1][0] = null;
    for(let i=1; i<16; i++) cells[currentRow+1][i] = null;

    // Score Box
    cells[currentRow][16] = c({ text: '点数', colSpan: 8, fontSize: 10, hAlign: 'left', vAlign: 'top', borders: { bottom: true, top: true, left: true, right: true } });
    for(let i=17; i<24; i++) cells[currentRow][i] = null;
    cells[currentRow+1][16] = c({ text: '', colSpan: 8, rowSpan: 1, borders: { bottom: true, top: true, left: true, right: true } }); 
    for(let i=17; i<24; i++) cells[currentRow+1][i] = null;
    
    currentRow += 2;

    // Name Row
    cells[currentRow][0] = c({ text: '  年     組     番', colSpan: 8, borders: { bottom: true, top: true, left: true, right: true } });
    for(let i=1; i<8; i++) cells[currentRow][i] = null;
    
    cells[currentRow][8] = c({ text: '氏名', colSpan: 16, borders: { bottom: true, top: true, left: true, right: true } });
    for(let i=9; i<24; i++) cells[currentRow][i] = null;

    currentRow += 1;
    // Spacer
    rowHeights[currentRow] = 10; 
    currentRow += 1;

    // --- Body Generation ---
    const questionsPerCol = Math.ceil(questionCount / columns);
    
    const renderQuestion = (qNum: number, r: number, cIdx: number, widthCols: number) => {
        if (r >= rowsEstimate) return; // Safety check

        // Question Number Box
        cells[r][cIdx] = c({ text: `問${qNum}`, colSpan: 2, hAlign: 'center', borders: { top: true, bottom: true, left: true, right: true }, bg: '#f3f4f6' });
        cells[r][cIdx+1] = null;

        const answerWidth = widthCols - 2;
        
        if (type === 'descriptive') {
            // Answer Box
            cells[r][cIdx+2] = c({ text: '', colSpan: answerWidth, borders: { top: true, bottom: true, left: true, right: true } });
            for(let k=1; k<answerWidth; k++) cells[r][cIdx+2+k] = null;
        } 
        else if (type === 'marksheet') {
            // Options ① ② ③ ④
            const optWidth = Math.floor(answerWidth / 4);
            const labels = ['①', '②', '③', '④'];
            for(let i=0; i<4; i++) {
                const isLast = i === 3;
                const span = isLast ? answerWidth - (optWidth * 3) : optWidth;
                cells[r][cIdx+2 + (i*optWidth)] = c({ text: labels[i], colSpan: span, hAlign: 'center', borders: { top: true, bottom: true, left: true, right: true } });
                for(let k=1; k<span; k++) cells[r][cIdx+2 + (i*optWidth) + k] = null;
            }
        }
        else if (type === 'grid') {
            // Grid style (e.g. for Kanji or Math) - Create small squares
            cells[r][cIdx+2] = c({ text: '', colSpan: answerWidth, borders: { top: true, bottom: true, left: true, right: true } }); // Simplification for grid mode container
             for(let k=1; k<answerWidth; k++) cells[r][cIdx+2+k] = null;
             // Ideally we would split this into tiny cells, but for this generator we keep it simple container
        }
    };

    const colGroupWidth = Math.floor(totalCols / columns);
    const colGap = 1;
    const effectiveColWidth = colGroupWidth - (columns > 1 ? 1 : 0);

    for (let i = 0; i < questionCount; i++) {
        const colIndex = Math.floor(i / questionsPerCol); // 0 or 1
        const rowIndexInCol = i % questionsPerCol;
        
        // Add some spacing between rows
        const spacing = 1; 
        const targetRow = currentRow + (rowIndexInCol * (1 + spacing)); 
        const targetCol = colIndex * colGroupWidth + (colIndex > 0 ? colGap : 0);

        if (targetRow < rowsEstimate) {
            renderQuestion(i + 1, targetRow, targetCol, effectiveColWidth);
            // Add row gap if not last in column
            if (rowIndexInCol < questionsPerCol - 1) {
                // Spacer row is already initialized as empty
            }
        }
    }

    return {
        id: `layout_${Date.now()}`,
        name: name,
        rows: rowsEstimate,
        cols: totalCols,
        rowHeights: rowHeights,
        colWidths: Array(totalCols).fill(colWidthMm * mmToPx),
        cells: cells,
    };
};

export const LayoutSidebar: React.FC<LayoutSidebarProps> = ({ layouts, setLayouts, activeLayoutId, setActiveLayoutId }) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    
    // Wizard State
    const [name, setName] = useState('');
    const [paperSize, setPaperSize] = useState<PaperSize>('A4');
    const [type, setType] = useState<SheetType>('descriptive');
    const [questionCount, setQuestionCount] = useState(10);
    const [columns, setColumns] = useState(1);

    const handleCreateLayout = () => {
        if (!name.trim()) {
            alert('レイアウト名を入力してください');
            return;
        }
        const newLayout = generateLayout(name.trim(), paperSize, type, questionCount, columns);
        setLayouts(prev => ({ ...prev, [newLayout.id]: newLayout }));
        setActiveLayoutId(newLayout.id);
        setIsCreateModalOpen(false);
        // Reset
        setName('');
        setQuestionCount(10);
    };

    const handleDeleteLayout = (id: string) => {
        if (window.confirm(`レイアウト「${layouts[id].name}」を削除しますか？`)) {
            setLayouts(prev => {
                const newLayouts = { ...prev };
                delete newLayouts[id];
                return newLayouts;
            });
            if (activeLayoutId === id) setActiveLayoutId(null);
        }
    };

    const handleImportLayout = async () => {
        const result = await window.electronAPI.invoke('import-sheet-layout');
        if (result.success && result.data) {
            const importedLayout = result.data as SheetLayout;
            const newId = `layout_${Date.now()}`;
            importedLayout.id = newId;
            importedLayout.name = `${importedLayout.name} (インポート)`;
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
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">解答用紙の新規作成</h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600"><XIcon className="w-6 h-6"/></button>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">レイアウト名</label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700" placeholder="例: 1学期中間テスト" autoFocus />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">用紙サイズ</label>
                                    <select value={paperSize} onChange={e => setPaperSize(e.target.value as PaperSize)} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700">
                                        <option value="A4">A4 (一般的)</option>
                                        <option value="B5">B5 (ノートサイズ)</option>
                                        <option value="A3">A3 (見開き)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">問題数</label>
                                    <input type="number" min="1" max="100" value={questionCount} onChange={e => setQuestionCount(parseInt(e.target.value))} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">形式</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button onClick={() => setType('descriptive')} className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${type === 'descriptive' ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                                        <ListIcon className="w-6 h-6 mb-1"/>
                                        <span className="text-xs font-semibold">記述式</span>
                                    </button>
                                    <button onClick={() => setType('marksheet')} className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${type === 'marksheet' ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                                        <CalculatorIcon className="w-6 h-6 mb-1"/>
                                        <span className="text-xs font-semibold">選択式</span>
                                    </button>
                                    <button onClick={() => setType('grid')} className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${type === 'grid' ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                                        <BoxSelectIcon className="w-6 h-6 mb-1"/>
                                        <span className="text-xs font-semibold">マス目</span>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">列の構成</label>
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="cols" checked={columns === 1} onChange={() => setColumns(1)} className="w-4 h-4 text-sky-600"/>
                                        <span className="text-sm">1列 (標準)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="cols" checked={columns === 2} onChange={() => setColumns(2)} className="w-4 h-4 text-sky-600"/>
                                        <span className="text-sm">2列 (問題数が多い場合)</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                            <button onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                キャンセル
                            </button>
                            <button onClick={handleCreateLayout} className="px-6 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-500 shadow-md transition-colors font-medium">
                                作成する
                            </button>
                        </div>
                    </div>
                </div>
             )}
            <aside className="w-80 flex-shrink-0 flex flex-col gap-4 bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                <h3 className="text-lg font-semibold border-b pb-2 dark:border-slate-700">レイアウト一覧</h3>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {Object.values(layouts).map((layout: SheetLayout) => (
                        <div key={layout.id} className={`flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${activeLayoutId === layout.id ? 'bg-sky-50 dark:bg-sky-900/50 ring-1 ring-sky-200' : ''}`}>
                            <span onClick={() => setActiveLayoutId(layout.id)} className="flex-1 truncate text-sm font-medium">{layout.name}</span>
                            <button onClick={() => handleDeleteLayout(layout.id)} className="p-1 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-500 transition-colors"><Trash2Icon className="w-4 h-4" /></button>
                        </div>
                    ))}
                    {Object.keys(layouts).length === 0 && (
                        <div className="text-center text-xs text-slate-400 py-4">
                            レイアウトがありません。<br/>新規作成してください。
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-2 pt-2 border-t dark:border-slate-700">
                    <button onClick={() => setIsCreateModalOpen(true)} className="w-full flex items-center justify-center gap-2 p-2.5 bg-sky-600 text-white rounded-md hover:bg-sky-500 transition-colors font-medium text-sm shadow-sm"><PlusIcon className="w-5 h-5"/>新規作成</button>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={handleImportLayout} className="flex items-center justify-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors text-xs text-slate-700 dark:text-slate-300"><FileUpIcon className="w-4 h-4"/>インポート</button>
                        <button onClick={handleExportLayout} disabled={!activeLayoutId} className="flex items-center justify-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors text-xs text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"><FileDownIcon className="w-4 h-4"/>保存(JSON)</button>
                    </div>
                </div>
            </aside>
        </>
    );
};