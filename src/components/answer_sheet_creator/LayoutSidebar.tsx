import React, { useState, useEffect, useCallback } from 'react';
import type { SheetLayout, SheetCell, LayoutConfig } from '../../types';
import { PlusIcon, Trash2Icon, FileUpIcon, FileDownIcon, XIcon, CalculatorIcon, ListIcon, BoxSelectIcon, PenLineIcon, ArrowDownFromLineIcon, ArrowRightIcon, PaletteIcon, GripVerticalIcon, RotateCcwIcon, Edit3Icon, SettingsIcon, MinusIcon, ChevronDownIcon, ChevronUpIcon } from '../icons';

interface LayoutSidebarProps {
    layouts: Record<string, SheetLayout>;
    setLayouts: React.Dispatch<React.SetStateAction<Record<string, SheetLayout>>>;
    activeLayoutId: string | null;
    setActiveLayoutId: React.Dispatch<React.SetStateAction<string | null>>;
}

type PaperSize = 'A4' | 'B5' | 'A3';
type QuestionType = 'text' | 'marksheet' | 'long_text' | 'english_word';

type QuestionDef = LayoutConfig['sections'][0]['questions'][0];
type SectionDef = LayoutConfig['sections'][0];

// Extend LayoutConfig locally to include header settings if not present in global types yet
interface ExtendedLayoutConfig extends LayoutConfig {
    headerSettings?: {
        showTitle: boolean;
        titleHeight: number; // grid units
        showName: boolean;
        nameHeight: number;
        showScore: boolean;
    };
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
const generateAutoLayout = (config: ExtendedLayoutConfig): SheetLayout => {
    const totalCols = 60; 
    const mmToPx = 3.78; 
    const baseRowHeightMm = config.defaultRowHeight || 10; 
    
    const cells: (SheetCell | null)[][] = [];
    const rowHeights: number[] = [];
    const colWidths: number[] = Array(totalCols).fill(((PAPER_DIMENSIONS[config.paperSize].width - 20) / totalCols) * mmToPx);

    const addRow = (heightMm: number = baseRowHeightMm) => {
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
    const hSettings = config.headerSettings || { showTitle: true, titleHeight: 2, showName: true, nameHeight: 1, showScore: true };
    
    if (hSettings.showTitle) {
        const scoreWidth = hSettings.showScore ? 12 : 0;
        const titleWidth = totalCols - scoreWidth;
        const titleRowSpan = hSettings.titleHeight;
        const startRow = addRow(14); 
        for(let i=1; i<titleRowSpan; i++) addRow(10);

        placeCell(startRow, 0, titleWidth, c({ 
            text: config.name, rowSpan: titleRowSpan, fontSize: 18, fontWeight: 'bold', hAlign: 'center', 
            borders: { top: true, bottom: true, left: true, right: true } 
        }));

        if (hSettings.showScore) {
            placeCell(startRow, titleWidth, scoreWidth, c({ 
                text: '点数', fontSize: 10, vAlign: 'top', 
                borders: { top: true, bottom: true, left: true, right: true } 
            }));
            if (titleRowSpan > 1) {
                placeCell(startRow + 1, titleWidth, scoreWidth, c({ 
                    text: '', rowSpan: titleRowSpan - 1,
                    borders: { top: true, bottom: true, left: true, right: true } 
                }));
            }
        }
    }

    if (hSettings.showName) {
        const nameRowSpan = hSettings.nameHeight || 1;
        const startRow = addRow(12);
        for(let i=1; i<nameRowSpan; i++) addRow(10);

        const infoWidth = Math.floor(totalCols / 3);
        const nameWidth = totalCols - infoWidth;

        placeCell(startRow, 0, infoWidth, c({ text: '  年     組     番', rowSpan: nameRowSpan }));
        placeCell(startRow, infoWidth, nameWidth, c({ text: '氏名', rowSpan: nameRowSpan }));
    }

    addRow(6); // Spacer

    // --- Body ---
    const sectionLabelWidth = 4;
    const contentAreaWidth = totalCols - sectionLabelWidth - 1;
    const contentStartCol = sectionLabelWidth;

    let globalQNum = 1;

    config.sections.forEach(section => {
        const sectionStartRow = cells.length;
        
        let currentRow = addRow();
        let currentContentCol = 0; 
        let currentRowMaxHeightRatio = 1.0; 

        section.questions.forEach((q, idx) => {
            const qNumText = q.labelOverride || `${globalQNum}`;
            if (!q.labelOverride) globalQNum++;

            const qNumBoxWidth = 3;
            let answerBoxWidth = 0;
            
            if (q.type === 'marksheet') {
                // Fixed width for marksheet box based on choices
                // e.g. 3 units per choice approx + some padding
                const choices = q.choices || 4;
                answerBoxWidth = Math.max(8, choices * 3);
            } else if (q.type === 'long_text') {
                answerBoxWidth = contentAreaWidth - qNumBoxWidth; 
            } else if (q.type === 'english_word') {
                 const wordCount = q.wordCount || 5;
                 // 5 units per word + 1 unit gap
                 answerBoxWidth = (wordCount * 6) - 1;
            } else {
                answerBoxWidth = Math.floor((contentAreaWidth * q.widthRatio) / 10) - qNumBoxWidth;
                answerBoxWidth = Math.max(4, answerBoxWidth);
            }

            const totalItemWidth = qNumBoxWidth + answerBoxWidth;

            // Check wrapping
            // Ensure we leave at least 1 col gap if not the first item
            const gap = currentContentCol > 0 ? 2 : 0; 

            if (currentContentCol + gap + totalItemWidth > contentAreaWidth) {
                rowHeights[currentRow] = baseRowHeightMm * currentRowMaxHeightRatio * mmToPx;
                currentRow = addRow();
                currentContentCol = 0;
                currentRowMaxHeightRatio = 1.0;
            } else {
                currentContentCol += gap;
            }

            const heightRatio = q.heightRatio || 1.0;
            currentRowMaxHeightRatio = Math.max(currentRowMaxHeightRatio, heightRatio);

            const absCol = contentStartCol + currentContentCol;
            placeCell(currentRow, absCol, qNumBoxWidth, c({ 
                text: qNumText, hAlign: 'center', backgroundColor: '#f3f4f6'
            }));

            // Place Answer Box
            if (q.type === 'marksheet') {
                const choices = q.choices || 4;
                const labels = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
                // Combine all choices into one string with spacing
                const text = labels.slice(0, choices).join('   '); // Spaced out
                
                placeCell(currentRow, absCol + qNumBoxWidth, answerBoxWidth, c({
                    text: text, hAlign: 'center',
                    borders: { top: true, bottom: true, left: true, right: true }
                }));
            } else if (q.type === 'english_word') {
                const wordCount = q.wordCount || 5;
                const wordUnit = 5;
                const gapUnit = 1;
                
                for(let i=0; i<wordCount; i++) {
                    const pos = i * (wordUnit + gapUnit);
                    // Ensure it fits within answerBoxWidth (clamping logic already in placeCell via col check)
                    placeCell(currentRow, absCol + qNumBoxWidth + pos, wordUnit, c({
                        text: '', 
                        borders: { top: false, left: false, right: false, bottom: true },
                        borderStyle: 'dashed' // Dotted underline
                    }));
                }
            } else {
                placeCell(currentRow, absCol + qNumBoxWidth, answerBoxWidth, c({ text: '' }));
            }

            currentContentCol += totalItemWidth; 
        });
        
        rowHeights[currentRow] = baseRowHeightMm * currentRowMaxHeightRatio * mmToPx;

        const sectionEndRow = cells.length;
        const rowSpan = sectionEndRow - sectionStartRow;
        if (rowSpan > 0) {
            placeCell(sectionStartRow, 0, sectionLabelWidth, c({
                text: section.title, rowSpan: rowSpan, hAlign: 'center', vAlign: 'middle',
                fontSize: 14, fontWeight: 'bold', backgroundColor: '#e5e7eb'
            }));
            for(let rr=sectionStartRow+1; rr<sectionEndRow; rr++) {
                if (rr < cells.length) { 
                    for(let cc=0; cc<sectionLabelWidth; cc++) { if (cc < totalCols) cells[rr][cc] = null; }
                }
            }
        }
        
        addRow(4);
    });

    return {
        id: `layout_${Date.now()}`,
        name: config.name,
        rows: cells.length,
        cols: totalCols,
        rowHeights,
        colWidths,
        cells,
        config,
    };
};

export const LayoutSidebar: React.FC<LayoutSidebarProps> = ({ layouts, setLayouts, activeLayoutId, setActiveLayoutId }) => {
    const [tab, setTab] = useState<'list' | 'edit'>('list');
    const [isInitModalOpen, setIsInitModalOpen] = useState(false);
    
    // --- Builder State ---
    const [config, setConfig] = useState<ExtendedLayoutConfig>({
        name: '', paperSize: 'A4', borderWidth: 1, borderColor: '#000000', defaultRowHeight: 10, sections: [],
        headerSettings: { showTitle: true, titleHeight: 2, showName: true, nameHeight: 1, showScore: true }
    });

    const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(new Set());
    const [initName, setInitName] = useState('');
    const [initSize, setInitSize] = useState<PaperSize>('A4');
    const [initRowHeight, setInitRowHeight] = useState(10);

    useEffect(() => {
        if (activeLayoutId && layouts[activeLayoutId]?.config) {
            const loadedConfig = layouts[activeLayoutId].config as ExtendedLayoutConfig;
            if (!loadedConfig.headerSettings) loadedConfig.headerSettings = { showTitle: true, titleHeight: 2, showName: true, nameHeight: 1, showScore: true };
            if (!loadedConfig.defaultRowHeight) loadedConfig.defaultRowHeight = 10;
            setConfig(loadedConfig);
        } else if (!activeLayoutId) {
            // Don't reset sections here if we just created one via handleInitCreate
        }
    }, [activeLayoutId, layouts]);

    const openInitModal = () => {
        setInitName('');
        setInitSize('A4');
        setInitRowHeight(10);
        setIsInitModalOpen(true);
    };

    const handleInitCreate = () => {
        if (!initName.trim()) {
            alert('テスト名を入力してください');
            return;
        }
        
        const newConfig: ExtendedLayoutConfig = {
            name: initName,
            paperSize: initSize,
            borderWidth: 1,
            borderColor: '#000000',
            defaultRowHeight: initRowHeight,
            sections: [{ id: `sec_${Date.now()}`, title: 'I', questions: [] }],
            headerSettings: { showTitle: true, titleHeight: 2, showName: true, nameHeight: 1, showScore: true }
        };
        
        setConfig(newConfig);
        
        const layout = generateAutoLayout(newConfig);
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
        setActiveLayoutId(layout.id);
        
        setTab('edit');
        setIsInitModalOpen(false);
    };

    const addSection = () => {
        const newSection: SectionDef = {
            id: `sec_${Date.now()}`,
            title: ['I', 'II', 'III', 'IV', 'V'][config.sections.length] || `${config.sections.length + 1}`,
            questions: []
        };
        const newConfig = { ...config, sections: [...config.sections, newSection] };
        setConfig(newConfig);
        const layout = generateAutoLayout(newConfig);
        if (activeLayoutId) layout.id = activeLayoutId;
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
    };

    const addQuestion = (type: QuestionType) => {
        let sections = [...config.sections];
        if (sections.length === 0) {
            sections.push({ id: `sec_${Date.now()}`, title: 'I', questions: [] });
        }
        const lastSection = sections[sections.length - 1];
        const newQ = {
            id: `q_${Date.now()}`,
            type,
            widthRatio: 10, // Default roughly half width (20 scale)
            heightRatio: 1.0,
            choices: type === 'marksheet' ? 4 : undefined,
            wordCount: type === 'english_word' ? 5 : undefined
        };
        lastSection.questions.push(newQ);
        
        const newConfig = { ...config, sections };
        setConfig(newConfig);
        setExpandedQuestionIds(prev => new Set([...prev, newQ.id]));
        
        const layout = generateAutoLayout(newConfig);
        if (activeLayoutId) layout.id = activeLayoutId;
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
    };

    const insertQuestionAfter = (sectionIdx: number, questionIdx: number, templateQuestion: QuestionDef) => {
        const newQuestion = { ...templateQuestion, id: `q_${Date.now()}` };
        const newSections = [...config.sections];
        newSections[sectionIdx].questions.splice(questionIdx + 1, 0, newQuestion);
        
        const newConfig = { ...config, sections: newSections };
        setConfig(newConfig);
        
        const layout = generateAutoLayout(newConfig);
        if (activeLayoutId) layout.id = activeLayoutId;
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
    };

    const updateQuestion = (sectionId: string, qId: string, updates: Partial<QuestionDef>) => {
        const newSections = config.sections.map(s => {
            if (s.id !== sectionId) return s;
            return {
                ...s,
                questions: s.questions.map(q => q.id === qId ? { ...q, ...updates } : q)
            };
        });
        const newConfig = { ...config, sections: newSections };
        setConfig(newConfig);
        
        const layout = generateAutoLayout(newConfig);
        if (activeLayoutId) layout.id = activeLayoutId;
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
    };

    const deleteQuestion = (sectionId: string, qId: string) => {
        const newSections = config.sections.map(s => {
            if (s.id !== sectionId) return s;
            return { ...s, questions: s.questions.filter(q => q.id !== qId) };
        });
        const newConfig = { ...config, sections: newSections };
        setConfig(newConfig);
        
        const layout = generateAutoLayout(newConfig);
        if (activeLayoutId) layout.id = activeLayoutId;
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
    };

    const toggleExpand = (qId: string) => {
        setExpandedQuestionIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(qId)) newSet.delete(qId);
            else newSet.add(qId);
            return newSet;
        });
    };

    const handleConfigChange = (newConfigPart: Partial<ExtendedLayoutConfig>) => {
        const newConfig = { ...config, ...newConfigPart };
        setConfig(newConfig);
        const layout = generateAutoLayout(newConfig);
        if (activeLayoutId) layout.id = activeLayoutId;
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
    }

    const handleCreateOrUpdateLayout = (showAlert = true) => {
        if (!config.name) {
            if(showAlert) alert('テスト名を入力してください');
            return;
        }
        const layout = generateAutoLayout(config);
        if (activeLayoutId) {
            layout.id = activeLayoutId;
        }
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
        if (!activeLayoutId) setActiveLayoutId(layout.id);
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
            {isInitModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">新規解答用紙の設定</h3>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">テスト名</label>
                            <input type="text" value={initName} onChange={e => setInitName(e.target.value)} className="w-full p-2 border rounded-md text-sm" placeholder="例: 1学期中間テスト" autoFocus />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">用紙サイズ</label>
                            <select value={initSize} onChange={e => setInitSize(e.target.value as PaperSize)} className="w-full p-2 border rounded-md text-sm">
                                <option value="A4">A4</option>
                                <option value="B5">B5</option>
                                <option value="A3">A3</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">基準の行の高さ (mm)</label>
                            <input type="number" min="5" max="30" value={initRowHeight} onChange={e => setInitRowHeight(parseInt(e.target.value))} className="w-full p-2 border rounded-md text-sm" />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setIsInitModalOpen(false)} className="px-4 py-2 text-sm rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">キャンセル</button>
                            <button onClick={handleInitCreate} className="px-4 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-500">作成開始</button>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'list' && (
                <div className="flex flex-col p-4 space-y-4 h-full">
                    <div className="flex justify-between items-center">
                        <button onClick={() => setTab('list')} className={`text-lg font-bold border-b-2 ${tab === 'list' ? 'border-sky-500' : 'border-transparent'}`}>保存データ</button>
                        <button onClick={() => setTab('edit')} className={`text-lg font-bold text-slate-400 border-b-2 border-transparent hover:text-slate-600`}>編集</button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {Object.values(layouts).map((layout: SheetLayout) => (
                            <div key={layout.id} className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${activeLayoutId === layout.id ? 'bg-sky-50 dark:bg-sky-900/50 border border-sky-200' : 'bg-slate-50 dark:bg-slate-700/50 border border-transparent hover:border-slate-300'}`}>
                                <span onClick={() => { setActiveLayoutId(layout.id); setTab('edit'); }} className="flex-1 truncate font-medium">{layout.name}</span>
                                <button onClick={() => handleDeleteLayout(layout.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-600 rounded-full transition-colors"><Trash2Icon className="w-4 h-4" /></button>
                            </div>
                        ))}
                        {Object.keys(layouts).length === 0 && <div className="text-center text-slate-400 py-10">作成されたレイアウトはありません</div>}
                    </div>
                    <div className="pt-4 border-t dark:border-slate-700 space-y-2">
                        <button onClick={openInitModal} className="w-full flex items-center justify-center gap-2 p-3 bg-sky-600 text-white rounded-lg hover:bg-sky-500 transition-colors font-bold shadow-sm"><PlusIcon className="w-5 h-5"/> 新規作成</button>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={handleImportLayout} className="flex items-center justify-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors text-xs text-slate-600 dark:text-slate-300"><FileUpIcon className="w-4 h-4"/>インポート</button>
                            <button onClick={handleExportLayout} disabled={!activeLayoutId} className="flex items-center justify-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors text-xs text-slate-600 dark:text-slate-300 disabled:opacity-50"><FileDownIcon className="w-4 h-4"/>保存</button>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'edit' && (
                <div className="flex flex-col h-full">
                     <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800">
                        <div className="flex gap-4">
                             <button onClick={() => setTab('list')} className="text-lg font-bold text-slate-400 hover:text-slate-600">保存データ</button>
                             <button onClick={() => setTab('edit')} className="text-lg font-bold border-b-2 border-sky-500">編集</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {/* Sticky Tools */}
                        <div className="sticky top-0 bg-white dark:bg-slate-800 z-10 py-2 space-y-2 border-b border-slate-100 dark:border-slate-700">
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => addQuestion('text')} className="flex items-center justify-center gap-1 p-2 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition-colors shadow-sm"><ListIcon className="w-4 h-4"/><span className="text-xs font-bold">記述</span></button>
                                <button onClick={() => addQuestion('marksheet')} className="flex items-center justify-center gap-1 p-2 bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100 transition-colors shadow-sm"><CalculatorIcon className="w-4 h-4"/><span className="text-xs font-bold">記号</span></button>
                                <button onClick={() => addQuestion('english_word')} className="flex items-center justify-center gap-1 p-2 bg-orange-50 text-orange-700 border border-orange-200 rounded hover:bg-orange-100 transition-colors shadow-sm"><PenLineIcon className="w-4 h-4"/><span className="text-xs font-bold">英単語</span></button>
                                <button onClick={() => addQuestion('long_text')} className="flex items-center justify-center gap-1 p-2 bg-purple-50 text-purple-700 border border-purple-200 rounded hover:bg-purple-100 transition-colors shadow-sm"><FileUpIcon className="w-4 h-4"/><span className="text-xs font-bold">長文</span></button>
                            </div>
                            <button onClick={addSection} className="w-full flex items-center justify-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-xs font-bold"><ArrowDownFromLineIcon className="w-4 h-4"/> 大問を追加</button>
                        </div>

                        <div className="space-y-4 bg-slate-50 dark:bg-slate-700/30 p-3 rounded-lg border border-slate-200 dark:border-slate-600">
                            <input type="text" value={config.name} onChange={e => handleConfigChange({name: e.target.value})} className="w-full p-2 border-b border-transparent focus:border-sky-500 bg-transparent text-lg font-bold placeholder-slate-400 outline-none" placeholder="テスト名を入力"/>
                            <div className="grid grid-cols-2 gap-2">
                                <select value={config.paperSize} onChange={e => handleConfigChange({paperSize: e.target.value as PaperSize})} className="p-1.5 border rounded bg-white dark:bg-slate-700 text-sm"><option value="A4">A4</option><option value="B5">B5</option><option value="A3">A3</option></select>
                                <div className="flex items-center gap-1 bg-white dark:bg-slate-700 border rounded px-2">
                                    <label className="text-[10px] text-slate-400 whitespace-nowrap">行高:</label>
                                    <input type="number" min="5" max="30" value={config.defaultRowHeight} onChange={e => handleConfigChange({defaultRowHeight: parseInt(e.target.value) || 10})} className="w-full p-1 text-sm bg-transparent text-right"/>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {config.sections.map((section, sIdx) => (
                                <div key={section.id} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-700">
                                    <div className="absolute -left-[1.2rem] top-0 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-full w-8 h-8 flex items-center justify-center font-serif font-bold text-slate-600 dark:text-slate-300">
                                        <input value={section.title} onChange={e => {
                                            const ns = [...config.sections];
                                            ns[sIdx].title = e.target.value;
                                            handleConfigChange({sections: ns});
                                        }} className="w-full h-full bg-transparent text-center outline-none rounded-full" />
                                    </div>
                                    
                                    <div className="space-y-2">
                                        {section.questions.map((q, qIdx) => {
                                            const isExpanded = expandedQuestionIds.has(q.id);
                                            return (
                                                <div key={q.id} className="group flex flex-col gap-1 p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 shadow-sm relative">
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => toggleExpand(q.id)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                                                            {isExpanded ? <ChevronUpIcon className="w-3 h-3 text-slate-400"/> : <ChevronDownIcon className="w-3 h-3 text-slate-400"/>}
                                                        </button>
                                                        <div className="flex-1 flex justify-between items-center text-xs">
                                                            <span className="font-bold">
                                                                {q.type === 'marksheet' ? '記号' : q.type === 'long_text' ? '長文' : q.type === 'english_word' ? '英単語' : '記述'}
                                                            </span>
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button onClick={() => insertQuestionAfter(sIdx, qIdx, q)} className="p-1 text-slate-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900 rounded" title="下に追加"><PlusIcon className="w-3 h-3"/></button>
                                                                <button onClick={() => deleteQuestion(section.id, q.id)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900 rounded" title="削除"><MinusIcon className="w-3 h-3"/></button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {isExpanded && (
                                                        <div className="pl-8 pr-2 pb-2 grid grid-cols-2 gap-2 text-xs border-t border-slate-100 dark:border-slate-700 pt-2 mt-1">
                                                            {q.type !== 'long_text' && (
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[10px] text-slate-400">幅:</span>
                                                                    <input type="range" min="1" max="20" value={q.widthRatio} onChange={e => updateQuestion(section.id, q.id, { widthRatio: parseInt(e.target.value) })} className="flex-1 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"/>
                                                                </div>
                                                            )}
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[10px] text-slate-400">高:</span>
                                                                <input type="number" step="0.5" min="0.5" max="5" value={q.heightRatio || 1.0} onChange={e => updateQuestion(section.id, q.id, { heightRatio: parseFloat(e.target.value) })} className="w-12 p-0.5 border rounded bg-slate-50 dark:bg-slate-900 text-center"/>
                                                            </div>
                                                            {q.type === 'marksheet' && (
                                                                <div className="flex items-center gap-1 col-span-2">
                                                                    <span className="text-[10px] text-slate-400">択:</span>
                                                                    <div className="flex gap-1">
                                                                        {[3, 4, 5].map(n => <button key={n} onClick={() => updateQuestion(section.id, q.id, { choices: n })} className={`px-1.5 py-0.5 text-[10px] rounded border ${q.choices === n ? 'bg-sky-500 text-white border-sky-500' : 'bg-slate-50 dark:bg-slate-700 border-slate-300'}`}>{n}</button>)}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {q.type === 'english_word' && (
                                                                <div className="flex items-center gap-1 col-span-2">
                                                                    <span className="text-[10px] text-slate-400">単語数:</span>
                                                                    <input type="number" min="1" max="20" value={q.wordCount || 5} onChange={e => updateQuestion(section.id, q.id, { wordCount: parseInt(e.target.value) })} className="w-12 p-0.5 border rounded bg-slate-50 dark:bg-slate-900 text-center"/>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {section.questions.length === 0 && <div className="text-xs text-slate-400 py-2">問題を追加してください</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                        <button onClick={() => handleCreateOrUpdateLayout(true)} className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold shadow-lg transform transition-transform active:scale-95 flex items-center justify-center gap-2">
                            <RotateCcwIcon className="w-5 h-5"/> 構成を反映して更新
                        </button>
                    </div>
                </div>
            )}
        </aside>
    );
};