import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { SheetLayout, SheetCell, LayoutConfig, HeaderElement, NumberingStyle } from '../../types';
import { generateAutoLayout, PAPER_DIMENSIONS } from './LayoutGenerator';
import { PlusIcon, Trash2Icon, FileUpIcon, FileDownIcon, XIcon, CalculatorIcon, ListIcon, BoxSelectIcon, PenLineIcon, ArrowDownFromLineIcon, ArrowRightIcon, ArrowLeftIcon, PaletteIcon, GripVerticalIcon, RotateCcwIcon, Edit3Icon, SettingsIcon, MinusIcon, ChevronDownIcon, ChevronUpIcon, AlignVerticalJustifyStartIcon, AlignVerticalJustifyEndIcon, PrintIcon } from '../icons';

interface LayoutSidebarProps {
    layouts: Record<string, SheetLayout>;
    setLayouts: React.Dispatch<React.SetStateAction<Record<string, SheetLayout>>>;
    activeLayoutId: string | null;
    setActiveLayoutId: React.Dispatch<React.SetStateAction<string | null>>;
    onPrintPreview?: () => void;
    children?: React.ReactNode;
}

type PaperSize = 'A4' | 'B5' | 'A3';
type QuestionType = 'text' | 'marksheet' | 'long_text' | 'english_word';

type QuestionDef = LayoutConfig['sections'][0]['questions'][0];
type SectionDef = LayoutConfig['sections'][0];

// Helper for formatting section numbers
const formatSectionTitle = (index: number, style: NumberingStyle): string => {
    const num = index + 1;
    switch (style) {
        case '1': return `${num}`;
        case 'I': return ['I','II','III','IV','V','VI','VII','VIII','IX','X'][index] || `${num}`;
        case 'i': return ['i','ii','iii','iv','v','vi','vii','viii','ix','x'][index] || `${num}`;
        case 'A': return String.fromCharCode(64 + num);
        case 'a': return String.fromCharCode(96 + num);
        case '①': return ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'][index] || `${num}`;
        case 'ア': return ['ア','イ','ウ','エ','オ'][index] || `${num}`;
        default: return `${num}`;
    }
};

export const LayoutSidebar: React.FC<LayoutSidebarProps> = ({ layouts, setLayouts, activeLayoutId, setActiveLayoutId, onPrintPreview, children }) => {
    const [tab, setTab] = useState<'list' | 'edit'>('list');
    const [isInitModalOpen, setIsInitModalOpen] = useState(false);
    
    // --- Builder State ---
    const [config, setConfig] = useState<LayoutConfig>({
        name: '', paperSize: 'A4', borderWidth: 1, borderColor: '#000000', defaultRowHeight: 10, gapBetweenQuestions: 2, sections: [],
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
    const [sectionNumberingStyle, setSectionNumberingStyle] = useState<NumberingStyle>('I');

    // Dynamic preview layout derived from current config
    const previewLayout = useMemo(() => generateAutoLayout(config), [config]);

    useEffect(() => {
        if (activeLayoutId && layouts[activeLayoutId]?.config) {
            const loadedConfig = layouts[activeLayoutId].config as LayoutConfig;
            const mergedHeader = { 
                showTitle: true, titleHeight: 2, showName: true, nameHeight: 1, showScore: true, position: 'top' as const, 
                ...loadedConfig.headerSettings 
            };
            
            let headerElements = loadedConfig.headerElements;
            if (!headerElements) {
                headerElements = [
                    { id: 'title', label: 'タイトル', height: 2, visible: mergedHeader.showTitle },
                    { id: 'score', label: '点数欄', height: 2, visible: mergedHeader.showScore },
                    { id: 'name', label: '氏名欄', height: mergedHeader.nameHeight || 1, visible: mergedHeader.nameHeight ? true : false }
                ];
            }

            const mergedConfig = { 
                ...loadedConfig, 
                defaultRowHeight: loadedConfig.defaultRowHeight || 10, 
                gapBetweenQuestions: loadedConfig.gapBetweenQuestions !== undefined ? loadedConfig.gapBetweenQuestions : 2,
                headerSettings: mergedHeader,
                headerElements: headerElements,
                headerPosition: loadedConfig.headerPosition || 'top'
            };
            setConfig(mergedConfig);
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
        
        const newConfig: LayoutConfig = {
            name: initName,
            paperSize: initSize,
            borderWidth: 1,
            borderColor: '#000000',
            defaultRowHeight: initRowHeight,
            gapBetweenQuestions: 2,
            sections: [{ id: `sec_${Date.now()}`, title: 'I', numberingStyle: '1', questions: [] }],
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
            title: formatSectionTitle(config.sections.length, sectionNumberingStyle),
            numberingStyle: '1',
            questions: []
        };
        const newConfig = { ...config, sections: [...config.sections, newSection] };
        setConfig(newConfig);
        const layout = generateAutoLayout(newConfig);
        if (activeLayoutId) layout.id = activeLayoutId;
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
    };

    const removeSection = (sectionId: string) => {
        if (window.confirm('この大問を削除しますか？')) {
            const newConfig = { ...config, sections: config.sections.filter(s => s.id !== sectionId) };
            // Re-number sections
            newConfig.sections.forEach((s, idx) => {
                 s.title = formatSectionTitle(idx, sectionNumberingStyle);
            });
            setConfig(newConfig);
            const layout = generateAutoLayout(newConfig);
            if (activeLayoutId) layout.id = activeLayoutId;
            setLayouts(prev => ({ ...prev, [layout.id]: layout }));
        }
    };
    
    const updateSection = (sectionId: string, updates: Partial<SectionDef>) => {
        const newConfig = { 
            ...config, 
            sections: config.sections.map(s => s.id === sectionId ? { ...s, ...updates } : s) 
        };
        setConfig(newConfig);
        const layout = generateAutoLayout(newConfig);
        if (activeLayoutId) layout.id = activeLayoutId;
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
    };

    const handleSectionNumberingChange = (style: NumberingStyle) => {
        setSectionNumberingStyle(style);
        const newConfig = {
            ...config,
            sections: config.sections.map((s, idx) => ({
                ...s,
                title: formatSectionTitle(idx, style)
            }))
        };
        setConfig(newConfig);
        const layout = generateAutoLayout(newConfig);
        if (activeLayoutId) layout.id = activeLayoutId;
        setLayouts(prev => ({ ...prev, [layout.id]: layout }));
    };

    const addQuestion = (type: QuestionType) => {
        let sections = [...config.sections];
        if (sections.length === 0) {
            sections.push({ id: `sec_${Date.now()}`, title: formatSectionTitle(0, sectionNumberingStyle), numberingStyle: '1', questions: [] });
        }
        const lastSection = sections[sections.length - 1];
        const newQ = {
            id: `q_${Date.now()}`,
            type,
            widthRatio: 20, 
            heightRatio: 1.0,
            lineHeightRatio: 1.5,
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
        setExpandedQuestionIds(prev => new Set([...prev, qId]));
        const el = document.getElementById(`sidebar-q-${qId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const handleConfigChange = (newConfigPart: Partial<LayoutConfig>) => {
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

    const renderEnglishGrid = (metadata: any) => {
        const { wordCount, wordsPerLine, lineHeightRatio } = metadata;
        const rows = Math.ceil(wordCount / (wordsPerLine || 10)); 
        
        return (
            <div style={{ 
                width: '100%', 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between', 
                padding: '4px 8px' 
            }}>
                {Array.from({ length: rows }).map((_, r) => (
                    <div key={r} style={{ 
                        width: '100%',
                        borderBottom: '1px dashed #666', 
                        height: '1px', 
                    }}></div>
                ))}
            </div>
        );
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

            {tab === 'list' ? (
                <div className="w-full h-full flex">
                    <aside className="w-96 flex-shrink-0 flex flex-col bg-white dark:bg-slate-800 border-r dark:border-slate-700 h-full">
                        <div className="flex border-b dark:border-slate-700">
                            <button onClick={() => setTab('list')} className={`flex-1 py-3 text-sm font-medium ${tab === 'list' ? 'border-b-2 border-sky-500 text-sky-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>一覧</button>
                            <button onClick={() => setTab('edit')} className={`flex-1 py-3 text-sm font-medium ${tab === 'edit' ? 'border-b-2 border-sky-500 text-sky-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>構成編集</button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 p-4">
                            {Object.values(layouts).map((layout: SheetLayout) => (
                                <div key={layout.id} className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${activeLayoutId === layout.id ? 'bg-sky-50 dark:bg-sky-900/50 border border-sky-200' : 'bg-slate-50 dark:bg-slate-700/50 border border-transparent hover:border-slate-300'}`}>
                                    <span onClick={() => { setActiveLayoutId(layout.id); }} className="flex-1 truncate font-medium">{layout.name}</span>
                                    <button onClick={() => handleDeleteLayout(layout.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-600 rounded-full transition-colors"><Trash2Icon className="w-4 h-4" /></button>
                                </div>
                            ))}
                            {Object.keys(layouts).length === 0 && <div className="text-center text-slate-400 py-10">作成されたレイアウトはありません</div>}
                        </div>
                        <div className="pt-4 border-t dark:border-slate-700 space-y-2 p-4">
                            <button onClick={openInitModal} className="w-full flex items-center justify-center gap-2 p-3 bg-sky-600 text-white rounded-lg hover:bg-sky-500 transition-colors font-bold shadow-sm"><PlusIcon className="w-5 h-5"/> 新規作成</button>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={handleImportLayout} className="flex items-center justify-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors text-xs text-slate-600 dark:text-slate-300"><FileUpIcon className="w-4 h-4"/>インポート</button>
                                <button onClick={handleExportLayout} disabled={!activeLayoutId} className="flex items-center justify-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors text-xs text-slate-600 dark:text-slate-300 disabled:opacity-50"><FileDownIcon className="w-4 h-4"/>保存</button>
                            </div>
                        </div>
                    </aside>
                    <main className="flex-1 overflow-hidden">{children}</main>
                </div>
            ) : (
                <div className="w-full h-full flex">
                    <aside className="w-96 flex-shrink-0 flex flex-col bg-white dark:bg-slate-800 border-r dark:border-slate-700 h-full">
                        <div className="flex border-b dark:border-slate-700">
                            <button onClick={() => setTab('list')} className={`flex-1 py-3 text-sm font-medium ${tab === 'list' ? 'border-b-2 border-sky-500 text-sky-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>一覧</button>
                            <button onClick={() => setTab('edit')} className={`flex-1 py-3 text-sm font-medium ${tab === 'edit' ? 'border-b-2 border-sky-500 text-sky-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>構成編集</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            <div className="space-y-4 bg-slate-50 dark:bg-slate-700/30 p-3 rounded-lg border border-slate-200 dark:border-slate-600">
                                <input type="text" value={config.name} onChange={e => { setConfig({...config, name: e.target.value}); setTimeout(() => handleCreateOrUpdateLayout(false), 0); }} className="w-full p-2 border-b border-transparent focus:border-sky-500 bg-transparent text-lg font-bold placeholder-slate-400 outline-none" placeholder="テスト名"/>
                                <div className="grid grid-cols-2 gap-2">
                                    <select value={config.paperSize} onChange={e => { setConfig({...config, paperSize: e.target.value as PaperSize}); setTimeout(() => handleCreateOrUpdateLayout(false), 0); }} className="p-1.5 border rounded bg-slate-50 dark:bg-slate-700 text-sm"><option value="A4">A4</option><option value="B5">B5</option><option value="A3">A3</option></select>
                                    <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-700 border rounded px-2">
                                        <label className="text-[10px] text-slate-400 whitespace-nowrap">行高:</label>
                                        <input type="number" min="5" max="30" value={config.defaultRowHeight} onChange={e => { setConfig({...config, defaultRowHeight: parseInt(e.target.value) || 10}); setTimeout(() => handleCreateOrUpdateLayout(false), 0); }} className="w-full p-1 text-sm bg-transparent text-right"/>
                                    </div>
                                </div>
                                <div className="pt-2 border-t dark:border-slate-600 text-xs space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer"><span className="text-[10px] font-bold text-slate-400">解答欄間隔:</span><input type="number" min="0" max="5" value={config.gapBetweenQuestions} onChange={e => handleConfigChange({gapBetweenQuestions: parseInt(e.target.value)})} className="w-10 p-0.5 border rounded bg-slate-50 dark:bg-slate-900 text-center"/></label>
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

                            <div className="sticky top-0 bg-white dark:bg-slate-800 z-10 py-2 space-y-2 border-b border-slate-100 dark:border-slate-700">
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => addQuestion('text')} className="flex items-center justify-center gap-1 p-2 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition-colors shadow-sm"><ListIcon className="w-4 h-4"/><span className="text-xs font-bold">記述</span></button>
                                    <button onClick={() => addQuestion('marksheet')} className="flex items-center justify-center gap-1 p-2 bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100 transition-colors shadow-sm"><CalculatorIcon className="w-4 h-4"/><span className="text-xs font-bold">記号</span></button>
                                    <button onClick={() => addQuestion('english_word')} className="flex items-center justify-center gap-1 p-2 bg-orange-50 text-orange-700 border border-orange-200 rounded hover:bg-orange-100 transition-colors shadow-sm"><PenLineIcon className="w-4 h-4"/><span className="text-xs font-bold">英単語</span></button>
                                    <button onClick={() => addQuestion('long_text')} className="flex items-center justify-center gap-1 p-2 bg-purple-50 text-purple-700 border border-purple-200 rounded hover:bg-purple-100 transition-colors shadow-sm"><FileUpIcon className="w-4 h-4"/><span className="text-xs font-bold">長文</span></button>
                                </div>
                                <button onClick={addSection} className="w-full flex items-center justify-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-xs font-bold"><ArrowDownFromLineIcon className="w-4 h-4"/> 大問を追加</button>
                            </div>
                            
                            <div className="space-y-4">
                                {config.sections.map((section, sIdx) => (
                                    <div key={section.id} className="relative pl-6 border-l-2 border-slate-300 dark:border-slate-600 group/section">
                                        {/* Improved Section Header Layout */}
                                        <div className="flex items-center gap-2 mb-2 justify-between">
                                            <div className="relative w-10 h-8">
                                                 <div className="absolute -left-[1.2rem] top-0 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 rounded-full min-w-[2rem] h-8 flex items-center justify-center font-serif font-bold text-slate-600 dark:text-slate-300 overflow-hidden shadow-sm">
                                                    <input value={section.title} onChange={e => {
                                                        const ns = [...config.sections];
                                                        ns[sIdx].title = e.target.value;
                                                        handleConfigChange({sections: ns});
                                                    }} className="w-full h-full bg-transparent text-center outline-none rounded-full" />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <select 
                                                    value={section.numberingStyle || '1'} 
                                                    onChange={(e) => updateSection(section.id, { numberingStyle: e.target.value as NumberingStyle })}
                                                    className="text-[10px] p-1 border rounded bg-white dark:bg-slate-800 max-w-[80px]"
                                                >
                                                    <option value="1">1, 2...</option>
                                                    <option value="(1)">(1), (2)...</option>
                                                    <option value="[1]">[1], [2]...</option>
                                                    <option value="①">①, ②...</option>
                                                    <option value="A">A, B...</option>
                                                    <option value="a">a, b...</option>
                                                    <option value="I">I, II...</option>
                                                    <option value="i">i, ii...</option>
                                                    <option value="ア">ア, イ...</option>
                                                </select>
                                                <button onClick={() => removeSection(section.id)} className="text-slate-400 hover:text-red-500 p-1.5 bg-slate-100 dark:bg-slate-800 rounded hover:bg-red-50 border border-slate-200 dark:border-slate-700" title="大問を削除"><Trash2Icon className="w-4 h-4"/></button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            {section.questions.map((q, qIdx) => {
                                                const isExpanded = expandedQuestionIds.has(q.id);
                                                return (
                                                    <div key={q.id} id={`sidebar-q-${q.id}`} className="group flex flex-col gap-1 p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 shadow-sm relative">
                                                        <div className="flex items-center gap-3">
                                                            <button onClick={() => toggleExpand(q.id)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                                                                {isExpanded ? <ChevronUpIcon className="w-3 h-3 text-slate-400"/> : <ChevronDownIcon className="w-3 h-3 text-slate-400"/>}
                                                            </button>
                                                            <div className="flex-1 flex justify-between items-center text-xs">
                                                                <span className="font-bold">{q.type === 'marksheet' ? '記号' : q.type === 'long_text' ? '長文' : q.type === 'english_word' ? '英単語' : '記述'}</span>
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
                                                                        <input type="range" min="1" max="40" value={q.widthRatio} onChange={e => updateQuestion(section.id, q.id, { widthRatio: parseInt(e.target.value) })} className="flex-1 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"/>
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[10px] text-slate-400">高:</span>
                                                                    <input type="number" step="0.1" min="0.5" max="5" value={q.heightRatio || 1.0} onChange={e => updateQuestion(section.id, q.id, { heightRatio: parseFloat(e.target.value) })} className="w-12 p-0.5 border rounded bg-slate-50 dark:bg-slate-900 text-center"/>
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
                                                                        <input type="number" min="1" max="100" value={q.wordCount || 5} onChange={e => updateQuestion(section.id, q.id, { wordCount: parseInt(e.target.value) })} className="w-12 p-0.5 border rounded bg-slate-50 dark:bg-slate-900 text-center"/>
                                                                    </div>
                                                                )}
                                                                {q.type === 'english_word' && (
                                                                    <div className="flex items-center gap-1 flex-1">
                                                                        <span className="text-[10px] text-slate-400">行間:</span>
                                                                        <input type="number" step="0.1" min="1.0" max="3.0" value={q.lineHeightRatio || 1.5} onChange={e => updateQuestion(section.id, q.id, { lineHeightRatio: parseFloat(e.target.value) })} className="w-full p-0.5 border rounded bg-slate-50 dark:bg-slate-900 text-center"/>
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
                            <div className="p-4 bg-slate-50 dark:bg-slate-900">
                                <button onClick={() => handleCreateOrUpdateLayout(true)} className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold shadow-lg transform transition-transform active:scale-95 flex items-center justify-center gap-2">
                                    <RotateCcwIcon className="w-5 h-5"/> 構成を反映して更新
                                </button>
                            </div>
                        </div>
                    </aside>

                    {/* Right Panel: Real Preview using generated Layout */}
                    <div className="flex-1 bg-slate-200 dark:bg-slate-900/50 p-8 overflow-auto flex justify-center">
                        <div className="relative shadow-2xl">
                            <div className="absolute top-2 right-2 flex gap-2 print:hidden z-20">
                                {onPrintPreview && <button onClick={onPrintPreview} className="p-2 bg-sky-600 text-white rounded-full shadow hover:bg-sky-500 transition-colors" title="印刷プレビュー"><PrintIcon className="w-5 h-5"/></button>}
                            </div>
                            {/* Render the actual SheetLayout as a table, scaled down slightly for viewing */}
                            <div style={{ 
                                width: `${PAPER_DIMENSIONS[config.paperSize].width}mm`, 
                                height: `${PAPER_DIMENSIONS[config.paperSize].height}mm`,
                                backgroundColor: 'white',
                                padding: '10mm',
                                boxSizing: 'border-box',
                                overflow: 'hidden' 
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                    <colgroup>
                                        {previewLayout.colWidths.map((w, i) => <col key={i} style={{ width: `${w}px` }} />)}
                                    </colgroup>
                                    <tbody>
                                        {previewLayout.cells.map((row, r) => (
                                            <tr key={r} style={{ height: `${previewLayout.rowHeights[r]}px` }}>
                                                {row.map((cell, c) => {
                                                    if (!cell) return null;
                                                    const borderStyleBase = `${cell.borderWidth || 1}px ${cell.borderStyle || 'solid'} ${cell.borderColor || '#000'}`;
                                                    const style: React.CSSProperties = {
                                                        textAlign: cell.hAlign,
                                                        verticalAlign: cell.vAlign,
                                                        fontWeight: cell.fontWeight,
                                                        fontStyle: cell.fontStyle,
                                                        textDecoration: cell.textDecoration,
                                                        fontSize: `${cell.fontSize}pt`,
                                                        borderTop: cell.borders?.top ? borderStyleBase : 'none',
                                                        borderBottom: cell.borders?.bottom ? borderStyleBase : 'none',
                                                        borderLeft: cell.borders?.left ? borderStyleBase : 'none',
                                                        borderRight: cell.borders?.right ? borderStyleBase : 'none',
                                                        backgroundColor: cell.backgroundColor || 'transparent',
                                                        padding: '2px 4px',
                                                        overflow: 'hidden',
                                                        wordWrap: 'break-word',
                                                        whiteSpace: 'pre-wrap'
                                                    };
                                                    return (
                                                        <td key={c} colSpan={cell.colSpan} rowSpan={cell.rowSpan} style={style}>
                                                            {cell.type === 'english-grid' ? renderEnglishGrid(cell.metadata) : cell.text}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
};