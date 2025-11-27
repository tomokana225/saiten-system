import React, { useState, useEffect, useCallback } from 'react';
import type { SheetLayout, SheetCell } from '../../types';
import { PlusIcon, Trash2Icon, FileUpIcon, FileDownIcon, XIcon, CalculatorIcon, ListIcon, BoxSelectIcon, PenLineIcon, ArrowDownFromLineIcon, ArrowRightIcon, PaletteIcon, GripVerticalIcon } from '../icons';

interface LayoutSidebarProps {
    layouts: Record<string, SheetLayout>;
    setLayouts: React.Dispatch<React.SetStateAction<Record<string, SheetLayout>>>;
    activeLayoutId: string | null;
    setActiveLayoutId: React.Dispatch<React.SetStateAction<string | null>>;
}

type PaperSize = 'A4' | 'B5' | 'A3';
type QuestionType = 'text' | 'marksheet' | 'long_text';

// Logical structure of the exam
interface QuestionDef {
    id: string;
    type: QuestionType;
    widthRatio: number; // 1 to 10 (relative width)
    chars?: number; // Hint for text width
    choices?: number; // For marksheet
    labelOverride?: string;
}

interface SectionDef {
    id: string;
    title: string; // e.g., "I", "II", "1", "2"
    questions: QuestionDef[];
}

interface LayoutConfig {
    name: string;
    paperSize: PaperSize;
    borderWidth: number;
    borderColor: string;
    sections: SectionDef[];
}

const PAPER_DIMENSIONS: Record<PaperSize, { width: number, height: number }> = {
    'A4': { width: 210, height: 297 },
    'B5': { width: 182, height: 257 },
    'A3': { width: 297, height: 420 },
};

const c = (overrides: Partial<SheetCell> = {}): SheetCell => ({
    text: '', rowSpan: 1, colSpan: 1, hAlign: 'left', vAlign: 'middle',
    fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none',
    fontSize: 11, borders: { top: true, bottom: true, left: true, right: true },
    borderStyle: 'solid', borderColor: '#000000', borderWidth: 1,
    ...overrides
});

// Auto-layout engine
const generateAutoLayout = (config: LayoutConfig): SheetLayout => {
    // High-resolution grid for flexible placement
    const totalCols = 60; 
    const mmToPx = 3.78; 
    const rowHeightMm = 10; 
    
    const cells: (SheetCell | null)[][] = [];
    const rowHeights: number[] = [];
    const colWidths: number[] = Array(totalCols).fill(((PAPER_DIMENSIONS[config.paperSize].width - 20) / totalCols) * mmToPx);

    const addRow = (heightMm: number = rowHeightMm) => {
        const row = Array(totalCols).fill(null).map(() => c({ borders: { top: false, bottom: false, left: false, right: false } }));
        cells.push(row);
        rowHeights.push(heightMm * mmToPx);
        return cells.length - 1;
    };

    const placeCell = (r: number, cIdx: number, span: number, content: SheetCell) => {
        while (r >= cells.length) addRow();
        if (cIdx >= totalCols) return;
        
        const safeSpan = Math.min(span, totalCols - cIdx);
        if (safeSpan <= 0) return;

        // Apply global style settings if not overridden
        const cellContent = {
            ...content,
            borderWidth: content.borderWidth ?? config.borderWidth,
            borderColor: content.borderColor ?? config.borderColor,
        };

        cells[r][cIdx] = { ...cellContent, colSpan: safeSpan };
        for (let k = 1; k < safeSpan; k++) {
            if (cIdx + k < totalCols) cells[r][cIdx + k] = null;
        }
    };

    // --- Header ---
    let r = addRow(16);
    placeCell(r, 0, 40, c({ text: config.name, fontSize: 18, fontWeight: 'bold', hAlign: 'center', borders: { top: true, bottom: true, left: true, right: true } }));
    placeCell(r, 40, 20, c({ text: '点数', fontSize: 10, vAlign: 'top', borders: { top: true, bottom: true, left: true, right: true } }));
    
    r = addRow(12);
    placeCell(r, 0, 20, c({ text: '  年     組     番', borders: { top: true, bottom: true, left: true, right: true } }));
    placeCell(r, 20, 20, c({ text: '氏名', borders: { top: true, bottom: true, left: true, right: true } }));
    placeCell(r, 40, 20, c({ text: '', borders: { top: true, bottom: true, left: true, right: true } })); // Score space

    addRow(6); // Spacer

    // --- Body ---
    // Layout Logic:
    // Iterate through sections.
    // Inside section, iterate through questions.
    // Pack questions into rows like flexbox.
    
    // Width allocation:
    // Left margin for Section Labels (e.g. 4 cols)
    const sectionLabelWidth = 4;
    const contentAreaWidth = totalCols - sectionLabelWidth - 1; // -1 right margin
    const contentStartCol = sectionLabelWidth;

    let globalQNum = 1;

    config.sections.forEach(section => {
        const sectionStartRow = cells.length;
        
        let currentRow = addRow();
        let currentContentCol = 0; // Relative to contentStartCol

        section.questions.forEach((q, idx) => {
            const qNumText = q.labelOverride || `${globalQNum}`;
            if (!q.labelOverride) globalQNum++;

            // Calculate width needed
            // Q Num box: fixed ~3 units
            // Answer box: depends on user setting (widthRatio or chars)
            // Let's map 'chars'/widthRatio to grid units.
            // total content width is ~55 units.
            // 10 chars ~ 10-15 units?
            // widthRatio 1-10 -> 10% to 100% of row
            
            const qNumBoxWidth = 3;
            let answerBoxWidth = 0;
            
            if (q.type === 'marksheet') {
                const choices = q.choices || 4;
                answerBoxWidth = Math.max(8, choices * 3);
            } else if (q.type === 'long_text') {
                answerBoxWidth = contentAreaWidth - qNumBoxWidth; // Full width
            } else {
                // Text
                // Use widthRatio if set, else approximate from chars
                // Map ratio 1..10 to 10%..100%
                answerBoxWidth = Math.floor((contentAreaWidth * q.widthRatio) / 10) - qNumBoxWidth;
                answerBoxWidth = Math.max(4, answerBoxWidth);
            }

            const totalItemWidth = qNumBoxWidth + answerBoxWidth;

            // Check if fits in current row
            if (currentContentCol + totalItemWidth > contentAreaWidth) {
                // Wrap to next row
                currentRow = addRow();
                currentContentCol = 0;
            }

            // Place Question Number
            const absCol = contentStartCol + currentContentCol;
            placeCell(currentRow, absCol, qNumBoxWidth, c({ 
                text: qNumText, 
                hAlign: 'center', 
                backgroundColor: '#f3f4f6',
                borders: { top: true, bottom: true, left: true, right: true }
            }));

            // Place Answer Box
            if (q.type === 'marksheet') {
                const choices = q.choices || 4;
                const labels = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
                const choiceSpan = Math.floor(answerBoxWidth / choices);
                for(let i=0; i<choices; i++) {
                    const isLast = i === choices - 1;
                    const span = isLast ? answerBoxWidth - (choiceSpan * (choices-1)) : choiceSpan;
                    placeCell(currentRow, absCol + qNumBoxWidth + (i * choiceSpan), span, c({
                        text: labels[i], hAlign: 'center',
                        borders: { top: true, bottom: true, left: true, right: true }
                    }));
                }
            } else if (q.type === 'long_text') {
                // Long text might span multiple rows?
                // For simplicity here, just one tall row or handle rowSpan?
                // Let's make the row taller for this one.
                rowHeights[currentRow] = 30 * mmToPx; // Tall row
                placeCell(currentRow, absCol + qNumBoxWidth, answerBoxWidth, c({
                    text: '', borders: { top: true, bottom: true, left: true, right: true }
                }));
            } else {
                // Normal text
                placeCell(currentRow, absCol + qNumBoxWidth, answerBoxWidth, c({
                    text: '', borders: { top: true, bottom: true, left: true, right: true }
                }));
            }

            currentContentCol += totalItemWidth + 1; // +1 gap
        });

        // Place Section Label
        const sectionEndRow = cells.length;
        const rowSpan = sectionEndRow - sectionStartRow;
        if (rowSpan > 0) {
            placeCell(sectionStartRow, 0, sectionLabelWidth, c({
                text: section.title,
                rowSpan: rowSpan,
                hAlign: 'center',
                vAlign: 'middle',
                fontSize: 14,
                fontWeight: 'bold',
                backgroundColor: '#e5e7eb',
                borders: { top: true, bottom: true, left: true, right: true }
            }));
            // Cleanup underlying
            for(let rr=sectionStartRow+1; rr<sectionEndRow; rr++) {
                for(let cc=0; cc<sectionLabelWidth; cc++) cells[rr][cc] = null;
            }
        }

        addRow(4); // Gap between sections
    });

    return {
        id: `layout_${Date.now()}`,
        name: config.name,
        rows: cells.length,
        cols: totalCols,
        rowHeights,
        colWidths,
        cells,
    };
};

export const LayoutSidebar: React.FC<LayoutSidebarProps> = ({ layouts, setLayouts, activeLayoutId, setActiveLayoutId }) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    
    // --- Builder State ---
    const [config, setConfig] = useState<LayoutConfig>({
        name: '',
        paperSize: 'A4',
        borderWidth: 1,
        borderColor: '#000000',
        sections: []
    });

    // Helper to add a section
    const addSection = () => {
        const newSection: SectionDef = {
            id: `sec_${Date.now()}`,
            title: ['I', 'II', 'III', 'IV', 'V'][config.sections.length] || `${config.sections.length + 1}`,
            questions: []
        };
        setConfig(prev => ({ ...prev, sections: [...prev.sections, newSection] }));
    };

    // Helper to add a question to the last section (or create one)
    const addQuestion = (type: QuestionType, widthRatio: number = 5) => {
        let sections = [...config.sections];
        if (sections.length === 0) {
            sections.push({ id: `sec_${Date.now()}`, title: 'I', questions: [] });
        }
        const lastSection = sections[sections.length - 1];
        
        lastSection.questions.push({
            id: `q_${Date.now()}`,
            type,
            widthRatio,
            choices: type === 'marksheet' ? 4 : undefined,
        });
        
        setConfig(prev => ({ ...prev, sections }));
    };

    const updateQuestion = (sectionId: string, qId: string, updates: Partial<QuestionDef>) => {
        setConfig(prev => ({
            ...prev,
            sections: prev.sections.map(s => {
                if (s.id !== sectionId) return s;
                return {
                    ...s,
                    questions: s.questions.map(q => q.id === qId ? { ...q, ...updates } : q)
                };
            })
        }));
    };

    const deleteQuestion = (sectionId: string, qId: string) => {
        setConfig(prev => ({
            ...prev,
            sections: prev.sections.map(s => {
                if (s.id !== sectionId) return s;
                return { ...s, questions: s.questions.filter(q => q.id !== qId) };
            })
        }));
    };

    const handleCreateLayout = () => {
        if (!config.name) {
            alert('テスト名を入力してください');
            return;
        }
        const layout = generateAutoLayout(config);
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
        setActiveLayoutId(layout.id);
        setIsCreateModalOpen(false);
        setConfig({ name: '', paperSize: 'A4', borderWidth: 1, borderColor: '#000000', sections: [] });
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
        }
    };

    const handleExportLayout = async () => {
        if (!activeLayoutId || !layouts[activeLayoutId]) return;
        await window.electronAPI.invoke('export-sheet-layout', {
            layoutName: layouts[activeLayoutId].name,
            layoutData: layouts[activeLayoutId],
        });
    };

    return (
        <>
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex overflow-hidden">
                        {/* Left: Configuration Sidebar */}
                        <div className="w-1/3 border-r dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col">
                            <div className="p-4 border-b dark:border-slate-700">
                                <h3 className="font-bold text-lg mb-4">設定</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">テスト名</label>
                                        <input type="text" value={config.name} onChange={e => setConfig({...config, name: e.target.value})} className="w-full p-2 border rounded-md text-sm" placeholder="1学期中間テスト"/>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <label className="block text-xs font-bold text-slate-500 mb-1">サイズ</label>
                                            <select value={config.paperSize} onChange={e => setConfig({...config, paperSize: e.target.value as PaperSize})} className="w-full p-2 border rounded-md text-sm">
                                                <option value="A4">A4</option>
                                                <option value="B5">B5</option>
                                                <option value="A3">A3</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <div className="flex-1">
                                            <label className="block text-xs font-bold text-slate-500 mb-1">枠線の色</label>
                                            <input type="color" value={config.borderColor} onChange={e => setConfig({...config, borderColor: e.target.value})} className="w-full h-8 cursor-pointer"/>
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-xs font-bold text-slate-500 mb-1">太さ</label>
                                            <input type="number" min="1" max="5" value={config.borderWidth} onChange={e => setConfig({...config, borderWidth: parseInt(e.target.value)})} className="w-full p-1 border rounded-md text-sm"/>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                <div className="space-y-2">
                                    <button onClick={() => addQuestion('text', 2)} className="w-full flex items-center gap-2 p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg shadow-sm transition-all text-left group">
                                        <div className="bg-blue-100 p-2 rounded text-blue-600"><ListIcon className="w-5 h-5"/></div>
                                        <div>
                                            <div className="font-bold text-sm">短答 (小)</div>
                                            <div className="text-xs text-slate-400">数文字程度の記述</div>
                                        </div>
                                        <PlusIcon className="ml-auto w-4 h-4 text-slate-300 group-hover:text-sky-500"/>
                                    </button>
                                    <button onClick={() => addQuestion('text', 5)} className="w-full flex items-center gap-2 p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg shadow-sm transition-all text-left group">
                                        <div className="bg-indigo-100 p-2 rounded text-indigo-600"><ListIcon className="w-5 h-5"/></div>
                                        <div>
                                            <div className="font-bold text-sm">記述 (中)</div>
                                            <div className="text-xs text-slate-400">1行程度の記述</div>
                                        </div>
                                        <PlusIcon className="ml-auto w-4 h-4 text-slate-300 group-hover:text-sky-500"/>
                                    </button>
                                    <button onClick={() => addQuestion('long_text')} className="w-full flex items-center gap-2 p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg shadow-sm transition-all text-left group">
                                        <div className="bg-purple-100 p-2 rounded text-purple-600"><FileUpIcon className="w-5 h-5"/></div>
                                        <div>
                                            <div className="font-bold text-sm">長文記述</div>
                                            <div className="text-xs text-slate-400">複数行の大きな枠</div>
                                        </div>
                                        <PlusIcon className="ml-auto w-4 h-4 text-slate-300 group-hover:text-sky-500"/>
                                    </button>
                                    <button onClick={() => addQuestion('marksheet')} className="w-full flex items-center gap-2 p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg shadow-sm transition-all text-left group">
                                        <div className="bg-teal-100 p-2 rounded text-teal-600"><CalculatorIcon className="w-5 h-5"/></div>
                                        <div>
                                            <div className="font-bold text-sm">記号選択</div>
                                            <div className="text-xs text-slate-400">①〜④などの選択肢</div>
                                        </div>
                                        <PlusIcon className="ml-auto w-4 h-4 text-slate-300 group-hover:text-sky-500"/>
                                    </button>
                                </div>
                                <div className="border-t pt-4 dark:border-slate-700">
                                    <button onClick={addSection} className="w-full flex items-center justify-center gap-2 p-2 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-slate-300 text-sm font-bold text-slate-600 dark:text-slate-300">
                                        <ArrowDownFromLineIcon className="w-4 h-4"/> 新しい大問を追加
                                    </button>
                                </div>
                            </div>
                            <div className="p-4 border-t dark:border-slate-700 bg-white dark:bg-slate-800">
                                <button onClick={handleCreateLayout} className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold shadow-lg transform transition-transform active:scale-95">
                                    解答用紙を生成する
                                </button>
                            </div>
                        </div>

                        {/* Right: Interactive Preview / List */}
                        <div className="w-2/3 bg-slate-100 dark:bg-slate-900/50 flex flex-col relative">
                            <div className="absolute top-2 right-2 z-10">
                                <button onClick={() => setIsCreateModalOpen(false)} className="p-2 bg-white rounded-full shadow hover:bg-slate-100"><XIcon className="w-5 h-5"/></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-8">
                                <div className="bg-white min-h-full shadow-lg p-8 rounded-sm" style={{ aspectRatio: PAPER_DIMENSIONS[config.paperSize].width / PAPER_DIMENSIONS[config.paperSize].height }}>
                                    <h1 className="text-center text-2xl font-bold border-b-2 border-black pb-4 mb-4">{config.name || 'テスト名'}</h1>
                                    
                                    {config.sections.map((section, sIdx) => (
                                        <div key={section.id} className="mb-6 border-l-4 border-slate-300 pl-4 relative group/section hover:border-sky-400 transition-colors">
                                            <div className="absolute -left-10 top-0 p-2">
                                                <input value={section.title} onChange={e => {
                                                    const newSections = [...config.sections];
                                                    newSections[sIdx].title = e.target.value;
                                                    setConfig({...config, sections: newSections});
                                                }} className="w-8 text-center font-bold text-xl bg-transparent border-b border-transparent focus:border-sky-500 outline-none" />
                                            </div>
                                            
                                            <div className="flex flex-wrap gap-2 items-start content-start">
                                                {section.questions.map((q, qIdx) => (
                                                    <div key={q.id} className="group/item relative border border-slate-300 bg-white p-2 rounded hover:shadow-md hover:border-sky-500 transition-all cursor-pointer" 
                                                        style={{ 
                                                            width: q.type === 'long_text' ? '100%' : `${(q.widthRatio || 5) * 10}%`,
                                                            minWidth: '100px'
                                                        }}>
                                                        
                                                        {/* Hover Controls */}
                                                        <div className="absolute -top-2 -right-2 hidden group-hover/item:flex gap-1 bg-white shadow rounded-full p-1 z-20">
                                                            <button onClick={() => deleteQuestion(section.id, q.id)} className="p-1 text-red-500 hover:bg-red-50 rounded-full"><Trash2Icon className="w-3 h-3"/></button>
                                                        </div>
                                                        <div className="absolute bottom-0 right-0 w-4 h-4 cursor-ew-resize opacity-0 group-hover/item:opacity-100 bg-slate-200 rounded-tl" 
                                                            title="幅を変更"
                                                            onMouseDown={(e) => {
                                                                // Simple resize logic simulation
                                                                const startX = e.clientX;
                                                                const startWidth = q.widthRatio;
                                                                const onMove = (mv: MouseEvent) => {
                                                                    const diff = mv.clientX - startX;
                                                                    const step = 20; // px per ratio unit approx
                                                                    const change = Math.round(diff / step);
                                                                    updateQuestion(section.id, q.id, { widthRatio: Math.max(1, Math.min(10, startWidth + change)) });
                                                                };
                                                                const onUp = () => {
                                                                    document.removeEventListener('mousemove', onMove);
                                                                    document.removeEventListener('mouseup', onUp);
                                                                };
                                                                document.addEventListener('mousemove', onMove);
                                                                document.addEventListener('mouseup', onUp);
                                                            }}
                                                        />

                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold bg-slate-100 px-1 rounded text-xs">{q.labelOverride || '?'}</span>
                                                            <span className="text-xs text-slate-400 flex-1 truncate">
                                                                {q.type === 'marksheet' ? `記号 (${q.choices}択)` : q.type === 'long_text' ? '長文記述' : '記述'}
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 h-6 bg-slate-50 border border-dashed border-slate-200 rounded flex items-center justify-center text-xs text-slate-300">
                                                            解答欄
                                                        </div>
                                                    </div>
                                                ))}
                                                {/* Add button at end of flow */}
                                                <button onClick={() => addQuestion('text', 2)} className="w-8 h-8 rounded border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-300 hover:text-sky-500 hover:border-sky-500 transition-colors">
                                                    <PlusIcon className="w-4 h-4"/>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {config.sections.length === 0 && (
                                        <div className="flex items-center justify-center h-40 text-slate-400">
                                            左のメニューから問題を追加してください
                                        </div>
                                    )}
                                </div>
                            </div>
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