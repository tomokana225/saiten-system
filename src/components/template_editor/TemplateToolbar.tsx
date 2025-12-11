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
}

export const TemplateToolbar: React.FC<TemplateToolbarProps> = ({ activeTool, setActiveTool, zoom, onZoomChange }) => {
    return (
        <div className="flex-shrink-0 flex justify-between items-center bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
            <div className="flex items-center gap-2">
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
                <button
                    onClick={() => setActiveTool('magic-wand')}
                    className={`p-2 rounded-md ${activeTool === 'magic-wand' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-700'}`}
                    title="枠内をクリックして自動認識"
                >
                    <Wand2Icon className="w-5 h-5" />
                </button>

                <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-2"></div>

                <span className="text-sm font-medium mr-2">領域作成:</span>
                {Object.values(AreaTypeEnum).map(type => (
                    <button
                        key={type}
                        onClick={() => setActiveTool(type)}
                        style={{
                            borderColor: areaTypeColors[type].hex,
                            color: activeTool === type ? 'white' : areaTypeColors[type].hex,
                            backgroundColor: activeTool === type ? areaTypeColors[type].hex : ''
                        }}
                        className={`px-2 py-1 text-xs rounded-md border-2 ${activeTool !== type ? 'bg-white dark:bg-slate-700' : ''}`}
                    >
                        {type}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><ZoomOutIcon className="w-5 h-5"/></button>
                <span className="text-sm w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
                 <button onClick={() => onZoomChange(Math.min(3, zoom + 0.1))} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><ZoomInIcon className="w-5 h-5"/></button>
            </div>
        </div>
    );
};