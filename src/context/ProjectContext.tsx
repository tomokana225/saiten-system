import React, { createContext, useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { AppStep, ScoringStatus } from '../types';
import type { GradingProject, Template, Area, StudentInfo, Student, Point, AllScores, StudentResult, Roster, SheetLayout, ExportImportOptions, ScoreData, AreaType } from '../types';
import { fileToArrayBuffer, loadImage } from '../utils';

// Helper function to convert data URL to ArrayBuffer
const dataUrlToArrayBuffer = (dataUrl: string): ArrayBuffer | null => {
    try {
        const base64 = dataUrl.split(',')[1];
        if (!base64) return null;
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    } catch (error) {
        console.error("Failed to convert data URL to ArrayBuffer:", error);
        return null;
    }
};

interface ProjectContextType {
    // State
    projects: Record<string, GradingProject>;
    rosters: Record<string, Roster>;
    sheetLayouts: Record<string, SheetLayout>;
    activeProjectId: string | null;
    currentStep: AppStep;
    previousStep: AppStep | null;
    isLoading: boolean;

    // Memoized values
    activeProject: GradingProject | null;
    calculatedResults: StudentResult[];
    studentsWithInfo: (Student & StudentInfo)[];

    // Setters & Handlers
    setProjects: React.Dispatch<React.SetStateAction<Record<string, GradingProject>>>;
    setRosters: React.Dispatch<React.SetStateAction<Record<string, Roster>>>;
    setSheetLayouts: React.Dispatch<React.SetStateAction<Record<string, SheetLayout>>>;
    setActiveProjectId: React.Dispatch<React.SetStateAction<string | null>>;
    setCurrentStep: React.Dispatch<React.SetStateAction<AppStep>>;
    setPreviousStep: React.Dispatch<React.SetStateAction<AppStep | null>>;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    updateActiveProject: (updater: (project: GradingProject) => GradingProject) => void;
    handleProjectCreate: (projectName: string) => void;
    handleProjectSelect: (projectId: string) => void;
    handleProjectDelete: (projectId: string) => void;
    handleProjectImport: () => Promise<void>;
    handleProjectExportWithOptions: (projectId: string, options: ExportImportOptions) => Promise<void>;
    nextStep: () => void;
    prevStep: () => void;
    goToStep: (step: AppStep) => void;
    handleTemplateUpload: (files: File[]) => Promise<void>;
    handleStudentSheetsUpload: (files: File[]) => Promise<void>;
    handleAreasChange: (areas: Area[]) => void;
    handleTemplateChange: (templateUpdates: Partial<Template>) => void;
    handleStudentInfoChange: (studentInfo: StudentInfo[]) => void;
    handleStudentSheetsChange: (sheets: Student[]) => void;
    handlePointsChange: (newPoints: Point[]) => void;
    handleScoresChange: (scoresOrUpdater: AllScores | ((prevScores: AllScores) => AllScores)) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [projects, setProjects] = useState<Record<string, GradingProject>>({});
    const [rosters, setRosters] = useState<Record<string, Roster>>({});
    const [sheetLayouts, setSheetLayouts] = useState<Record<string, SheetLayout>>({});
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.CLASS_SELECTION);
    const [previousStep, setPreviousStep] = useState<AppStep | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const activeProject = useMemo(() => {
        if (!activeProjectId || !projects[activeProjectId]) return null;
        return projects[activeProjectId];
    }, [activeProjectId, projects]);

    useEffect(() => {
        const initializeData = async () => {
            setIsLoading(true);
            try {
                const storedProjects = JSON.parse(localStorage.getItem('gradingProjects') || '{}');
                for (const proj of Object.values(storedProjects) as GradingProject[]) {
                    if ((proj.template as any)?.dataUrl) {
                        const buffer = dataUrlToArrayBuffer((proj.template as any).dataUrl);
                        if (buffer) {
                            proj.template.filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName: proj.template.name });
                        }
                        delete (proj.template as any).dataUrl;
                    }
                    if (proj.uploadedSheets) {
                        for (const sheet of proj.uploadedSheets) {
                            if ((sheet as any).dataUrl) {
                                const buffer = dataUrlToArrayBuffer((sheet as any).dataUrl);
                                if(buffer) {
                                     sheet.filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName: sheet.originalName });
                                }
                                delete (sheet as any).dataUrl;
                            }
                        }
                    }
                }
                setProjects(storedProjects);
                setRosters(JSON.parse(localStorage.getItem('rosters') || '{}'));
                const storedLayouts = JSON.parse(localStorage.getItem('sheetLayouts') || '{}');
                Object.values(storedLayouts).forEach((layout: any) => {
                    if (!layout.cells) layout.cells = [];
                    const rows = layout.rows || layout.cells.length || 20;
                    const cols = layout.cols || layout.cells[0]?.length || 10;
                    if (!layout.rowHeights || layout.rowHeights.length !== rows) layout.rowHeights = Array(rows).fill(30);
                    if (!layout.colWidths || layout.colWidths.length !== cols) layout.colWidths = Array(cols).fill(80);
                    layout.rows = rows;
                    layout.cols = cols;
                });
                setSheetLayouts(storedLayouts);
            } catch (error) {
                console.error("Failed to initialize data:", error);
            } finally {
                setIsLoading(false);
            }
        };
        initializeData();
    }, []);

    useEffect(() => {
        const persistProjects = () => {
            if (isLoading) return; // Don't save while initially loading
            try {
                // Directly save the projects object, which contains file paths instead of large data URLs.
                localStorage.setItem('gradingProjects', JSON.stringify(projects));
            } catch (error) {
                if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                    alert('ストレージ容量の上限に達しました。古いプロジェクトをエクスポートして削除するか、アップロードする画像のサイズを小さくしてください。');
                } else {
                    console.error("Failed to save projects:", error);
                }
            }
        };
        persistProjects();
    }, [projects, isLoading]);
    
    useEffect(() => {
        if (isLoading) return;
        try { localStorage.setItem('rosters', JSON.stringify(rosters)); } catch (e) { console.error(e); }
    }, [rosters, isLoading]);

    useEffect(() => {
        if (isLoading) return;
        try { localStorage.setItem('sheetLayouts', JSON.stringify(sheetLayouts)); } catch (e) { console.error(e); }
    }, [sheetLayouts, isLoading]);

    const updateActiveProject = useCallback((updater: (project: GradingProject) => GradingProject) => {
        if (!activeProjectId) return;
        setProjects(prev => ({ ...prev, [activeProjectId]: updater(prev[activeProjectId]) }));
    }, [activeProjectId]);

    const nextStep = () => {
        const order: AppStep[] = [AppStep.CLASS_SELECTION, AppStep.TEMPLATE_UPLOAD, AppStep.AREA_SELECTION, AppStep.STUDENT_INFO_INPUT, AppStep.STUDENT_UPLOAD, AppStep.STUDENT_VERIFICATION, AppStep.POINT_ALLOCATION, AppStep.GRADING, AppStep.RESULTS];
        const currentIndex = order.indexOf(currentStep);
        if (currentIndex < order.length - 1) {
            setCurrentStep(order[currentIndex + 1]);
        }
    };

    const prevStep = () => {
        const order: AppStep[] = [AppStep.CLASS_SELECTION, AppStep.TEMPLATE_UPLOAD, AppStep.AREA_SELECTION, AppStep.STUDENT_INFO_INPUT, AppStep.STUDENT_UPLOAD, AppStep.STUDENT_VERIFICATION, AppStep.POINT_ALLOCATION, AppStep.GRADING, AppStep.RESULTS];
        const currentIndex = order.indexOf(currentStep);
        if (currentIndex > 0) {
            setCurrentStep(order[currentIndex - 1]);
        }
    };
    
    const goToStep = (step: AppStep) => {
         if (step === AppStep.SETTINGS) {
            setPreviousStep(currentStep);
            setCurrentStep(step);
         } else {
            const order: AppStep[] = [AppStep.CLASS_SELECTION, AppStep.TEMPLATE_UPLOAD, AppStep.AREA_SELECTION, AppStep.STUDENT_INFO_INPUT, AppStep.STUDENT_UPLOAD, AppStep.STUDENT_VERIFICATION, AppStep.POINT_ALLOCATION, AppStep.GRADING, AppStep.RESULTS];
            if (order.includes(step)) setCurrentStep(step);
         }
    };

    const handleProjectCreate = (projectName: string) => {
        const newId = `proj_${Date.now()}`;
        const newProject: GradingProject = {
            id: newId, name: projectName, template: null, areas: [], studentInfo: [], uploadedSheets: [], points: [], scores: {},
            aiSettings: { batchSize: 5, delayBetweenBatches: 1000, gradingMode: 'quality', markSheetSensitivity: 1.5 },
            lastModified: Date.now(),
        };
        setProjects(prev => ({...prev, [newId]: newProject}));
        setActiveProjectId(newId);
        setCurrentStep(AppStep.TEMPLATE_UPLOAD);
    };

    const handleProjectSelect = (projectId: string) => {
        setActiveProjectId(projectId);
        setCurrentStep(AppStep.TEMPLATE_UPLOAD);
    };
    
    const handleProjectDelete = (projectId: string) => {
        setProjects(prev => {
            const newProjects = { ...prev };
            delete newProjects[projectId];
            return newProjects;
        });
        if (activeProjectId === projectId) {
            setActiveProjectId(null);
            setCurrentStep(AppStep.CLASS_SELECTION);
        }
    };

    const handleProjectImport = async () => {
        const result = await window.electronAPI.invoke('import-project');
        if (result.success && result.data) {
            try {
                const importedData = JSON.parse(result.data);
                if (!importedData.id || !importedData.name) {
                    alert('無効なプロジェクトファイルです。必須項目が不足しています。');
                    return;
                }
                const newName = window.prompt(`インポートするプロジェクト名を入力してください:`, `${importedData.name} (インポート)`);
                if (!newName) return;
                setIsLoading(true);
                if ((importedData.template as any)?.dataUrl) {
                    const buffer = dataUrlToArrayBuffer((importedData.template as any).dataUrl);
                    if (buffer) {
                        importedData.template.filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName: importedData.template.name });
                    }
                    delete (importedData.template as any).dataUrl;
                }
                if (importedData.uploadedSheets) {
                    for (const sheet of importedData.uploadedSheets) {
                        if ((sheet as any).dataUrl) {
                            const buffer = dataUrlToArrayBuffer((sheet as any).dataUrl);
                            if(buffer) {
                                sheet.filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName: sheet.originalName });
                            }
                            delete (sheet as any).dataUrl;
                        }
                    }
                }
                const newProject: GradingProject = {
                    ...importedData,
                    id: `proj_${Date.now()}`,
                    name: newName,
                    lastModified: Date.now(),
                };
                if (!newProject.aiSettings) {
                    newProject.aiSettings = { batchSize: 5, delayBetweenBatches: 1000, gradingMode: 'quality', markSheetSensitivity: 1.5 };
                } else if (newProject.aiSettings.markSheetSensitivity === undefined) {
                    newProject.aiSettings.markSheetSensitivity = 1.5;
                }
                setProjects(prev => ({ ...prev, [newProject.id]: newProject }));
                alert(`プロジェクト「${newProject.name}」をインポートしました。`);
            } catch (error) {
                alert(`インポートに失敗しました: ${error.message}`);
            } finally {
                setIsLoading(false);
            }
        }
    };
    
    const handleProjectExportWithOptions = async (projectId: string, options: ExportImportOptions) => {
        const projectToExport = projects[projectId];
        if (!projectToExport) return;
        setIsLoading(true);
        // Create a deep copy to modify for serialization
        const serializableProject: GradingProject = JSON.parse(JSON.stringify(projectToExport));

        // Conditionally remove data based on options
        if (!options.includeTemplate) {
            delete (serializableProject as Partial<GradingProject>).template;
            delete (serializableProject as Partial<GradingProject>).areas;
            delete (serializableProject as Partial<GradingProject>).points;
        }
        if (!options.includeStudents) {
            delete (serializableProject as Partial<GradingProject>).studentInfo;
        }
        if (!options.includeAnswers) {
            delete (serializableProject as Partial<GradingProject>).uploadedSheets;
            delete (serializableProject as Partial<GradingProject>).scores;
        }
        
        // Convert file paths to data URLs for portability
        if (serializableProject.template?.filePath) {
            const result = await window.electronAPI.invoke('get-image-details', serializableProject.template.filePath);
            if (result.success) {
                (serializableProject.template as any).dataUrl = result.details.url;
            }
            delete (serializableProject.template as any).filePath;
        }
        if (serializableProject.uploadedSheets) {
            for (const sheet of serializableProject.uploadedSheets) {
                 if (sheet.filePath) {
                    const result = await window.electronAPI.invoke('get-image-details', sheet.filePath);
                    if (result.success) {
                        (sheet as any).dataUrl = result.details.url;
                    }
                    delete sheet.filePath;
                }
            }
        }
        
        setIsLoading(false);
        const result = await window.electronAPI.invoke('export-project', {
            projectName: serializableProject.name,
            projectData: JSON.stringify(serializableProject, null, 2)
        });
        if (result.success) {
            alert(`プロジェクトをエクスポートしました: ${result.path}`);
        } else {
            alert(`エクスポートに失敗しました: ${result.error}`);
        }
    };

    const handleTemplateUpload = async (files: File[]) => {
        if (files.length === 0) return;
        setIsLoading(true);
        const file = files[0];
        try {
            const buffer = await fileToArrayBuffer(file);
            const filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName: file.name });
            if (!filePath) throw new Error("ファイルの保存に失敗しました。");
            const img = await loadImage(filePath);
            const newTemplate: Template = {
                id: file.name, name: file.name, filePath: filePath,
                width: img.naturalWidth, height: img.naturalHeight,
            };
            updateActiveProject(p => ({ ...p, template: newTemplate, lastModified: Date.now() }));
            nextStep();
        } catch (error) {
            console.error("Error processing template:", error);
            alert("テンプレート画像の処理中にエラーが発生しました。");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleStudentSheetsUpload = async (files: File[]) => {
        if (files.length === 0) return;
        setIsLoading(true);
        try {
            const newSheets = await Promise.all(files.map(async file => {
                const buffer = await fileToArrayBuffer(file);
                const filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName: file.name });
                return { id: `${file.name}-${file.lastModified}`, originalName: file.name, filePath };
            }));
             updateActiveProject(p => ({ ...p, uploadedSheets: newSheets, lastModified: Date.now() }));
            nextStep();
        } catch (error) {
            console.error("Error processing student sheets:", error);
             alert("解答用紙の処理中にエラーが発生しました。");
        } finally {
            setIsLoading(false);
        }
    };
    
    const calculatedResults = useMemo((): StudentResult[] => {
        if (!activeProject || activeProject.studentInfo.length === 0 || !activeProject.template) return [];
        const validPointIds = new Set(activeProject.points.map(p => p.id));
        const allStudentsWithDetails = activeProject.studentInfo.map((info, index) => {
            const studentScores = activeProject.scores[info.id] || {};
            // FIX: Explicitly type the destructured `scoreData` to `ScoreData` to resolve property access error.
            const totalScore = Object.entries(studentScores).reduce((sum, [pointIdStr, scoreData]: [string, ScoreData]) => {
                if (validPointIds.has(parseInt(pointIdStr, 10))) {
                    return sum + (scoreData.score || 0);
                }
                return sum;
            }, 0);
            const subtotals: { [subtotalAreaId: number]: number } = {};
            activeProject.areas.filter(a => a.type === '小計' as AreaType).forEach(subArea => {
                subtotals[subArea.id] = activeProject.points
                    .filter(p => p.subtotalIds?.includes(subArea.id))
                    .reduce((sum, p) => sum + (studentScores[p.id]?.score || 0), 0);
            });
            const sheet = activeProject.uploadedSheets[index] || { id: `missing-sheet-${index}`, originalName: 'N/A', filePath: null };
            return { ...sheet, ...info, totalScore, subtotals };
        });
        const allTotalScores = allStudentsWithDetails.map(s => s.totalScore);
        const totalStudents = allTotalScores.length;
        const sumScores = allTotalScores.reduce((sum, score) => sum + score, 0);
        const mean = totalStudents > 0 ? sumScores / totalStudents : 0;
        const variance = totalStudents > 0 ? allTotalScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / totalStudents : 0;
        const stdDev = Math.sqrt(variance);
        let resultsWithRank = allStudentsWithDetails.map(student => ({
            ...student,
            standardScore: stdDev === 0 ? "50.0" : (((10 * (student.totalScore - mean)) / stdDev) + 50).toFixed(1),
            rank: 0, classRank: 0
        }));
        resultsWithRank.sort((a, b) => b.totalScore - a.totalScore);
        resultsWithRank.forEach((result, index) => {
            result.rank = index > 0 && result.totalScore === resultsWithRank[index-1].totalScore ? resultsWithRank[index-1].rank : index + 1;
        });
        const resultsByClass: { [className: string]: typeof resultsWithRank } = {};
        resultsWithRank.forEach(result => {
            if (!resultsByClass[result.class]) resultsByClass[result.class] = [];
            resultsByClass[result.class].push(result);
        });
        Object.values(resultsByClass).forEach(classGroup => {
            classGroup.sort((a,b) => b.totalScore - a.totalScore);
            classGroup.forEach((result, index) => {
                result.classRank = index > 0 && result.totalScore === classGroup[index-1].totalScore ? classGroup[index-1].classRank : index + 1;
            });
        });
        return resultsWithRank;
    }, [activeProject]);

    const studentsWithInfo = useMemo(() => {
        if (!activeProject) return [];
        return activeProject.studentInfo.map((info, index) => ({
            ...(activeProject.uploadedSheets[index] || { id: `missing-${index}`, originalName: 'N/A', filePath: null }),
            ...info,
        }));
    }, [activeProject]);

    const handleAreasChange = useCallback((areas: Area[]) => {
        updateActiveProject(p => ({ ...p, areas, lastModified: Date.now() }));
    }, [updateActiveProject]);
    
    const handleTemplateChange = useCallback((templateUpdates: Partial<Template>) => {
        if (!activeProject?.template) return;
        updateActiveProject(p => ({
            ...p, template: { ...p.template!, ...templateUpdates }, lastModified: Date.now()
        }));
    }, [updateActiveProject, activeProject]);

    const handleStudentInfoChange = useCallback((studentInfo: StudentInfo[]) => {
        updateActiveProject(p => ({ ...p, studentInfo, lastModified: Date.now() }));
    }, [updateActiveProject]);
    
    const handleStudentSheetsChange = useCallback((sheets: Student[]) => {
        updateActiveProject(p => ({ ...p, uploadedSheets: sheets, lastModified: Date.now() }));
    }, [updateActiveProject]);

    const handlePointsChange = useCallback((newPoints: Point[]) => {
        if (!activeProjectId) return;
        setProjects(prevProjects => {
            const currentProject = prevProjects[activeProjectId];
            if (!currentProject) return prevProjects;
            const newScores = Object.entries(currentProject.scores).reduce((acc, [studentId, studentScores]) => {
                const updatedStudentScores = Object.entries(studentScores).reduce((sAcc, [pointIdStr, scoreData]) => {
                    const pointId = parseInt(pointIdStr, 10);
                    if (scoreData.status === ScoringStatus.CORRECT) {
                        const newPoint = newPoints.find(np => np.id === pointId);
                        const oldPoint = currentProject.points.find(op => op.id === pointId);
                        if (newPoint && oldPoint && newPoint.points !== oldPoint.points) {
                            sAcc[pointId] = { ...scoreData, score: newPoint.points };
                        } else {
                            sAcc[pointId] = scoreData;
                        }
                    } else {
                        sAcc[pointId] = scoreData;
                    }
                    return sAcc;
                }, {} as { [areaId: number]: ScoreData; });
                acc[studentId] = updatedStudentScores;
                return acc;
            }, {} as AllScores);
            const updatedProject = { ...currentProject, points: newPoints, scores: newScores, lastModified: Date.now() };
            return { ...prevProjects, [activeProjectId]: updatedProject };
        });
    }, [activeProjectId]);

    const handleScoresChange = useCallback((scoresOrUpdater: AllScores | ((prevScores: AllScores) => AllScores)) => {
        if (!activeProjectId) return;
        setProjects(prevProjects => {
            const currentProject = prevProjects[activeProjectId];
            if (!currentProject) return prevProjects; 
            const newScores = typeof scoresOrUpdater === 'function' 
                ? scoresOrUpdater(currentProject.scores) 
                : scoresOrUpdater;
            const updatedProject = { ...currentProject, scores: newScores, lastModified: Date.now() };
            return { ...prevProjects, [activeProjectId]: updatedProject };
        });
    }, [activeProjectId]);

    const value: ProjectContextType = {
        projects, rosters, sheetLayouts, activeProjectId, currentStep, previousStep, isLoading,
        activeProject, calculatedResults, studentsWithInfo,
        setProjects, setRosters, setSheetLayouts, setActiveProjectId, setCurrentStep, setPreviousStep, setIsLoading,
        updateActiveProject, handleProjectCreate, handleProjectSelect, handleProjectDelete, handleProjectImport,
        handleProjectExportWithOptions, nextStep, prevStep, goToStep, handleTemplateUpload,
        handleStudentSheetsUpload, handleAreasChange, handleTemplateChange, handleStudentInfoChange,
        handleStudentSheetsChange, handlePointsChange, handleScoresChange
    };

    return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export const useProject = (): ProjectContextType => {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};