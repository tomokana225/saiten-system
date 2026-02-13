
import React, { useState } from 'react';
import type { GradingProject, ExportImportOptions } from '../types';
import { FileUpIcon, PlusIcon, Trash2Icon, FileDownIcon, XIcon, Edit3Icon, MergeIcon } from './icons';
import { useProject } from '../context/ProjectContext';

interface ClassSelectionProps {
    projects: Record<string, GradingProject>;
    onProjectSelect: (projectId: string) => void;
    onProjectCreate: (projectName: string) => void;
    onProjectDelete: (projectId: string) => void;
    onProjectImport: () => void;
    // This prop will be added to renderer.tsx later
    onProjectExportWithOptions: (projectId: string, options: ExportImportOptions) => void;
}

const CreateProjectModal = ({ onConfirm, onCancel, projects, initialName = '', title = '新しいテストの作成', confirmText = '作成' }: {
    onConfirm: (name: string) => void;
    onCancel: () => void;
    projects: Record<string, GradingProject>;
    initialName?: string;
    title?: string;
    confirmText?: string;
}) => {
    const [name, setName] = useState(initialName);
    const [error, setError] = useState('');
    
    const handleConfirm = () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError('テスト名を入力してください。');
            return;
        }
        // Allow same name if we are editing and haven't changed it (though usually pointless)
        if (trimmedName !== initialName && Object.values(projects).some(p => p.name === trimmedName)) {
            setError('同じ名前のテストが既に存在します。');
            return;
        }
        onConfirm(trimmedName);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
                <h3 className="text-lg font-semibold">{title}</h3>
                <div>
                    <label htmlFor="project-name-input" className="block text-sm font-medium">テスト名</label>
                    <input id="project-name-input" type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600" autoFocus/>
                    {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
                </div>
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="px-4 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">キャンセル</button>
                    <button onClick={handleConfirm} className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-500">{confirmText}</button>
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
                    <button onClick={onCancel} className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"><XIcon className="w-5 h-5"/></button>
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
                     <button onClick={() => onConfirm(options)} className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-500">エクスポート</button>
                </div>
            </div>
        </div>
    );
};

export const ClassSelection: React.FC<ClassSelectionProps> = ({ projects, onProjectSelect, onProjectCreate, onProjectDelete, onProjectImport, onProjectExportWithOptions }) => {
    const { handleProjectRename, handleProjectMerge } = useProject();
    
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [exportModalProjectId, setExportModalProjectId] = useState<string | null>(null);
    const [renameModalProjectId, setRenameModalProjectId] = useState<string | null>(null);
    const [showMergeModal, setShowMergeModal] = useState(false);
    
    // Selection state for merging
    const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

    // Explicitly type the sort function parameters to 'GradingProject' to resolve property access errors.
    const sortedProjects = Object.values(projects).sort((a: GradingProject, b: GradingProject) => b.lastModified - a.lastModified);
    
    const handleCreateProject = (name: string) => {
        onProjectCreate(name);
        setIsCreateModalOpen(false);
    };

    const handleToggleSelect = (id: string) => {
        setSelectedProjectIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleRenameConfirm = (newName: string) => {
        if (renameModalProjectId) {
            handleProjectRename(renameModalProjectId, newName);
            setRenameModalProjectId(null);
        }
    };

    const handleMergeConfirm = (newName: string) => {
        handleProjectMerge(Array.from(selectedProjectIds), newName);
        setShowMergeModal(false);
        setSelectedProjectIds(new Set());
    };

    return (
        <div className="w-full max-w-4xl mx-auto space-y-8 pb-20">
             {isCreateModalOpen && <CreateProjectModal onConfirm={handleCreateProject} onCancel={() => setIsCreateModalOpen(false)} projects={projects} />}
             
             {renameModalProjectId && projects[renameModalProjectId] && (
                 <CreateProjectModal 
                    initialName={projects[renameModalProjectId].name}
                    title="テスト名の変更"
                    confirmText="変更"
                    onConfirm={handleRenameConfirm} 
                    onCancel={() => setRenameModalProjectId(null)} 
                    projects={projects} 
                />
             )}

             {showMergeModal && (
                 <CreateProjectModal
                    title="テストの結合"
                    confirmText="結合して作成"
                    onConfirm={handleMergeConfirm}
                    onCancel={() => setShowMergeModal(false)}
                    projects={projects}
                 />
             )}

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
                 <button onClick={() => setIsCreateModalOpen(true)} className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-800 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-sky-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors h-48">
                    <PlusIcon className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-2" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">新しいテストを作成</span>
                </button>
                 <button onClick={onProjectImport} className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-800 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-sky-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors h-48">
                    <FileUpIcon className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-2" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">プロジェクトをインポート</span>
                </button>
                {sortedProjects.map((project: GradingProject) => {
                    const isSelected = selectedProjectIds.has(project.id);
                    return (
                        <div key={project.id} className={`group relative bg-white dark:bg-slate-800 rounded-lg shadow-md hover:shadow-lg transition-all flex flex-col h-48 border-2 ${isSelected ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-transparent'}`}>
                            {/* Checkbox for merge selection */}
                            <div className="absolute top-3 left-3 z-10">
                                <input 
                                    type="checkbox" 
                                    checked={isSelected} 
                                    onChange={() => handleToggleSelect(project.id)}
                                    className="w-5 h-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500 cursor-pointer shadow-sm"
                                    onClick={e => e.stopPropagation()} 
                                />
                            </div>

                            <button onClick={() => onProjectSelect(project.id)} className="w-full h-full text-left p-6 pt-8 flex-grow flex flex-col">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2 truncate">{project.name}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 flex-grow">
                                    {project.studentInfo.length} 名の生徒
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                                    最終更新: {new Date(project.lastModified).toLocaleString()}
                                </p>
                            </button>
                             <div className="p-2 border-t dark:border-slate-700 flex justify-end gap-1">
                                 <button onClick={() => setRenameModalProjectId(project.id)} className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-700 transition-colors" title="名前を変更"><Edit3Icon className="w-4 h-4" /></button>
                                 <button onClick={() => setExportModalProjectId(project.id)} className="p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-700 transition-colors" title="エクスポート"><FileDownIcon className="w-4 h-4" /></button>
                                 <button onClick={() => { if(window.confirm(`「${project.name}」を削除しますか？`)) onProjectDelete(project.id) }} className="p-2 rounded-full text-slate-500 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/50 transition-colors" title="削除"><Trash2Icon className="w-4 h-4" /></button>
                             </div>
                        </div>
                    );
                })}
            </div>

            {/* Merge Floating Action Bar */}
            {selectedProjectIds.size > 1 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom-10 z-40">
                    <div className="font-bold">{selectedProjectIds.size}個を選択中</div>
                    <div className="h-6 w-px bg-slate-600"></div>
                    <button 
                        onClick={() => setShowMergeModal(true)}
                        className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 px-4 py-1.5 rounded-full font-bold transition-colors"
                    >
                        <MergeIcon className="w-4 h-4" />
                        結合する
                    </button>
                    <button 
                        onClick={() => setSelectedProjectIds(new Set())}
                        className="p-1 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white"
                        title="キャンセル"
                    >
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
};
