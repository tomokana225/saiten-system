import React, { useState, useEffect } from 'react';
import type { SheetLayout, SheetCell } from '../../types';
import { PlusIcon, Trash2Icon, FileUpIcon, FileDownIcon, XIcon, CalculatorIcon, ListIcon, BoxSelectIcon, PenLineIcon, ArrowDownFromLineIcon } from '../icons';

interface LayoutSidebarProps {
    layouts: Record<string, SheetLayout>;
    setLayouts: React.Dispatch<React.SetStateAction<Record<string, SheetLayout>>>;
    activeLayoutId: string | null;
    setActiveLayoutId: React.Dispatch<React.SetStateAction<string | null>>;
}

type PaperSize = 'A4' | 'B5' | 'A3';
type QuestionType = 'text' | 'marksheet';

interface QuestionGroup {
    id: string;
    type: QuestionType;
    count: number; // Number of questions in this group
    columns: number; // How many questions per row (1, 2, 3...)
    chars?: number; // Approximate character count for text width (e.g. 5, 10, 20...)
    choices?: number; // For marksheet
    labelStart: number; // Starting question number
}

interface SectionBlock {
    id: string;
    label: string; // I, II, 1, 2...
    questions: QuestionGroup[];
}

const PAPER_DIMENSIONS: Record<PaperSize, { width: number, height: number }> = {
    'A4': { width: 210, height: 297 }, // mm
    'B5': { width: 182, height: 257 },
    'A3': { width: 297, height: 420 },
};

const c = (overrides: Partial<SheetCell> = {}): SheetCell => ({
    text: '', rowSpan: 1, colSpan: 1, hAlign: 'left', vAlign: 'middle',
    fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none',
    fontSize: 11, borders: { top: true, bottom: true, left: true, right: true },
    ...overrides
});

// Helper to convert number to Roman numerals or standard
const getSectionLabel = (index: number) => {
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return romans[index] || String(index + 1);
};

const generateSmartLayout = (name: string, size: PaperSize, sections: SectionBlock[]): SheetLayout => {
    // Layout Constants
    const totalCols = 48; // High resolution grid for flexibility
    const mmToPx = 3.78; 
    const rowHeightMm = 9; 
    
    // Grid Initialization
    const cells: (SheetCell | null)[][] = [];
    const rowHeights: number[] = [];
    const colWidths: number[] = Array(totalCols).fill(((PAPER_DIMENSIONS[size].width - 20) / totalCols) * mmToPx);

    const addRow = (heightMm: number = rowHeightMm) => {
        const row = Array(totalCols).fill(null).map(() => c({ borders: { top: false, bottom: false, left: false, right: false } }));
        cells.push(row);
        rowHeights.push(heightMm * mmToPx);
        return cells.length - 1;
    };

    const placeCell = (r: number, cIdx: number, span: number, content: SheetCell) => {
        if (r >= cells.length) addRow();
        cells[r][cIdx] = { ...content, colSpan: span };
        for (let k = 1; k < span; k++) cells[r][cIdx + k] = null;
    };

    // --- Header ---
    let r = addRow(14); // Title row
    placeCell(r, 0, 32, c({ text: name, fontSize: 18, fontWeight: 'bold', hAlign: 'center', borders: { top: true, bottom: true, left: true, right: true } }));
    placeCell(r, 32, 16, c({ text: '点数', fontSize: 10, vAlign: 'top', borders: { top: true, bottom: true, left: true, right: true } }));
    
    r = addRow(10); // Name row
    placeCell(r, 0, 16, c({ text: '  年     組     番', borders: { top: true, bottom: true, left: true, right: true } }));
    placeCell(r, 16, 16, c({ text: '氏名', borders: { top: true, bottom: true, left: true, right: true } }));
    placeCell(r, 32, 16, c({ text: '', borders: { top: true, bottom: true, left: true, right: true } })); // Score space

    addRow(4); // Spacer

    // --- Body ---
    // Section column width (for 'I', 'II' etc)
    const sectionColSpan = 3; 
    const contentColSpan = totalCols - sectionColSpan - 1; // -1 for right margin
    const contentStartCol = sectionColSpan;

    sections.forEach(section => {
        const startRow = cells.length;
        
        // Render each question group in this section
        section.questions.forEach(group => {
            const itemsPerRow = group.columns;
            // Width per item block (Question Number + Answer Box)
            const itemBlockSpan = Math.floor(contentColSpan / itemsPerRow);
            const itemGap = 1;
            const actualItemSpan = itemBlockSpan - itemGap;

            // Inside item block:
            // Q Num width: fixed small width (e.g. 3 units)
            const qNumSpan = 3;
            // Answer box width
            const answerBoxSpan = actualItemSpan - qNumSpan;

            let currentQ = 0;
            while (currentQ < group.count) {
                const rowIdx = addRow(group.type === 'marksheet' ? 8 : 10);
                
                for (let col = 0; col < itemsPerRow && currentQ < group.count; col++) {
                    const itemStartCol = contentStartCol + (col * itemBlockSpan);
                    const qNumber = group.labelStart + currentQ;

                    // Question Number
                    placeCell(rowIdx, itemStartCol, qNumSpan, c({ 
                        text: `${qNumber}`, 
                        hAlign: 'center', 
                        backgroundColor: '#f3f4f6',
                        borders: { top: true, bottom: true, left: true, right: true } 
                    }));

                    // Answer Area
                    if (group.type === 'marksheet') {
                        const choices = group.choices || 4;
                        const labels = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
                        const choiceSpan = Math.floor(answerBoxSpan / choices);
                        
                        for(let i=0; i<choices; i++) {
                            const isLast = i === choices - 1;
                            const span = isLast ? answerBoxSpan - (choiceSpan * (choices-1)) : choiceSpan;
                            placeCell(rowIdx, itemStartCol + qNumSpan + (i * choiceSpan), span, c({
                                text: labels[i], hAlign: 'center',
                                borders: { top: true, bottom: true, left: true, right: true }
                            }));
                        }
                    } else {
                        // Text Answer
                        // If 'chars' is set, we could visually hint width, but here we fill the allotted column space.
                        // Ideally if chars is small and cols=1, the box shouldn't stretch full width.
                        // Let's adjust width based on 'chars' if it's significantly smaller than available space.
                        
                        let effectiveAnswerSpan = answerBoxSpan;
                        // Rough approx: 1 unit ~ 4mm. 1 char ~ 5-8mm? 
                        // If chars provided, limit width.
                        if (group.chars && group.chars > 0) {
                            // very rough calculation
                            const needed = Math.ceil(group.chars * 1.5); 
                            if (needed < answerBoxSpan) effectiveAnswerSpan = needed;
                        }

                        placeCell(rowIdx, itemStartCol + qNumSpan, effectiveAnswerSpan, c({
                            text: '', 
                            borders: { top: true, bottom: true, left: true, right: true }
                        }));
                    }
                    currentQ++;
                }
            }
        });

        // Add Section Label (spanning all rows of this section)
        const endRow = cells.length;
        const sectionHeightRows = endRow - startRow;
        if (sectionHeightRows > 0) {
            placeCell(startRow, 0, sectionColSpan, c({
                text: section.label,
                rowSpan: sectionHeightRows,
                hAlign: 'center',
                vAlign: 'middle',
                fontSize: 14,
                fontWeight: 'bold',
                backgroundColor: '#e5e7eb',
                borders: { top: true, bottom: true, left: true, right: true }
            }));
            // Fill nulls for rowSpan
            for(let r=startRow+1; r<endRow; r++) {
                for(let c=0; c<sectionColSpan; c++) cells[r][c] = null;
            }
        }
        
        // Gap between sections
        addRow(4);
    });

    return {
        id: `layout_${Date.now()}`,
        name: name,
        rows: cells.length,
        cols: totalCols,
        rowHeights,
        colWidths,
        cells,
    };
};

export const LayoutSidebar: React.FC<LayoutSidebarProps> = ({ layouts, setLayouts, activeLayoutId, setActiveLayoutId }) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    
    // Wizard State
    const [name, setName] = useState('');
    const [paperSize, setPaperSize] = useState<PaperSize>('A4');
    const [sections, setSections] = useState<SectionBlock[]>([]);

    const addSection = () => {
        const newSection: SectionBlock = {
            id: `sec_${Date.now()}`,
            label: getSectionLabel(sections.length),
            questions: []
        };
        setSections([...sections, newSection]);
    };

    const addQuestionGroup = (sectionId: string, type: QuestionType) => {
        setSections(prev => prev.map(sec => {
            if (sec.id !== sectionId) return sec;
            
            // Calculate start number based on previous groups in ALL sections? 
            // Usually numbering continues or resets. Let's assume continuous for entire test.
            // But calculating it dynamically is safer during render or generation.
            // Here we just set a placeholder, the generator/UI should calc index.
            
            const newGroup: QuestionGroup = {
                id: `grp_${Date.now()}`,
                type,
                count: 5,
                columns: 1,
                labelStart: 1, // Will be recalculated
                chars: type === 'text' ? 10 : undefined,
                choices: type === 'marksheet' ? 4 : undefined
            };
            return { ...sec, questions: [...sec.questions, newGroup] };
        }));
    };

    const updateGroup = (sectionId: string, groupId: string, field: keyof QuestionGroup, value: any) => {
        setSections(prev => prev.map(sec => {
            if (sec.id !== sectionId) return sec;
            return {
                ...sec,
                questions: sec.questions.map(q => q.id === groupId ? { ...q, [field]: value } : q)
            };
        }));
    };

    const removeGroup = (sectionId: string, groupId: string) => {
        setSections(prev => prev.map(sec => {
            if (sec.id !== sectionId) return sec;
            return { ...sec, questions: sec.questions.filter(q => q.id !== groupId) };
        }));
    };

    const removeSection = (sectionId: string) => {
        setSections(prev => prev.filter(s => s.id !== sectionId));
    };

    // Calculate dynamic start numbers for display
    useEffect(() => {
        let counter = 1;
        setSections(prev => prev.map(sec => ({
            ...sec,
            questions: sec.questions.map(q => {
                const start = counter;
                counter += q.count;
                return { ...q, labelStart: start };
            })
        })));
    }, [sections.map(s => s.questions.map(q => q.count).join(',')).join('|')]); // Recalc when counts change

    const handleCreateLayout = () => {
        if (!name.trim()) {
            alert('テスト名を入力してください');
            return;
        }
        if (sections.length === 0) {
            alert('大問を追加してください');
            return;
        }
        
        const newLayout = generateSmartLayout(name.trim(), paperSize, sections);
        setLayouts(prev => ({ ...prev, [newLayout.id]: newLayout }));
        setActiveLayoutId(newLayout.id);
        setIsCreateModalOpen(false);
        
        // Reset
        setName('');
        setSections([]);
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
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
                        <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">解答用紙を作成</h3>
                            <button onClick={() => setIsCreateModalOpen(false)}><XIcon className="w-6 h-6 text-slate-400"/></button>
                        </div>
                        
                        <div className="flex-1 overflow-auto p-6 space-y-6">
                            {/* Global Settings */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">テスト名</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded-md bg-white dark:bg-slate-700" placeholder="例: 1学期中間考査" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">用紙サイズ</label>
                                    <div className="flex gap-2">
                                        {(['A4', 'B5', 'A3'] as PaperSize[]).map(s => (
                                            <button key={s} onClick={() => setPaperSize(s)} className={`px-4 py-2 rounded-md border ${paperSize === s ? 'bg-sky-600 text-white border-sky-600' : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600'}`}>{s}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Builder Area */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-md font-bold text-slate-700 dark:text-slate-300">構成エディタ</h4>
                                    <button onClick={addSection} className="flex items-center gap-2 px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600 text-sm font-medium">
                                        <PlusIcon className="w-4 h-4"/> 大問を追加
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    {sections.map((section, sIdx) => (
                                        <div key={section.id} className="border-l-4 border-sky-500 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-r-lg">
                                            <div className="flex justify-between items-center mb-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl font-bold font-serif text-slate-700 dark:text-slate-200">{section.label}</span>
                                                    <input 
                                                        type="text" 
                                                        value={section.label} 
                                                        onChange={e => setSections(prev => prev.map(s => s.id === section.id ? {...s, label: e.target.value} : s))}
                                                        className="w-16 p-1 text-sm bg-white dark:bg-slate-700 border rounded"
                                                        placeholder="番号"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => addQuestionGroup(section.id, 'text')} className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs hover:bg-slate-50 dark:hover:bg-slate-600"><PenLineIcon className="w-3 h-3"/> 記述を追加</button>
                                                    <button onClick={() => addQuestionGroup(section.id, 'marksheet')} className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs hover:bg-slate-50 dark:hover:bg-slate-600"><CalculatorIcon className="w-3 h-3"/> 記号を追加</button>
                                                    <button onClick={() => removeSection(section.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2Icon className="w-4 h-4"/></button>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                {section.questions.map((group, gIdx) => (
                                                    <div key={group.id} className="flex items-center gap-4 bg-white dark:bg-slate-800 p-3 rounded shadow-sm border border-slate-200 dark:border-slate-700">
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500">
                                                            {gIdx + 1}
                                                        </div>
                                                        
                                                        {/* Type & Count */}
                                                        <div className="flex flex-col w-24">
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase">{group.type === 'marksheet' ? '記号(選択)' : '記述(自由)'}</span>
                                                            <div className="flex items-center gap-1">
                                                                <input type="number" min="1" value={group.count} onChange={e => updateGroup(section.id, group.id, 'count', parseInt(e.target.value))} className="w-12 p-1 text-sm border rounded bg-slate-50 dark:bg-slate-900" />
                                                                <span className="text-xs">問</span>
                                                            </div>
                                                        </div>

                                                        {/* Layout Settings */}
                                                        <div className="flex-1 grid grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-[10px] text-slate-400 font-bold mb-1">横並び数</label>
                                                                <input type="range" min="1" max="5" value={group.columns} onChange={e => updateGroup(section.id, group.id, 'columns', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"/>
                                                                <div className="text-xs text-right">{group.columns}列</div>
                                                            </div>
                                                            <div>
                                                                {group.type === 'text' ? (
                                                                    <>
                                                                        <label className="block text-[10px] text-slate-400 font-bold mb-1">解答枠サイズ (文字数目安)</label>
                                                                        <select value={group.chars} onChange={e => updateGroup(section.id, group.id, 'chars', parseInt(e.target.value))} className="w-full p-1 text-xs border rounded bg-slate-50 dark:bg-slate-900">
                                                                            <option value="0">自動 (最大)</option>
                                                                            <option value="5">短め (〜5文字)</option>
                                                                            <option value="10">普通 (〜10文字)</option>
                                                                            <option value="20">長め (〜20文字)</option>
                                                                        </select>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <label className="block text-[10px] text-slate-400 font-bold mb-1">選択肢の数</label>
                                                                        <select value={group.choices} onChange={e => updateGroup(section.id, group.id, 'choices', parseInt(e.target.value))} className="w-full p-1 text-xs border rounded bg-slate-50 dark:bg-slate-900">
                                                                            <option value="2">2択</option>
                                                                            <option value="3">3択</option>
                                                                            <option value="4">4択</option>
                                                                            <option value="5">5択</option>
                                                                        </select>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Number Range Preview */}
                                                        <div className="text-xs text-slate-400 w-20 text-center">
                                                            No. {group.labelStart} ～ {group.labelStart + group.count - 1}
                                                        </div>

                                                        <button onClick={() => removeGroup(section.id, group.id)} className="text-slate-300 hover:text-red-500">
                                                            <XIcon className="w-5 h-5"/>
                                                        </button>
                                                    </div>
                                                ))}
                                                {section.questions.length === 0 && (
                                                    <div className="text-center text-xs text-slate-400 py-2 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded">
                                                        小問グループを追加してください
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {sections.length === 0 && (
                                        <div className="text-center py-10 text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700">
                                            「大問を追加」ボタンを押して構成を開始してください
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3">
                            <button onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">キャンセル</button>
                            <button onClick={handleCreateLayout} className="px-6 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-500 shadow transition-colors font-bold">作成する</button>
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