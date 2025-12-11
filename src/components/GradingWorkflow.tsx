import React, { useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { AppStep } from '../types';
import type { QuestionStats, Student } from '../types';

import { FileUpload } from './common';
import { TemplateEditor } from './TemplateEditor';
import { StudentInfoInput } from './StudentInfoInput';
import { StudentVerificationEditor } from './StudentVerificationEditor';
import { PointAllocator } from './PointAllocator';
import { GradingView } from './GradingView';
import { ResultsView } from './ResultsView';
import { ClassSelection } from './ClassSelection';
import { Trash2Icon, ArrowRightIcon, RotateCcwIcon, CheckCircle2Icon } from './icons';


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
        uploadFilesRaw,
        updateActiveProject,
        projects,
        handleProjectSelect,
        handleProjectCreate,
        handleProjectDelete,
        handleProjectImport,
        handleProjectExportWithOptions,
        nextStep,
    } = useProject();

    const [uploadMode, setUploadMode] = useState<'interleaved' | 'split'>('interleaved');
    const [splitBatches, setSplitBatches] = useState<Record<number, { files: {path: string, name: string}[], isReversed: boolean }>>({});

    if (!activeProject) {
        return <ClassSelection 
            projects={projects} 
            onProjectSelect={handleProjectSelect} 
            onProjectCreate={handleProjectCreate} 
            onProjectDelete={handleProjectDelete} 
            onProjectImport={handleProjectImport} 
            onProjectExportWithOptions={handleProjectExportWithOptions}
        />;
    }

    const handleSplitBatchUpload = async (pageIndex: number, files: File[]) => {
        try {
            const processed = await uploadFilesRaw(files);
            setSplitBatches(prev => ({
                ...prev,
                [pageIndex]: {
                    files: [...(prev[pageIndex]?.files || []), ...processed],
                    isReversed: prev[pageIndex]?.isReversed || false
                }
            }));
        } catch (e) {
            alert('アップロードに失敗しました');
        }
    };

    const toggleBatchReverse = (pageIndex: number) => {
        setSplitBatches(prev => ({
            ...prev,
            [pageIndex]: { ...prev[pageIndex], isReversed: !prev[pageIndex]?.isReversed }
        }));
    };

    const clearBatch = (pageIndex: number) => {
        setSplitBatches(prev => {
            const next = { ...prev };
            delete next[pageIndex];
            return next;
        });
    };

    const handleCombineAndProceed = () => {
        const pagesPerStudent = activeProject.template?.pages?.length || 1;
        const newSheets: Student[] = [];
        
        // Find max number of students across all batches
        let maxStudents = 0;
        for (let i = 0; i < pagesPerStudent; i++) {
            if (splitBatches[i]?.files) {
                maxStudents = Math.max(maxStudents, splitBatches[i].files.length);
            }
        }

        if (maxStudents === 0) {
            alert('ファイルがアップロードされていません。');
            return;
        }

        // Prepare batches (apply reverse if needed)
        const finalizedBatches: {path: string, name: string}[][] = [];
        for (let i = 0; i < pagesPerStudent; i++) {
            const batch = splitBatches[i];
            if (!batch) {
                finalizedBatches[i] = [];
                continue;
            }
            if (batch.isReversed) {
                finalizedBatches[i] = [...batch.files].reverse();
            } else {
                finalizedBatches[i] = [...batch.files];
            }
        }

        // Zip them together
        for (let s = 0; s < maxStudents; s++) {
            const studentImages: (string | null)[] = [];
            const names: string[] = [];
            
            for (let p = 0; p < pagesPerStudent; p++) {
                const file = finalizedBatches[p][s];
                if (file) {
                    studentImages.push(file.path);
                    names.push(file.name);
                } else {
                    studentImages.push(null);
                }
            }

            const baseName = names[0] || `Student ${s+1}`;
            newSheets.push({
                id: `combined-${Date.now()}-${s}`,
                originalName: baseName,
                filePath: studentImages[0],
                images: studentImages
            });
        }

        updateActiveProject(p => ({ ...p, uploadedSheets: newSheets, lastModified: Date.now() }));
        nextStep();
    };

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
            const pagesCount = activeProject.template?.pages?.length || 1;
            
            return (
                <div className="flex-1 flex flex-col items-center h-full max-w-5xl mx-auto w-full">
                    <h2 className="text-xl font-semibold mb-4 text-slate-800 dark:text-slate-200">4. 生徒の解答用紙をアップロード</h2>
                    
                    {/* Mode Toggle */}
                    <div className="flex p-1 bg-slate-200 dark:bg-slate-700 rounded-lg mb-6">
                        <button 
                            onClick={() => setUploadMode('interleaved')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${uploadMode === 'interleaved' ? 'bg-white dark:bg-slate-600 shadow text-sky-600 dark:text-sky-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                        >
                            一括アップロード (1人ずつ)
                        </button>
                        <button 
                            onClick={() => setUploadMode('split')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${uploadMode === 'split' ? 'bg-white dark:bg-slate-600 shadow text-sky-600 dark:text-sky-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                        >
                            分けてアップロード (ページごと)
                        </button>
                    </div>

                    {uploadMode === 'interleaved' ? (
                        <div className="w-full flex-1 flex flex-col items-center justify-center">
                            <div className="w-full max-w-lg">
                                <FileUpload 
                                    id="student-sheets-upload" 
                                    onFilesUpload={handleStudentSheetsUpload} 
                                    title="ファイルをまとめてアップロード" 
                                    description={`生徒全員分の解答用紙をまとめてアップロードしてください。ファイル名の順に、1人あたり${pagesCount}枚ずつ割り当てられます。`} 
                                    multiple={true} 
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="w-full flex-1 flex flex-col">
                            <div className="text-sm text-slate-500 mb-4 text-center">
                                ページ（表面・裏面など）ごとにファイルを分けてアップロードします。枚数が合わない場合は自動的に空欄で埋められます。
                            </div>
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto p-2">
                                {Array.from({ length: pagesCount }).map((_, index) => {
                                    const batch = splitBatches[index];
                                    const fileCount = batch?.files?.length || 0;
                                    const isReversed = batch?.isReversed || false;

                                    return (
                                        <div key={index} className="flex flex-col bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <h4 className="font-semibold text-slate-700 dark:text-slate-300">
                                                    {index + 1}枚目 ({index === 0 ? '表面' : index === 1 ? '裏面' : `Page ${index + 1}`})
                                                </h4>
                                                {fileCount > 0 && <span className="text-xs bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">{fileCount}ファイル</span>}
                                            </div>
                                            
                                            {fileCount === 0 ? (
                                                <FileUpload 
                                                    id={`batch-upload-${index}`}
                                                    onFilesUpload={(files) => handleSplitBatchUpload(index, files)}
                                                    title="アップロード"
                                                    description="ドラッグ＆ドロップ"
                                                    multiple={true}
                                                />
                                            ) : (
                                                <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-800 border-2 border-dashed border-sky-300 rounded-lg p-4 gap-2">
                                                    <CheckCircle2Icon className="w-8 h-8 text-green-500"/>
                                                    <p className="text-sm">アップロード完了</p>
                                                    <button onClick={() => clearBatch(index)} className="text-xs text-red-500 hover:underline">やり直す</button>
                                                </div>
                                            )}

                                            {/* Options for 2nd page onwards */}
                                            {index > 0 && (
                                                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                                        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${isReversed ? 'bg-sky-500' : 'bg-slate-300'}`}>
                                                            <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${isReversed ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                        </div>
                                                        <input type="checkbox" className="hidden" checked={isReversed} onChange={() => toggleBatchReverse(index)} />
                                                        <span className="text-xs text-slate-600 dark:text-slate-400">逆順にする (ADF用)</span>
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-4 flex justify-end">
                                <button 
                                    onClick={handleCombineAndProceed}
                                    disabled={Object.keys(splitBatches).length === 0}
                                    className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                                >
                                    結合して次へ
                                    <ArrowRightIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}
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