import React, { useState } from 'react';
import type { GradingFilter, Area } from '../../types';
import { ScoringStatus, AreaType } from '../../types';
import { SparklesIcon, SpinnerIcon, ChevronDownIcon, ChevronUpIcon, PaletteIcon, CheckCircle2Icon, PencilIcon } from '../icons';

interface GradingHeaderProps {
    selectedArea: Area | undefined;
    onStartAIGrading: () => void;
    onStartMarkSheetGrading: () => void;
    onStartAIGradingAll: () => void;
    isGrading: boolean;
    isGradingAll: boolean;
    progress: { current: number; total: number; message?: string };
    filter: GradingFilter;
    onFilterChange: (filter: GradingFilter) => void;
    apiKey: string;
    columnCount: number;
    onColumnCountChange: (count: number) => void;
    onBulkScore: (status: ScoringStatus.CORRECT | ScoringStatus.INCORRECT) => void;
    aiGradingMode: 'auto' | 'strict';
    onAiGradingModeChange: (mode: 'auto' | 'strict') => void;
    answerFormat: string;
    onAnswerFormatChange: (format: string) => void;
    isImageEnhanced: boolean;
    onToggleImageEnhancement: () => void;
    // OCR props
    onStartLocalOCR?: () => void;
    ocrLanguage?: 'eng' | 'jpn';
    onOcrLanguageChange?: (lang: 'eng' | 'jpn') => void;
    isHandwritingMode?: boolean;
    onToggleHandwritingMode?: () => void;
}

const filterOptions: { value: GradingFilter; label: string }[] = [
    { value: 'ALL', label: 'すべて' },
    { value: ScoringStatus.UNSCORED, label: '未採点' },
    { value: 'SCORED', label: '採点済み' },
    { value: ScoringStatus.CORRECT, label: '正解' },
    { value: ScoringStatus.INCORRECT, label: '不正解' },
    { value: ScoringStatus.PARTIAL, label: '部分点' },
];

const presetAnswerFormats = [
    { label: 'ア-オ', value: 'アイウエオ' }, { label: '数字', value: '0123456789' }, { label: 'A-E', value: 'ABCDE' }, { label: 'a-e', value: 'abcde' }
];

export const GradingHeader: React.FC<GradingHeaderProps> = ({
    selectedArea, onStartAIGrading, onStartMarkSheetGrading, onStartAIGradingAll, isGrading, isGradingAll, progress, filter, onFilterChange, apiKey,
    columnCount, onColumnCountChange, onBulkScore,
    aiGradingMode, onAiGradingModeChange, answerFormat, onAnswerFormatChange,
    isImageEnhanced, onToggleImageEnhancement,
    onStartLocalOCR, ocrLanguage, onOcrLanguageChange, isHandwritingMode, onToggleHandwritingMode
}) => {
    const isAnyGrading = isGrading || isGradingAll;
    const isMarkSheet = selectedArea?.type === AreaType.MARK_SHEET;
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="flex-shrink-0 flex flex-col gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg shadow">
            <div className="flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    {isMarkSheet ? (
                         <button
                            onClick={onStartMarkSheetGrading}
                            disabled={!selectedArea || isAnyGrading}
                            className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:bg-slate-400 transition-colors"
                        >
                            {isGrading ? <SpinnerIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />}
                            {isGrading ? '採点中...' : 'この問題をマークシート採点'}
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                             <button
                                onClick={onStartAIGrading}
                                disabled={!selectedArea || isAnyGrading || !apiKey}
                                className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-500 disabled:bg-slate-400 transition-colors"
                            >
                                {isGrading && !onStartLocalOCR /* Simple check if it's AI */ ? <SpinnerIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />}
                                {isGrading && !onStartLocalOCR ? '採点中...' : 'AI採点'}
                            </button>
                            
                            {onStartLocalOCR && (
                                <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-md p-0.5 border border-slate-200 dark:border-slate-600">
                                    <button
                                        onClick={onStartLocalOCR}
                                        disabled={!selectedArea || isAnyGrading}
                                        className="flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-white dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded shadow-sm hover:bg-slate-50 dark:hover:bg-slate-500 disabled:opacity-50 transition-colors"
                                        title="Tesseract.jsを使用してローカルで文字認識を行います（API制限なし）"
                                    >
                                        {isGrading && ocrLanguage ? <SpinnerIcon className="w-4 h-4" /> : <CheckCircle2Icon className="w-4 h-4" />}
                                        ローカルOCR
                                    </button>
                                    <select
                                        value={ocrLanguage}
                                        onChange={(e) => onOcrLanguageChange?.(e.target.value as 'eng' | 'jpn')}
                                        disabled={isAnyGrading}
                                        className="text-xs bg-transparent border-none py-1 pl-2 pr-1 focus:ring-0 text-slate-600 dark:text-slate-300"
                                    >
                                        <option value="eng">数字・英字</option>
                                        <option value="jpn">日本語(β)</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    )}
                    <button
                        onClick={onStartAIGradingAll}
                        disabled={isAnyGrading || !apiKey}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-500 disabled:bg-slate-400 transition-colors"
                    >
                        {isGradingAll ? <SpinnerIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />}
                        {isGradingAll ? '全問題採点中...' : '全問AI'}
                    </button>
                    {isAnyGrading && progress.total > 0 && (
                        <div className="flex items-center gap-2">
                             <div className="flex flex-col text-xs text-slate-500 dark:text-slate-400 w-48">
                                <span>{progress.message || '進捗'}</span>
                                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mt-1">
                                    <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                                </div>
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{progress.current} / {progress.total}</span>
                        </div>
                    )}
                 </div>

                <div className="flex items-center gap-4">
                    <button 
                        onClick={onToggleImageEnhancement}
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors ${isImageEnhanced ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                        title="薄い文字を濃く表示します"
                    >
                        <PaletteIcon className="w-4 h-4" />
                        <span>文字を濃く</span>
                    </button>
                    <div className="h-6 w-px bg-slate-300 dark:bg-slate-600"></div>
                    <button onClick={() => onBulkScore(ScoringStatus.CORRECT)} disabled={!selectedArea || isAnyGrading} className="px-3 py-1.5 text-xs rounded-md bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 hover:bg-green-200 disabled:opacity-50">すべてを◯に</button>
                    <button onClick={() => onBulkScore(ScoringStatus.INCORRECT)} disabled={!selectedArea || isAnyGrading} className="px-3 py-1.5 text-xs rounded-md bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 hover:bg-red-200 disabled:opacity-50">すべてを☓に</button>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title={isExpanded ? "設定を閉じる" : "設定を開く"}>
                        {isExpanded ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                    </button>
                </div>
            </div>
            
            {isExpanded && (
                <div className="space-y-3 border-t pt-3 dark:border-slate-700">
                    {!isMarkSheet && (
                        <div>
                            <h4 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">AI / OCR設定（この問題）</h4>
                            <div className="flex items-start gap-4">
                                <div className="w-40">
                                    <label className="text-xs text-slate-600 dark:text-slate-400">採点判定モード</label>
                                    <select 
                                        value={aiGradingMode}
                                        onChange={(e) => onAiGradingModeChange(e.target.value as 'auto' | 'strict')}
                                        className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded p-1.5 text-sm mt-1"
                                        disabled={!selectedArea || isAnyGrading}
                                    >
                                        <option value="auto">自動認識 (AIのみ)</option>
                                        <option value="strict">厳格モード (記号/単語)</option>
                                    </select>
                                </div>
                                <div className="flex-1 space-y-1">
                                    <label className="text-xs text-slate-600 dark:text-slate-400">正解（厳格モード・ローカルOCR用）</label>
                                    <input
                                        type="text"
                                        value={answerFormat}
                                        onChange={(e) => onAnswerFormatChange(e.target.value)}
                                        placeholder="例: アイウエオ, 123"
                                        className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded p-1.5 text-xs"
                                        disabled={!selectedArea || isAnyGrading}
                                    />
                                    <div className="flex flex-wrap gap-1">
                                        {presetAnswerFormats.map(preset => (
                                            <button key={preset.label} onClick={() => onAnswerFormatChange(preset.value)} disabled={isAnyGrading} className="px-2 py-1 text-xs bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded disabled:opacity-50">
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Local OCR Settings */}
                            {onToggleHandwritingMode && (
                                <div className="mt-3 p-2 bg-slate-50 dark:bg-slate-700/50 rounded border border-slate-200 dark:border-slate-600">
                                    <h5 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">ローカルOCR設定</h5>
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={isHandwritingMode} 
                                                onChange={onToggleHandwritingMode} 
                                                disabled={isAnyGrading}
                                                className="rounded text-sky-600 focus:ring-sky-500" 
                                            />
                                            <span className="text-sm font-medium flex items-center gap-1">
                                                <PencilIcon className="w-3 h-3" />
                                                手書き補正モード
                                            </span>
                                        </label>
                                        <p className="text-[10px] text-slate-500">
                                            ※手書き文字を太く強調して認識率を高めます。印刷文字の場合はOFFにしてください。
                                        </p>
                                    </div>
                                </div>
                            )}
                            
                            <p className="text-[10px] text-slate-500 mt-1">※ローカルOCRを使用する場合、「正解」に入力された文字と完全に一致した場合のみ正解(◯)となります。</p>
                        </div>
                    )}
                    <div className="flex justify-between items-center border-t pt-2 dark:border-slate-700">
                        <div className="flex items-center gap-2">
                            <label htmlFor="filter-select" className="text-sm">絞り込み表示:</label>
                            <select id="filter-select" value={filter} onChange={e => onFilterChange(e.target.value as GradingFilter)} disabled={isAnyGrading} className="p-1.5 text-sm bg-slate-100 dark:bg-slate-700 rounded-md border border-slate-200 dark:border-slate-600 disabled:opacity-50">
                            {filterOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 w-64">
                            <label htmlFor="column-slider" className="text-sm whitespace-nowrap">表示列数: {columnCount}</label>
                            <input
                                id="column-slider"
                                type="range"
                                min="1"
                                max="10"
                                value={columnCount}
                                onChange={e => onColumnCountChange(parseInt(e.target.value, 10))}
                                disabled={isAnyGrading}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-sky-500 disabled:opacity-50"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};