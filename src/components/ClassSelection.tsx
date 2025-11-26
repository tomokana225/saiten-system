import React, { useState } from 'react';
import type { GradingProject, ExportImportOptions } from '../types';
import { FileUpIcon, PlusIcon, Trash2Icon, FileDownIcon, XIcon } from './icons';

interface ClassSelectionProps {
    projects: Record<string, GradingProject>;
    onProjectSelect: (projectId: string) => void;
    onProjectCreate: (projectName: string) => void;
    onProjectDelete: (projectId: string) => void;
    onProjectImport: () => void;
    // This prop will be added to renderer.tsx later
    onProjectExportWithOptions: (projectId: string, options: ExportImportOptions) => void;
}

const CreateProjectModal = ({ onConfirm, onCancel, projects }: {
    onConfirm: (name: string) => void;
    onCancel: () => void;
    projects: Record<string, GradingProject>;
}) => {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    
    const handleConfirm = () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError('テスト名を入力してください。');
            return;
        }
        if (Object.values(projects).some(p => p.name === trimmedName)) {
            setError('同じ名前のテストが既に存在します。');
            return;
        }
        onConfirm(trimmedName);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
                <h3 className="text-lg font-semibold">新しいテストの作成</h3>
                <div>
                    <label htmlFor="new-project-name" className="block text-sm font-medium">テスト名</label>
                    <input id="new-project-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full p-2 border rounded-md" autoFocus/>
                    {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
                </div>
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="px-4 py-2 rounded-md">キャンセル</button>
                    <button onClick={handleConfirm} className="px-4 py-2 bg-sky-600 text-white rounded-md">作成</button>
                </div>
            </div>
        </div>
    );
};

const ExportOptionsModal = ({ project, onConfirm, onCancel }: {
    project: GradingProject;
    onConfirm: (options: ExportImportOptions) => void;
    onCancel: () => void;
}) => {
    const [options, setOptions] = useState<ExportImportOptions>({
        includeTemplate: true,
        includeStudents: true,
        includeAnswers: true,
    });
    
    const handleToggle = (option: keyof ExportImportOptions) => {
        setOptions(prev => ({...prev, [option]: !prev[option]}));
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">エクスポートオプション</h3>
                    <button onClick={onCancel} className="p-1 rounded-full"><XIcon className="w-5 h-5"/></button>
                </div>
                <p>エクスポートするデータを選択してください:</p>
                <div className="space-y-2">
                    <label className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">
                        <input type="checkbox" checked={options.includeTemplate} onChange={() => handleToggle('includeTemplate')} className="h-5 w-5 rounded"/>
                        <span>テンプレートと領域・配点設定</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">
                        <input type="checkbox" checked={options.includeStudents} onChange={() => handleToggle('includeStudents')} className="h-5 w-5 rounded"/>
                        <span>生徒情報</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">
                        <input type="checkbox" checked={options.includeAnswers} onChange={() => handleToggle('includeAnswers')} className="h-5 w-5 rounded"/>
                        <span>答案データと採点結果</span>
                    </label>
                </div>
                <div className="flex justify-end gap-2">
                     <button onClick={() => onConfirm(options)} className="px-4 py-2 bg-sky-600 text-white rounded-md">エクスポート</button>
                </div>
            </div>
        </div>
    );
};

export const ClassSelection: React.FC<ClassSelectionProps> = ({ projects, onProjectSelect, onProjectCreate, onProjectDelete, onProjectImport, onProjectExportWithOptions }) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [exportModalProjectId, setExportModalProjectId] = useState<string | null>(null);

    // FIX: Explicitly type the sort function parameters to 'GradingProject' to resolve property access errors.
    const sortedProjects = Object.values(projects).sort((a: GradingProject, b: GradingProject) => b.lastModified - a.lastModified);
    
    const handleCreateProject = (name: string) => {
        onProjectCreate(name);
        setIsCreateModalOpen(false);
    };

    return (
        <div className="w-full max-w-4xl mx-auto space-y-8">
             {isCreateModalOpen && <CreateProjectModal onConfirm={handleCreateProject} onCancel={() => setIsCreateModalOpen(false)} projects={projects} />}
             {exportModalProjectId && projects[exportModalProjectId] && (
                <ExportOptionsModal
                    project={projects[exportModalProjectId]}
                    onConfirm={(options) => {
                        onProjectExportWithOptions(exportModalProjectId, options);
                        setExportModalProjectId(null);
                    }}
                    onCancel={() => setExportModalProjectId(null)}
                />
             )}
            <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">テストを選択</h2>
                <p className="text-slate-600 dark:text-slate-400">作業を再開するテストを選択するか、新しいテストを作成してください。</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 <button onClick={() => setIsCreateModalOpen(true)} className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-800 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-sky-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <PlusIcon className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-2" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">新しいテストを作成</span>
                </button>
                 <button onClick={onProjectImport} className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-800 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-sky-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <FileUpIcon className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-2" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">プロジェクトをインポート</span>
                </button>
                {/* FIX: Explicitly type the map function parameter to 'GradingProject' to resolve property access errors. */}
                {sortedProjects.map((project: GradingProject) => (
                    <div key={project.id} className="group relative bg-white dark:bg-slate-800 rounded-lg shadow-md hover:shadow-lg transition-shadow flex flex-col">
                        <button onClick={() => onProjectSelect(project.id)} className="w-full h-full text-left p-6 flex-grow">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2 truncate">{project.name}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {project.studentInfo.length} 名の生徒
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
                                最終更新: {new Date(project.lastModified).toLocaleString()}
                            </p>
                        </button>
                         <div className="p-2 border-t dark:border-slate-700 flex justify-end gap-2">
                             <button onClick={() => setExportModalProjectId(project.id)} className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" title="エクスポート"><FileDownIcon className="w-5 h-5" /></button>
                             <button onClick={() => { if(window.confirm(`「${project.name}」を削除しますか？`)) onProjectDelete(project.id) }} className="p-2 rounded-full text-slate-500 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/50" title="削除"><Trash2Icon className="w-5 h-5" /></button>
                         </div>
                    </div>
                ))}
            </div>
        </div>
    );
};