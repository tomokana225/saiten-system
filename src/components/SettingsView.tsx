
import React, { useState } from 'react';
import { SunIcon, MoonIcon, InfoIcon, SpinnerIcon } from './icons';
import type { AISettings } from '../types';

interface SettingsViewProps {
    theme: 'light' | 'dark';
    setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
    aiSettings?: AISettings;
    onAiSettingsChange?: React.Dispatch<React.SetStateAction<AISettings>>;
}

export const SettingsView = ({ theme, setTheme, aiSettings, onAiSettingsChange }: SettingsViewProps) => {

    return (
        <div className="w-full max-w-4xl mx-auto space-y-8">
            <div className="space-y-4">
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">テーマ設定</h3>
                <div className="flex items-center space-x-2 p-1 bg-slate-200 dark:bg-slate-700 rounded-lg">
                    <button onClick={() => setTheme('light')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${theme === 'light' ? 'bg-white dark:bg-slate-600 shadow' : 'hover:bg-slate-300 dark:hover:bg-slate-600/50'}`}>
                        < SunIcon className="w-5 h-5"/>
                        ライト
                    </button>
                    <button onClick={() => setTheme('dark')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${theme === 'dark' ? 'bg-slate-800 text-white shadow' : 'hover:bg-slate-300 dark:hover:bg-slate-600/50'}`}>
                         <MoonIcon className="w-5 h-5"/>
                        ダーク
                    </button>
                </div>
            </div>

            {aiSettings && onAiSettingsChange && (
                 <div className="space-y-4 pt-8 border-t border-slate-200 dark:border-slate-700">
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">AI採点 詳細設定</h3>
                    <div className="p-4 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-lg flex items-start gap-3">
                        <InfoIcon className="w-6 h-6 flex-shrink-0 mt-1" />
                        <p className="text-sm">
                            AIによる自動採点およびマークシート認識のパフォーマンスを調整します。設定は自動で保存されます。
                        </p>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            使用モデル
                        </label>
                        <select
                            value={aiSettings.aiModel || 'gemini-3-flash-preview'}
                            onChange={(e) => onAiSettingsChange(prev => ({ ...prev, aiModel: e.target.value }))}
                            className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700"
                        >
                            <option value="gemini-3-flash-preview">Gemini 3 Flash Preview (推奨: 高速)</option>
                            <option value="gemini-3-pro-preview">Gemini 3 Pro Preview (高精度)</option>
                            <option value="gemini-flash-lite-latest">Gemini Flash Lite (超高速・軽量)</option>
                        </select>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            モデルを変更することで採点の精度や処理速度を調整できます。
                        </p>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="batch-size-slider" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            一度に採点する解答数: <span className="font-bold">{aiSettings.batchSize}</span> 件
                        </label>
                        <input
                            id="batch-size-slider"
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            value={aiSettings.batchSize}
                            onChange={(e) => onAiSettingsChange(prev => ({ ...prev, batchSize: parseInt(e.target.value, 10) }))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-sky-600"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            一度にAPIへ送信する解答の数です。
                        </p>
                    </div>
                     <div className="space-y-2">
                        <label htmlFor="delay-slider" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            採点バッチ間の待機時間: <span className="font-bold">{(aiSettings.delayBetweenBatches / 1000).toFixed(1)}</span> 秒
                        </label>
                        <input
                            id="delay-slider"
                            type="range"
                            min="0"
                            max="5000"
                            step="250"
                            value={aiSettings.delayBetweenBatches}
                            onChange={(e) => onAiSettingsChange(prev => ({ ...prev, delayBetweenBatches: parseInt(e.target.value, 10) }))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-sky-600"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            採点モード
                        </label>
                        <div className="flex items-center space-x-2 p-1 bg-slate-200 dark:bg-slate-700 rounded-lg">
                            <button 
                                onClick={() => onAiSettingsChange(prev => ({ ...prev, gradingMode: 'quality' }))}
                                className={`flex-1 px-4 py-2 rounded-md text-sm transition-colors ${(aiSettings.gradingMode === 'quality' || !aiSettings.gradingMode) ? 'bg-white dark:bg-slate-600 shadow' : 'hover:bg-slate-300 dark:hover:bg-slate-600/50'}`}
                            >
                                品質優先
                            </button>
                            <button 
                                onClick={() => onAiSettingsChange(prev => ({ ...prev, gradingMode: 'speed' }))}
                                className={`flex-1 px-4 py-2 rounded-md text-sm transition-colors ${aiSettings.gradingMode === 'speed' ? 'bg-white dark:bg-slate-600 shadow' : 'hover:bg-slate-300 dark:hover:bg-slate-600/50'}`}
                            >
                                速度優先
                            </button>
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-6">
                        <h4 className="text-md font-bold text-slate-800 dark:text-slate-200">マークシート設定</h4>
                        
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                マーク開始番号 (0 または 1)
                            </label>
                            <div className="flex items-center space-x-2 p-1 bg-slate-200 dark:bg-slate-700 rounded-lg">
                                <button 
                                    onClick={() => onAiSettingsChange(prev => ({ ...prev, markSheetNumberingBase: 0 }))}
                                    className={`flex-1 px-4 py-2 rounded-md text-sm transition-colors ${aiSettings.markSheetNumberingBase === 0 ? 'bg-white dark:bg-slate-600 shadow' : 'hover:bg-slate-300 dark:hover:bg-slate-600/50'}`}
                                >
                                    0 から開始 (0, 1, 2...)
                                </button>
                                <button 
                                    onClick={() => onAiSettingsChange(prev => ({ ...prev, markSheetNumberingBase: 1 }))}
                                    className={`flex-1 px-4 py-2 rounded-md text-sm transition-colors ${aiSettings.markSheetNumberingBase === 1 ? 'bg-white dark:bg-slate-600 shadow' : 'hover:bg-slate-300 dark:hover:bg-slate-600/50'}`}
                                >
                                    1 から開始 (1, 2, 3...)
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-900 rounded-lg">
                            <div className="space-y-1">
                                <label className="text-sm font-bold">判定位置の表示</label>
                                <p className="text-xs text-slate-500">マークの中心点（緑の点）を採点画面に表示します。</p>
                            </div>
                            <button 
                                onClick={() => onAiSettingsChange(prev => ({ ...prev, showMarkCentroids: !prev.showMarkCentroids }))}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${aiSettings.showMarkCentroids ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${aiSettings.showMarkCentroids ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="sensitivity-slider" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                マークシート認識感度: <span className="font-bold">{(aiSettings.markSheetSensitivity || 1.5).toFixed(1)}</span>
                            </label>
                            <input
                                id="sensitivity-slider"
                                type="range"
                                min="1.1"
                                max="3.0"
                                step="0.1"
                                value={aiSettings.markSheetSensitivity || 1.5}
                                onChange={(e) => onAiSettingsChange(prev => ({ ...prev, markSheetSensitivity: parseFloat(e.target.value) }))}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-sky-600"
                            />
                            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                                <span>低い (かすれも認識)</span>
                                <span>高い (濃いマークのみ)</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
