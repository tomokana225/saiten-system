
import React from 'react';
import type { AreaType } from '../../types';
import { AreaType as AreaTypeEnum } from '../../types';
import { ZoomInIcon, ZoomOutIcon, Wand2Icon, Undo2Icon, Redo2Icon, PlusIcon, MousePointer2Icon } from '../icons';
import { areaTypeColors } from './TemplateSidebar';

interface TemplateToolbarProps {
    isAutoDetectMode: boolean;
    setIsAutoDetectMode: (val: boolean) => void;
    wandTargetType: AreaType;
    setWandTargetType: (type: AreaType) => void;
    manualDrawType: AreaType | null;
    setManualDrawType: (type: AreaType | null) => void;
    zoom: number;
    onZoomChange: (zoom: number) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

const typeNameMap: Record<string, string> = {
    [AreaTypeEnum.ANSWER]: '解答', 
    [AreaTypeEnum.MARK_SHEET]: 'マークシート', 
    [AreaTypeEnum.NAME]: '氏名',
    [AreaTypeEnum.SUBTOTAL]: '小計', 
    [AreaTypeEnum.TOTAL]: '合計', 
    [AreaTypeEnum.QUESTION_NUMBER]: '問題番号',
    [AreaTypeEnum.ALIGNMENT_MARK]: '基準マーク', 
    [AreaTypeEnum.STUDENT_ID_MARK]: '学籍番号',
    [AreaTypeEnum.STUDENT_ID_REF_RIGHT]: '学籍基準(右)',
    [AreaTypeEnum.STUDENT_ID_REF_BOTTOM]: '学籍基準(下)',
};

export const TemplateToolbar: React.FC<TemplateToolbarProps> = ({ 
    isAutoDetectMode, setIsAutoDetectMode, wandTargetType, setWandTargetType,
    manualDrawType, setManualDrawType, zoom, onZoomChange, undo, redo, canUndo, canRedo
}) => {
    return (
        <div className="flex-shrink-0 flex items-center bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 gap-3 min-h-[64px]">
            {/* History Controls */}
            <div className="flex flex-col gap-1 shrink-0 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                <button onClick={undo} disabled={!canUndo} className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30" title="元に戻す (Ctrl+Z)"><Undo2Icon className="w-4 h-4"/></button>
                <button onClick={redo} disabled={!canRedo} className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30" title="やり直す (Ctrl+Y)"><Redo2Icon className="w-4 h-4"/></button>
            </div>

            <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 shrink-0"></div>

            {/* Smart Interaction Controls */}
            <div className="flex flex-col gap-1 shrink-0">
                <button
                    onClick={() => { setIsAutoDetectMode(false); setManualDrawType(null); }}
                    className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-all font-bold text-xs ${!isAutoDetectMode && !manualDrawType ? 'bg-sky-500 text-white shadow-md' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                >
                    <MousePointer2Icon className="w-3.5 h-3.5" />
                    <span>通常選択</span>
                </button>

                <div className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-all font-bold text-xs border-2 ${isAutoDetectMode ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300' : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600'}`}>
                    <button onClick={() => setIsAutoDetectMode(!isAutoDetectMode)} className="flex items-center gap-2">
                        <Wand2Icon className="w-3.5 h-3.5" />
                        <span>自動認識</span>
                    </button>
                    {isAutoDetectMode && (
                        <select 
                            value={wandTargetType} 
                            onChange={(e) => setWandTargetType(e.target.value as AreaType)}
                            className="text-[10px] p-0 border-none bg-transparent font-bold focus:ring-0 cursor-pointer"
                        >
                            {Object.values(AreaTypeEnum).map(t => <option key={t} value={t}>{typeNameMap[t] || t}</option>)}
                        </select>
                    )}
                </div>
            </div>

            <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 shrink-0"></div>

            {/* Manual Draw Types - Grouped into 2 rows to prevent overflow */}
            <div className="flex items-center flex-1 min-w-0 gap-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0 writing-mode-vertical text-center hidden sm:block">手動<br/>追加</span>
                <div className="grid grid-rows-2 grid-flow-col gap-1 overflow-x-auto scrollbar-hide p-1">
                    {Object.values(AreaTypeEnum).map(type => (
                        <button
                            key={type}
                            onClick={() => { setIsAutoDetectMode(false); setManualDrawType(manualDrawType === type ? null : type); }}
                            style={{
                                borderColor: areaTypeColors[type].hex,
                                color: manualDrawType === type ? 'white' : areaTypeColors[type].hex,
                                backgroundColor: manualDrawType === type ? areaTypeColors[type].hex : ''
                            }}
                            className={`px-2 py-1 text-[10px] font-bold rounded-md border-2 whitespace-nowrap transition-all active:scale-95 ${manualDrawType !== type ? 'bg-white dark:bg-slate-900' : 'shadow-sm'}`}
                        >
                            {typeNameMap[type] || type}
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 shrink-0"></div>

            <div className="flex flex-col items-center gap-1 shrink-0 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                <div className="flex items-center gap-1">
                    <button onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))} className="p-1 rounded-md hover:bg-white dark:hover:bg-slate-700 transition-colors"><ZoomOutIcon className="w-3.5 h-3.5"/></button>
                    <button onClick={() => onZoomChange(Math.min(5, zoom + 0.1))} className="p-1 rounded-md hover:bg-white dark:hover:bg-slate-700 transition-colors"><ZoomInIcon className="w-3.5 h-3.5"/></button>
                </div>
                <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-slate-400">{(zoom * 100).toFixed(0)}%</span>
            </div>
        </div>
    );
};
