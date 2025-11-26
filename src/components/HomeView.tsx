import React from 'react';
import type { AppMode } from '../types';
import { Edit3Icon, UsersIcon, BarChart3Icon, FilePlusIcon } from './icons';

interface HomeViewProps {
    setAppMode: (mode: AppMode) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ setAppMode }) => {
    const modes = [
        {
            mode: '採点' as AppMode,
            title: '採点モード',
            description: 'テストのテンプレートや生徒の解答を登録し、一括で採点作業を行います。',
            Icon: Edit3Icon,
        },
        {
            mode: '名簿管理' as AppMode,
            title: '名簿管理モード',
            description: '学年やクラスごとの生徒名簿を事前に作成・編集します。採点モードで簡単に読み込めます。',
            Icon: UsersIcon,
        },
        {
            mode: '成績集計' as AppMode,
            title: '成績集計モード',
            description: '複数のテスト（クラス別など）の採点結果を統合し、学年全体の順位や偏差値を算出します。',
            Icon: BarChart3Icon,
        },
        {
            mode: '解答用紙作成' as AppMode,
            title: '解答用紙作成ツール',
            description: 'Excelのようなグリッド操作で、オリジナルの解答用紙を設計・印刷できます。',
            Icon: FilePlusIcon,
        },
    ];

    return (
        <div className="flex-1 flex flex-col justify-center items-center">
            <h1 className="text-4xl font-bold mb-4 text-slate-800 dark:text-slate-200">AI Grading Assistant</h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-12">開始するモードを選択してください</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl w-full">
                {modes.map(({ mode, title, description, Icon }) => (
                    <button
                        key={mode}
                        onClick={() => setAppMode(mode)}
                        className="flex flex-col items-center p-8 bg-white dark:bg-slate-800 rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 text-center"
                    >
                        <div className="p-5 bg-sky-100 dark:bg-sky-900 rounded-full mb-6">
                            <Icon className="w-12 h-12 text-sky-600 dark:text-sky-400" />
                        </div>
                        <h2 className="text-2xl font-semibold mb-3 text-slate-900 dark:text-slate-100">{title}</h2>
                        <p className="text-slate-500 dark:text-slate-400">{description}</p>
                    </button>
                ))}
            </div>
        </div>
    );
};