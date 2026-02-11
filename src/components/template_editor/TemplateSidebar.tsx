
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Area, Template } from '../../types';
import { AreaType, AreaType as AreaTypeEnum } from '../../types';
// FIX: Added SpinnerIcon to imports
import { SparklesIcon, Trash2Icon, InfoIcon, ChevronDownIcon, ChevronUpIcon, SettingsIcon, Undo2Icon, Redo2Icon, Wand2Icon, SpinnerIcon } from '../icons';
import { findAlignmentMarks } from '../../utils';
import { DetectionSettings } from '../TemplateEditor';

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
    [AreaTypeEnum.MARKSHEET_REF_RIGHT]: { hex: '#f97316', bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-800 dark:text-orange-300', hover: 'hover:bg-orange-200/50 dark:hover:bg-orange-800/50' },
    [AreaTypeEnum.MARKSHEET_REF_BOTTOM]: { hex: '#d946ef', bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/50', text: 'text-fuchsia-800 dark:text-fuchsia-300', hover: 'hover:bg-fuchsia-200/50 dark:hover:bg-fuchsia-800/50' },
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
    detSettings: DetectionSettings;
    setDetSettings: React.Dispatch<React.SetStateAction<DetectionSettings>>;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

export const TemplateSidebar: React.FC<TemplateSidebarProps> = ({ 
    areas, setAreas, selectedAreaIds, setSelectedAreaIds, apiKey, template, onTemplateChange, 
    detSettings, setDetSettings, undo, redo, canUndo, canRedo 
}) => {
    const [isDetecting, setIsDetecting] = useState(false);
    const [isOptionsExpanded, setIsOptionsExpanded] = useState(false);
    const listContainerRef = useRef<HTMLDivElement>(null);
    
    const handleDetectAlignmentMarks = async () => {
        setIsDetecting(true);
        try {
            const pageIndex = 0; // Currently assumes detection on page 1
            const imagePath = template.pages?.[pageIndex]?.imagePath || template.filePath;
            
            const result = await window.electronAPI.invoke('get-image-details', imagePath);
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

            // Pass user settings to the detection algorithm
            const marks = findAlignmentMarks(imageData, {
                minSize: detSettings.minSize,
                threshold: detSettings.threshold,
                padding: detSettings.padding
            });

            if (marks) {
                const existingMarkIds = new Set(areas.filter(a => a.type === AreaType.ALIGNMENT_MARK).map(a => a.id));
                const newAreas = areas.filter(a => a.type !== AreaType.ALIGNMENT_MARK);
                // Mark display size: use the actual minSize setting or proportional
                const markSize = Math.max(detSettings.minSize, Math.min(img.naturalWidth, img.naturalHeight) * 0.03);

                const markAreas: Area[] = [
                    { id: Date.now(), name: '基準TL', type: AreaType.ALIGNMENT_MARK, x: marks.tl.x - markSize/2, y: marks.tl.y - markSize/2, width: markSize, height: markSize, pageIndex: 0 },
                    { id: Date.now()+1, name: '基準TR', type: AreaType.ALIGNMENT_MARK, x: marks.tr.x - markSize/2, y: marks.tr.y - markSize/2, width: markSize, height: markSize, pageIndex: 0 },
                    { id: Date.now()+2, name: '基準BR', type: AreaType.ALIGNMENT_MARK, x: marks.br.x - markSize/2, y: marks.br.y - markSize/2, width: markSize, height: markSize, pageIndex: 0 },
                    { id: Date.now()+3, name: '基準BL', type: AreaType.ALIGNMENT_MARK, x: marks.bl.x - markSize/2, y: marks.bl.y - markSize/2, width: markSize, height: markSize, pageIndex: 0 },
                ];

                setAreas([...newAreas, ...markAreas]);
                onTemplateChange({ alignmentMarkIdealCorners: marks });
                alert(`${markAreas.length}個の基準マークを検出しました。`);
            } else {
                alert('基準マークを検出できませんでした。「詳細設定」の「感度」や「最小サイズ」を調整してみてください。');
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

    // Keep selected item in view after list re-orders
    useEffect(() => {
        if (selectedAreaIds.size === 1) {
            const selectedId = Array.from(selectedAreaIds)[0];
            const element = listContainerRef.current?.querySelector(`[data-area-id="${selectedId}"]`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [sortedAreas, selectedAreaIds]);


    return (
        <aside className="w-80 flex-shrink-0 flex flex-col gap-4 bg-white dark:bg-slate-800 p-4 rounded-lg shadow h-full overflow-hidden">
            <h3 className="text-lg font-semibold border-b pb-2 dark:border-slate-700 flex justify-between items-center">
                <span>領域設定</span>
                <div className="flex gap-1">
                    <button onClick={undo} disabled={!canUndo} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30" title="元に戻す"><Undo2Icon className="w-4 h-4"/></button>
                    <button onClick={redo} disabled={!canRedo} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30" title="やり直す"><Redo2Icon className="w-4 h-4"/></button>
                </div>
            </h3>

            <div className="space-y-3">
                {/* Standard Sized Detection Button */}
                <button
                    onClick={handleDetectAlignmentMarks}
                    disabled={isDetecting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50 font-bold text-sm"
                >
                    {isDetecting ? <SpinnerIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />}
                    <span>基準マークを自動検出</span>
                </button>

                {/* Collapsible Detection Options */}
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button 
                        onClick={() => setIsOptionsExpanded(!isOptionsExpanded)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <SettingsIcon className="w-3.5 h-3.5" />
                            認識精度の詳細設定
                        </div>
                        {isOptionsExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                    </button>
                    
                    {isOptionsExpanded && (
                        <div className="p-3 space-y-4 border-t border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-1 duration-200">
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px]">
                                    <label className="font-bold text-slate-600 dark:text-slate-400">マークの最小サイズ</label>
                                    <span className="text-sky-600 font-mono">{detSettings.minSize}px</span>
                                </div>
                                <input 
                                    type="range" min="5" max="100" value={detSettings.minSize} 
                                    onChange={e => setDetSettings({...detSettings, minSize: parseInt(e.target.value)})}
                                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                                />
                                <p className="text-[9px] text-slate-400">これより小さい塊を無視します</p>
                            </div>
                            
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px]">
                                    <label className="font-bold text-slate-600 dark:text-slate-400">感度 (閾値)</label>
                                    <span className="text-sky-600 font-mono">{detSettings.threshold}</span>
                                </div>
                                <input 
                                    type="range" min="50" max="240" value={detSettings.threshold} 
                                    onChange={e => setDetSettings({...detSettings, threshold: parseInt(e.target.value)})}
                                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                                />
                                <p className="text-[9px] text-slate-400">値が大きいほど、薄いマークも拾います</p>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px]">
                                    <label className="font-bold text-slate-600 dark:text-slate-400">検出の余白</label>
                                    <span className="text-sky-600 font-mono">{detSettings.padding}px</span>
                                </div>
                                <input 
                                    type="range" min="-10" max="20" value={detSettings.padding} 
                                    onChange={e => setDetSettings({...detSettings, padding: parseInt(e.target.value)})}
                                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                                />
                                <p className="text-[9px] text-slate-400">検出された枠の拡張/縮小</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-between items-center mt-2">
                <h4 className="font-semibold flex items-center gap-2">
                    <InfoIcon className="w-4 h-4 text-slate-400" />
                    領域一覧 ({areas.length})
                </h4>
                <button onClick={handleDeleteSelected} disabled={selectedAreaIds.size === 0} className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors" title="選択した領域を削除">
                    <Trash2Icon className="w-5 h-5" />
                </button>
            </div>

            <div ref={listContainerRef} className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1 scrollbar-thin">
                {sortedAreas.map(area => {
                    const colors = areaTypeColors[area.type] || fallbackColor;
                    const isSelected = selectedAreaIds.has(area.id);
                    return (
                        <div
                            key={area.id}
                            data-area-id={area.id}
                            onClick={() => setSelectedAreaIds(new Set([area.id]))}
                            className={`group p-2.5 rounded-xl cursor-pointer border-2 transition-all ${isSelected ? 'bg-white dark:bg-slate-700 border-sky-500 shadow-md ring-2 ring-sky-500/20' : `bg-slate-50 dark:bg-slate-900 border-transparent hover:border-slate-200 dark:hover:border-slate-700`}`}
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.hex }} />
                                    <input
                                        type="text"
                                        value={area.name}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            handleAreaChange(area.id, 'name', e.target.value);
                                        }}
                                        className="font-bold bg-transparent border-none focus:ring-0 p-0 outline-none w-full text-xs truncate"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                                <span className="text-[10px] font-mono text-slate-400">{Math.round(area.width)}x{Math.round(area.height)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <select
                                    value={area.type}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handleAreaChange(area.id, 'type', e.target.value)}
                                    className="text-[10px] py-0.5 px-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 font-medium text-slate-600 dark:text-slate-300"
                                >
                                    {Object.values(AreaTypeEnum).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                {isSelected && (
                                    <div className="flex gap-1">
                                        <button onClick={(e) => {e.stopPropagation(); handleAreaChange(area.id, 'name', `${area.name} (コピー)`); }} className="p-1 text-slate-400 hover:text-sky-500"><SettingsIcon className="w-3 h-3"/></button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                {areas.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 opacity-60">
                        <Wand2Icon className="w-12 h-12 mb-2" />
                        <p className="text-xs text-center">枠をクリックするか<br/>自動検出ボタンを押してください</p>
                    </div>
                )}
            </div>
        </aside>
    );
};
