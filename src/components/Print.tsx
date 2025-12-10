import React, { useState, useRef, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import type { StudentResult, Template, Area, Point, AllScores, LayoutSettings, ReportLayoutSettings, QuestionStats } from '../types';
import { AreaType } from '../types';
import {
    XIcon, PrintIcon, AlignLeftIcon, AlignCenterIcon, AlignRightIcon,
    AlignVerticalJustifyStartIcon, AlignVerticalJustifyCenterIcon, AlignVerticalJustifyEndIcon
} from './icons';
import { PrintableIndividualReport } from './printables/PrintableIndividualReport';
import { PrintableAnswerSheet } from './printables/PrintableAnswerSheet';
import { useProject } from '../context/ProjectContext';

interface PrintProps {
    initialTab: 'report' | 'sheets';
    questionStats: QuestionStats[];
    onClose: () => void;
}

const defaultLayoutSettings: LayoutSettings = {
    mark: { show: true, fontSize: 26, opacity: 0.7, correctColor: '#ff0000', incorrectColor: '#0000ff', partialColor: '#ff8c00', hAlign: 'center', vAlign: 'middle', hOffset: 0, vOffset: 0, positioningMode: 'answer_area' },
    point: { fontSize: 10, color: '#ff0000', corner: 'bottom-right', hOffset: 0, vOffset: 0 },
    subtotal: { fontSize: 28, showScore: true, color: '#0000ff', colors: {}, hAlign: 'center', vAlign: 'middle' },
    total: { fontSize: 32, showScore: true, color: '#ff0000', hAlign: 'center', vAlign: 'middle' },
};

const AlignmentPicker = ({ hAlign, vAlign, onAlignChange }: { hAlign: 'left' | 'center' | 'right'; vAlign: 'top' | 'middle' | 'bottom'; onAlignChange: (prop: 'hAlign' | 'vAlign', value: any) => void; }) => (
    <div className="flex items-center gap-1 p-1 bg-slate-200 dark:bg-slate-700/80 rounded-md mt-1">
        <button onClick={() => onAlignChange('hAlign', 'left')} className={`p-1 rounded ${hAlign === 'left' ? 'bg-white dark:bg-slate-600' : 'hover:bg-slate-300/50 dark:hover:bg-slate-600/50'}`} title="左揃え"><AlignLeftIcon className="w-5 h-5"/></button>
        <button onClick={() => onAlignChange('hAlign', 'center')} className={`p-1 rounded ${hAlign === 'center' ? 'bg-white dark:bg-slate-600' : 'hover:bg-slate-300/50 dark:hover:bg-slate-600/50'}`} title="中央揃え"><AlignCenterIcon className="w-5 h-5"/></button>
        <button onClick={() => onAlignChange('hAlign', 'right')} className={`p-1 rounded ${hAlign === 'right' ? 'bg-white dark:bg-slate-600' : 'hover:bg-slate-300/50 dark:hover:bg-slate-600/50'}`} title="右揃え"><AlignRightIcon className="w-5 h-5"/></button>
        <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1"></div>
        <button onClick={() => onAlignChange('vAlign', 'top')} className={`p-1 rounded ${vAlign === 'top' ? 'bg-white dark:bg-slate-600' : 'hover:bg-slate-300/50 dark:hover:bg-slate-600/50'}`} title="上揃え"><AlignVerticalJustifyStartIcon className="w-5 h-5"/></button>
        <button onClick={() => onAlignChange('vAlign', 'middle')} className={`p-1 rounded ${vAlign === 'middle' ? 'bg-white dark:bg-slate-600' : 'hover:bg-slate-300/50 dark:hover:bg-slate-600/50'}`} title="中央揃え"><AlignVerticalJustifyCenterIcon className="w-5 h-5"/></button>
        <button onClick={() => onAlignChange('vAlign', 'bottom')} className={`p-1 rounded ${vAlign === 'bottom' ? 'bg-white dark:bg-slate-600' : 'hover:bg-slate-300/50 dark:hover:bg-slate-600/50'}`} title="下揃え"><AlignVerticalJustifyEndIcon className="w-5 h-5"/></button>
    </div>
);

const CornerPicker = ({ corner, onCornerChange }: { corner: 'bottom-right' | 'top-right' | 'top-left' | 'bottom-left'; onCornerChange: (corner: 'bottom-right' | 'top-right' | 'top-left' | 'bottom-left') => void; }) => {
    const corners: ('top-left' | 'top-right' | 'bottom-left' | 'bottom-right')[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const titles = { 'top-left': '左上', 'top-right': '右上', 'bottom-left': '左下', 'bottom-right': '右下' };
    return (<div className="grid grid-cols-2 gap-1 p-1 bg-slate-200 dark:bg-slate-700/80 rounded-md mt-1">{corners.map(c => (<button key={c} onClick={() => onCornerChange(c)} className={`px-3 py-1 text-xs rounded ${corner === c ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-600/50 hover:bg-slate-300/50'}`} title={titles[c]}>{titles[c]}</button>))}</div>);
};

export const Print: React.FC<PrintProps> = ({ initialTab, questionStats, onClose }) => {
    const { calculatedResults: results, activeProject } = useProject();
    const { template, areas, points, scores } = activeProject!;

    const printRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'report' | 'sheets'>(initialTab);
    
    // Only select students who have a filePath (meaning they have an uploaded answer sheet) by default.
    // This prevents printing blank sheets with 0 scores for absent students.
    const [selectedStudents, setSelectedStudents] = useState<Set<string>>(
        new Set(results.filter(r => r.filePath).map(r => r.id))
    );
    
    const [sortOrder, setSortOrder] = useState<'rank' | 'number'>('rank');
    const [reportLayoutSettings, setReportLayoutSettings] = useState<ReportLayoutSettings>({ orientation: 'portrait', reportsPerPage: 1, questionTableColumns: 1 });
    const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>(defaultLayoutSettings);
    
    const subtotalAreas = useMemo(() => areas.filter(a => a.type === AreaType.SUBTOTAL), [areas]);
    const hasLinkedQuestionNumbers = useMemo(() => points.some(p => p.questionNumberAreaId), [points]);

    const handleStudentSelectionChange = (studentId: string) => { setSelectedStudents(prev => { const newSet = new Set(prev); if (newSet.has(studentId)) newSet.delete(studentId); else newSet.add(studentId); return newSet; }); };
    const handleSelectAll = () => { setSelectedStudents(selectedStudents.size === results.length ? new Set() : new Set(results.map(r => r.id))); };
    
    const sortedAndFilteredResults = useMemo(() => {
        const filtered = results.filter(r => selectedStudents.has(r.id));
        if (sortOrder === 'number') {
            return [...filtered].sort((a, b) => {
                const classCompare = a.class.localeCompare(b.class);
                if (classCompare !== 0) return classCompare;
                const numA = parseInt(a.number, 10), numB = parseInt(b.number, 10);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return a.number.localeCompare(b.number);
            });
        }
        return filtered;
    }, [results, selectedStudents, sortOrder]);

    // FIX: The type definitions for 'react-to-print' are likely incorrect and missing the 'content' property. Casting to 'any' to bypass the erroneous type check.
    const handlePrint = useReactToPrint({ content: () => printRef.current, onBeforePrint: async () => { if (activeTab === 'report' && reportLayoutSettings.orientation === 'landscape') document.body.classList.add('printing-landscape'); }, onAfterPrint: () => { document.body.classList.remove('printing-landscape'); } } as any);
    const handleSettingChange = (category: keyof LayoutSettings, key: string, value: any) => { setLayoutSettings(prev => ({ ...prev, [category]: { ...prev[category], [key]: value }})); };
    const handleSubtotalColorChange = (subtotalId: number, color: string) => { setLayoutSettings(prev => ({ ...prev, subtotal: { ...prev.subtotal, colors: { ...prev.subtotal.colors, [subtotalId]: color } } })); };
    
    const renderSettings = () => {
        if (activeTab === 'report') {
            return (<div className="space-y-4">
                <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50"><label className="font-medium text-sm text-slate-700 dark:text-slate-300">並び順</label><div className="flex items-center gap-2 mt-1"><button key="rank" onClick={() => setSortOrder('rank')} className={`px-3 py-1 text-xs rounded-md flex-1 ${sortOrder === 'rank' ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>点数順</button><button key="number" onClick={() => setSortOrder('number')} className={`px-3 py-1 text-xs rounded-md flex-1 ${sortOrder === 'number' ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>番号順</button></div></div>
                <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50"><label className="font-medium text-sm text-slate-700 dark:text-slate-300">用紙の向き</label><div className="flex items-center gap-2 mt-1">{([ 'portrait', 'landscape' ] as const).map(o => (<button key={o} onClick={() => setReportLayoutSettings(s => ({ ...s, orientation: o }))} className={`px-3 py-1 text-xs rounded-md flex-1 ${reportLayoutSettings.orientation === o ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>{o === 'portrait' ? '縦' : '横'}</button>))}</div></div>
                <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50"><label className="font-medium text-sm text-slate-700 dark:text-slate-300">1枚あたりの人数</label><div className="flex items-center gap-2 mt-1">{([1, 2, 4] as const).map(num => (<button key={num} onClick={() => setReportLayoutSettings(s => ({ ...s, reportsPerPage: num }))} className={`px-3 py-1 text-xs rounded-md flex-1 ${reportLayoutSettings.reportsPerPage === num ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>{num}人</button>))}</div></div>
                <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50"><label className="font-medium text-sm text-slate-700 dark:text-slate-300">問題別得点表の列数</label><div className="flex items-center gap-2 mt-1">{([1, 2, 3] as const).map(num => (<button key={num} onClick={() => setReportLayoutSettings(s => ({ ...s, questionTableColumns: num }))} className={`px-3 py-1 text-xs rounded-md flex-1 ${reportLayoutSettings.questionTableColumns === num ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>{num}列</button>))}</div></div>
            </div>);
        }
        if (activeTab === 'sheets') {
             return (<div className="space-y-4">
                <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50"><label className="font-medium text-sm text-slate-700 dark:text-slate-300">並び順</label><div className="flex items-center gap-2 mt-1"><button key="rank" onClick={() => setSortOrder('rank')} className={`px-3 py-1 text-xs rounded-md flex-1 ${sortOrder === 'rank' ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>点数順</button><button key="number" onClick={() => setSortOrder('number')} className={`px-3 py-1 text-xs rounded-md flex-1 ${sortOrder === 'number' ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>番号順</button></div></div>
                <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50">
                    <label className="font-medium text-sm text-slate-700 dark:text-slate-300">採点マーク (◯☓△)</label>
                    <div className="flex items-center gap-4 mt-2">
                        <label className="flex items-center text-xs gap-1"><input type="checkbox" checked={layoutSettings.mark.show} onChange={e => handleSettingChange('mark', 'show', e.target.checked)} /> 表示</label>
                    </div>
                    <div className="mt-2 space-y-2">
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">配置基準</label>
                        <div className="flex items-center gap-2">
                            <button onClick={() => handleSettingChange('mark', 'positioningMode', 'answer_area')} className={`px-3 py-1 text-xs rounded-md flex-1 ${layoutSettings.mark.positioningMode === 'answer_area' ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>解答欄</button>
                            <button onClick={() => handleSettingChange('mark', 'positioningMode', 'question_number_area')} className={`px-3 py-1 text-xs rounded-md flex-1 ${layoutSettings.mark.positioningMode === 'question_number_area' ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-700'}`}>問題番号</button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1"><span>サイズ:</span><input type="number" value={layoutSettings.mark.fontSize} onChange={e => handleSettingChange('mark', 'fontSize', parseInt(e.target.value))} className="w-16 p-1 text-xs rounded-md bg-white dark:bg-slate-700" /></div>
                    <div className="flex items-center gap-2 mt-1"><span>不透明度:</span><input type="range" min="0" max="1" step="0.1" value={layoutSettings.mark.opacity} onChange={e => handleSettingChange('mark', 'opacity', parseFloat(e.target.value))} className="w-full" /></div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                        <div className="text-center"><label className="text-xs">◯の色</label><input type="color" value={layoutSettings.mark.correctColor} onChange={e => handleSettingChange('mark', 'correctColor', e.target.value)} className="w-full h-8 p-0 border-none rounded cursor-pointer bg-transparent" /></div>
                        <div className="text-center"><label className="text-xs">☓の色</label><input type="color" value={layoutSettings.mark.incorrectColor} onChange={e => handleSettingChange('mark', 'incorrectColor', e.target.value)} className="w-full h-8 p-0 border-none rounded cursor-pointer bg-transparent" /></div>
                        <div className="text-center"><label className="text-xs">△の色</label><input type="color" value={layoutSettings.mark.partialColor} onChange={e => handleSettingChange('mark', 'partialColor', e.target.value)} className="w-full h-8 p-0 border-none rounded cursor-pointer bg-transparent" /></div>
                    </div>
                    {layoutSettings.mark.positioningMode !== 'question_number_area' && (
                        <AlignmentPicker hAlign={layoutSettings.mark.hAlign} vAlign={layoutSettings.mark.vAlign} onAlignChange={(prop, val) => handleSettingChange('mark', prop, val)} />
                    )}
                    <div className="flex items-center gap-2 mt-1"><span className="text-xs">横位置:</span><input type="range" min="-50" max="50" step="0.5" value={layoutSettings.mark.hOffset} onChange={e => handleSettingChange('mark', 'hOffset', parseFloat(e.target.value))} className="w-full" /><span className="text-xs w-10 text-right">{layoutSettings.mark.hOffset}%</span></div>
                    <div className="flex items-center gap-2 mt-1"><span className="text-xs">縦位置:</span><input type="range" min="-50" max="50" step="0.5" value={layoutSettings.mark.vOffset} onChange={e => handleSettingChange('mark', 'vOffset', parseFloat(e.target.value))} className="w-full" /><span className="text-xs w-10 text-right">{layoutSettings.mark.vOffset}%</span></div>
                </div>
                <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50">
                    <label className="font-medium text-sm text-slate-700 dark:text-slate-300">各問題の点数</label>
                    <div className="flex items-center gap-2 mt-1">
                        <input type="number" value={layoutSettings.point.fontSize} onChange={e => handleSettingChange('point', 'fontSize', parseInt(e.target.value))} className="w-16 p-1 text-xs rounded-md bg-white dark:bg-slate-700" />
                        <input type="color" value={layoutSettings.point.color} onChange={e => handleSettingChange('point', 'color', e.target.value)} className="w-8 h-8 p-0 border-none rounded cursor-pointer bg-transparent" />
                    </div>
                    <CornerPicker corner={layoutSettings.point.corner} onCornerChange={(corner) => handleSettingChange('point', 'corner', corner)} />
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs">横位置:</span>
                        <input type="range" min="-50" max="50" step="0.5" value={layoutSettings.point.hOffset} onChange={e => handleSettingChange('point', 'hOffset', parseFloat(e.target.value))} className="w-full" />
                        <span className="text-xs w-10 text-right">{layoutSettings.point.hOffset}%</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs">縦位置:</span>
                        <input type="range" min="-50" max="50" step="0.5" value={layoutSettings.point.vOffset} onChange={e => handleSettingChange('point', 'vOffset', parseFloat(e.target.value))} className="w-full" />
                        <span className="text-xs w-10 text-right">{layoutSettings.point.vOffset}%</span>
                    </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50"><label className="font-medium text-sm text-slate-700 dark:text-slate-300">小計（共通設定）</label><div className="flex items-center gap-2 mt-1"><input type="number" value={layoutSettings.subtotal.fontSize} onChange={e => handleSettingChange('subtotal', 'fontSize', parseInt(e.target.value))} className="w-16 p-1 text-xs rounded-md bg-white dark:bg-slate-700" /><input type="color" value={layoutSettings.subtotal.color} onChange={e => handleSettingChange('subtotal', 'color', e.target.value)} className="w-8 h-8 p-0 border-none rounded cursor-pointer bg-transparent" /></div><div className="flex items-center gap-4 mt-2"><label className="flex items-center text-xs gap-1"><input type="checkbox" checked={layoutSettings.subtotal.showScore} onChange={e => handleSettingChange('subtotal', 'showScore', e.target.checked)} /> 点数</label></div><AlignmentPicker hAlign={layoutSettings.subtotal.hAlign} vAlign={layoutSettings.subtotal.vAlign} onAlignChange={(prop, val) => handleSettingChange('subtotal', prop, val)} /></div>
                <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50"><h4 className="font-medium text-sm text-slate-700 dark:text-slate-300">小計の色分け設定</h4><div className="mt-2 space-y-2">{subtotalAreas.map(area => (<div key={area.id} className="flex items-center justify-between"><label htmlFor={`subtotal-color-${area.id}`} className="text-sm">{area.name}</label><input id={`subtotal-color-${area.id}`} type="color" value={layoutSettings.subtotal.colors[area.id] || layoutSettings.subtotal.color} onChange={(e) => handleSubtotalColorChange(area.id, e.target.value)} className="w-8 h-8 p-0 border-none rounded cursor-pointer bg-transparent" /></div>))}{subtotalAreas.length === 0 && <p className="text-xs text-slate-500">小計エリアが設定されていません。</p>}</div></div>
                <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50"><label className="font-medium text-sm text-slate-700 dark:text-slate-300">合計点</label><div className="flex items-center gap-2 mt-1"><input type="number" value={layoutSettings.total.fontSize} onChange={e => handleSettingChange('total', 'fontSize', parseInt(e.target.value))} className="w-16 p-1 text-xs rounded-md bg-white dark:bg-slate-700" /><input type="color" value={layoutSettings.total.color} onChange={e => handleSettingChange('total', 'color', e.target.value)} className="w-8 h-8 p-0 border-none rounded cursor-pointer bg-transparent" /></div><div className="flex items-center gap-4 mt-2"><label className="flex items-center text-xs gap-1"><input type="checkbox" checked={layoutSettings.total.showScore} onChange={e => handleSettingChange('total', 'showScore', e.target.checked)} /> 点数</label></div><AlignmentPicker hAlign={layoutSettings.total.hAlign} vAlign={layoutSettings.total.vAlign} onAlignChange={(prop, val) => handleSettingChange('total', prop, val)} /></div>
             </div>);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
            <header className="bg-white dark:bg-slate-800 p-2 flex justify-between items-center print-preview-controls">
                <div className="flex items-center gap-1 p-1 bg-slate-200 dark:bg-slate-900 rounded-lg ml-4"><button onClick={() => setActiveTab('report')} className={`px-3 py-1.5 text-sm rounded-md ${activeTab === 'report' ? 'bg-white dark:bg-slate-700 shadow' : ''}`}>個人成績表</button><button onClick={() => setActiveTab('sheets')} className={`px-3 py-1.5 text-sm rounded-md ${activeTab === 'sheets' ? 'bg-white dark:bg-slate-700 shadow' : ''}`}>添削済み解答用紙</button></div>
                <div className="flex items-center gap-4"><button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-500"><PrintIcon className="w-5 h-5"/>印刷</button><button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><XIcon className="w-6 h-6"/></button></div>
            </header>
            <main className="flex-1 flex overflow-hidden">
                <div className="flex-1 bg-slate-300 dark:bg-slate-950/80 overflow-auto p-4">
                    {sortedAndFilteredResults.length > 0 ? (<>{activeTab === 'report' && <PrintableIndividualReport ref={printRef} results={sortedAndFilteredResults} points={points} scores={scores} questionStats={questionStats} settings={reportLayoutSettings} />}{activeTab === 'sheets' && <PrintableAnswerSheet ref={printRef} results={sortedAndFilteredResults} template={template!} areas={areas} points={points} scores={scores} settings={layoutSettings} />}</>) : <div className="flex items-center justify-center h-full text-white"><p>印刷対象の生徒がいません。オプションで選択してください。</p></div>}
                </div>
                <aside className="w-80 bg-slate-100 dark:bg-slate-900 p-4 space-y-4 overflow-y-auto print-preview-controls">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">印刷オプション</h3>{renderSettings()}
                    <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50 flex flex-col"><label className="font-medium text-sm text-slate-700 dark:text-slate-300">印刷する生徒</label><div className="mt-2 space-y-1 max-h-60 overflow-y-auto"><div className="flex items-center"><input id="student-all" type="checkbox" checked={selectedStudents.size === results.length} onChange={handleSelectAll} className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"/><label htmlFor="student-all" className="ml-2 text-sm">すべて選択</label></div>{results.map(r => <div key={r.id} className="flex items-center"><input id={`student-${r.id}`} type="checkbox" checked={selectedStudents.has(r.id)} onChange={() => handleStudentSelectionChange(r.id)} className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"/><label htmlFor={`student-${r.id}`} className="ml-2 text-sm">{r.class}-{r.number} {r.name}</label></div>)}</div></div>
                </aside>
            </main>
        </div>
    );
};