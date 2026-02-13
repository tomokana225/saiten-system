
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Student, Area, StudentInfo, Point } from '../types';
import { AreaType } from '../types';
import { AnswerSnippet } from './AnswerSnippet';
import { 
    Trash2Icon, PlusIcon, GripVerticalIcon, ArrowRightIcon, 
    SparklesIcon, SpinnerIcon, EyeIcon, AlertCircleIcon, 
    RotateCcwIcon, ArrowDownFromLineIcon, CheckCircle2Icon, SettingsIcon, FileStackIcon, ListIcon, BoxSelectIcon,
    ArrowDownWideNarrowIcon
} from './icons';
import { useProject } from '../context/ProjectContext';
import { analyzeMarkSheetSnippet, findNearestAlignedRefArea } from '../utils';

// Type to store debug information about the grid detection
interface DetectionDebugInfo {
    pageIndex: number;
    areaId: number;
    points: { x: number; y: number }[];
    detectedIndex: number | number[];
}

export const StudentVerificationEditor = () => {
    const { activeProject, updateActiveProject, handleStudentInfoChange, handleStudentSheetsChange } = useProject();
    const { template, areas, studentInfo, uploadedSheets, aiSettings } = activeProject!;

    const [assignments, setAssignments] = useState<(string | null)[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [debugInfo, setDebugInfo] = useState<Record<string, DetectionDebugInfo[]>>({});
    const [showDebug, setShowDebug] = useState(true);
    const [mismatchedStudents, setMismatchedStudents] = useState<Set<string>>(new Set());

    // Initialize assignments based on current project state (uploadedSheets are parallel to studentInfo)
    useEffect(() => {
        const initial = uploadedSheets.map(s => s.id);
        // Pad with nulls if studentInfo is longer
        while (initial.length < studentInfo.length) initial.push(null);
        setAssignments(initial);
    }, [uploadedSheets, studentInfo]);

    // Group ID areas by page
    const idAreasByPage = useMemo(() => {
        const grouped: Record<number, Area[]> = {};
        areas.filter(a => a.type === AreaType.STUDENT_ID_MARK).forEach(area => {
            const p = area.pageIndex || 0;
            if (!grouped[p]) grouped[p] = [];
            grouped[p].push(area);
        });
        // Sort areas in each page by X coordinate (assuming horizontal ID digits)
        Object.values(grouped).forEach(list => list.sort((a, b) => a.x - b.x));
        return grouped;
    }, [areas]);

    const idPages = useMemo(() => Object.keys(idAreasByPage).map(Number).sort((a, b) => a - b), [idAreasByPage]);

    const detectIdForStudent = async (student: Student): Promise<{ id: string, pageIds: Record<number, string>, debug: DetectionDebugInfo[], error?: string }> => {
        const debugs: DetectionDebugInfo[] = [];
        const detectedIdsByPage: Record<number, string> = {};

        for (const pageIndex of idPages) {
            const pageAreas = idAreasByPage[pageIndex];
            const imagePath = student.images[pageIndex];
            
            if (!pageAreas || pageAreas.length === 0 || !imagePath) continue;

            let pageIdString = '';
            
            // Find references for this page
            const refR = findNearestAlignedRefArea(pageAreas[0], areas, AreaType.STUDENT_ID_REF_RIGHT);
            const refB = findNearestAlignedRefArea(pageAreas[0], areas, AreaType.STUDENT_ID_REF_BOTTOM);

            for (const area of pageAreas) {
                // Construct a temporary point config for analysis
                // Assuming standard 10-row (0-9) layout for IDs
                const tempPoint: Point = {
                    id: area.id,
                    label: area.name,
                    points: 0,
                    subtotalIds: [],
                    markSheetOptions: 10, // 0-9
                    markSheetLayout: 'vertical', // Standard IDs are columns of 0-9
                };

                const res = await analyzeMarkSheetSnippet(
                    imagePath,
                    area,
                    tempPoint,
                    aiSettings.markSheetSensitivity,
                    refR,
                    refB,
                    template?.alignmentMarkIdealCorners // Use global alignment if available
                );

                debugs.push({
                    pageIndex,
                    areaId: area.id,
                    points: res.positions,
                    detectedIndex: res.index
                });

                if (typeof res.index === 'number' && res.index !== -1) {
                    // Assuming index 0 is '0', 1 is '1', etc.
                    pageIdString += res.index.toString();
                } else {
                    pageIdString += '?';
                }
            }
            detectedIdsByPage[pageIndex] = pageIdString;
        }

        // Consistency Check
        const validIds = Object.values(detectedIdsByPage).filter(s => s && !s.includes('?'));
        if (validIds.length === 0) return { id: '', pageIds: detectedIdsByPage, debug: debugs };

        const firstId = validIds[0];
        const isConsistent = validIds.every(id => id === firstId);

        if (!isConsistent) {
            return { id: '', pageIds: detectedIdsByPage, debug: debugs, error: 'Mismatch' };
        }

        return { id: firstId, pageIds: detectedIdsByPage, debug: debugs };
    };

    const handleSortGlobal = async () => {
        setIsProcessing(true);
        setMismatchedStudents(new Set());
        const newDebugInfo: Record<string, DetectionDebugInfo[]> = {};
        
        // 1. Detect IDs for all uploaded sheets
        // We treat uploadedSheets as the source of truth for physical papers
        const detectionResults = await Promise.all(uploadedSheets.map(async (sheet) => {
            const res = await detectIdForStudent(sheet);
            newDebugInfo[sheet.id] = res.debug;
            return { sheet, ...res };
        }));

        setDebugInfo(newDebugInfo);

        // 2. Match to Roster
        const newAssignments: (string | null)[] = new Array(studentInfo.length).fill(null);
        const usedSheets = new Set<string>();
        const unassignedSheets: typeof detectionResults = [];
        const mismatchIds = new Set<string>();

        // First pass: Match perfect IDs
        for (const res of detectionResults) {
            if (res.error) {
                mismatchIds.add(res.sheet.id);
                unassignedSheets.push(res);
                continue;
            }

            if (res.id) {
                // Find matching student in roster
                // Try matching by "number" or combined "class-number" logic? 
                // Usually ID mark = Student Number or custom ID. 
                // Let's assume the ID mark corresponds to the student's 'number' field for now, 
                // or we could add an 'id' field to StudentInfo if needed. 
                // Simple case: exact match on 'number' column.
                const rosterIndex = studentInfo.findIndex(s => s.number === res.id || s.id === res.id);
                
                if (rosterIndex !== -1 && !newAssignments[rosterIndex]) {
                    newAssignments[rosterIndex] = res.sheet.id;
                    usedSheets.add(res.sheet.id);
                } else {
                    unassignedSheets.push(res); // Duplicate or not found
                }
            } else {
                unassignedSheets.push(res);
            }
        }

        setMismatchedStudents(mismatchIds);

        // 3. Reconstruct the lists
        // We need to reorder `uploadedSheets` to match `studentInfo` order based on `newAssignments`
        // `uploadedSheets` in context is a flat array. `studentInfo` is a flat array.
        // We want `uploadedSheets[i]` to belong to `studentInfo[i]`.
        
        const reorderedSheets: Student[] = [];
        
        // Fill matched slots
        for (let i = 0; i < studentInfo.length; i++) {
            const sheetId = newAssignments[i];
            if (sheetId) {
                const sheet = uploadedSheets.find(s => s.id === sheetId);
                reorderedSheets.push(sheet!);
            } else {
                // Placeholder for missing sheet
                reorderedSheets.push({ id: `empty-${Date.now()}-${i}`, originalName: '', filePath: null, images: [] });
            }
        }

        // Append unmatched/mismatched sheets at the end (or we could keep them in a separate pool? 
        // For this app structure, usually we just append them or replace empty slots if we force it?
        // Let's just update the main list. Any "extras" are usually problematic.
        // If we strictly follow "studentInfo" length, extras might be lost or need to be added as extra rows.
        // Current app structure couples studentInfo[i] with uploadedSheets[i].
        
        // Add extra rows for unassigned sheets
        unassignedSheets.forEach(res => {
            if (!usedSheets.has(res.sheet.id)) {
                reorderedSheets.push(res.sheet);
                // Also need to add dummy student info so they line up
                handleStudentInfoChange([...studentInfo, { id: `extra-${Date.now()}-${reorderedSheets.length}`, class: '', number: '', name: '(未登録)' }]);
            }
        });

        // Update Project
        handleStudentSheetsChange(reorderedSheets);
        setIsProcessing(false);
    };

    // --- Drag & Drop Logic (simplified for brevity, assume relying on existing libraries or simple array moves if implemented) ---
    // For this implementation, we will provide "Move Up/Down" or just rely on the auto-sort.
    // Implementing full DnD list here is complex without a library like dnd-kit.
    // We'll stick to a simple "Swap" or "Move" UI or just the Auto Sort for now as primary interaction.

    const moveSheet = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= uploadedSheets.length) return;
        const newSheets = [...uploadedSheets];
        const [moved] = newSheets.splice(fromIndex, 1);
        newSheets.splice(toIndex, 0, moved);
        handleStudentSheetsChange(newSheets);
    };

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex-shrink-0 flex justify-between items-center p-4 bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">解答用紙と名簿の照合</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        学籍番号マークを読み取って自動的に並べ替えます。ページ間の整合性もチェックします。
                    </p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowDebug(!showDebug)}
                        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md border ${showDebug ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-slate-300 text-slate-600'}`}
                    >
                        <EyeIcon className="w-4 h-4"/> 認識エリア表示
                    </button>
                    <button 
                        onClick={handleSortGlobal}
                        disabled={isProcessing}
                        className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-500 disabled:opacity-50 font-bold shadow-sm"
                    >
                        {isProcessing ? <SpinnerIcon className="w-4 h-4"/> : <SparklesIcon className="w-4 h-4"/>}
                        学籍番号で自動並べ替え
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900/50 p-2 rounded-lg">
                <div className="space-y-2">
                    {studentInfo.map((info, index) => {
                        const sheet = uploadedSheets[index];
                        const hasSheet = sheet && sheet.images.length > 0 && sheet.images[0] !== null;
                        const isMismatched = sheet && mismatchedStudents.has(sheet.id);
                        const sheetDebugs = sheet ? debugInfo[sheet.id] : undefined;

                        return (
                            <div key={info.id} className={`flex items-start gap-4 p-3 rounded-lg border transition-colors ${hasSheet ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700' : 'bg-slate-50 dark:bg-slate-800/50 border-dashed border-slate-300'}`}>
                                {/* Roster Info */}
                                <div className="w-48 flex-shrink-0 pt-2">
                                    <div className="font-bold text-lg text-slate-700 dark:text-slate-200">{info.class}-{info.number}</div>
                                    <div className="text-slate-600 dark:text-slate-400 truncate">{info.name}</div>
                                    {!hasSheet && <div className="mt-2 text-xs text-red-400 font-bold">解答用紙なし</div>}
                                </div>

                                {/* Arrow */}
                                <div className="flex flex-col justify-center pt-4 text-slate-300">
                                    <ArrowRightIcon className="w-6 h-6" />
                                </div>

                                {/* Sheet Info & Images */}
                                <div className="flex-1 min-w-0">
                                    {hasSheet ? (
                                        <div className="flex flex-col gap-2">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500 font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">{sheet.originalName}</span>
                                                    {isMismatched && (
                                                        <span className="flex items-center gap-1 text-xs text-red-600 bg-red-100 px-2 py-1 rounded font-bold">
                                                            <AlertCircleIcon className="w-3 h-3"/> ページ間不一致
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex gap-1">
                                                    <button onClick={() => moveSheet(index, index - 1)} disabled={index === 0} className="p-1 hover:bg-slate-100 rounded text-slate-400"><ArrowDownFromLineIcon className="w-4 h-4 rotate-180"/></button>
                                                    <button onClick={() => moveSheet(index, index + 1)} disabled={index === uploadedSheets.length - 1} className="p-1 hover:bg-slate-100 rounded text-slate-400"><ArrowDownFromLineIcon className="w-4 h-4"/></button>
                                                </div>
                                            </div>
                                            
                                            {/* ID Crops for each page */}
                                            <div className="flex gap-4 overflow-x-auto pb-2">
                                                {idPages.map(pageIdx => {
                                                    const areasOnPage = idAreasByPage[pageIdx];
                                                    if (!areasOnPage || !sheet.images[pageIdx]) return null;
                                                    
                                                    // Calculate bounding box for all ID marks on this page to show a unified snippet
                                                    const minX = Math.min(...areasOnPage.map(a => a.x));
                                                    const minY = Math.min(...areasOnPage.map(a => a.y));
                                                    const maxX = Math.max(...areasOnPage.map(a => a.x + a.width));
                                                    const maxY = Math.max(...areasOnPage.map(a => a.y + a.height));
                                                    
                                                    const combinedArea: Area = {
                                                        id: -pageIdx,
                                                        name: `ID Page ${pageIdx+1}`,
                                                        type: AreaType.STUDENT_ID_MARK,
                                                        x: minX, y: minY, width: maxX - minX, height: maxY - minY,
                                                        pageIndex: pageIdx
                                                    };

                                                    // Find debug points for this page
                                                    const pageDebugs = sheetDebugs?.filter(d => d.pageIndex === pageIdx);

                                                    return (
                                                        <div key={pageIdx} className="relative flex-shrink-0 border border-slate-200 dark:border-slate-600 rounded overflow-hidden bg-slate-50 dark:bg-slate-900" style={{ height: '80px', width: '200px' }}>
                                                            <AnswerSnippet 
                                                                imageSrc={sheet.images[pageIdx]} 
                                                                area={combinedArea} 
                                                                template={template!}
                                                                padding={5}
                                                            >
                                                                {showDebug && pageDebugs && (
                                                                    <div className="absolute inset-0 pointer-events-none">
                                                                        {pageDebugs.map((d, i) => (
                                                                            d.points.map((p, j) => (
                                                                                <div key={`${i}-${j}`} className="absolute w-1.5 h-1.5 bg-green-500 rounded-full shadow-sm" style={{ 
                                                                                    left: `${((p.x - combinedArea.x) / combinedArea.width) * 100}%`, 
                                                                                    top: `${((p.y - combinedArea.y) / combinedArea.height) * 100}%`,
                                                                                    transform: 'translate(-50%, -50%)',
                                                                                    opacity: d.detectedIndex === j || (Array.isArray(d.detectedIndex) && d.detectedIndex.includes(j)) ? 1 : 0.2
                                                                                }} />
                                                                            ))
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </AnswerSnippet>
                                                            <div className="absolute bottom-0 right-0 bg-black/50 text-white text-[10px] px-1 rounded-tl">P{pageIdx+1}</div>
                                                        </div>
                                                    );
                                                })}
                                                {idPages.length === 0 && <div className="text-xs text-slate-400 p-2">学籍番号エリアが設定されていません</div>}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-20 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-slate-300">
                                            Empty Slot
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
