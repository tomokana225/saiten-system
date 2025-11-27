import React, { useState } from 'react';
import type { SheetLayout, SheetCell } from '../../types';
import { PlusIcon, Trash2Icon, FileUpIcon, FileDownIcon, XIcon, CalculatorIcon, ListIcon, BoxSelectIcon, PenLineIcon } from '../icons';

interface LayoutSidebarProps {
    layouts: Record<string, SheetLayout>;
    setLayouts: React.Dispatch<React.SetStateAction<Record<string, SheetLayout>>>;
    activeLayoutId: string | null;
    setActiveLayoutId: React.Dispatch<React.SetStateAction<string | null>>;
}

type PaperSize = 'A4' | 'B5' | 'A3';
type QuestionType = 'marksheet' | 'short_text' | 'long_text' | 'grid' | 'english';

interface QuestionBlock {
    id: string;
    type: QuestionType;
    count: number;
    startNumber: number;
    options?: {
        choices?: number; // For marksheet
        lines?: number; // For english/long text
        chars?: number; // For grid
    };
}

const PAPER_DIMENSIONS: Record<PaperSize, { width: number, height: number }> = {
    'A4': { width: 210, height: 297 }, // mm
    'B5': { width: 176, height: 250 },
    'A3': { width: 297, height: 420 },
};

// Helper to create a base cell
const c = (overrides: Partial<SheetCell> = {}): SheetCell => ({
    text: '', rowSpan: 1, colSpan: 1, hAlign: 'left', vAlign: 'middle',
    fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none',
    fontSize: 11, borders: { top: true, bottom: true, left: true, right: true },
    ...overrides
});

const generateSmartLayout = (name: string, size: PaperSize, columns: number, blocks: QuestionBlock[]): SheetLayout => {
    // 1. Grid Setup (approx 5mm grid base is flexible)
    // A4 width 210mm. Margins 20mm total -> 190mm active.
    // To allow flexible subdivision, we use a high resolution grid.
    // 24 columns is good (divisible by 2, 3, 4, 6, 8, 12).
    const totalCols = 24; 
    const mmToPx = 3.78; // approx 96dpi
    
    const widthMm = PAPER_DIMENSIONS[size].width;
    const heightMm = PAPER_DIMENSIONS[size].height;
    
    const colWidthMm = (widthMm - 20) / totalCols; // 20mm total horizontal margin
    const rowHeightMm = 8; // Base row height
    
    // Estimate rows needed. We'll extend if needed.
    const estimatedRows = Math.ceil((heightMm - 20) / rowHeightMm);
    const cells: (SheetCell | null)[][] = [];
    const rowHeights: number[] = [];

    // Helper to extend grid rows
    const ensureRows = (rowIndex: number) => {
        while (cells.length <= rowIndex) {
            const row: (SheetCell | null)[] = Array(totalCols).fill(null).map(() => c({borders: {top:false, bottom:false, left:false, right:false}}));
            cells.push(row);
            rowHeights.push(rowHeightMm * mmToPx);
        }
    };

    let currentRow = 0;

    // --- Header Generation (Title, Name, Score) ---
    ensureRows(currentRow + 4);
    
    // Title
    cells[currentRow][0] = c({ text: name, colSpan: 16, rowSpan: 2, fontSize: 18, fontWeight: 'bold', hAlign: 'center', borders: { bottom: true, top: true, left: true, right: true } });
    for(let i=1; i<16; i++) cells[currentRow][i] = null;
    cells[currentRow+1][0] = null;
    for(let i=1; i<16; i++) cells[currentRow+1][i] = null;

    // Score
    cells[currentRow][16] = c({ text: '点数', colSpan: 8, fontSize: 10, hAlign: 'left', vAlign: 'top', borders: { bottom: true, top: true, left: true, right: true } });
    for(let i=17; i<24; i++) cells[currentRow][i] = null;
    cells[currentRow+1][16] = c({ text: '', colSpan: 8, rowSpan: 1, borders: { bottom: true, top: true, left: true, right: true } }); 
    for(let i=17; i<24; i++) cells[currentRow+1][i] = null;
    
    currentRow += 2;

    // Name
    cells[currentRow][0] = c({ text: '  年     組     番', colSpan: 8, borders: { bottom: true, top: true, left: true, right: true } });
    for(let i=1; i<8; i++) cells[currentRow][i] = null;
    
    cells[currentRow][8] = c({ text: '氏名', colSpan: 16, borders: { bottom: true, top: true, left: true, right: true } });
    for(let i=9; i<24; i++) cells[currentRow][i] = null;

    currentRow += 1;
    rowHeights[currentRow] = 5 * mmToPx; // Spacer
    cells[currentRow].forEach(cell => { if(cell) cell.borders = {top:false, bottom:false, left:false, right:false}; });
    currentRow += 1;

    // --- Body Generation ---
    // Column logic
    const colGroupWidth = Math.floor(totalCols / columns); // 24 or 12
    const innerColWidth = colGroupWidth - (columns > 1 ? 1 : 0); // gutter
    const colGap = 1;

    // We track the current row for each main column independently
    const colCurrentRows = Array(columns).fill(currentRow);

    let activeColumn = 0; // 0 to columns-1

    const addCell = (colIdx: number, rowIdx: number, span: number, content: SheetCell) => {
        ensureRows(rowIdx);
        const startC = colIdx * colGroupWidth + (colIdx > 0 ? colGap : 0);
        
        // Clear area first (in case of overlap or initialization)
        for(let r = rowIdx; r < rowIdx + content.rowSpan; r++) {
            ensureRows(r);
            for(let k = 0; k < span; k++) {
                cells[r][startC + k] = null;
            }
        }
        
        cells[rowIdx][startC] = { ...content, colSpan: span };
    };

    // Calculate layout for each block
    blocks.forEach(block => {
        // Decide layout based on block type
        let qNum = block.startNumber;
        
        for (let i = 0; i < block.count; i++) {
            const r = colCurrentRows[activeColumn];
            
            // Render Question Number
            // Use 2 grid units for question number
            const qNumWidth = 2;
            const contentWidth = innerColWidth - qNumWidth; 
            
            // Logic per type
            if (block.type === 'marksheet') {
                // Check if we can fit multiple marksheets in one row? 
                // For simplicity, 1 question per row for now, or 2 if width allows.
                // With 24 cols, 1 col = 24 units. QNum=2. Content=22.
                // Marksheet usually needs ~4 units per option. 4 options = 16 units. Fits easily.
                // If 2 columns mode -> 12 units total. QNum=2. Content=10. 4 options -> 2.5 units each. Tight but ok.
                
                const optionsCount = block.options?.choices || 4;
                const labels = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
                
                addCell(activeColumn, r, qNumWidth, c({ text: `問${qNum}`, hAlign: 'center', backgroundColor: '#f3f4f6' }));
                
                const optWidth = Math.floor(contentWidth / optionsCount);
                for(let opt=0; opt<optionsCount; opt++) {
                    const isLast = opt === optionsCount - 1;
                    const span = isLast ? contentWidth - (optWidth * (optionsCount-1)) : optWidth;
                    addCell(activeColumn, r, span, c({ text: labels[opt], hAlign: 'center' }));
                    // Shift internal pointer? No, addCell handles absolute positioning relative to column start
                    // Actually addCell needs an offset.
                    // Let's refactor addCell to accept relative column offset.
                }
                
                // Correct way to add multiple cells in a row:
                // We need to manually place them.
                const startC = activeColumn * colGroupWidth + (activeColumn > 0 ? colGap : 0);
                
                // Q Num
                cells[r][startC] = c({ text: `問${qNum}`, colSpan: qNumWidth, hAlign: 'center', backgroundColor: '#f3f4f6' });
                for(let k=1; k<qNumWidth; k++) cells[r][startC+k] = null;

                // Options
                for(let opt=0; opt<optionsCount; opt++) {
                    const isLast = opt === optionsCount - 1;
                    const span = isLast ? contentWidth - (optWidth * (optionsCount-1)) : optWidth;
                    const optStartC = startC + qNumWidth + (opt * optWidth);
                    cells[r][optStartC] = c({ text: labels[opt], colSpan: span, hAlign: 'center' });
                    for(let k=1; k<span; k++) cells[r][optStartC+k] = null;
                }

                colCurrentRows[activeColumn]++;
            }
            else if (block.type === 'short_text') {
                const startC = activeColumn * colGroupWidth + (activeColumn > 0 ? colGap : 0);
                cells[r][startC] = c({ text: `問${qNum}`, colSpan: qNumWidth, hAlign: 'center', backgroundColor: '#f3f4f6' });
                for(let k=1; k<qNumWidth; k++) cells[r][startC+k] = null;

                cells[r][startC + qNumWidth] = c({ text: '', colSpan: contentWidth });
                for(let k=1; k<contentWidth; k++) cells[r][startC + qNumWidth + k] = null;
                
                colCurrentRows[activeColumn]++;
            }
            else if (block.type === 'long_text') {
                const lines = block.options?.lines || 3;
                const startC = activeColumn * colGroupWidth + (activeColumn > 0 ? colGap : 0);
                
                // Q Num spans all rows
                cells[r][startC] = c({ text: `問${qNum}`, colSpan: qNumWidth, rowSpan: lines, hAlign: 'center', vAlign: 'middle', backgroundColor: '#f3f4f6' });
                for(let l=0; l<lines; l++) {
                    ensureRows(r+l);
                    for(let k=0; k<qNumWidth; k++) {
                        if (l===0 && k===0) continue; 
                        cells[r+l][startC+k] = null;
                    }
                    // Answer lines
                    cells[r+l][startC+qNumWidth] = c({ text: '', colSpan: contentWidth });
                    for(let k=1; k<contentWidth; k++) cells[r+l][startC+qNumWidth+k] = null;
                }
                
                colCurrentRows[activeColumn] += lines;
            }
            else if (block.type === 'english') {
                const lines = block.options?.lines || 4; // usually 4 lines for one english staff
                const startC = activeColumn * colGroupWidth + (activeColumn > 0 ? colGap : 0);
                
                // We use 4 rows to simulate 4 lines.
                // 1st line: top border only (or bottom of previous?). 
                // Let's make 4 small rows.
                
                cells[r][startC] = c({ text: `問${qNum}`, colSpan: qNumWidth, rowSpan: 4, hAlign: 'center', vAlign: 'middle', backgroundColor: '#f3f4f6' });
                for(let l=0; l<4; l++) {
                    ensureRows(r+l);
                    rowHeights[r+l] = 7 * mmToPx; // Slightly shorter for english lines?
                    
                    for(let k=0; k<qNumWidth; k++) {
                        if (l===0 && k===0) continue;
                        cells[r+l][startC+k] = null;
                    }
                    
                    // English lines: Borders need to be careful.
                    // Line 1: Border Bottom (solid)
                    // Line 2: Border Bottom (dotted/dashed) - standard cell doesn't support border style yet, use solid
                    // Line 3: Border Bottom (solid) - baseline
                    // Line 4: Border Bottom (hidden or solid)
                    
                    // Simplification: Standard rows.
                    cells[r+l][startC+qNumWidth] = c({ 
                        text: '', colSpan: contentWidth, 
                        borders: { left: l===0||l===3, right: l===0||l===3, top: l===0, bottom: true } 
                        // Visual trickery: Ideally we need dashed lines. 
                        // For now, just standard boxes.
                    });
                    for(let k=1; k<contentWidth; k++) cells[r+l][startC+qNumWidth+k] = null;
                }
                colCurrentRows[activeColumn] += 4;
            }
            else if (block.type === 'grid') {
                // Genkou youshi style.
                const charCount = block.options?.chars || 100; // e.g. 10x10 is hard in this grid.
                // Assuming contentWidth (e.g. 22 or 10 units).
                // Let's just make a big box with "X文字" label for now, as true grid requires changing colWidths dynamically which breaks other questions.
                
                const startC = activeColumn * colGroupWidth + (activeColumn > 0 ? colGap : 0);
                const rowsNeeded = Math.ceil(charCount / 20) + 1; // rough estimate
                
                cells[r][startC] = c({ text: `問${qNum}`, colSpan: qNumWidth, rowSpan: rowsNeeded, hAlign: 'center', vAlign: 'middle', backgroundColor: '#f3f4f6' });
                for(let l=0; l<rowsNeeded; l++) {
                    ensureRows(r+l);
                    for(let k=0; k<qNumWidth; k++) { if (l===0 && k===0) continue; cells[r+l][startC+k] = null; }
                }

                // Title row for grid
                cells[r][startC+qNumWidth] = c({ text: `${charCount}文字以内で記述しなさい`, colSpan: contentWidth, borders:{top:true, left:true, right:true, bottom:false}, fontSize: 9 });
                for(let k=1; k<contentWidth; k++) cells[r][startC+qNumWidth+k] = null;

                // Big box
                const gridRows = rowsNeeded - 1;
                cells[r+1][startC+qNumWidth] = c({ text: '', colSpan: contentWidth, rowSpan: gridRows, borders:{top:false, left:true, right:true, bottom:true} });
                for(let l=0; l<gridRows; l++) {
                    for(let k=0; k<contentWidth; k++) {
                        if (l===0 && k===0) continue;
                        cells[r+1+l][startC+qNumWidth+k] = null;
                    }
                }
                colCurrentRows[activeColumn] += rowsNeeded;
            }

            // Move to next column if this one is getting too long (simple balancing)
            // Or just fill linearly if specified?
            // "columns" setting implies user wants layout like:
            // [Col 1] [Col 2]
            // If we just fill Col 1 then Col 2, we need to know when to switch.
            // Simple logic: Switch after N questions or fill evenly?
            // Let's switch active column for every question to balance them!
            if (columns > 1) {
                activeColumn = (activeColumn + 1) % columns;
                // If we wrap around, we don't necessarily increment row, because we track row per column.
            }
            
            qNum++;
        }
    });

    // Cleanup empty rows at end
    // (Optional)

    return {
        id: `layout_${Date.now()}`,
        name: name,
        rows: cells.length,
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
    const [columns, setColumns] = useState(1);
    
    const [questionBlocks, setQuestionBlocks] = useState<QuestionBlock[]>([]);

    const addBlock = (type: QuestionType) => {
        const lastBlock = questionBlocks[questionBlocks.length - 1];
        const startNum = lastBlock ? lastBlock.startNumber + lastBlock.count : 1;
        
        const newBlock: QuestionBlock = {
            id: `block_${Date.now()}`,
            type,
            count: 1,
            startNumber: startNum,
            options: type === 'marksheet' ? { choices: 4 } : 
                     type === 'english' ? { lines: 4 } : 
                     type === 'long_text' ? { lines: 3 } : 
                     type === 'grid' ? { chars: 100 } : {}
        };
        setQuestionBlocks([...questionBlocks, newBlock]);
    };

    const updateBlock = (id: string, field: keyof QuestionBlock | 'options', value: any) => {
        setQuestionBlocks(prev => {
            const newBlocks = prev.map(b => {
                if (b.id === id) {
                    if (field === 'options') return { ...b, options: { ...b.options, ...value } };
                    return { ...b, [field]: value };
                }
                return b;
            });
            // Recalculate start numbers
            let currentStart = 1;
            return newBlocks.map(b => {
                const updated = { ...b, startNumber: currentStart };
                currentStart += b.count;
                return updated;
            });
        });
    };

    const removeBlock = (id: string) => {
        setQuestionBlocks(prev => {
            const newBlocks = prev.filter(b => b.id !== id);
            let currentStart = 1;
            return newBlocks.map(b => {
                const updated = { ...b, startNumber: currentStart };
                currentStart += b.count;
                return updated;
            });
        });
    };

    const handleCreateLayout = () => {
        if (!name.trim()) {
            alert('レイアウト名を入力してください');
            return;
        }
        if (questionBlocks.length === 0) {
            alert('少なくとも1つの問題ブロックを追加してください');
            return;
        }
        
        const newLayout = generateSmartLayout(name.trim(), paperSize, columns, questionBlocks);
        setLayouts(prev => ({ ...prev, [newLayout.id]: newLayout }));
        setActiveLayoutId(newLayout.id);
        setIsCreateModalOpen(false);
        
        // Reset
        setName('');
        setQuestionBlocks([]);
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
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-6 max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center flex-shrink-0">
                            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">解答用紙の簡単作成</h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600"><XIcon className="w-6 h-6"/></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                            {/* Basic Settings */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                                <div className="col-span-1 md:col-span-3">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">テスト名 (タイトル)</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700" placeholder="例: 1学期期末テスト 英語" autoFocus />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">用紙サイズ</label>
                                    <select value={paperSize} onChange={e => setPaperSize(e.target.value as PaperSize)} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700">
                                        <option value="A4">A4 (一般的)</option>
                                        <option value="B5">B5 (ノートサイズ)</option>
                                        <option value="A3">A3 (見開き)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">レイアウト列数</label>
                                    <div className="flex items-center gap-4 mt-2">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" name="cols" checked={columns === 1} onChange={() => setColumns(1)} className="w-4 h-4 text-sky-600"/>
                                            <span className="text-sm">1列</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" name="cols" checked={columns === 2} onChange={() => setColumns(2)} className="w-4 h-4 text-sky-600"/>
                                            <span className="text-sm">2列</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Block Builder */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="font-semibold text-slate-700 dark:text-slate-300">問題構成</h4>
                                    <div className="flex gap-2">
                                        <button onClick={() => addBlock('marksheet')} className="px-3 py-1.5 text-xs bg-teal-100 text-teal-700 hover:bg-teal-200 rounded-md flex items-center gap-1 transition-colors"><CalculatorIcon className="w-3 h-3"/> 記号(選択)</button>
                                        <button onClick={() => addBlock('short_text')} className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md flex items-center gap-1 transition-colors"><ListIcon className="w-3 h-3"/> 語句(短文)</button>
                                        <button onClick={() => addBlock('long_text')} className="px-3 py-1.5 text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-md flex items-center gap-1 transition-colors"><FileUpIcon className="w-3 h-3"/> 記述(複数行)</button>
                                        <button onClick={() => addBlock('english')} className="px-3 py-1.5 text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-md flex items-center gap-1 transition-colors"><PenLineIcon className="w-3 h-3"/> 英作文</button>
                                    </div>
                                </div>

                                <div className="space-y-3 min-h-[200px] bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg">
                                    {questionBlocks.length === 0 && (
                                        <div className="text-center text-slate-400 py-8">
                                            上のボタンから問題ブロックを追加してください
                                        </div>
                                    )}
                                    {questionBlocks.map((block, index) => (
                                        <div key={block.id} className="bg-white dark:bg-slate-800 p-3 rounded-md shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
                                            <div className="flex-shrink-0 w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-xs font-bold">
                                                {index + 1}
                                            </div>
                                            <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                                                <div className="col-span-3">
                                                    <span className="text-xs font-bold text-slate-500 block mb-1">種類</span>
                                                    <span className="text-sm font-medium">
                                                        {block.type === 'marksheet' ? '記号選択' : 
                                                         block.type === 'short_text' ? '語句記述' : 
                                                         block.type === 'long_text' ? '長文記述' : 
                                                         block.type === 'english' ? '英作文' : 'マス目'}
                                                    </span>
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="text-xs font-bold text-slate-500 block mb-1">問題数</label>
                                                    <input type="number" min="1" max="50" value={block.count} onChange={e => updateBlock(block.id, 'count', parseInt(e.target.value))} className="w-full p-1 text-sm border rounded bg-slate-50 dark:bg-slate-700" />
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="text-xs font-bold text-slate-500 block mb-1">開始番号</label>
                                                    <span className="text-sm px-2">{block.startNumber} ～</span>
                                                </div>
                                                <div className="col-span-4">
                                                    <label className="text-xs font-bold text-slate-500 block mb-1">オプション</label>
                                                    {block.type === 'marksheet' && (
                                                        <select value={block.options?.choices} onChange={e => updateBlock(block.id, 'options', { choices: parseInt(e.target.value) })} className="w-full p-1 text-xs border rounded bg-slate-50 dark:bg-slate-700">
                                                            <option value="3">3択</option>
                                                            <option value="4">4択</option>
                                                            <option value="5">5択</option>
                                                        </select>
                                                    )}
                                                    {block.type === 'long_text' && (
                                                        <div className="flex items-center gap-2 text-xs">
                                                            <span>行数:</span>
                                                            <input type="number" min="2" max="10" value={block.options?.lines} onChange={e => updateBlock(block.id, 'options', { lines: parseInt(e.target.value) })} className="w-12 p-1 border rounded bg-slate-50 dark:bg-slate-700" />
                                                        </div>
                                                    )}
                                                    {block.type === 'english' && (
                                                        <span className="text-xs text-slate-400">4線 (固定)</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button onClick={() => removeBlock(block.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                                                <Trash2Icon className="w-5 h-5"/>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700 flex-shrink-0">
                            <button onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                キャンセル
                            </button>
                            <button onClick={handleCreateLayout} className="px-6 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-500 shadow-md transition-colors font-medium">
                                解答用紙を生成
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