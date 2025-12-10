import React, { useState, useMemo } from 'react';
import type { Area, Template } from '../../types';
import { AreaType, AreaType as AreaTypeEnum } from '../../types';
import { SparklesIcon, Trash2Icon, InfoIcon } from '../icons';
import { findAlignmentMarks } from '../../utils';

export const areaTypeColors: { [key in AreaType]: { hex: string; bg: string; text: string; hover: string } } = {
    [AreaTypeEnum.ANSWER]: { hex: '#3b82f6', bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-800 dark:text-blue-300', hover: 'hover:bg-blue-200/50 dark:hover:bg-blue-800/50' },
    [AreaTypeEnum.NAME]: { hex: '#16a34a', bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-800 dark:text-green-300', hover: 'hover:bg-green-200/50 dark:hover:bg-green-800/50' },
    [AreaTypeEnum.SUBTOTAL]: { hex: '#ea580c', bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-800 dark:text-orange-300', hover: 'hover:bg-orange-200/50 dark:hover:bg-orange-800/50' },
    [AreaTypeEnum.TOTAL]: { hex: '#c026d3', bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/50', text: 'text-fuchsia-800 dark:text-fuchsia-300', hover: 'hover:bg-fuchsia-200/50 dark:hover:bg-fuchsia-800/50' },
    [AreaTypeEnum.MARK_SHEET]: { hex: '#14b8a6', bg: 'bg-teal-100 dark:bg-teal-900/50', text: 'text-teal-800 dark:text-teal-300', hover: 'hover:bg-teal-200/50 dark:hover:bg-teal-800/50' },
    [AreaTypeEnum.QUESTION_NUMBER]: { hex: '#64748b', bg: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-800 dark:text-slate-300', hover: 'hover:bg-slate-300/50 dark:hover:bg-slate-600/50' },
    [AreaTypeEnum.ALIGNMENT_MARK]: { hex: '#ef4444', bg: 'bg-red-200 dark:bg-red-700', text: 'text-red-800 dark:text-red-300', hover: 'hover:bg-red-300/50 dark:hover:bg-red-600/50' },
    [AreaTypeEnum.STUDENT_ID_MARK]: { hex: '#8b5cf6', bg: 'bg-violet-200 dark:bg-violet-700', text: 'text-violet-800 dark:text-violet-300', hover: 'hover:bg-violet-300/50 dark:hover:bg-violet-600/50' },
    [AreaTypeEnum.STUDENT_ID_REF_RIGHT]: { hex: '#ec4899', bg: 'bg-pink-200 dark:bg-pink-700', text: 'text-pink-800 dark:text-pink-300', hover: 'hover:bg-pink-300/50 dark:hover:bg-pink-600/50' },
    [AreaTypeEnum.STUDENT_ID_REF_BOTTOM]: { hex: '#06b6d4', bg: 'bg-cyan-200 dark:bg-cyan-700', text: 'text-cyan-800 dark:text-cyan-300', hover: 'hover:bg-cyan-300/50 dark:hover:bg-cyan-600/50' },
};

const fallbackColor = areaTypeColors[AreaTypeEnum.QUESTION_NUMBER];

interface TemplateSidebarProps {
    areas: Area[];
    setAreas: (areas: Area[]) => void;
    selectedAreaIds: Set<number>;
    setSelectedAreaIds: (ids: Set<number>) => void;
    apiKey: string;
    template: Template;
    onTemplateChange: (templateUpdates: Partial<Template>) => void;
}

export const TemplateSidebar: React.FC<TemplateSidebarProps> = ({ areas, setAreas, selectedAreaIds, setSelectedAreaIds, apiKey, template, onTemplateChange }) => {
    const [isDetecting, setIsDetecting] = useState(false);
    
    const handleDetectAlignmentMarks = async () => {
        setIsDetecting(true);
        try {
            const result = await window.electronAPI.invoke('get-image-details', template.filePath);
            if (!result.success || !result.details?.url) {
                throw new Error(result.error || 'Failed to get template image for alignment mark detection.');
            }
            const dataUrl = result.details.url;
            const img = new Image();
            img.src = dataUrl;
            await img.decode();

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not get canvas context");
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const marks = findAlignmentMarks(imageData);

            if (marks) {
                const existingMarkIds = new Set(areas.filter(a => a.type === AreaType.ALIGNMENT_MARK).map(a => a.id));
                const newAreas = areas.filter(a => a.type !== AreaType.ALIGNMENT_MARK);
                const markSize = Math.min(template.width, template.height) * 0.05;

                const markAreas: Area[] = [
                    { id: Date.now(), name: '基準マーク TL', type: AreaType.ALIGNMENT_MARK, x: marks.tl.x - markSize/2, y: marks.tl.y - markSize/2, width: markSize, height: markSize },
                    { id: Date.now()+1, name: '基準マーク TR', type: AreaType.ALIGNMENT_MARK, x: marks.tr.x - markSize/2, y: marks.tr.y - markSize/2, width: markSize, height: markSize },
                    { id: Date.now()+2, name: '基準マーク BR', type: AreaType.ALIGNMENT_MARK, x: marks.br.x - markSize/2, y: marks.br.y - markSize/2, width: markSize, height: markSize },
                    { id: Date.now()+3, name: '基準マーク BL', type: AreaType.ALIGNMENT_MARK, x: marks.bl.x - markSize/2, y: marks.bl.y - markSize/2, width: markSize, height: markSize },
                ];

                setAreas([...newAreas, ...markAreas]);
                onTemplateChange({ alignmentMarkIdealCorners: marks });
                alert(`${markAreas.length}個の基準マークを検出しました。`);
            } else {
                alert('基準マークを検出できませんでした。画像の四隅に明確な黒い四角形があるか確認してください。');
            }
        } catch (error) {
            console.error("Error detecting alignment marks:", error);
            alert(`エラーが発生しました: ${error.message}`);
        } finally {
            setIsDetecting(false);
        }
    };

    const handleAreaChange = (id: number, field: 'name' | 'type', value: string) => {
        const newAreas = areas.map(area => {
            if (area.id === id) {
                const updatedArea = { ...area, [field]: value };
                if (updatedArea.type === AreaTypeEnum.MARK_SHEET) {
                    const match = updatedArea.name.match(/\d+/);
                    updatedArea.questionNumber = match ? parseInt(match[0], 10) : undefined;
                } else {
                    delete updatedArea.questionNumber;
                }
                return updatedArea;
            }
            return area;
        });
        setAreas(newAreas);
    };

    const handleDeleteSelected = () => {
        const newAreas = areas.filter(a => !selectedAreaIds.has(a.id));
        setAreas(newAreas);
        setSelectedAreaIds(new Set());
    };
    
    const sortedAreas = useMemo(() => {
        const markSheets = areas
            .filter(a => a.type === AreaTypeEnum.MARK_SHEET)
            .sort((a, b) => (a.questionNumber ?? Infinity) - (b.questionNumber ?? Infinity));
    
        const otherAreas = areas.filter(a => a.type !== AreaTypeEnum.MARK_SHEET);
        
        return [...markSheets, ...otherAreas];
    }, [areas]);


    return (
        <aside className="w-80 flex-shrink-0 flex flex-col gap-4 bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold border-b pb-2 dark:border-slate-700">領域設定</h3>
            <div className="space-y-2">
                <button
                    onClick={handleDetectAlignmentMarks}
                    disabled={isDetecting}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 disabled:bg-slate-400"
                >
                    <SparklesIcon className="w-4 h-4" />
                    {isDetecting ? '検出中...' : '基準マークを自動検出'}
                </button>
            </div>
            <div className="flex justify-between items-center">
                <h4 className="font-semibold">領域一覧</h4>
                <button onClick={handleDeleteSelected} disabled={selectedAreaIds.size === 0} className="p-1 rounded-full text-slate-400 hover:text-red-500 disabled:opacity-50">
                    <Trash2Icon className="w-5 h-5" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 -mr-2">
                {sortedAreas.map(area => {
                    const colors = areaTypeColors[area.type] || fallbackColor;
                    return (
                        <div
                            key={area.id}
                            onClick={() => setSelectedAreaIds(new Set([area.id]))}
                            className={`p-2 rounded-md cursor-pointer border-l-4 ${selectedAreaIds.has(area.id) ? 'bg-slate-100 dark:bg-slate-700' : ''} ${colors.hover}`}
                            style={{ borderLeftColor: colors.hex }}
                        >
                            <div className="flex items-center justify-between">
                                <input
                                    type="text"
                                    value={area.name}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        handleAreaChange(area.id, 'name', e.target.value);
                                    }}
                                    className="font-medium bg-transparent border-b border-transparent focus:border-slate-300 outline-none w-full text-sm"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                            <div className="flex justify-between items-center mt-1">
                                <select
                                    value={area.type}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handleAreaChange(area.id, 'type', e.target.value)}
                                    className="text-xs p-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800"
                                >
                                    {Object.values(AreaTypeEnum).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <span className="text-xs text-slate-400">{Math.round(area.width)}x{Math.round(area.height)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
};