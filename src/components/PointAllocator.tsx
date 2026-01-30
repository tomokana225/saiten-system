
import React, { useState, useEffect, useMemo } from 'react';
import type { Area, Point, Template } from '../types';
import { AreaType } from '../types';
import { SparklesIcon, SpinnerIcon, EyeIcon, EyeOffIcon, SettingsIcon } from './icons';
import { useProject } from '../context/ProjectContext';
import { AnswerSnippet } from './AnswerSnippet';

const answerAndMarkSheetAreas = (areas: Area[]) => areas.filter(a => a.type === AreaType.ANSWER || a.type === AreaType.MARK_SHEET);

export const PointAllocator = () => {
    const { activeProject, handlePointsChange } = useProject();
    const { areas, points, template } = activeProject!;

    const relevantAreas = useMemo(() => answerAndMarkSheetAreas(areas), [areas]);
    const subtotalAreas = useMemo(() => areas.filter(a => a.type === AreaType.SUBTOTAL), [areas]);
    const questionNumberAreas = useMemo(() => areas.filter(a => a.type === AreaType.QUESTION_NUMBER), [areas]);
    const [isDetecting, setIsDetecting] = useState(false);
    const [showImages, setShowImages] = useState(true);

    // Bulk settings state
    const [bulkPoints, setBulkPoints] = useState<number | ''>(10);
    const [bulkOptions, setBulkOptions] = useState<number | ''>(4);

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
    
    const handleApplyBulkSettings = () => {
        const pVal = typeof bulkPoints === 'number' ? bulkPoints : undefined;
        const oVal = typeof bulkOptions === 'number' ? bulkOptions : undefined;

        if (pVal === undefined && oVal === undefined) return;

        setInternalPoints(prev => prev.map(p => {
            const area = areas.find(a => a.id === p.id);
            if (area?.type === AreaType.MARK_SHEET) {
                return {
                    ...p,
                    points: pVal !== undefined ? pVal : p.points,
                    markSheetOptions: oVal !== undefined ? oVal : p.markSheetOptions,
                    // If options changed, reset correct answer index if out of bounds
                    correctAnswerIndex: (oVal !== undefined && (p.correctAnswerIndex ?? 0) >= oVal) ? 0 : p.correctAnswerIndex
                };
            }
            return p;
        }));
        alert('マークシートの一括設定を適用しました。');
    };

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
            
            // Group by page to minimize image loading
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
                    
                    let sx = Math.floor(area.x);
                    let sy = Math.floor(area.y);
                    let sw = Math.floor(area.width);
                    let sh = Math.floor(area.height);

                    if (sx < 0) { sw += sx; sx = 0; }
                    if (sy < 0) { sh += sy; sy = 0; }
                    if (sx + sw > mainCanvas.width) sw = mainCanvas.width - sx;
                    if (sy + sh > mainCanvas.height) sh = mainCanvas.height - sy;

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
                                const r = data[idx];
                                const g = data[idx + 1];
                                const b = data[idx + 2];
                                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                                invertedGraySum += (255 - gray);
                            }
                        }
                        darknessScores[i] = invertedGraySum;
                    }

                    if (darknessScores.every(score => score === 0)) continue;

                    const scoresWithIndices = darknessScores.map((score, index) => ({ score, index }));
                    scoresWithIndices.sort((a, b) => b.score - a.score);

                    const winner = scoresWithIndices[0];
                    const runnerUp = scoresWithIndices[1];
                    
                    const roiW = segmentWidth * (1 - 2 * 0.25);
                    const roiH = segmentHeight * (1 - 2 * 0.25);
                    const roiArea = roiW * roiH;
                    
                    const minThreshold = roiArea * 255 * 0.015; 
                    const isConfidentWinner = winner.score > minThreshold && 
                                            (!runnerUp || winner.score > runnerUp.score * 1.05);

                    if (isConfidentWinner) {
                        const pointIndex = updatedPoints.findIndex(p => p.id === point.id);
                        if (pointIndex !== -1) {
                            updatedPoints[pointIndex] = { ...updatedPoints[pointIndex], correctAnswerIndex: winner.index };
                            detectedCount++;
                        }
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
                    if (isChecked) {
                        return { ...p, subtotalIds: [...new Set([...currentIds, subtotalAreaId])] };
                    } else {
                        return { ...p, subtotalIds: currentIds.filter(id => id !== subtotalAreaId) };
                    }
                }
                return p;
            })
        );
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
        <div className="w-full max-w-full mx-auto flex flex-col h-full">
            <div className="flex-shrink-0 mb-4 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">各解答欄への配点設定</h3>
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

                {/* Bulk Settings Panel */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-lg shadow-sm">
                    <div className="flex items-center gap-2 mb-2 text-slate-700 dark:text-slate-200 font-semibold text-sm">
                        <SettingsIcon className="w-4 h-4" />
                        <span>マークシート一括設定</span>
                    </div>
                    <div className="flex items-end gap-4">
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">選択肢の数</label>
                            <input 
                                type="number" 
                                min="2" 
                                max="10" 
                                value={bulkOptions} 
                                onChange={e => setBulkOptions(e.target.value === '' ? '' : parseInt(e.target.value))} 
                                className="w-20 p-1.5 border rounded text-sm bg-slate-50 dark:bg-slate-900 dark:border-slate-600"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">配点</label>
                            <input 
                                type="number" 
                                min="0" 
                                value={bulkPoints} 
                                onChange={e => setBulkPoints(e.target.value === '' ? '' : parseInt(e.target.value))} 
                                className="w-20 p-1.5 border rounded text-sm bg-slate-50 dark:bg-slate-900 dark:border-slate-600"
                            />
                        </div>
                        <button 
                            onClick={handleApplyBulkSettings} 
                            className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-500"
                        >
                            すべてのマークシートに適用
                        </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                        ※この操作を行うと、全ての「マークシート」タイプの問題の設定が上書きされます。
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md">
                <div className="space-y-4">
                {internalPoints.map((point) => {
                    const area = relevantAreas.find(a => a.id === point.id);
                    if (!area) return null;
                    
                    const pageIndex = area.pageIndex || 0;
                    const imageSrc = template?.pages?.[pageIndex]?.imagePath || template?.filePath;

                    return (
                    <div key={point.id} className="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
                        {showImages && template && (
                            <div className="mb-4 h-24 w-full bg-slate-100 dark:bg-slate-900 rounded-md border border-slate-300 dark:border-slate-600 overflow-hidden relative group">
                                <AnswerSnippet
                                    imageSrc={imageSrc}
                                    area={area}
                                    template={template}
                                    pannable={true}
                                />
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-500">問題</label>
                                <input type="text" value={point.label} onChange={(e) => handlePointPropChange(point.id, 'label', e.target.value)} className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded p-2" />
                                <span className="text-xs px-2 py-1 rounded-full bg-slate-200 dark:bg-slate-700">{area.type} {pageIndex > 0 ? `(p.${pageIndex+1})` : ''}</span>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-500">配点</label>
                                <input type="number" min="0" value={point.points} onChange={(e) => handlePointPropChange(point.id, 'points', parseInt(e.target.value) || 0)} className="w-24 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded p-2" />
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
                             <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2"><label className="block text-sm font-medium text-slate-500">選択肢の数</label><input type="number" min="2" max="10" value={point.markSheetOptions || 4} onChange={e => handlePointPropChange(point.id, 'markSheetOptions', parseInt(e.target.value) || 2)} className="w-24 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded p-2" /></div>
                                <div className="space-y-2"><label className="block text-sm font-medium text-slate-500">レイアウト</label><div className="flex items-center gap-2 p-1 bg-slate-200 dark:bg-slate-900/50 rounded-lg w-fit"><button onClick={() => handlePointPropChange(point.id, 'markSheetLayout', 'horizontal')} className={`px-3 py-1 text-xs rounded-md ${point.markSheetLayout === 'horizontal' ? 'bg-white dark:bg-slate-700 shadow' : ''}`}>横並び</button><button onClick={() => handlePointPropChange(point.id, 'markSheetLayout', 'vertical')} className={`px-3 py-1 text-xs rounded-md ${point.markSheetLayout === 'vertical' ? 'bg-white dark:bg-slate-700 shadow' : ''}`}>縦並び</button></div></div>
                                <div className="space-y-2"><label className="block text-sm font-medium text-slate-500">正解の選択肢</label><div className="flex flex-wrap items-center gap-1">{Array.from({ length: point.markSheetOptions || 0 }).map((_, i) => (<button key={i} onClick={() => handlePointPropChange(point.id, 'correctAnswerIndex', i)} className={`w-8 h-8 rounded-md text-xs font-mono ${point.correctAnswerIndex === i ? 'bg-sky-500 text-white' : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300'}`}>{String.fromCharCode(65 + i)}</button>))}</div></div>
                             </div>
                        )}
                    </div>
                )})}
                </div>
            </div>
             <div className="flex-shrink-0 mt-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg flex justify-end items-center gap-8">
                {subtotalSums.length > 0 && (<div className="flex flex-col items-end gap-1 text-slate-600 dark:text-slate-300">{subtotalSums.map(sub => (<p key={sub.id} className="text-md font-semibold">{sub.name}: {sub.sum} 点</p>))}</div>)}
                {subtotalSums.length > 0 && (<div className="border-l border-slate-300 dark:border-slate-600 h-12"></div>)}
                <div><p className="text-xl font-bold text-slate-800 dark:text-slate-200">合計点: {grandTotal} 点</p></div>
            </div>
        </div>
    );
};
