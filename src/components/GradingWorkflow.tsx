import React from 'react';
import { useProject } from '../context/ProjectContext';
import { AppStep } from '../types';
import type { QuestionStats } from '../types';

import { FileUpload } from './common';
import { TemplateEditor } from './TemplateEditor';
import { StudentInfoInput } from './StudentInfoInput';
import { StudentVerificationEditor } from './StudentVerificationEditor';
import { PointAllocator } from './PointAllocator';
import { GradingView } from './GradingView';
import { ResultsView } from './ResultsView';
import { ClassSelection } from './ClassSelection';
import { Trash2Icon, ArrowRightIcon, RotateCcwIcon } from './icons';


interface GradingWorkflowProps {
    apiKey: string;
    setPrintPreviewConfig: (config: { open: boolean, initialTab: 'report' | 'sheets', questionStats: QuestionStats[] }) => void;
}

export const GradingWorkflow: React.FC<GradingWorkflowProps> = ({ apiKey, setPrintPreviewConfig }) => {
    const { 
        activeProject, 
        currentStep,
        handleTemplateUpload,
        handleStudentSheetsUpload,
        projects,
        handleProjectSelect,
        handleProjectCreate,
        handleProjectDelete,
        handleProjectImport,
        handleProjectExportWithOptions,
        nextStep,
        updateActiveProject
    } = useProject();

    if (!activeProject) {
        // This case should ideally be handled in App.tsx, but as a fallback:
        return <ClassSelection 
            projects={projects} 
            onProjectSelect={handleProjectSelect} 
            onProjectCreate={handleProjectCreate} 
            onProjectDelete={handleProjectDelete} 
            onProjectImport={handleProjectImport} 
            onProjectExportWithOptions={handleProjectExportWithOptions}
        />;
    }

    switch (currentStep) {
        case AppStep.TEMPLATE_UPLOAD:
            return (
                <div className="flex-1 flex flex-col items-center h-full">
                    <h2 className="text-xl font-semibold mb-4 text-slate-800 dark:text-slate-200">1. 解答のテンプレートをアップロード</h2>
                    <div className="w-full max-w-4xl flex-1 flex flex-col gap-6 overflow-hidden">
                        <div className="flex-shrink-0">
                            <FileUpload id="template-upload" onFilesUpload={handleTemplateUpload} title="クリックしてファイルを選択またはドラッグ＆ドロップ" description="解答が書き込まれていない、マスターとなるテスト用紙をアップロードしてください。複数ファイル・複数ページに対応しています。" multiple={true} />
                        </div>
                        
                        {activeProject.template && activeProject.template.pages && activeProject.template.pages.length > 0 && (
                            <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 overflow-hidden border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm font-semibold mb-2 text-slate-600 dark:text-slate-300">アップロードされたページ ({activeProject.template.pages.length}枚)</h3>
                                <div className="flex-1 overflow-y-auto pr-2">
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {activeProject.template.pages.map((page, index) => (
                                            <div key={index} className="relative group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden aspect-[1/1.414]">
                                                <img src={page.imagePath} alt={`Page ${index + 1}`} className="w-full h-full object-contain" />
                                                <div className="absolute top-0 left-0 bg-black/50 text-white text-xs px-2 py-1 rounded-br-md">
                                                    Page {index + 1}
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        const newPages = [...activeProject.template!.pages];
                                                        newPages.splice(index, 1);
                                                        updateActiveProject(p => ({
                                                            ...p,
                                                            template: { ...p.template!, pages: newPages },
                                                            lastModified: Date.now()
                                                        }));
                                                    }}
                                                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                                    title="削除"
                                                >
                                                    <Trash2Icon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex-shrink-0 mt-4 flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-700">
                                    <button 
                                        onClick={() => {
                                            if(window.confirm('すべてのページを削除してもよろしいですか？')) {
                                                updateActiveProject(p => ({ ...p, template: null, lastModified: Date.now() }));
                                            }
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                                    >
                                        <RotateCcwIcon className="w-4 h-4" />
                                        リセット
                                    </button>
                                    <div className="flex items-center gap-4">
                                        <div className="text-sm text-slate-500">
                                            テストの全ページが揃っているか確認してください。<br/>
                                            生徒1人につき {activeProject.template.pages.length} 枚の解答用紙として処理されます。
                                        </div>
                                        <button 
                                            onClick={nextStep}
                                            className="flex items-center gap-2 px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-md font-bold shadow-sm transition-transform active:scale-95"
                                        >
                                            枚数を確定して次へ
                                            <ArrowRightIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
        case AppStep.AREA_SELECTION:
            return activeProject.template ? <TemplateEditor apiKey={apiKey} /> : null;
        case AppStep.STUDENT_INFO_INPUT:
            return <StudentInfoInput />;
        case AppStep.STUDENT_UPLOAD:
            return (
                <div className="flex-1 flex flex-col justify-center items-center">
                    <h2 className="text-xl font-semibold mb-4">4. 生徒の解答用紙をアップロード</h2>
                     <FileUpload id="student-sheets-upload" onFilesUpload={handleStudentSheetsUpload} title="クリックしてファイルを選択またはドラッグ＆ドロップ" description={`生徒全員分の解答用紙をまとめてアップロードしてください。テンプレートに基づき、1人あたり${activeProject.template?.pages?.length || 1}枚ずつ自動的に割り当てられます。`} multiple={true} />
                </div>
            );
        case AppStep.STUDENT_VERIFICATION:
            return <StudentVerificationEditor />;
        case AppStep.POINT_ALLOCATION:
            return <PointAllocator />;
        case AppStep.GRADING:
            return <GradingView apiKey={apiKey} />;
        case AppStep.RESULTS:
            return <ResultsView onPreviewOpen={setPrintPreviewConfig} />;
        default:
             return <ClassSelection 
                projects={projects} 
                onProjectSelect={handleProjectSelect} 
                onProjectCreate={handleProjectCreate} 
                onProjectDelete={handleProjectDelete} 
                onProjectImport={handleProjectImport} 
                onProjectExportWithOptions={handleProjectExportWithOptions}
            />;
    }
};