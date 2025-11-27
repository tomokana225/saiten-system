import React, { useState, useEffect, useCallback } from 'react';
import type { SheetLayout, SheetCell, LayoutConfig } from '../../types';
import { PlusIcon, Trash2Icon, FileUpIcon, FileDownIcon, XIcon, CalculatorIcon, ListIcon, BoxSelectIcon, PenLineIcon, ArrowDownFromLineIcon, ArrowRightIcon, PaletteIcon, GripVerticalIcon, RotateCcwIcon, Edit3Icon } from '../icons';

interface LayoutSidebarProps {
    layouts: Record<string, SheetLayout>;
    setLayouts: React.Dispatch<React.SetStateAction<Record<string, SheetLayout>>>;
    activeLayoutId: string | null;
    setActiveLayoutId: React.Dispatch<React.SetStateAction<string | null>>;
}

type PaperSize = 'A4' | 'B5' | 'A3';
type QuestionType = 'text' | 'marksheet' | 'long_text';

// Re-using types from src/types.ts, but local aliases for clarity
type QuestionDef = LayoutConfig['sections'][0]['questions'][0];
type SectionDef = LayoutConfig['sections'][0];

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

// Auto-layout engine (Same as before, but exported or reusable)
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

            const qNumBoxWidth = 3;
            let answerBoxWidth = 0;
            
            if (q.type === 'marksheet') {
                const choices = q.choices || 4;
                answerBoxWidth = Math.max(8, choices * 3);
            } else if (q.type === 'long_text') {
                answerBoxWidth = contentAreaWidth - qNumBoxWidth; // Full width
            } else {
                // Map ratio 1..10 to width
                answerBoxWidth = Math.floor((contentAreaWidth * q.widthRatio) / 10) - qNumBoxWidth;
                answerBoxWidth = Math.max(4, answerBoxWidth);
            }

            const totalItemWidth = qNumBoxWidth + answerBoxWidth;

            // Check if fits in current row
            if (currentContentCol + totalItemWidth > contentAreaWidth) {
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
                rowHeights[currentRow] = 30 * mmToPx; // Tall row
                placeCell(currentRow, absCol + qNumBoxWidth, answerBoxWidth, c({
                    text: '', borders: { top: true, bottom: true, left: true, right: true }
                }));
            } else {
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
                if (rr < cells.length) { 
                    for(let cc=0; cc<sectionLabelWidth; cc++) {
                        if (cc < totalCols) cells[rr][cc] = null;
                    }
                }
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
        config, // Store config for re-editing
    };
};

export const LayoutSidebar: React.FC<LayoutSidebarProps> = ({ layouts, setLayouts, activeLayoutId, setActiveLayoutId }) => {
    const [tab, setTab] = useState<'list' | 'edit'>('list');
    
    // --- Builder State ---
    const [config, setConfig] = useState<LayoutConfig>({
        name: '',
        paperSize: 'A4',
        borderWidth: 1,
        borderColor: '#000000',
        sections: []
    });

    // Load config from active layout when switching to edit tab
    useEffect(() => {
        if (activeLayoutId && layouts[activeLayoutId]?.config) {
            setConfig(layouts[activeLayoutId].config!);
        } else if (!activeLayoutId) {
            // Reset if nothing selected
            setConfig({ name: '', paperSize: 'A4', borderWidth: 1, borderColor: '#000000', sections: [] });
        }
    }, [activeLayoutId, layouts, tab]);

    // Switch to edit tab automatically if creating new
    const startNewLayout = () => {
        setConfig({ name: '新規テスト', paperSize: 'A4', borderWidth: 1, borderColor: '#000000', sections: [] });
        setActiveLayoutId(null);
        setTab('edit');
    };

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
        // Auto-regenerate if active layout exists and matches
        // Debounce this in real app, here manual button for now or auto effect?
        // Let's rely on explicit "Regenerate" button to avoid lag
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

    const handleCreateOrUpdateLayout = () => {
        if (!config.name) {
            alert('テスト名を入力してください');
            return;
        }
        const layout = generateAutoLayout(config);
        // If updating existing, keep ID
        if (activeLayoutId) {
            layout.id = activeLayoutId;
        }
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
        setActiveLayoutId(layout.id);
        // alert('レイアウトを更新しました');
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
        await window.electronAPI.invoke('export-sheet-layout', {
            layoutName: layouts[activeLayoutId].name,
            layoutData: layouts[activeLayoutId],
        });
    };

    return (
        <aside className="w-96 flex-shrink-0 flex flex-col bg-white dark:bg-slate-800 border-r dark:border-slate-700 h-full">
            {/* Tab Header */}
            <div className="flex border-b dark:border-slate-700">
                <button 
                    onClick={() => setTab('list')}
                    className={`flex-1 py-3 text-sm font-medium ${tab === 'list' ? 'border-b-2 border-sky-500 text-sky-600' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                    一覧
                </button>
                <button 
                    onClick={() => setTab('edit')}
                    className={`flex-1 py-3 text-sm font-medium ${tab === 'edit' ? 'border-b-2 border-sky-500 text-sky-600' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                    構成編集
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
                {tab === 'list' && (
                    <div className="absolute inset-0 flex flex-col p-4 space-y-4">
                        <div className="flex-1 overflow-y-auto space-y-2">
                            {Object.values(layouts).map((layout: SheetLayout) => (
                                <div key={layout.id} className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${activeLayoutId === layout.id ? 'bg-sky-50 dark:bg-sky-900/50 border border-sky-200' : 'bg-slate-50 dark:bg-slate-700/50 border border-transparent hover:border-slate-300'}`}>
                                    <span onClick={() => setActiveLayoutId(layout.id)} className="flex-1 truncate font-medium">{layout.name}</span>
                                    <button onClick={() => handleDeleteLayout(layout.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-600 rounded-full transition-colors"><Trash2Icon className="w-4 h-4" /></button>
                                </div>
                            ))}
                            {Object.keys(layouts).length === 0 && (
                                <div className="text-center text-slate-400 py-10">
                                    作成されたレイアウトはありません
                                </div>
                            )}
                        </div>
                        <div className="pt-4 border-t dark:border-slate-700 space-y-2">
                            <button onClick={startNewLayout} className="w-full flex items-center justify-center gap-2 p-3 bg-sky-600 text-white rounded-lg hover:bg-sky-500 transition-colors font-bold shadow-sm">
                                <PlusIcon className="w-5 h-5"/> 新規作成
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={handleImportLayout} className="flex items-center justify-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors text-xs text-slate-600 dark:text-slate-300"><FileUpIcon className="w-4 h-4"/>インポート</button>
                                <button onClick={handleExportLayout} disabled={!activeLayoutId} className="flex items-center justify-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors text-xs text-slate-600 dark:text-slate-300 disabled:opacity-50"><FileDownIcon className="w-4 h-4"/>保存</button>
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'edit' && (
                    <div className="absolute inset-0 flex flex-col">
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {/* Basic Settings */}
                            <div className="space-y-4 bg-slate-50 dark:bg-slate-700/30 p-3 rounded-lg border border-slate-200 dark:border-slate-600">
                                <input type="text" value={config.name} onChange={e => setConfig({...config, name: e.target.value})} className="w-full p-2 border-b border-transparent focus:border-sky-500 bg-transparent text-lg font-bold placeholder-slate-400 outline-none" placeholder="テスト名を入力"/>
                                <div className="flex gap-2">
                                    <select value={config.paperSize} onChange={e => setConfig({...config, paperSize: e.target.value as PaperSize})} className="flex-1 p-1.5 border rounded bg-white dark:bg-slate-700 text-sm">
                                        <option value="A4">A4</option>
                                        <option value="B5">B5</option>
                                        <option value="A3">A3</option>
                                    </select>
                                    <div className="flex items-center gap-1 bg-white dark:bg-slate-700 border rounded px-2">
                                        <input type="color" value={config.borderColor} onChange={e => setConfig({...config, borderColor: e.target.value})} className="w-6 h-6 cursor-pointer border-none bg-transparent"/>
                                        <input type="number" min="1" max="5" value={config.borderWidth} onChange={e => setConfig({...config, borderWidth: parseInt(e.target.value)})} className="w-10 p-1 text-sm bg-transparent text-right"/>
                                        <span className="text-xs text-slate-400">px</span>
                                    </div>
                                </div>
                            </div>

                            {/* Add Buttons */}
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => addQuestion('text', 2)} className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg transition-all shadow-sm">
                                    <ListIcon className="w-6 h-6 text-blue-500 mb-1"/>
                                    <span className="text-xs font-bold">短答</span>
                                </button>
                                <button onClick={() => addQuestion('text', 5)} className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg transition-all shadow-sm">
                                    <ListIcon className="w-6 h-6 text-indigo-500 mb-1"/>
                                    <span className="text-xs font-bold">記述</span>
                                </button>
                                <button onClick={() => addQuestion('long_text')} className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg transition-all shadow-sm">
                                    <FileUpIcon className="w-6 h-6 text-purple-500 mb-1"/>
                                    <span className="text-xs font-bold">長文</span>
                                </button>
                                <button onClick={() => addQuestion('marksheet')} className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg transition-all shadow-sm">
                                    <CalculatorIcon className="w-6 h-6 text-teal-500 mb-1"/>
                                    <span className="text-xs font-bold">記号</span>
                                </button>
                            </div>
                            
                            <button onClick={addSection} className="w-full py-2 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-bold text-slate-500 dark:text-slate-400 transition-colors">
                                ＋ 新しい大問を追加
                            </button>

                            {/* Tree View */}
                            <div className="space-y-4">
                                {config.sections.map((section, sIdx) => (
                                    <div key={section.id} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-700">
                                        <div className="absolute -left-[1.2rem] top-0 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-full w-8 h-8 flex items-center justify-center font-serif font-bold text-slate-600 dark:text-slate-300">
                                            <input value={section.title} onChange={e => setConfig(prev => {
                                                const ns = [...prev.sections];
                                                ns[sIdx].title = e.target.value;
                                                return {...prev, sections: ns};
                                            })} className="w-full h-full bg-transparent text-center outline-none rounded-full" />
                                        </div>
                                        
                                        <div className="space-y-2">
                                            {section.questions.map((q, qIdx) => (
                                                <div key={q.id} className="group flex items-center gap-3 p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 shadow-sm">
                                                    <div className="text-xs font-bold text-slate-400 w-4 text-center">{qIdx+1}</div>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between text-xs mb-1">
                                                            <span className="font-bold">{q.type === 'marksheet' ? '記号' : q.type === 'long_text' ? '長文' : '記述'}</span>
                                                            <button onClick={() => deleteQuestion(section.id, q.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><XIcon className="w-4 h-4"/></button>
                                                        </div>
                                                        
                                                        {q.type !== 'long_text' && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-slate-400">幅:</span>
                                                                <input type="range" min="1" max="10" value={q.widthRatio} onChange={e => updateQuestion(section.id, q.id, { widthRatio: parseInt(e.target.value) })} className="flex-1 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"/>
                                                            </div>
                                                        )}
                                                        {q.type === 'marksheet' && (
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[10px] text-slate-400">選択肢:</span>
                                                                <div className="flex gap-1">
                                                                    {[3, 4, 5].map(n => (
                                                                        <button key={n} onClick={() => updateQuestion(section.id, q.id, { choices: n })} className={`px-1.5 py-0.5 text-[10px] rounded border ${q.choices === n ? 'bg-sky-500 text-white border-sky-500' : 'bg-slate-50 dark:bg-slate-700 border-slate-300'}`}>{n}</button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {section.questions.length === 0 && <div className="text-xs text-slate-400 py-2">問題を追加してください</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                            <button onClick={handleCreateOrUpdateLayout} className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold shadow-lg transform transition-transform active:scale-95 flex items-center justify-center gap-2">
                                <RotateCcwIcon className="w-5 h-5"/>
                                {activeLayoutId ? '構成を反映して更新' : '解答用紙を作成'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
};