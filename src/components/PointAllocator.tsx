
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
    const [bulkLayout, setBulkLayout] = useState<'horizontal' | 'vertical'>('horizontal');

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

    const grandTotal = useMemo(() => internalPoints.reduce((sum, p) => sum + (p.points || 0), 0), [internalPoints]);

    return (
        <div className="w-full h-full flex flex-col h-full relative">
            <div className="flex-shrink-0 flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">解答欄への配点設定</h3>
                <div className="flex gap-2">
                    <button onClick={() => setShowImages(!showImages)} className="px-3 py-2 text-sm bg-slate-200 rounded-md">
                        {showImages ? '画像を隠す' : '画像を表示'}
                    </button>
                    <button onClick={handleAutoDetectAnswers} disabled={isDetecting} className="flex items-center gap-2 px-3 py-2 text-sm bg-teal-600 text-white rounded-md">
                        {isDetecting ? <SpinnerIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />}
                        自動認識
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md pb-24">
                <div className="space-y-4">
                {internalPoints.map((point) => {
                    const area = relevantAreas.find(a => a.id === point.id);
                    if (!area) return null;
                    const imageSrc = template?.pages?.[area.pageIndex || 0]?.imagePath || template?.filePath;
                    return (
                    <div key={point.id} className="p-4 rounded-lg shadow-sm border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="font-bold text-slate-700 dark:text-slate-300">{point.label}</div>
                            <span className="text-xs px-2 py-1 rounded-full bg-slate-200 dark:bg-slate-700">{area.type}</span>
                        </div>
                        {showImages && imageSrc && (
                            <div className="mb-4 h-24 w-full bg-slate-100 dark:bg-slate-900 rounded-md overflow-hidden relative">
                                <AnswerSnippet imageSrc={imageSrc} area={area} template={template} pannable={true} />
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1"><label className="text-xs text-slate-500">配点</label><input type="number" min="0" value={point.points} onChange={(e) => handlePointPropChange(point.id, 'points', parseInt(e.target.value) || 0)} className="w-full bg-white dark:bg-slate-700 border border-slate-300 rounded p-2 text-sm" /></div>
                            {area.type === AreaType.MARK_SHEET && (
                                <>
                                    <div className="space-y-1"><label className="text-xs text-slate-500">選択肢数</label><input type="number" min="2" max="10" value={point.markSheetOptions || 4} onChange={e => handlePointPropChange(point.id, 'markSheetOptions', parseInt(e.target.value) || 2)} className="w-full bg-white dark:bg-slate-700 border border-slate-300 rounded p-2 text-sm" /></div>
                                    <div className="space-y-1"><label className="text-xs text-slate-500">正解(0-)</label><input type="number" min="0" value={point.correctAnswerIndex || 0} onChange={e => handlePointPropChange(point.id, 'correctAnswerIndex', parseInt(e.target.value) || 0)} className="w-full bg-white dark:bg-slate-700 border border-slate-300 rounded p-2 text-sm" /></div>
                                    <div className="col-span-3 grid grid-cols-2 gap-4 mt-2 p-3 bg-slate-50 dark:bg-slate-900/30 rounded border">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">縦基準点</label>
                                            <select value={point.markRefRightAreaId || ''} onChange={e => handlePointPropChange(point.id, 'markRefRightAreaId', e.target.value ? parseInt(e.target.value) : undefined)} className="w-full bg-white dark:bg-slate-800 border rounded p-1 text-[11px]">
                                                <option value="">(均等分割)</option>
                                                {alignmentAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">横基準点</label>
                                            <select value={point.markRefBottomAreaId || ''} onChange={e => handlePointPropChange(point.id, 'markRefBottomAreaId', e.target.value ? parseInt(e.target.value) : undefined)} className="w-full bg-white dark:bg-slate-800 border rounded p-1 text-[11px]">
                                                <option value="">(均等分割)</option>
                                                {alignmentAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )})}
                </div>
            </div>
            <div className="flex-shrink-0 mt-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg flex justify-end">
                <p className="text-xl font-bold">合計点: {grandTotal} 点</p>
            </div>
        </div>
    );
};
