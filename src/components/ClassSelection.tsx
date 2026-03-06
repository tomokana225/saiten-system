
import React, { useState, useMemo } from 'react';
import type { GradingProject, ExportImportOptions } from '../types';
import { FileUpIcon, PlusIcon, Trash2Icon, FileDownIcon, XIcon, Edit3Icon, MergeIcon } from './icons';
import { useProject } from '../context/ProjectContext';

interface ClassSelectionProps {
    projects: Record<string, GradingProject>;
    onProjectSelect: (projectId: string) => void;
    onProjectCreate: (projectName: string, testName?: string, className?: string) => void;
    onProjectDelete: (projectId: string) => void;
    onProjectImport: () => void;
    onProjectExportWithOptions: (projectId: string, options: ExportImportOptions) => void;
}

const CreateProjectModal = ({ onConfirm, onCancel, projects, initialName = '', initialTestName = '', initialClassName = '', title = '新しいテストの作成', confirmText = '作成' }: {
    onConfirm: (name: string, testName: string, className: string) => void;
    onCancel: () => void;
    projects: Record<string, GradingProject>;
    initialName?: string;
    initialTestName?: string;
    initialClassName?: string;
    title?: string;
    confirmText?: string;
}) => {
    const [name, setName] = useState(initialName);
    const [testName, setTestName] = useState(initialTestName);
    const [className, setClassName] = useState(initialClassName);
    const [error, setError] = useState('');
    
    const handleConfirm = () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError('プロジェクト名を入力してください。');
            return;
        }
        onConfirm(trimmedName, testName.trim(), className.trim());
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
                <h3 className="text-lg font-semibold">{title}</h3>
                <div className="space-y-3">
                    <div>
                        <label htmlFor="project-name-input" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">プロジェクト名 (管理用)</label>
                        <input id="project-name-input" type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600" placeholder="例: 2024年度 第1回 中間考査 数学A" autoFocus/>
                        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="test-name-input" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">テスト名</label>
                            <input id="test-name-input" type="text" value={testName} onChange={(e) => setTestName(e.target.value)} className="mt-1 w-full p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600" placeholder="例: 中間考査"/>
                        </div>
                        <div>
                            <label htmlFor="class-name-input" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">クラス/組</label>
                            <input id="class-name-input" type="text" value={className} onChange={(e) => setClassName(e.target.value)} className="mt-1 w-full p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600" placeholder="例: 1年1組"/>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
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
    
    const handleCreateProject = (name: string, testName: string, className: string) => {
        onProjectCreate(name, testName, className);
        setIsCreateModalOpen(false);
    };

    const handleRenameConfirm = (newName: string, newTestName: string, newClassName: string) => {
        if (renameModalProjectId) {
            handleProjectRename(renameModalProjectId, newName, newTestName, newClassName); 
            setRenameModalProjectId(null);
        }
    };

    const handleMergeConfirm = (newName: string, testName: string, className: string) => {
        handleProjectMerge(Array.from(selectedProjectIds), newName, testName, className);
        setShowMergeModal(false);
        setSelectedProjectIds(new Set());
    };

    // Grouping logic
    const groupedProjects = useMemo(() => {
        const groups: Record<string, GradingProject[]> = {};
        Object.values(projects).forEach(p => {
            const key = p.testName || 'その他';
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
        // Sort each group by lastModified
        Object.keys(groups).forEach(key => {
            groups[key].sort((a, b) => b.lastModified - a.lastModified);
        });
        return groups;
    }, [projects]);

    const testNames = useMemo(() => {
        return Object.keys(groupedProjects).sort((a, b) => {
            if (a === 'その他') return 1;
            if (b === 'その他') return -1;
            return a.localeCompare(b);
        });
    }, [groupedProjects]);

    return (
        <div className="w-full max-w-5xl mx-auto space-y-8 pb-20">
             {isCreateModalOpen && <CreateProjectModal onConfirm={handleCreateProject} onCancel={() => setIsCreateModalOpen(false)} projects={projects} />}
             
             {renameModalProjectId && projects[renameModalProjectId] && (
                 <CreateProjectModal 
                    initialName={projects[renameModalProjectId].name}
                    initialTestName={projects[renameModalProjectId].testName}
                    initialClassName={projects[renameModalProjectId].className}
                    title="プロジェクト情報の変更"
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

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">採点記録</h2>
                    <p className="text-slate-600 dark:text-slate-400">作業を再開するテストを選択するか、新しいテストを作成してください。</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onProjectImport} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm">
                        <FileUpIcon className="w-4 h-4" />
                        インポート
                    </button>
                    <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-500 transition-colors text-sm font-bold shadow-sm">
                        <PlusIcon className="w-4 h-4" />
                        新規作成
                    </button>
                </div>
            </div>
            
            <div className="space-y-10">
                {testNames.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                        <Edit3Icon className="w-12 h-12 text-slate-300 mb-4" />
                        <p className="text-slate-500">まだ採点記録がありません。「新規作成」から始めてください。</p>
                    </div>
                )}

                {testNames.map(testName => (
                    <section key={testName} className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-6 w-1 bg-sky-500 rounded-full"></div>
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">{testName}</h3>
                            <span className="text-xs font-medium px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded-full text-slate-500">{groupedProjects[testName].length}件</span>
                        </div>
                        
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                                        <th className="p-4 w-12">
                                            <input 
                                                type="checkbox" 
                                                className="w-5 h-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                                onChange={(e) => {
                                                    const allIds = groupedProjects[testName].map(p => p.id);
                                                    setSelectedProjectIds(prev => {
                                                        const next = new Set(prev);
                                                        if (e.target.checked) {
                                                            allIds.forEach(id => next.add(id));
                                                        } else {
                                                            allIds.forEach(id => next.delete(id));
                                                        }
                                                        return next;
                                                    });
                                                }}
                                                checked={groupedProjects[testName].every(p => selectedProjectIds.has(p.id))}
                                            />
                                        </th>
                                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">クラス</th>
                                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">プロジェクト名</th>
                                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">生徒数</th>
                                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">最終更新</th>
                                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupedProjects[testName].map((project: GradingProject) => {
                                        const isSelected = selectedProjectIds.has(project.id);
                                        return (
                                            <tr 
                                                key={project.id} 
                                                onClick={() => onProjectSelect(project.id)}
                                                className={`group border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer ${isSelected ? 'bg-sky-50/50 dark:bg-sky-900/10' : ''}`}
                                            >
                                                <td className="p-4" onClick={e => e.stopPropagation()}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isSelected} 
                                                        onChange={() => handleToggleSelect(project.id)}
                                                        className="w-5 h-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    {project.className ? (
                                                        <span className="text-xs font-bold px-2 py-1 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 rounded">
                                                            {project.className}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-300 dark:text-slate-600">-</span>
                                                    )}
                                                </td>
                                                <td className="p-4">
                                                    <div className="font-bold text-slate-900 dark:text-slate-100">{project.name}</div>
                                                </td>
                                                <td className="p-4 text-sm text-slate-600 dark:text-slate-400">
                                                    {project.studentInfo.length} 名
                                                </td>
                                                <td className="p-4 text-xs text-slate-500 dark:text-slate-500">
                                                    {new Date(project.lastModified).toLocaleString()}
                                                </td>
                                                <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                                                    <div className="flex justify-end gap-1">
                                                        <button onClick={() => setRenameModalProjectId(project.id)} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-700 transition-colors" title="名前を変更"><Edit3Icon className="w-4 h-4" /></button>
                                                        <button onClick={() => setExportModalProjectId(project.id)} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-700 transition-colors" title="エクスポート"><FileDownIcon className="w-4 h-4" /></button>
                                                        <button onClick={() => { if(window.confirm(`「${project.name}」を削除しますか？`)) onProjectDelete(project.id) }} className="p-2 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/50 transition-colors" title="削除"><Trash2Icon className="w-4 h-4" /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ))}
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
