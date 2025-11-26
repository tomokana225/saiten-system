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
        handleProjectExportWithOptions
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
                <div className="flex-1 flex flex-col justify-center items-center">
                    <h2 className="text-xl font-semibold mb-4">1. 解答のテンプレートをアップロード</h2>
                    <FileUpload id="template-upload" onFilesUpload={handleTemplateUpload} title="クリックしてファイルを選択またはドラッグ＆ドロップ" description="解答が書き込まれていない、マスターとなるテスト用紙をアップロードしてください。" multiple={false} />
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
                     <FileUpload id="student-sheets-upload" onFilesUpload={handleStudentSheetsUpload} title="クリックしてファイルを選択またはドラッグ＆ドロップ" description="生徒全員分の解答用紙をまとめてアップロードしてください。" multiple={true} />
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
