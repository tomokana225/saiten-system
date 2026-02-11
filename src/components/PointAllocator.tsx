
import React, { useState, useEffect, useMemo } from 'react';
import type { Area, Point, Template } from '../types';
import { AreaType } from '../types';
import { SparklesIcon, SpinnerIcon, EyeIcon, EyeOffIcon, CheckCircle2Icon, CopyIcon } from './icons';
import { useProject } from '../context/ProjectContext';
import { AnswerSnippet } from './AnswerSnippet';

const answerAndMarkSheetAreas = (areas: Area[]) => areas.filter(a => a.type === AreaType.ANSWER || a.type === AreaType.MARK_SHEET);

export const PointAllocator = () => {
    const { activeProject, handlePointsChange } = useProject();
    const { areas, points, template } = activeProject!;

    const relevantAreas = useMemo(() => answerAndMarkSheetAreas(areas), [areas]);
    const subtotalAreas = useMemo(() => areas.filter(a => a.type === AreaType.SUBTOTAL), [areas]);
    const questionNumberAreas = useMemo(() => areas.filter(a => a.type === AreaType.QUESTION_NUMBER), [areas]);
    const alignmentAreas = useMemo(() => areas.filter(a => a.type === AreaType.ALIGNMENT_MARK || a.type === AreaType.MARKSHEET_REF_RIGHT || a.type === AreaType.MARKSHEET_REF_BOTTOM), [areas]);
    
    const [isDetecting, setIsDetecting] = useState(false);
    const [showImages, setShowImages] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // State for Bulk Editing
    const [bulkPoints, setBulkPoints] = useState<string>('');
    const [bulkChoices, setBulkChoices] = useState<string>('');

    const [internalPoints, setInternalPoints] = useState<Point[]>(() => {
        return relevantAreas.map(area => {
            const existingPoint = points.find(p => p.id === area.id);
            if (existingPoint) return existingPoint;
            const basePoint = { id: area.id, points: 10, label: area.name, subtotalIds: [] as number[] };
            if (area.type === AreaType.MARK_SHEET) {
                return { ...basePoint, markSheetOptions: 4, markSheetLayout: 'horizontal' as const, correctAnswerIndex: 0 };
            }
            return basePoint;
        });
    });
    
    useEffect(() => {
        handlePointsChange(internalPoints);
    }, [internalPoints, handlePointsChange]);
    
    const handleAutoDetectAnswers = async () => {
        if (!template) return;
        setIsDetecting(true);
        try {
            const markSheetPoints = internalPoints.filter(p => areas.find(a => a.id === p.id)?.type === AreaType.MARK_SHEET);
            if (markSheetPoints.length === 0) { setIsDetecting(false); return; }

            const updatedPoints = [...internalPoints];
            let detectedCount = 0;
            const templatePages = template.pages || (template.filePath ? [{ imagePath: template.filePath }] : []);

            for (const point of markSheetPoints) {
                const area = areas.find(a => a.id === point.id)!;
                const pageIdx = area.pageIndex || 0;
                const pageImage = templatePages[pageIdx]?.imagePath;
                if (!pageImage) continue;

                const result = await window.electronAPI.invoke('get-image-details', pageImage);
                if (!result.success || !result.details?.url) continue;

                const img = new Image();
                img.src = result.details.url;
                await new Promise(r => img.onload = r);
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
                ctx.drawImage(img, 0, 0);

                const data = ctx.getImageData(area.x, area.y, area.width, area.height).data;
                const options = point.markSheetOptions || 4;
                const isHorizontal = point.markSheetLayout === 'horizontal';
                const segmentWidth = isHorizontal ? area.width / options : area.width;
                const segmentHeight = isHorizontal ? area.height : area.height / options;
                const darknessScores = Array(options).fill(0);

                for (let i = 0; i < options; i++) {
                    const xStart = isHorizontal ? i * segmentWidth : 0;
                    const yStart = isHorizontal ? 0 : i * segmentHeight;
                    let darkSum = 0;
                    for (let y = Math.floor(yStart + segmentHeight * 0.2); y < yStart + segmentHeight * 0.8; y++) {
                        for (let x = Math.floor(xStart + segmentWidth * 0.2); x < xStart + segmentWidth * 0.8; x++) {
                            const idx = (y * Math.floor(area.width) + x) * 4;
                            darkSum += (255 - (0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2]));
                        }
                    }
                    darknessScores[i] = darkSum;
                }

                const winner = darknessScores.indexOf(Math.max(...darknessScores));
                if (Math.max(...darknessScores) > 1000) {
                    const idx = updatedPoints.findIndex(p => p.id === point.id);
                    updatedPoints[idx] = { ...updatedPoints[idx], correctAnswerIndex: winner };
                    detectedCount++;
                }
            }
            setInternalPoints(updatedPoints);
            alert(`${detectedCount}件のマークシートの正解を自動認識しました。`);
        } catch (error) { console.error(error); } finally { setIsDetecting(false); }
    };

    const handlePointPropChange = (id: number, field: keyof Point, value: any) => {
        setInternalPoints(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleSubtotalChange = (pointId: number, subtotalAreaId: number, isChecked: boolean) => {
        setInternalPoints(prevPoints => 
            prevPoints.map(p => {
                if (p.id === pointId) {
                    const currentIds = p.subtotalIds || [];
                    if (isChecked) return { ...p, subtotalIds: [...new Set([...currentIds, subtotalAreaId])] };
                    else return { ...p, subtotalIds: currentIds.filter(id => id !== subtotalAreaId) };
                }
                return p;
            })
        );
    };

    // Bulk Operations
    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === internalPoints.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(internalPoints.map(p => p.id)));
    };

    const applyBulkPoints = () => {
        const pts = parseInt(bulkPoints);
        if (isNaN(pts)) return;
        setInternalPoints(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, points: pts } : p));
    };

    const applyBulkChoices = () => {
        const ch = parseInt(bulkChoices);
        if (isNaN(ch)) return;
        setInternalPoints(prev => prev.map(p => {
            if (!selectedIds.has(p.id)) return p;
            const area = relevantAreas.find(a => a.id === p.id);
            if (area?.type === AreaType.MARK_SHEET) {
                return { ...p, markSheetOptions: ch };
            }
            return p;
        }));
    };

    const grandTotal = useMemo(() => internalPoints.reduce((sum, p) => sum + (p.points || 0), 0), [internalPoints]);

    return (
        <div className="w-full h-full flex flex-col relative overflow-hidden">
            <div className="flex-shrink-0 flex justify-between items-center mb-4 px-1">
                <div className="flex items-center gap-4">
                    <h3 className="text-xl font-semibold">解答欄への配点設定</h3>
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer hover:bg-slate-300 transition-colors">
                        <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === internalPoints.length} onChange={toggleSelectAll} className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500" />
                        <span className="text-sm font-bold">すべて選択</span>
                    </label>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowImages(!showImages)} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-slate-300">
                        {showImages ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                        {showImages ? '画像を隠す' : '画像を表示'}
                    </button>
                    <button onClick={handleAutoDetectAnswers} disabled={isDetecting} className="flex items-center gap-2 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50">
                        {isDetecting ? <SpinnerIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />}
                        マークの正解を自動認識
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md pb-32">
                <div className="space-y-4">
                {internalPoints.map((point) => {
                    const area = relevantAreas.find(a => a.id === point.id);
                    if (!area) return null;
                    const imageSrc = template?.pages?.[area.pageIndex || 0]?.imagePath || template?.filePath;
                    const isSelected = selectedIds.has(point.id);
                    return (
                    <div 
                        key={point.id} 
                        className={`p-4 rounded-lg shadow-sm border transition-all ${isSelected ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-400 ring-2 ring-sky-400/20' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                        onClick={() => toggleSelect(point.id)}
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(point.id)} onClick={e => e.stopPropagation()} className="w-5 h-5 rounded text-sky-600 focus:ring-sky-500" />
                            <div className="font-bold text-slate-700 dark:text-slate-300">{point.label}</div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 font-bold uppercase tracking-wider">{area.type}</span>
                        </div>
                        {showImages && imageSrc && (
                            <div className="mb-4 h-24 w-full bg-slate-100 dark:bg-slate-900 rounded-md overflow-hidden relative border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                                <AnswerSnippet imageSrc={imageSrc} area={area} template={template} pannable={true} />
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" onClick={e => e.stopPropagation()}>
                            <div className="space-y-1"><label className="text-xs font-bold text-slate-500">配点</label><input type="number" min="0" value={point.points} onChange={(e) => handlePointPropChange(point.id, 'points', parseInt(e.target.value) || 0)} className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded p-2 text-sm" /></div>
                            {area.type === AreaType.MARK_SHEET && (
                                <>
                                    <div className="space-y-1"><label className="text-xs font-bold text-slate-500">選択肢数</label><input type="number" min="2" max="10" value={point.markSheetOptions || 4} onChange={e => handlePointPropChange(point.id, 'markSheetOptions', parseInt(e.target.value) || 2)} className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded p-2 text-sm" /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-slate-500">正解 (0 = A)</label><input type="number" min="0" value={point.correctAnswerIndex || 0} onChange={e => handlePointPropChange(point.id, 'correctAnswerIndex', parseInt(e.target.value) || 0)} className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded p-2 text-sm" /></div>
                                </>
                            )}
                        </div>
                    </div>
                )})}
                </div>
            </div>

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white p-3 rounded-2xl shadow-2xl flex items-center gap-6 z-50 border border-slate-600 animate-in slide-in-from-bottom-4">
                    <div className="flex items-center gap-2 px-2 py-1 bg-slate-700 rounded-lg">
                        <span className="text-xs font-bold text-slate-400">選択中:</span>
                        <span className="text-sm font-black">{selectedIds.size}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-300">配点:</span>
                        <input type="number" placeholder="-" className="w-16 p-1 text-black rounded text-sm font-bold" value={bulkPoints} onChange={e => setBulkPoints(e.target.value)} />
                        <button onClick={applyBulkPoints} className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded-md text-xs font-bold transition-colors">適用</button>
                    </div>
                    <div className="w-px h-6 bg-slate-600"></div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-300">選択肢数:</span>
                        <input type="number" placeholder="-" className="w-12 p-1 text-black rounded text-sm font-bold" value={bulkChoices} onChange={e => setBulkChoices(e.target.value)} />
                        <button onClick={applyBulkChoices} className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded-md text-xs font-bold transition-colors">適用</button>
                    </div>
                </div>
            )}

            <div className="flex-shrink-0 mt-4 p-4 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <div className="flex gap-4">
                     {subtotalAreas.map(sa => {
                         const subSum = internalPoints.filter(p => p.subtotalIds?.includes(sa.id)).reduce((acc, curr) => acc + (curr.points || 0), 0);
                         return <div key={sa.id} className="text-sm"><span className="text-slate-500">{sa.name}:</span> <span className="font-bold">{subSum}点</span></div>;
                     })}
                </div>
                <p className="text-2xl font-black text-sky-600 dark:text-sky-400">合計満点: {grandTotal} 点</p>
            </div>
        </div>
    );
};
