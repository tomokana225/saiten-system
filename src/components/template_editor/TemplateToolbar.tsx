
import React from 'react';
import type { AreaType } from '../../types';
import { AreaType as AreaTypeEnum } from '../../types';
import { ZoomInIcon, ZoomOutIcon, MousePointer2Icon, HandIcon, Wand2Icon } from '../icons';
import { areaTypeColors } from './TemplateSidebar';

interface TemplateToolbarProps {
    activeTool: AreaType | 'select' | 'pan' | 'magic-wand';
    setActiveTool: (tool: AreaType | 'select' | 'pan' | 'magic-wand') => void;
    zoom: number;
    onZoomChange: (zoom: number) => void;
    wandTargetType: AreaType;
    setWandTargetType: (type: AreaType) => void;
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
    [AreaTypeEnum.STUDENT_ID_REF_RIGHT]: '学籍番号基準(右)',
    [AreaTypeEnum.STUDENT_ID_REF_BOTTOM]: '学籍番号基準(下)',
};

export const TemplateToolbar: React.FC<TemplateToolbarProps> = ({ activeTool, setActiveTool, zoom, onZoomChange, wandTargetType, setWandTargetType }) => {
    return (
        <div className="flex-shrink-0 flex items-center bg-slate-100 dark:bg-slate-800 p-2 rounded-lg gap-2 overflow-hidden">
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    onClick={() => setActiveTool('select')}
                    className={`p-2 rounded-md ${activeTool === 'select' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-700'}`}
                    title="選択"
                >
                    <MousePointer2Icon className="w-5 h-5" />
                </button>
                <button
                    onClick={() => setActiveTool('pan')}
                    className={`p-2 rounded-md ${activeTool === 'pan' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-700'}`}
                    title="パン"
                >
                    <HandIcon className="w-5 h-5" />
                </button>
                <div className="flex items-center bg-white dark:bg-slate-700 rounded-md border border-slate-200 dark:border-slate-600">
                    <button
                        onClick={() => setActiveTool('magic-wand')}
                        className={`p-2 rounded-l-md ${activeTool === 'magic-wand' ? 'bg-sky-500 text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                        title="自動認識ツール: 枠内をクリックして領域を作成"
                    >
                        <Wand2Icon className="w-5 h-5" />
                    </button>
                    {activeTool === 'magic-wand' && (
                        <div className="flex items-center px-2 py-1 border-l border-slate-200 dark:border-slate-600 bg-sky-50 dark:bg-sky-900/30 rounded-r-md">
                            <span className="text-xs font-bold text-sky-700 dark:text-sky-300 mr-2 whitespace-nowrap">作成タイプ:</span>
                            <select 
                                value={wandTargetType} 
                                onChange={(e) => setWandTargetType(e.target.value as AreaType)}
                                className="text-xs p-1 rounded border-none bg-transparent font-medium text-slate-700 dark:text-slate-200 focus:ring-0 cursor-pointer"
                            >
                                {Object.values(AreaTypeEnum).map(t => (
                                    <option key={t} value={t}>{typeNameMap[t] || t}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-2 flex-shrink-0"></div>

            <div className="flex items-center flex-1 min-w-0 overflow-hidden gap-2">
                <span className="text-sm font-medium flex-shrink-0">手動描画:</span>
                <div className="flex gap-1 overflow-x-auto scrollbar-hide min-w-0 w-full items-center">
                    {Object.values(AreaTypeEnum).map(type => (
                        <button
                            key={type}
                            onClick={() => setActiveTool(type)}
                            style={{
                                borderColor: areaTypeColors[type].hex,
                                color: activeTool === type ? 'white' : areaTypeColors[type].hex,
                                backgroundColor: activeTool === type ? areaTypeColors[type].hex : ''
                            }}
                            className={`px-2 py-1 text-xs rounded-md border-2 whitespace-nowrap flex-shrink-0 ${activeTool !== type ? 'bg-white dark:bg-slate-700' : ''}`}
                        >
                            {typeNameMap[type] || type}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><ZoomOutIcon className="w-5 h-5"/></button>
                <span className="text-sm w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
                 <button onClick={() => onZoomChange(Math.min(3, zoom + 0.1))} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><ZoomInIcon className="w-5 h-5"/></button>
            </div>
        </div>
    );
};
