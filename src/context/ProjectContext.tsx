
import React, { createContext, useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { AppStep, ScoringStatus } from '../types';
import type { GradingProject, Template, Area, StudentInfo, Student, Point, AllScores, StudentResult, Roster, SheetLayout, ExportImportOptions, ScoreData, AreaType } from '../types';
import { fileToArrayBuffer, loadImage, convertFileToImages } from '../utils';

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
    uploadFilesRaw: (files: File[]) => Promise<{ path: string; name: string }[]>; // New method
    handleAreasChange: (areas: Area[]) => void;
    handleTemplateChange: (templateUpdates: Partial<Template>) => void;
    handleStudentInfoChange: (studentInfo: StudentInfo[]) => void;
    handleStudentSheetsChange: (sheets: Student[]) => void;
    handlePointsChange: (newPoints: Point[]) => void;
    handleScoresChange: (scoresOrUpdater: AllScores | ((prevScores: AllScores) => AllScores)) => void;
}

// Added missing { } for React hooks import at top and ensure createContext is available
const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Fixed: Ensure useState is available from React imports
    const [projects, setProjects] = useState<Record<string, GradingProject>>({});
    const [rosters, setRosters] = useState<Record<string, Roster>>({});
    const [sheetLayouts, setSheetLayouts] = useState<Record<string, SheetLayout>>({});
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.CLASS_SELECTION);
    const [previousStep, setPreviousStep] = useState<AppStep | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Fixed: Ensure useMemo is available from React imports
    const activeProject = useMemo(() => {
        if (!activeProjectId || !projects[activeProjectId]) return null;
        return projects[activeProjectId];
    }, [activeProjectId, projects]);

    // Fixed: Ensure useEffect is available from React imports
    useEffect(() => {
        const initializeData = async () => {
            setIsLoading(true);
            try {
                const storedProjects = JSON.parse(localStorage.getItem('gradingProjects') || '{}');
                for (const proj of Object.values(storedProjects) as GradingProject[]) {
                    // Migration: Convert single page to array if needed
                    if (proj.template && !proj.template.pages) {
                        proj.template.pages = [];
                        if (proj.template.filePath) {
                            proj.template.pages.push({
                                imagePath: proj.template.filePath,
                                width: proj.template.width || 0,
                                height: proj.template.height || 0
                            });
                        }
                    }
                    // Migration: Students
                    if (proj.uploadedSheets) {
                        for (const sheet of proj.uploadedSheets) {
                            if (!sheet.images && sheet.filePath) {
                                sheet.images = [sheet.filePath];
                            } else if (!sheet.images) {
                                sheet.images = [];
                            }
                        }
                    }
                    // Migration: Ensure aiSettings has model and base
                    if (proj.aiSettings) {
                        if (!proj.aiSettings.aiModel) proj.aiSettings.aiModel = 'gemini-3-flash-preview';
                        if (proj.aiSettings.markSheetNumberingBase === undefined) proj.aiSettings.markSheetNumberingBase = 1;
                    }
                }
                setProjects(storedProjects);
                setRosters(JSON.parse(localStorage.getItem('rosters') || '{}'));
                const storedLayouts = JSON.parse(localStorage.getItem('sheetLayouts') || '{}');
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

    // Fixed: Ensure useCallback is available from React imports
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
            aiSettings: { batchSize: 5, delayBetweenBatches: 1000, gradingMode: 'quality', markSheetSensitivity: 1.5, markSheetNumberingBase: 1, aiModel: 'gemini-3-flash-preview' },
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
                const newProject: GradingProject = {
                    ...importedData,
                    id: `proj_${Date.now()}`,
                    name: importedData.name + ' (インポート)',
                    lastModified: Date.now(),
                };
                if (newProject.aiSettings) {
                    if (!newProject.aiSettings.aiModel) newProject.aiSettings.aiModel = 'gemini-3-flash-preview';
                    if (newProject.aiSettings.markSheetNumberingBase === undefined) newProject.aiSettings.markSheetNumberingBase = 1;
                }
                setProjects(prev => ({ ...prev, [newProject.id]: newProject }));
                alert(`プロジェクト「${newProject.name}」をインポートしました。`);
            } catch (error) {
                alert(`インポートに失敗しました: ${error.message}`);
            }
        }
    };
    
    const handleProjectExportWithOptions = async (projectId: string, options: ExportImportOptions) => {
        const projectToExport = projects[projectId];
        if (!projectToExport) return;
        setIsLoading(true);
        const serializableProject: GradingProject = JSON.parse(JSON.stringify(projectToExport));

        if (!options.includeTemplate) {
            delete (serializableProject as Partial<GradingProject>).template;
            delete (serializableProject as Partial<GradingProject>).areas;
            delete (serializableProject as Partial<GradingProject>).points;
        }
        if (!options.includeStudents) delete (serializableProject as Partial<GradingProject>).studentInfo;
        if (!options.includeAnswers) {
            delete (serializableProject as Partial<GradingProject>).uploadedSheets;
            delete (serializableProject as Partial<GradingProject>).scores;
        }
        
        setIsLoading(false);
        const result = await window.electronAPI.invoke('export-project', {
            projectName: serializableProject.name,
            projectData: JSON.stringify(serializableProject, null, 2)
        });
        if (result.success) alert(`プロジェクトをエクスポートしました: ${result.path}`);
        else alert(`エクスポートに失敗しました: ${result.error}`);
    };

    const handleTemplateUpload = async (files: File[]) => {
        if (files.length === 0) return;
        setIsLoading(true);
        try {
            const newPages: { imagePath: string; width: number; height: number }[] = [];
            const sortedFiles = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            for (const file of sortedFiles) {
                const dataUrls = await convertFileToImages(file);
                for (const dataUrl of dataUrls) {
                    const buffer = dataUrlToArrayBuffer(dataUrl);
                    if (!buffer) continue;
                    
                    const originalName = file.name; 
                    const filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName });
                    if (!filePath) continue;
                    
                    const img = await loadImage(filePath);
                    newPages.push({
                        imagePath: filePath,
                        width: img.naturalWidth,
                        height: img.naturalHeight
                    });
                }
            }

            if (newPages.length === 0) throw new Error("有効な画像またはPDFページが見つかりませんでした。");

            const existingPages = activeProject?.template?.pages || [];
            const allPages = [...existingPages, ...newPages];

            const firstFile = files[0];
            const newTemplate: Template = {
                id: activeProject?.template?.id || firstFile.name,
                name: activeProject?.template?.name || firstFile.name,
                filePath: allPages[0].imagePath,
                width: allPages[0].width,
                height: allPages[0].height,
                pages: allPages,
            };
            
            updateActiveProject(p => ({ ...p, template: newTemplate, lastModified: Date.now() }));
        } catch (error) {
            console.error("Error processing template:", error);
            alert("テンプレート画像の処理中にエラーが発生しました。");
        } finally {
            setIsLoading(false);
        }
    };

    const uploadFilesRaw = async (files: File[]): Promise<{ path: string; name: string }[]> => {
        setIsLoading(true);
        try {
            const processedImages: { path: string; name: string }[] = [];
            const sortedFiles = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            for (const file of sortedFiles) {
                const dataUrls = await convertFileToImages(file);
                for (const dataUrl of dataUrls) {
                    const buffer = dataUrlToArrayBuffer(dataUrl);
                    if (!buffer) continue;
                    const filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName: file.name });
                    if (filePath) {
                        processedImages.push({ path: filePath, name: file.name });
                    }
                }
            }
            return processedImages;
        } catch (error) {
            console.error("Raw upload failed:", error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleStudentSheetsUpload = async (files: File[]) => {
        if (files.length === 0 || !activeProject?.template) return;
        try {
            const allSheetImages = await uploadFilesRaw(files);
            const pagesPerStudent = activeProject.template.pages.length;
            const newSheets: Student[] = [];
            
            for (let i = 0; i < allSheetImages.length; i += pagesPerStudent) {
                const studentImages = allSheetImages.slice(i, i + pagesPerStudent);
                if (studentImages.length === 0) continue;
                
                const imagePaths = studentImages.map(img => img.path);
                while (imagePaths.length < pagesPerStudent) {
                    imagePaths.push(null);
                }

                newSheets.push({
                    id: `${studentImages[0].name}-${Date.now()}-${i}`,
                    originalName: studentImages[0].name,
                    filePath: imagePaths[0],
                    images: imagePaths
                });
            }

             updateActiveProject(p => ({ ...p, uploadedSheets: newSheets, lastModified: Date.now() }));
            nextStep();
        } catch (error) {
            console.error("Error processing student sheets:", error);
             alert("解答用紙の処理中にエラーが発生しました。");
        }
    };
    
    const calculatedResults = useMemo((): StudentResult[] => {
        if (!activeProject || activeProject.studentInfo.length === 0 || !activeProject.template) return [];
        
        const validPointIds = new Set(activeProject.points.map(p => p.id));
        const allStudentsWithDetails = activeProject.studentInfo.map((info, index) => {
            const studentScores = activeProject.scores[info.id] || {};
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

            const sheet = activeProject.uploadedSheets[index];
            const isAbsent = !sheet || !sheet.images || sheet.images.every(img => !img);
            const displaySheet = sheet || { id: `missing-sheet-${index}`, originalName: 'N/A', filePath: null, images: [] };

            return { ...displaySheet, ...info, totalScore, subtotals, isAbsent };
        });

        const presentStudents = allStudentsWithDetails.filter(s => !s.isAbsent);
        const presentScores = presentStudents.map(s => s.totalScore);
        const totalPresent = presentScores.length;
        
        const sumScores = presentScores.reduce((sum, score) => sum + score, 0);
        const mean = totalPresent > 0 ? sumScores / totalPresent : 0;
        const variance = totalPresent > 0 ? presentScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / totalPresent : 0;
        const stdDev = Math.sqrt(variance);

        let resultsWithRank = allStudentsWithDetails.map(student => {
            let standardScore = "50.0";
            if (!student.isAbsent) {
                standardScore = stdDev === 0 ? "50.0" : (((10 * (student.totalScore - mean)) / stdDev) + 50).toFixed(1);
            } else {
                standardScore = "-";
            }
            
            return {
                ...student,
                standardScore,
                rank: 0 as number | null,
                classRank: 0 as number | null
            };
        });

        const presentResults = resultsWithRank.filter(r => !r.isAbsent);
        const absentResults = resultsWithRank.filter(r => r.isAbsent);

        presentResults.sort((a, b) => b.totalScore - a.totalScore);
        presentResults.forEach((result, index) => {
            result.rank = index > 0 && result.totalScore === presentResults[index-1].totalScore ? presentResults[index-1].rank : index + 1;
        });

        const resultsByClass: { [className: string]: typeof presentResults } = {};
        presentResults.forEach(result => {
            if (!resultsByClass[result.class]) resultsByClass[result.class] = [];
            resultsByClass[result.class].push(result);
        });

        Object.values(resultsByClass).forEach(classGroup => {
            classGroup.sort((a,b) => b.totalScore - a.totalScore);
            classGroup.forEach((result, index) => {
                result.classRank = index > 0 && result.totalScore === classGroup[index-1].totalScore ? classGroup[index-1].classRank : index + 1;
            });
        });

        return [...presentResults, ...absentResults];
    }, [activeProject]);

    const studentsWithInfo = useMemo(() => {
        if (!activeProject) return [];
        return activeProject.studentInfo.map((info, index) => ({
            ...(activeProject.uploadedSheets[index] || { id: `missing-${index}`, originalName: 'N/A', filePath: null, images: [] }),
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
        handleStudentSheetsUpload, uploadFilesRaw, handleAreasChange, handleTemplateChange, handleStudentInfoChange,
        handleStudentSheetsChange, handlePointsChange, handleScoresChange
    };

    // Fixed: Ensure useContext is used correctly with ProjectContext
    return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export const useProject = (): ProjectContextType => {
    // Fixed: Use useContext correctly with defined context
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};
