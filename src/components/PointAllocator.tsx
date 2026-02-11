
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
    const alignmentAreas = useMemo(() => areas.filter(a => a.type === AreaType.ALIGNMENT_MARK), [areas]);
    
    const [isDetecting, setIsDetecting] = useState(false);
    const [showImages, setShowImages] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // State for Bulk Editing
    const [bulkPoints, setBulkPoints] = useState<string>('');
    const [bulkChoices, setBulkChoices] = useState<string>('');
    const [bulkLayout, setBulkLayout] = useState<'horizontal' | 'vertical'>('horizontal');

    const [internalPoints, setInternalPoints] = useState<Point[]>(() => {
        const initialPoints = relevantAreas.map(area => {
            const existingPoint = points.find(p => p.id === area.id);
            if (existingPoint) return existingPoint;
            const basePoint = { id: area.id, points: 10, label: area.name, subtotalIds: [] as number[] };
            if (area.type === AreaType.MARK_SHEET) {
                return { ...basePoint, markSheetOptions: 4, markSheetLayout: 'horizontal' as const, correctAnswerIndex: 0 };
            }
            return basePoint;
        });
        return initialPoints.filter(p => relevantAreas.some(a => a.id === p.id));
    });
    
    useEffect(() => {
        setInternalPoints(prevPoints => {
            return relevantAreas.map(area => {
                const existingPoint = prevPoints.find(p => p.id === area.id);
                if (existingPoint) {
                    if (area.type !== AreaType.MARK_SHEET && existingPoint.markSheetOptions !== undefined) {
                        const { markSheetOptions, markSheetLayout, correctAnswerIndex, ...rest } = existingPoint;
                        return rest;
                    }
                    if (area.type === AreaType.MARK_SHEET && existingPoint.markSheetOptions === undefined) {
                        return { ...existingPoint, markSheetOptions: 4, markSheetLayout: 'horizontal' as const, correctAnswerIndex: 0 };
                    }
                    return existingPoint;
                }
                const basePoint = { id: area.id, points: 10, label: area.name, subtotalIds: [] as number[] };
                if (area.type === AreaType.MARK_SHEET) {
                     return { ...basePoint, markSheetOptions: 4, markSheetLayout: 'horizontal' as const, correctAnswerIndex: 0 };
                }
                return basePoint;
            });
        });
    }, [relevantAreas]);

    useEffect(() => {
        handlePointsChange(internalPoints);
    }, [internalPoints, handlePointsChange]);
    
    const handleAutoDetectAnswers = async () => {
        if (!template) return;
        setIsDetecting(true);
        try {
            const markSheetPoints = internalPoints.filter(p => {
                const area = areas.find(a => a.id === p.id);
                return area?.type === AreaType.MARK_SHEET;
            });

            if (markSheetPoints.length === 0) {
                alert('マークシート形式の問題がありません。');
                setIsDetecting(false);
                return;
            }

            const updatedPoints = [...internalPoints];
            let detectedCount = 0;
            
            const pointsByPage: Record<number, Point[]> = {};
            markSheetPoints.forEach(p => {
                const area = areas.find(a => a.id === p.id);
                const pIdx = area?.pageIndex || 0;
                if (!pointsByPage[pIdx]) pointsByPage[pIdx] = [];
                pointsByPage[pIdx].push(p);
            });

            const templatePages = template.pages || (template.filePath ? [{ imagePath: template.filePath }] : []);

            for (const [pageIdxStr, pointsOnPage] of Object.entries(pointsByPage)) {
                const pageIdx = parseInt(pageIdxStr, 10);
                const pageImage = templatePages[pageIdx]?.imagePath;
                if (!pageImage) continue;

                const result = await window.electronAPI.invoke('get-image-details', pageImage);
                if (!result.success || !result.details?.url) continue;

                const img = new Image();
                img.src = result.details.url;
                await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
                
                const mainCanvas = document.createElement('canvas');
                mainCanvas.width = img.naturalWidth;
                mainCanvas.height = img.naturalHeight;
                const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
                if (!mainCtx) continue;
                mainCtx.drawImage(img, 0, 0);

                for (const point of pointsOnPage) {
                    const area = areas.find(a => a.id === point.id)!;
                    let sx = Math.floor(area.x); let sy = Math.floor(area.y); let sw = Math.floor(area.width); let sh = Math.floor(area.height);

                    if (sw <= 0 || sh <= 0) continue;

                    const imageData = mainCtx.getImageData(sx, sy, sw, sh);
                    const data = imageData.data;
                    const options = point.markSheetOptions || 4;
                    const isHorizontal = point.markSheetLayout === 'horizontal';
                    
                    const segmentWidth = isHorizontal ? sw / options : sw;
                    const segmentHeight = isHorizontal ? sh : sh / options;
                    const darknessScores = Array(options).fill(0);

                    for (let i = 0; i < options; i++) {
                        const xStart = isHorizontal ? i * segmentWidth : 0;
                        const yStart = isHorizontal ? 0 : i * segmentHeight;
                        const roiMargin = 0.25;
                        const roiXStart = Math.floor(xStart + segmentWidth * roiMargin);
                        const roiYStart = Math.floor(yStart + segmentHeight * roiMargin);
                        const roiXEnd = Math.ceil(xStart + segmentWidth * (1 - roiMargin));
                        const roiYEnd = Math.ceil(yStart + segmentHeight * (1 - roiMargin));
                        let invertedGraySum = 0;
                        for (let y = roiYStart; y < roiYEnd; y++) {
                            for (let x = roiXStart; x < roiXEnd; x++) {
                                if (x < 0 || x >= sw || y < 0 || y >= sh) continue;
                                const idx = (y * sw + x) * 4;
                                invertedGraySum += (255 - (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]));
                            }
                        }
                        darknessScores[i] = invertedGraySum;
                    }

                    if (darknessScores.every(score => score === 0)) continue;
                    const scoresWithIndices = darknessScores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score);
                    const winner = scoresWithIndices[0]; const runnerUp = scoresWithIndices[1];
                    const roiArea = (segmentWidth * 0.5) * (segmentHeight * 0.5);
                    const minThreshold = roiArea * 255 * 0.015; 
                    if (winner.score > minThreshold && (!runnerUp || winner.score > runnerUp.score * 1.05)) {
                        const pointIndex = updatedPoints.findIndex(p => p.id === point.id);
                        if (pointIndex !== -1) { updatedPoints[pointIndex] = { ...updatedPoints[pointIndex], correctAnswerIndex: winner.index }; detectedCount++; }
                    }
                }
            }
            setInternalPoints(updatedPoints);
            alert(`${markSheetPoints.length}件のマークシート問題のうち、${detectedCount}件の正解を認識しました。`);
        } catch (error) {
            console.error("Error auto-detecting answers:", error);
            alert(`エラーが発生しました: ${error.message}`);
        } finally {
            setIsDetecting(false);
        }
    };

    const handlePointPropChange = (id: number, field: keyof Point, value: any) => {
        setInternalPoints(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleSubtotalChange = (pointId: number, subtotalAreaId: number, isChecked: boolean) => {
        setInternalPoints(prevPoints => 
            prevPoints.map(p => {
                if (p.id === pointId) {
                    const currentIds = p.subtotalIds || [];
                    if (isChecked) { return { ...p, subtotalIds: [...new Set([...currentIds, subtotalAreaId])] }; }
                    else { return { ...p, subtotalIds: currentIds.filter(id => id !== subtotalAreaId) }; }
                }
                return p;
            })
        );
    };
    
    // Bulk Operations
    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === internalPoints.length) { setSelectedIds(new Set()); }
        else { setSelectedIds(new Set(internalPoints.map(p => p.id))); }
    };

    const applyBulkPoints = () => {
        const pts = parseInt(bulkPoints); if (isNaN(pts)) return;
        setInternalPoints(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, points: pts } : p));
    };

    const applyBulkOptions = () => {
        const opts = parseInt(bulkChoices); if (isNaN(opts) || opts < 2 || opts > 10) return;
        setInternalPoints(prev => prev.map(p => {
            if (selectedIds.has(p.id)) {
                const area = relevantAreas.find(a => a.id === p.id);
                if (area?.type === AreaType.MARK_SHEET) return { ...p, markSheetOptions: opts };
            }
            return p;
        }));
    };

    const applyBulkLayout = (layout: 'horizontal' | 'vertical') => {
        setInternalPoints(prev => prev.map(p => {
            if (selectedIds.has(p.id)) {
                const area = relevantAreas.find(a => a.id === p.id);
                if (area?.type === AreaType.MARK_SHEET) return { ...p, markSheetLayout: layout };
            }
            return p;
        }));
    };

    const subtotalSums = useMemo(() => {
        return subtotalAreas.map(subtotalArea => ({
            id: subtotalArea.id,
            name: subtotalArea.name,
            sum: internalPoints.filter(p => p.subtotalIds?.includes(subtotalArea.id)).reduce((acc, curr) => acc + (curr.points || 0), 0),
        }));
    }, [internalPoints, subtotalAreas]);

    const grandTotal = useMemo(() => {
        return internalPoints.reduce((sum, p) => sum + (p.points || 0), 0);
    }, [internalPoints]);

    return (
        <div className="w-full max-w-full mx-auto flex flex-col h-full relative">
            <div className="flex-shrink-0 flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">各解答欄への配点設定</h3>
                    <label className="flex items-center gap-2 cursor-pointer bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-300">
                        <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === internalPoints.length} onChange={toggleSelectAll} className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500" />
                        <span className="text-sm font-medium">すべて選択</span>
                    </label>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowImages(!showImages)}
                        className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                        title={showImages ? "画像を隠す" : "画像を表示"}
                    >
                        {showImages ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                        <span>{showImages ? '画像を隠す' : '画像を表示'}</span>
                    </button>
                     <button onClick={handleAutoDetectAnswers} disabled={isDetecting || !internalPoints.some(p => areas.find(a=>a.id===p.id)?.type === AreaType.MARK_SHEET)} className="flex items-center gap-2 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:bg-slate-400 transition-colors">
                        {isDetecting ? <SpinnerIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />}
                        {isDetecting ? '認識中...' : 'マークシートの正解を自動認識'}
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md pb-24">
                <div className="space-y-4">
                {internalPoints.map((point) => {
                    const area = relevantAreas.find(a => a.id === point.id);
                    if (!area) return null;
                    
                    const pageIndex = area.pageIndex || 0;
                    const imageSrc = template?.pages?.[pageIndex]?.imagePath || template?.filePath;
                    const isSelected = selectedIds.has(point.id);

                    return (
                    <div 
                        key={point.id} 
                        className={`p-4 rounded-lg shadow-sm border transition-all ${isSelected ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-400 ring-1 ring-sky-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                        onClick={() => toggleSelect(point.id)}
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(point.id)} onClick={(e) => e.stopPropagation()} className="w-5 h-5 rounded text-sky-600 focus:ring-sky-500 flex-shrink-0" />
                            <div className="font-bold text-slate-700 dark:text-slate-300">{point.label}</div>
                            <span className="text-xs px-2 py-1 rounded-full bg-slate-200 dark:bg-slate-700">{area.type} {pageIndex > 0 ? `(p.${pageIndex+1})` : ''}</span>
                        </div>

                        {showImages && template && (
                            <div className="mb-4 h-24 w-full bg-slate-100 dark:bg-slate-900 rounded-md border border-slate-300 dark:border-slate-600 overflow-hidden relative group" onClick={(e) => e.stopPropagation()}>
                                <AnswerSnippet imageSrc={imageSrc} area={area} template={template} pannable={true} />
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" onClick={(e) => e.stopPropagation()}>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-500">問題ラベル</label>
                                <input type="text" value={point.label} onChange={(e) => handlePointPropChange(point.id, 'label', e.target.value)} className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded p-2 text-sm" />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-500">配点</label>
                                <input type="number" min="0" value={point.points} onChange={(e) => handlePointPropChange(point.id, 'points', parseInt(e.target.value) || 0)} className="w-24 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded p-2 text-sm" />
                            </div>
                            <div className="space-y-4">
                                {subtotalAreas.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-500 mb-1">小計グループ</label>
                                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                                            {subtotalAreas.map(area => (<label key={area.id} className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={point.subtotalIds?.includes(area.id) || false} onChange={(e) => handleSubtotalChange(point.id, area.id, e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"/><span>{area.name}</span></label>))}
                                        </div>
                                    </div>
                                )}
                                {questionNumberAreas.length > 0 && (
                                     <div>
                                        <label className="block text-sm font-medium text-slate-500 mb-1">問題番号エリア</label>
                                        <select value={point.questionNumberAreaId || ''} onChange={(e) => handlePointPropChange(point.id, 'questionNumberAreaId', e.target.value ? parseInt(e.target.value) : undefined)} className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded p-2 text-sm">
                                            <option value="">未設定</option>
                                            {questionNumberAreas.map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                        {area.type === AreaType.MARK_SHEET && (
                             <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-4" onClick={(e) => e.stopPropagation()}>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2"><label className="block text-sm font-medium text-slate-500">選択肢の数</label><input type="number" min="2" max="10" value={point.markSheetOptions || 4} onChange={e => handlePointPropChange(point.id, 'markSheetOptions', parseInt(e.target.value) || 2)} className="w-24 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded p-2 text-sm" /></div>
                                    <div className="space-y-2"><label className="block text-sm font-medium text-slate-500">レイアウト</label><div className="flex items-center gap-2 p-1 bg-slate-200 dark:bg-slate-900/50 rounded-lg w-fit"><button onClick={() => handlePointPropChange(point.id, 'markSheetLayout', 'horizontal')} className={`px-3 py-1 text-xs rounded-md ${point.markSheetLayout === 'horizontal' ? 'bg-white dark:bg-slate-700 shadow' : ''}`}>横並び</button><button onClick={() => handlePointPropChange(point.id, 'markSheetLayout', 'vertical')} className={`px-3 py-1 text-xs rounded-md ${point.markSheetLayout === 'vertical' ? 'bg-white dark:bg-slate-700 shadow' : ''}`}>縦並び</button></div></div>
                                    <div className="space-y-2"><label className="block text-sm font-medium text-slate-500">正解の選択肢</label><div className="flex flex-wrap items-center gap-1">{Array.from({ length: point.markSheetOptions || 0 }).map((_, i) => (<button key={i} onClick={() => handlePointPropChange(point.id, 'correctAnswerIndex', i)} className={`w-8 h-8 rounded-md text-xs font-mono ${point.correctAnswerIndex === i ? 'bg-sky-500 text-white' : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300'}`}>{String.fromCharCode(65 + i)}</button>))}</div></div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900/30 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">位置基準点 (オプション)</label>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <span className="text-[10px] text-slate-400">縦の基準点 (右列など):</span>
                                                <select 
                                                    value={point.markRefRightAreaId || ''} 
                                                    onChange={e => handlePointPropChange(point.id, 'markRefRightAreaId', e.target.value ? parseInt(e.target.value) : undefined)}
                                                    className="w-full bg-white dark:bg-slate-800 border-none rounded p-1 text-[11px]"
                                                >
                                                    <option value="">(未選択: 均等分割)</option>
                                                    {alignmentAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[10px] text-slate-400">横の基準点 (下行など):</span>
                                                <select 
                                                    value={point.markRefBottomAreaId || ''} 
                                                    onChange={e => handlePointPropChange(point.id, 'markRefBottomAreaId', e.target.value ? parseInt(e.target.value) : undefined)}
                                                    className="w-full bg-white dark:bg-slate-800 border-none rounded p-1 text-[11px]"
                                                >
                                                    <option value="">(未選択: 均等分割)</option>
                                                    {alignmentAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <p className="text-[9px] text-slate-500 italic mt-1">基準点を指定すると、スキャンの傾き等に関わらず正確な位置でマークを読み取ります。</p>
                                    </div>
                                </div>
                             </div>
                        )}
                    </div>
                )})}
                </div>
            </div>

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="absolute bottom-20 left-0 right-0 mx-auto w-max max-w-[90%] bg-slate-800 text-white p-3 rounded-xl shadow-xl flex flex-wrap items-center gap-4 z-50 animate-in slide-in-from-bottom-4">
                    <span className="text-sm font-bold bg-slate-700 px-2 py-1 rounded">{selectedIds.size} 件選択中</span>
                    <div className="h-6 w-px bg-slate-600"></div>
                    <div className="flex items-center gap-2"><span className="text-xs">配点:</span><input type="number" min="0" placeholder="-" className="w-16 p-1 text-black rounded text-sm" value={bulkPoints} onChange={e => setBulkPoints(e.target.value)} /><button onClick={applyBulkPoints} disabled={!bulkPoints} className="px-2 py-1 bg-sky-600 hover:bg-sky-500 rounded text-xs disabled:opacity-50">適用</button></div>
                    <div className="h-6 w-px bg-slate-600"></div>
                    <div className="flex items-center gap-2"><span className="text-xs">選択肢数:</span><input type="number" min="2" max="10" placeholder="-" className="w-12 p-1 text-black rounded text-sm" value={bulkChoices} onChange={e => setBulkChoices(e.target.value)} /><button onClick={applyBulkOptions} disabled={!bulkChoices} className="px-2 py-1 bg-sky-600 hover:bg-sky-500 rounded text-xs disabled:opacity-50">適用</button></div>
                    <div className="flex items-center gap-1 bg-slate-700 p-1 rounded"><button onClick={() => applyBulkLayout('horizontal')} className="px-2 py-1 text-xs hover:bg-slate-600 rounded">横並び</button><button onClick={() => applyBulkLayout('vertical')} className="px-2 py-1 text-xs hover:bg-slate-600 rounded">縦並び</button></div>
                </div>
            )}

             <div className="flex-shrink-0 mt-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg flex justify-end items-center gap-8">
                {subtotalSums.length > 0 && (<div className="flex flex-col items-end gap-1 text-slate-600 dark:text-slate-300">{subtotalSums.map(sub => (<p key={sub.id} className="text-md font-semibold">{sub.name}: {sub.sum} 点</p>))}</div>)}
                {subtotalSums.length > 0 && (<div className="border-l border-slate-300 dark:border-slate-600 h-12"></div>)}
                <div><p className="text-xl font-bold text-slate-800 dark:text-slate-200">合計点: {grandTotal} 点</p></div>
            </div>
        </div>
    );
};
