
import React, { useState } from 'react';
import { SunIcon, MoonIcon, InfoIcon, EyeIcon, EyeOffIcon, CheckCircle2Icon, XCircleIcon, SpinnerIcon } from './icons';
import type { AISettings } from '../types';

interface SettingsViewProps {
    theme: 'light' | 'dark';
    setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
    apiKey: string;
    onApiKeyChange: React.Dispatch<React.SetStateAction<string>>;
    apiKeyStatus: 'unchecked' | 'validating' | 'valid' | 'invalid';
    onValidateKey: () => void;
    aiSettings?: AISettings;
    onAiSettingsChange?: React.Dispatch<React.SetStateAction<AISettings>>;
}

export const SettingsView = ({ theme, setTheme, apiKey, onApiKeyChange, apiKeyStatus, onValidateKey, aiSettings, onAiSettingsChange }: SettingsViewProps) => {
    const [showApiKey, setShowApiKey] = useState(false);

    const getStatusIndicator = () => {
        switch (apiKeyStatus) {
            case 'validating':
                return <span className="flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-400"><SpinnerIcon className="w-4 h-4" /> 認証中...</span>;
            case 'valid':
                return <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400"><CheckCircle2Icon className="w-4 h-4" /> 認証済み</span>;
            case 'invalid':
                return <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400"><XCircleIcon className="w-4 h-4" /> 認証に失敗しました</span>;
            case 'unchecked':
            default:
                 if (apiKey) {
                    return <span className="text-sm text-slate-500 dark:text-slate-400">未認証</span>;
                 }
                 return null;
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto space-y-8">
            <div className="space-y-4">
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">テーマ設定</h3>
                <div className="flex items-center space-x-2 p-1 bg-slate-200 dark:bg-slate-700 rounded-lg">
                    <button onClick={() => setTheme('light')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${theme === 'light' ? 'bg-white dark:bg-slate-600 shadow' : 'hover:bg-slate-300 dark:hover:bg-slate-600/50'}`}>
                        <SunIcon className="w-5 h-5"/>
                        ライト
                    </button>
                    <button onClick={() => setTheme('dark')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${theme === 'dark' ? 'bg-slate-800 text-white shadow' : 'hover:bg-slate-300 dark:hover:bg-slate-600/50'}`}>
                         <MoonIcon className="w-5 h-5"/>
                        ダーク
                    </button>
                </div>
            </div>
            
            <div className="space-y-4">
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Gemini API キー設定</h3>
                <div className="p-4 bg-white dark:bg-slate-800 rounded-lg shadow space-y-3">
                   <div>
                       <label htmlFor="api-key-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                           APIキー
                       </label>
                       <div className="mt-1 relative rounded-md shadow-sm">
                           <input
                               id="api-key-input"
                               type={showApiKey ? 'text' : 'password'}
                               value={apiKey}
                               onChange={(e) => onApiKeyChange(e.target.value)}
                               className="block w-full p-2 pr-10 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700"
                               placeholder="AIza..."
                           />
                           <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                               <button onClick={() => setShowApiKey(!showApiKey)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                   {showApiKey ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                               </button>
                           </div>
                       </div>
                   </div>
                   <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <button 
                               onClick={() => onValidateKey()} 
                               disabled={apiKeyStatus === 'validating' || !apiKey}
                               className="px-4 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-500 disabled:bg-slate-400"
                           >
                               保存して認証
                           </button>
                            {getStatusIndicator()}
                        </div>
                   </div>
               </div>
            </div>

            {aiSettings && onAiSettingsChange && (
                 <div className="space-y-4 pt-8 border-t border-slate-200 dark:border-slate-700">
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">AI採点 詳細設定</h3>
                    <div className="p-4 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-lg flex items-start gap-3">
                        <InfoIcon className="w-6 h-6 flex-shrink-0 mt-1" />
                        <p className="text-sm">
                            AIによる自動採点のパフォーマンスを調整します。設定は自動で保存されます。
                        </p>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            使用モデル
                        </label>
                        <select
                            value={aiSettings.aiModel || 'gemini-1.5-flash'}
                            onChange={(e) => onAiSettingsChange(prev => ({ ...prev, aiModel: e.target.value }))}
                            className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700"
                        >
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash (推奨: 高速・無料枠大)</option>
                            <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp (実験的)</option>
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash (最新・無料枠少)</option>
                        </select>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            「制限超過 (429)」エラーが出る場合は、制限の緩い 1.5 Flash を使用してください。
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
                            一度にAPIへ送信する解答の数です。値を大きくすると全体的な処理時間は短縮される傾向にありますが、1回あたりの待ち時間は長くなります。
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
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            連続したAPIリクエストの間に待機時間を設けます。APIの利用制限エラーが発生する場合、この値を大きく設定してください。
                        </p>
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
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            「速度優先」モードはAIの思考時間を短縮し、採点レスポンスを高速化しますが、複雑な解答に対する精度が若干低下する可能性があります。
                        </p>
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
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            認識感度を調整します。値が低いほど、かすれた線や薄いマークも解答として認識しやすくなります。値が高いほど、濃くはっきりと書かれたマークのみを解答として認識します。
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
