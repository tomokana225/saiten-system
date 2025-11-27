import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { SheetLayout, SheetCell, LayoutConfig } from '../../types';
import { PlusIcon, Trash2Icon, FileUpIcon, FileDownIcon, XIcon, CalculatorIcon, ListIcon, BoxSelectIcon, PenLineIcon, ArrowDownFromLineIcon, ArrowRightIcon, PaletteIcon, GripVerticalIcon, RotateCcwIcon, Edit3Icon, SettingsIcon, MinusIcon, ChevronDownIcon, ChevronUpIcon, AlignVerticalJustifyStartIcon, AlignVerticalJustifyEndIcon } from '../icons';

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

interface HeaderElement {
    id: 'title' | 'name' | 'score';
    label: string;
    height: number;
    visible: boolean;
}

interface ExtendedLayoutConfig extends LayoutConfig {
    headerElements?: HeaderElement[]; // Ordered list of header elements
    headerPosition?: 'top' | 'bottom';
    // Legacy support
    headerSettings?: any;
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

    // --- Header Generation Logic ---
    const generateHeader = () => {
        // Default header elements if not present
        const elements = config.headerElements || [
            { id: 'title', label: 'タイトル', height: 2, visible: true },
            { id: 'score', label: '点数欄', height: 2, visible: true },
            { id: 'name', label: '氏名欄', height: 1, visible: true }
        ];

        // Filter visible elements
        const visibleElements = elements.filter(e => e.visible);
        
        let i = 0;
        while (i < visibleElements.length) {
            const el = visibleElements[i];
            const nextEl = visibleElements[i+1];

            // Special handling: If Title and Score are adjacent (Title then Score), try to put them on the same row(s)
            // This preserves the classic "Test Name [Score]" layout.
            if (el.id === 'title' && nextEl && nextEl.id === 'score') {
                // Title takes left part, Score takes right part (e.g. 12 cols)
                const scoreWidth = 12;
                const titleWidth = totalCols - scoreWidth;
                const rowSpan = Math.max(el.height, nextEl.height); // Use max height of the two
                
                const startRow = addRow(14); // First row slightly taller
                // Add extra rows if span > 1
                for(let k=1; k<rowSpan; k++) addRow(10);
                
                // Title box
                placeCell(startRow, 0, titleWidth, c({ 
                    text: config.name, rowSpan: rowSpan, fontSize: 18, fontWeight: 'bold', hAlign: 'center', 
                    borders: { top: true, bottom: true, left: true, right: true } 
                }));
                
                // Score box
                placeCell(startRow, titleWidth, scoreWidth, c({ 
                    text: '点数', fontSize: 10, vAlign: 'top', 
                    borders: { top: true, bottom: true, left: true, right: true } 
                }));
                if (rowSpan > 1) {
                    // Empty space below 'Score' label
                    placeCell(startRow + 1, titleWidth, scoreWidth, c({ 
                        text: '', rowSpan: rowSpan - 1,
                        borders: { top: true, bottom: true, left: true, right: true } 
                    }));
                }
                
                i += 2; // Skip next element since we handled it
            } else {
                // Standard full-width placement for other elements (or isolated title/score)
                const rowSpan = el.height;
                const startRow = addRow(el.id === 'title' ? 14 : 10);
                for(let k=1; k<rowSpan; k++) addRow(10);
                
                if (el.id === 'title') {
                    placeCell(startRow, 0, totalCols, c({ 
                        text: config.name, rowSpan: rowSpan, fontSize: 18, fontWeight: 'bold', hAlign: 'center', 
                        borders: { top: true, bottom: true, left: true, right: true } 
                    }));
                } else if (el.id === 'name') {
                    // Split name row: Class/Num (1/3) + Name (2/3)
                    const infoWidth = Math.floor(totalCols / 3);
                    const nameWidth = totalCols - infoWidth;
                    placeCell(startRow, 0, infoWidth, c({ text: '  年     組     番', rowSpan: rowSpan }));
                    placeCell(startRow, infoWidth, nameWidth, c({ text: '氏名', rowSpan: rowSpan }));
                } else if (el.id === 'score') {
                     // Isolated Score box. Usually better on the right.
                     const scoreWidth = 12;
                     // Place empty space on left, score on right
                     // Or full width? Let's put it on right for consistency.
                     placeCell(startRow, totalCols - scoreWidth, scoreWidth, c({ 
                        text: '点数', fontSize: 10, vAlign: 'top', 
                        borders: { top: true, bottom: true, left: true, right: true } 
                    }));
                    if (rowSpan > 1) {
                        placeCell(startRow + 1, totalCols - scoreWidth, scoreWidth, c({ 
                            text: '', rowSpan: rowSpan - 1,
                            borders: { top: true, bottom: true, left: true, right: true } 
                        }));
                    }
                }
                i++;
            }
        }
        
        addRow(6); // Spacer after header
    };

    const generateBody = () => {
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
                
                // Determine basic width
                if (q.type === 'marksheet') {
                    const choices = q.choices || 4;
                    answerBoxWidth = (choices * 4) - 1; 
                } else if (q.type === 'long_text') {
                    answerBoxWidth = contentAreaWidth - qNumBoxWidth; 
                } else if (q.type === 'english_word') {
                     const wordCount = q.wordCount || 5;
                     // Calculate width needed. If too wide, wrap inside the box later.
                     // But for layout flow, we need a width.
                     // If wordCount is large, we use full width and wrap internally.
                     const singleLineLimit = 8; // max words per line estimate
                     if (wordCount > singleLineLimit) {
                         answerBoxWidth = contentAreaWidth - qNumBoxWidth;
                     } else {
                         answerBoxWidth = (wordCount * 6) - 1;
                     }
                } else {
                    answerBoxWidth = Math.floor((contentAreaWidth * q.widthRatio) / 10) - qNumBoxWidth;
                    answerBoxWidth = Math.max(4, answerBoxWidth);
                }
    
                const totalItemWidth = qNumBoxWidth + answerBoxWidth;
                const gap = currentContentCol > 0 ? 2 : 0; 
    
                // Wrap entire item if needed
                if (currentContentCol + gap + totalItemWidth > contentAreaWidth) {
                    rowHeights[currentRow] = baseRowHeightMm * currentRowMaxHeightRatio * mmToPx;
                    currentRow = addRow();
                    currentContentCol = 0;
                    currentRowMaxHeightRatio = 1.0;
                } else {
                    currentContentCol += gap;
                }
    
                const heightRatio = q.heightRatio || 1.0;
                
                // For English words, if multiline, we need to calculate height
                let englishRows = 1;
                if (q.type === 'english_word') {
                    const wordCount = q.wordCount || 5;
                    // Estimate words per row based on allocated width
                    // Grid width available: answerBoxWidth
                    // Word unit: 6 (5 box + 1 gap)
                    const wordsPerLine = Math.floor((answerBoxWidth + 1) / 6);
                    englishRows = Math.ceil(wordCount / Math.max(1, wordsPerLine));
                }
                
                const totalHeightRatio = Math.max(heightRatio, englishRows);
                currentRowMaxHeightRatio = Math.max(currentRowMaxHeightRatio, totalHeightRatio);
    
                const absCol = contentStartCol + currentContentCol;
                placeCell(currentRow, absCol, qNumBoxWidth, c({ 
                    text: qNumText, hAlign: 'center', backgroundColor: '#f3f4f6'
                }));
    
                if (q.type === 'marksheet') {
                    const choices = q.choices || 4;
                    const labels = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
                    const text = labels.slice(0, choices).join('   '); 
                    placeCell(currentRow, absCol + qNumBoxWidth, answerBoxWidth, c({
                        text: text, hAlign: 'center',
                        borders: { top: true, bottom: true, left: true, right: true }
                    }));
                } else if (q.type === 'english_word') {
                    const wordCount = q.wordCount || 5;
                    const wordUnit = 5;
                    const gapUnit = 1;
                    
                    // Calculate layout within the answer box area
                    const wordsPerLine = Math.floor((answerBoxWidth + 1) / (wordUnit + gapUnit));
                    
                    for(let i=0; i<wordCount; i++) {
                        const lineIndex = Math.floor(i / wordsPerLine);
                        const indexInLine = i % wordsPerLine;
                        
                        const targetRow = currentRow + lineIndex;
                        // Ensure subsequent rows exist if needed (though placeCell handles addRow, we need height)
                        if (targetRow >= rowHeights.length) {
                            addRow();
                            rowHeights[targetRow] = baseRowHeightMm * mmToPx; // default height for extra lines
                        }
                        
                        const pos = indexInLine * (wordUnit + gapUnit);
                        placeCell(targetRow, absCol + qNumBoxWidth + pos, wordUnit, c({
                            text: '', 
                            borders: { top: false, left: false, right: false, bottom: true },
                            borderStyle: 'dashed' 
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
    };

    if (config.headerPosition === 'bottom') {
        generateBody();
        // Add spacer before footer
        addRow(10);
        generateHeader();
    } else {
        generateHeader();
        generateBody();
    }

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
        headerElements: [
            { id: 'title', label: 'タイトル', height: 2, visible: true },
            { id: 'score', label: '点数欄', height: 2, visible: true },
            { id: 'name', label: '氏名欄', height: 1, visible: true }
        ],
        headerPosition: 'top'
    });

    const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(new Set());
    const [initName, setInitName] = useState('');
    const [initSize, setInitSize] = useState<PaperSize>('A4');
    const [initRowHeight, setInitRowHeight] = useState(10);
    const configSectionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (activeLayoutId && layouts[activeLayoutId]?.config) {
            const loadedConfig = layouts[activeLayoutId].config as ExtendedLayoutConfig;
            // Merge defaults
            const mergedHeader = { showTitle: true, titleHeight: 2, showName: true, nameHeight: 1, showScore: true, position: 'top' as const, ...loadedConfig.headerSettings };
            // Initialize headerElements if missing
            if (!loadedConfig.headerElements) {
                loadedConfig.headerElements = [
                    { id: 'title', label: 'タイトル', height: 2, visible: mergedHeader.showTitle },
                    { id: 'score', label: '点数欄', height: 2, visible: mergedHeader.showScore },
                    { id: 'name', label: '氏名欄', height: mergedHeader.nameHeight || 1, visible: mergedHeader.showName }
                ];
            }
            const mergedConfig = { 
                ...loadedConfig, 
                defaultRowHeight: loadedConfig.defaultRowHeight || 10, 
                headerSettings: mergedHeader 
            };
            setConfig(mergedConfig);
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
            headerElements: [
                { id: 'title', label: 'タイトル', height: 2, visible: true },
                { id: 'score', label: '点数欄', height: 2, visible: true },
                { id: 'name', label: '氏名欄', height: 1, visible: true }
            ],
            headerPosition: 'top'
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

    const handleQuestionClick = (qId: string) => {
        // Expand the clicked question in the sidebar
        setExpandedQuestionIds(prev => new Set([...prev, qId]));
        
        // Scroll sidebar to the question setting
        // Simple approach: find element by id logic (assuming we added ids to DOM)
        // For now, just expand is helpful.
    };

    const handleConfigChange = (newConfigPart: Partial<ExtendedLayoutConfig>) => {
        const newConfig = { ...config, ...newConfigPart };
        setConfig(newConfig);
        const layout = generateAutoLayout(newConfig);
        if (activeLayoutId) layout.id = activeLayoutId;
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
    }
    
    const moveHeaderElement = (index: number, direction: 'up' | 'down') => {
        if (!config.headerElements) return;
        const newElements = [...config.headerElements];
        if (direction === 'up' && index > 0) {
            [newElements[index], newElements[index - 1]] = [newElements[index - 1], newElements[index]];
        } else if (direction === 'down' && index < newElements.length - 1) {
            [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]];
        }
        handleConfigChange({ headerElements: newElements });
    };

    const updateHeaderElement = (index: number, updates: Partial<HeaderElement>) => {
        if (!config.headerElements) return;
        const newElements = [...config.headerElements];
        newElements[index] = { ...newElements[index], ...updates };
        handleConfigChange({ headerElements: newElements });
    };

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
        <aside className="w-full flex-shrink-0 flex flex-col bg-white dark:bg-slate-800 border-r dark:border-slate-700 h-full max-w-7xl mx-auto">
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
                <div className="flex h-full">
                    {/* Left Panel: Settings */}
                    <div className="w-80 flex-shrink-0 border-r dark:border-slate-700 flex flex-col p-4 bg-slate-50 dark:bg-slate-900 overflow-y-auto">
                        <div className="flex items-center gap-2 mb-4">
                            <button onClick={() => setTab('list')} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800"><ArrowLeftIcon className="w-5 h-5"/></button>
                            <h3 className="font-bold">構成編集</h3>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="space-y-4 p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                                <input type="text" value={config.name} onChange={e => { setConfig({...config, name: e.target.value}); setTimeout(() => handleCreateOrUpdateLayout(false), 0); }} className="w-full p-2 border-b border-transparent focus:border-sky-500 bg-transparent text-lg font-bold placeholder-slate-400 outline-none" placeholder="テスト名"/>
                                <div className="grid grid-cols-2 gap-2">
                                    <select value={config.paperSize} onChange={e => { setConfig({...config, paperSize: e.target.value as PaperSize}); setTimeout(() => handleCreateOrUpdateLayout(false), 0); }} className="p-1.5 border rounded bg-slate-50 dark:bg-slate-700 text-sm"><option value="A4">A4</option><option value="B5">B5</option><option value="A3">A3</option></select>
                                    <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-700 border rounded px-2">
                                        <label className="text-[10px] text-slate-400 whitespace-nowrap">行高:</label>
                                        <input type="number" min="5" max="30" value={config.defaultRowHeight} onChange={e => { setConfig({...config, defaultRowHeight: parseInt(e.target.value) || 10}); setTimeout(() => handleCreateOrUpdateLayout(false), 0); }} className="w-full p-1 text-sm bg-transparent text-right"/>
                                    </div>
                                </div>
                                 {/* Header Settings */}
                                <div className="pt-2 border-t dark:border-slate-600 text-xs">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-bold text-slate-500">ヘッダー設定</span>
                                        <div className="flex gap-1">
                                            <button onClick={() => handleConfigChange({ headerPosition: 'top' })} className={`px-2 py-0.5 rounded border ${config.headerPosition !== 'bottom' ? 'bg-sky-100 text-sky-700 border-sky-300' : 'border-slate-200'}`}>上</button>
                                            <button onClick={() => handleConfigChange({ headerPosition: 'bottom' })} className={`px-2 py-0.5 rounded border ${config.headerPosition === 'bottom' ? 'bg-sky-100 text-sky-700 border-sky-300' : 'border-slate-200'}`}>下</button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        {config.headerElements?.map((el, idx) => (
                                            <div key={el.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 p-1 rounded border border-slate-200 dark:border-slate-600">
                                                <input type="checkbox" checked={el.visible} onChange={e => updateHeaderElement(idx, { visible: e.target.checked })} className="rounded"/>
                                                <span className="flex-1">{el.label}</span>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] text-slate-400">高:</span>
                                                    <input type="number" min="1" max="10" value={el.height} onChange={e => updateHeaderElement(idx, { height: parseInt(e.target.value) })} className="w-8 p-0.5 text-center border rounded bg-white dark:bg-slate-800"/>
                                                </div>
                                                <div className="flex flex-col">
                                                    <button onClick={() => moveHeaderElement(idx, 'up')} disabled={idx === 0} className="text-slate-400 hover:text-sky-500 disabled:opacity-30"><ChevronUpIcon className="w-3 h-3"/></button>
                                                    <button onClick={() => moveHeaderElement(idx, 'down')} disabled={idx === (config.headerElements?.length || 0) - 1} className="text-slate-400 hover:text-sky-500 disabled:opacity-30"><ChevronDownIcon className="w-3 h-3"/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => addQuestion('text')} className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg transition-all shadow-sm"><ListIcon className="w-6 h-6 text-blue-500 mb-1"/><span className="text-xs font-bold">記述</span></button>
                                <button onClick={() => addQuestion('marksheet')} className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg transition-all shadow-sm"><CalculatorIcon className="w-6 h-6 text-teal-500 mb-1"/><span className="text-xs font-bold">記号</span></button>
                                <button onClick={() => addQuestion('english_word')} className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg transition-all shadow-sm"><PenLineIcon className="w-6 h-6 text-orange-500 mb-1"/><span className="text-xs font-bold">英単語</span></button>
                                <button onClick={() => addQuestion('long_text')} className="flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-800 border hover:border-sky-500 rounded-lg transition-all shadow-sm"><FileUpIcon className="w-6 h-6 text-purple-500 mb-1"/><span className="text-xs font-bold">長文</span></button>
                            </div>
                            <button onClick={addSection} className="w-full flex items-center justify-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-xs font-bold"><ArrowDownFromLineIcon className="w-4 h-4"/> 大問を追加</button>
                            
                            <div className="space-y-4">
                                {config.sections.map((section, sIdx) => (
                                    <div key={section.id} className="relative pl-6 border-l-2 border-slate-300 dark:border-slate-600">
                                        <div className="absolute -left-[1.2rem] top-0 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 rounded-full w-8 h-8 flex items-center justify-center font-serif font-bold text-slate-600 dark:text-slate-300">
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
                                                                    <button onClick={() => insertQuestionAfter(sIdx, qIdx, q)} className="p-1 text-slate-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900 rounded"><PlusIcon className="w-3 h-3"/></button>
                                                                    <button onClick={() => deleteQuestion(section.id, q.id)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900 rounded"><MinusIcon className="w-3 h-3"/></button>
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
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Interactive Preview */}
                    <div className="flex-1 bg-slate-100 dark:bg-slate-800/50 p-8 overflow-auto flex justify-center">
                        <div 
                            className="bg-white shadow-lg relative"
                            style={{ 
                                width: `${PAPER_DIMENSIONS[config.paperSize].width}mm`, 
                                height: `${PAPER_DIMENSIONS[config.paperSize].height}mm`,
                                padding: '10mm',
                                boxSizing: 'border-box'
                            }}
                        >
                            {config.headerSettings?.position === 'top' && (
                                <div className="border-b-2 border-black pb-2 mb-4 text-center">
                                    {config.headerSettings?.showTitle && <h1 className="text-2xl font-bold">{config.name}</h1>}
                                </div>
                            )}

                            {config.sections.map((section, sIdx) => (
                                <div key={section.id} className="flex mb-6 relative group/section">
                                    <div className="w-12 flex-shrink-0 border border-black flex items-center justify-center text-xl font-bold bg-gray-200 mr-2 relative">
                                        {section.title}
                                        <div className="absolute top-0 -left-8 hidden group-hover/section:flex flex-col gap-1">
                                            <button onClick={() => addQuestion('text')} className="p-1 bg-white shadow rounded-full hover:text-green-600"><PlusIcon className="w-4 h-4"/></button>
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 flex flex-wrap content-start gap-y-2">
                                        {section.questions.map((q, qIdx) => {
                                            // Re-calculate visual width for preview
                                            let widthStyle = '50%';
                                            if (q.type === 'long_text') widthStyle = '100%';
                                            else if (q.type === 'english_word') widthStyle = `${Math.min(100, (q.wordCount || 5) * 10)}%`;
                                            else widthStyle = `${(q.widthRatio / 20) * 100}%`;
                                            
                                            return (
                                                <div 
                                                    key={q.id} 
                                                    className="relative group/question box-border flex pr-2 cursor-pointer"
                                                    style={{ width: widthStyle, height: `${(config.defaultRowHeight || 10) * (q.heightRatio || 1)}mm` }}
                                                    onClick={() => handleQuestionClick(q.id)}
                                                >
                                                    <div className="w-8 border border-black border-r-0 bg-gray-100 flex items-center justify-center text-sm font-bold">Q</div>
                                                    
                                                    <div className="flex-1 border border-black relative bg-white flex items-center overflow-hidden">
                                                        {q.type === 'marksheet' && (
                                                            <div className="flex w-full justify-around text-xs">
                                                                {Array.from({length: q.choices || 4}).map((_, i) => <span key={i} className="border rounded-full w-4 h-4 flex items-center justify-center border-slate-400">{i+1}</span>)}
                                                            </div>
                                                        )}
                                                        {q.type === 'english_word' && (
                                                            <div className="flex w-full h-full flex-wrap items-end pb-1 px-1 gap-1">
                                                                {Array.from({length: q.wordCount || 5}).map((_, i) => <div key={i} className="flex-1 h-4 border-b border-dashed border-black min-w-[20px]"></div>)}
                                                            </div>
                                                        )}
                                                        
                                                        {/* Hover Controls Overlay - Fixed z-index and visibility */}
                                                        <div className="absolute right-0 top-0 bottom-0 w-8 bg-slate-100/90 border-l flex-col items-center justify-center gap-1 z-50 hidden group-hover/question:flex">
                                                            <button onClick={(e) => { e.stopPropagation(); insertQuestionAfter(sIdx, qIdx, q); }} className="p-1 text-green-600 hover:bg-green-200 rounded" title="追加"><PlusIcon className="w-3 h-3"/></button>
                                                            <button onClick={(e) => { e.stopPropagation(); deleteQuestion(section.id, q.id); }} className="p-1 text-red-600 hover:bg-red-200 rounded" title="削除"><MinusIcon className="w-3 h-3"/></button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
};