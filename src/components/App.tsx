import React, { useState, useEffect, useCallback } from 'react';
import { ProjectProvider, useProject } from '../context/ProjectContext';
import { AppMode, AppStep } from '../types';
import type { QuestionStats, AISettings } from '../types';

import { Stepper, FileUpload } from './common';
import { HomeView } from './HomeView';
import { ClassSelection } from './ClassSelection';
import { SettingsView } from './SettingsView';
import { RosterManagementView } from './RosterManagementView';
import { GradeAggregationView } from './GradeAggregationView';
import { AnswerSheetCreator } from './AnswerSheetCreator';
import { Print } from './Print';
import { GradingWorkflow } from './GradingWorkflow';
import { ArrowLeftIcon, SettingsIcon, FileDownIcon, UsersIcon, BarChart3Icon, Edit3Icon, FilePlusIcon } from './icons';

const AppContent: React.FC = () => {
    const {
        projects, rosters, setRosters, sheetLayouts, setSheetLayouts,
        activeProjectId, setActiveProjectId, currentStep, setCurrentStep, previousStep,
        isLoading, activeProject, goToStep, prevStep, nextStep,
        handleProjectSelect, handleProjectCreate, handleProjectDelete,
        handleProjectImport, handleProjectExportWithOptions,
        updateActiveProject
    } = useProject();

    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
    const [appMode, setAppMode] = useState<AppMode>(AppMode.HOME);
    const [printPreviewConfig, setPrintPreviewConfig] = useState<{ open: boolean, initialTab: 'report' | 'sheets', questionStats: QuestionStats[] }>({ open: false, initialTab: 'report', questionStats: [] });
    const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('geminiApiKey') || '');
    const [apiKeyStatus, setApiKeyStatus] = useState<'unchecked' | 'validating' | 'valid' | 'invalid'>('unchecked');

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        localStorage.setItem('theme', theme);
    }, [theme]);
    
    const handleValidateKey = useCallback(async (keyToValidate: string) => {
        if (!keyToValidate) {
            setApiKeyStatus('unchecked');
            return;
        }
        setApiKeyStatus('validating');
        const result = await window.electronAPI.invoke('gemini-validate-key', { apiKey: keyToValidate });
        setApiKeyStatus(result.success ? 'valid' : 'invalid');
        if (!result.success) {
            console.error("API Key validation failed:", result.error);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('geminiApiKey', apiKey);
        if (apiKey) {
            handleValidateKey(apiKey);
        } else {
            setApiKeyStatus('unchecked');
        }
    }, [apiKey, handleValidateKey]);
    
    const handleAiSettingsChange = useCallback((updater: React.SetStateAction<AISettings>) => {
        if (!activeProject) return;
        updateActiveProject(proj => {
            const oldSettings = proj.aiSettings;
            const newSettings = typeof updater === 'function' ? updater(oldSettings) : updater;
            return { ...proj, aiSettings: newSettings, lastModified: Date.now() };
        });
    }, [activeProject, updateActiveProject]);
    
    const goBackFromSettings = useCallback(() => {
        if (previousStep) {
            setCurrentStep(previousStep);
        } else {
            setCurrentStep(AppStep.CLASS_SELECTION);
        }
    }, [previousStep, setCurrentStep]);

    const resetToHome = () => {
        setAppMode(AppMode.HOME);
        setActiveProjectId(null);
        setCurrentStep(AppStep.CLASS_SELECTION);
    };

    const renderContent = () => {
        if (appMode === AppMode.HOME) {
            return <HomeView setAppMode={setAppMode} />;
        }
        if (appMode === AppMode.ROSTER) {
            return <RosterManagementView rosters={rosters} setRosters={setRosters} />;
        }
        if (appMode === AppMode.AGGREGATION) {
            return <GradeAggregationView projects={projects} />;
        }
        if (appMode === AppMode.SHEET_CREATOR) {
            return <AnswerSheetCreator layouts={sheetLayouts} setLayouts={setSheetLayouts} />;
        }
        if (currentStep === AppStep.SETTINGS) {
            return <SettingsView 
               theme={theme} setTheme={setTheme} apiKey={apiKey} onApiKeyChange={setApiKey}
               apiKeyStatus={apiKeyStatus} onValidateKey={() => handleValidateKey(apiKey)}
               aiSettings={activeProject?.aiSettings}
               onAiSettingsChange={activeProject ? handleAiSettingsChange : undefined}
            />;
        }
        if (appMode === AppMode.GRADING) {
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
            return <GradingWorkflow apiKey={apiKey} setPrintPreviewConfig={setPrintPreviewConfig} />;
        }
        return <p>Invalid state</p>;
    };

    const isNavVisible = appMode !== AppMode.HOME;
    const isGradingMode = appMode === AppMode.GRADING;
    const showBackButton = isGradingMode && currentStep !== AppStep.CLASS_SELECTION && activeProject;
    const isStepView = isGradingMode && currentStep !== AppStep.CLASS_SELECTION && activeProject && currentStep !== AppStep.SETTINGS;
    const isSettingsView = currentStep === AppStep.SETTINGS;
    const modeIcons: { [key in AppMode]: React.FC<{className: string}> } = {
        [AppMode.HOME]: UsersIcon, [AppMode.GRADING]: Edit3Icon, [AppMode.ROSTER]: UsersIcon,
        [AppMode.AGGREGATION]: BarChart3Icon, [AppMode.SHEET_CREATOR]: FilePlusIcon,
    };
    const ModeIcon = modeIcons[appMode];

    return (
        <div className="h-screen w-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
            {isLoading && (
                 <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-sky-400"></div>
                 </div>
            )}
            {printPreviewConfig.open && activeProject && <Print initialTab={printPreviewConfig.initialTab} questionStats={printPreviewConfig.questionStats} onClose={() => setPrintPreviewConfig({ ...printPreviewConfig, open: false })} />}
            
            {isNavVisible && (
                 <header className="flex-shrink-0 w-full p-2 bg-white dark:bg-slate-800 shadow-md flex justify-between items-center z-20">
                    <div className="flex items-center gap-4">
                        <button onClick={resetToHome} className="text-lg font-bold p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md">AI Grading Assistant</button>
                        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700"></div>
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                           <ModeIcon className="w-5 h-5" />
                           <span>
                                {appMode === AppMode.GRADING && '採点モード'}
                                {appMode === AppMode.ROSTER && '名簿管理モード'}
                                {appMode === AppMode.AGGREGATION && '成績集計モード'}
                                {appMode === AppMode.SHEET_CREATOR && '解答用紙作成ツール'}
                           </span>
                           {isGradingMode && activeProject && <span className="font-semibold text-slate-800 dark:text-slate-200">&gt; {activeProject.name}</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isGradingMode && activeProject && <button onClick={() => handleProjectExportWithOptions(activeProject.id, { includeTemplate: true, includeStudents: true, includeAnswers: true })} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors"><FileDownIcon className="w-4 h-4" />エクスポート</button>}
                        <button onClick={() => goToStep(AppStep.SETTINGS)} className={`p-2 rounded-full ${currentStep === AppStep.SETTINGS ? 'bg-slate-200 dark:bg-slate-700' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}><SettingsIcon className="w-5 h-5"/></button>
                    </div>
                </header>
            )}

            <main className="flex-1 flex flex-col p-4 overflow-hidden">
                {isStepView && (
                    <div className="flex-shrink-0 mb-4 flex items-center gap-4">
                        {showBackButton && <button onClick={prevStep} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><ArrowLeftIcon className="w-5 h-5"/></button>}
                        <div className="flex-grow">
                            <Stepper currentStep={currentStep} />
                        </div>
                         {currentStep !== AppStep.RESULTS && <button onClick={nextStep} disabled={!activeProject?.template} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-md disabled:bg-slate-400">次へ</button>}
                    </div>
                )}
                {isSettingsView && (
                    <div className="flex-shrink-0 mb-4 flex items-center gap-4">
                        <button onClick={goBackFromSettings} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">
                            <ArrowLeftIcon className="w-5 h-5"/>
                        </button>
                        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">設定</h2>
                    </div>
                )}
                <div className="flex-1 flex flex-col overflow-auto">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export const App: React.FC = () => {
    return (
        <ProjectProvider>
            <AppContent />
        </ProjectProvider>
    );
};