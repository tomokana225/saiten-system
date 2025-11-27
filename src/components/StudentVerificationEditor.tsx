import React, { useState, useMemo, useRef } from 'react';
import type { Student, StudentInfo } from '../types';
import { AreaType } from '../types';
import { fileToArrayBuffer } from '../utils';
import { AnswerSnippet } from './AnswerSnippet';
import { Trash2Icon, PlusIcon, GripVerticalIcon, XIcon, UploadCloudIcon, ArrowDownFromLineIcon, ArrowRightIcon } from './icons';
import { useProject } from '../context/ProjectContext';

export const StudentVerificationEditor = () => {
    const { activeProject, handleStudentSheetsChange, handleStudentInfoChange } = useProject();
    const { uploadedSheets, studentInfo: studentInfoList, template, areas } = activeProject!;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [draggedSheetIndex, setDraggedSheetIndex] = useState<number | null>(null);
    const [draggedInfoIndex, setDraggedInfoIndex] = useState<number | null>(null);
    const [dragOverSheetIndex, setDragOverSheetIndex] = useState<number | null>(null);
    const [dragOverInfoIndex, setDragOverInfoIndex] = useState<number | null>(null);

    const nameArea = useMemo(() => areas.find(a => a.type === AreaType.NAME), [areas]);
    const createBlankSheet = (): Student => ({ id: `blank-sheet-${Date.now()}-${Math.random()}`, originalName: '（空の行）', filePath: null });
    
    const numRows = Math.max(uploadedSheets.length, studentInfoList.length);

    // --- Sheets Operations ---

    const handleAppendSheets = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        const newSheetData = await Promise.all(files.map(async (file: File) => {
            const buffer = await fileToArrayBuffer(file);
            const filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName: file.name });
            return { id: `${file.name}-${file.lastModified}`, originalName: file.name, filePath };
        }));
        handleStudentSheetsChange([...uploadedSheets, ...newSheetData]);
        e.target.value = '';
    };

    const handleInsertBlankSheet = (index: number) => {
        const newSheets = [...uploadedSheets];
        newSheets.splice(index, 0, createBlankSheet());
        handleStudentSheetsChange(newSheets);
    };

    const handleDeleteSheet = (index: number) => {
        const newSheets = [...uploadedSheets];
        newSheets.splice(index, 1);
        handleStudentSheetsChange(newSheets);
    };

    const handleSheetDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
        e.preventDefault();
        if (draggedSheetIndex === null || draggedSheetIndex === dropIndex) {
            setDraggedSheetIndex(null);
            setDragOverSheetIndex(null);
            return;
        }
        const newSheets = [...uploadedSheets];
        const draggedItem = newSheets[draggedSheetIndex];
        newSheets.splice(draggedSheetIndex, 1);
        newSheets.splice(dropIndex, 0, draggedItem);
        handleStudentSheetsChange(newSheets);
        setDraggedSheetIndex(null);
        setDragOverSheetIndex(null);
    };

    // --- Info Operations ---

    const handleInsertBlankInfo = (index: number) => {
        const newInfo = [...studentInfoList];
        newInfo.splice(index, 0, { id: `new-info-${Date.now()}-${Math.random()}`, class: '', number: '', name: '' });
        handleStudentInfoChange(newInfo);
    };

    const handleDeleteInfo = (index: number) => {
        const newInfo = [...studentInfoList];
        newInfo.splice(index, 1);
        handleStudentInfoChange(newInfo);
    };

    const handleInfoInputChange = (index: number, field: string, value: string) => {
        const newInfo = [...studentInfoList];
        // Ensure existence
        while (newInfo.length <= index) {
            newInfo.push({ id: `new-info-${Date.now()}-${Math.random()}`, class: '', number: '', name: '' });
        }
        newInfo[index] = { ...newInfo[index], [field]: value };
        handleStudentInfoChange(newInfo);
    };

    const handleInfoDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
        e.preventDefault();
        if (draggedInfoIndex === null || draggedInfoIndex === dropIndex) {
            setDraggedInfoIndex(null);
            setDragOverInfoIndex(null);
            return;
        }
        const newInfo = [...studentInfoList];
        const draggedItem = newInfo[draggedInfoIndex];
        newInfo.splice(draggedInfoIndex, 1);
        newInfo.splice(dropIndex, 0, draggedItem);
        handleStudentInfoChange(newInfo);
        setDraggedInfoIndex(null);
        setDragOverInfoIndex(null);
    };

    return (
         <div className="w-full space-y-4 flex flex-col h-full">
            <div className="flex-shrink-0 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">生徒情報と解答用紙の照合・修正</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">左右のリストをドラッグして順序を調整し、ズレを修正してください。</p>
                </div>
                <label className="flex items-center space-x-2 px-3 py-2 text-sm bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors cursor-pointer">
                    <PlusIcon className="w-4 h-4" />
                    <span>解答用紙を追加</span>
                    <input type="file" multiple className="hidden" onChange={handleAppendSheets} accept="image/*" />
                </label>
            </div>
            
             <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md">
                <div className="flex gap-4 min-w-[800px]">
                    {/* Left Column: Answer Sheets */}
                    <div className="flex-1 flex flex-col gap-2">
                        <div className="h-10 flex items-center justify-center font-semibold text-center bg-slate-200 dark:bg-slate-700 rounded-md sticky top-0 z-10">解答用紙 ({uploadedSheets.length})</div>
                        {Array.from({ length: Math.max(uploadedSheets.length, numRows) }).map((_, index) => {
                            const sheet = uploadedSheets[index];
                            const isDraggable = !!sheet;
                            return (
                                <div 
                                    key={sheet?.id || `empty-sheet-${index}`}
                                    className={`relative flex items-center gap-2 p-2 rounded-md border transition-all h-28 flex-shrink-0 ${
                                        sheet ? 'bg-white dark:bg-slate-800 border-transparent cursor-grab active:cursor-grabbing hover:shadow-md' : 'bg-transparent border-dashed border-slate-300'
                                    } ${dragOverSheetIndex === index ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30' : ''}`}
                                    draggable={isDraggable}
                                    onDragStart={(e) => { setDraggedSheetIndex(index); e.dataTransfer.effectAllowed = 'move'; }}
                                    onDragEnter={(e) => { e.preventDefault(); if(isDraggable) setDragOverSheetIndex(index); }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDragLeave={() => setDragOverSheetIndex(null)}
                                    onDrop={(e) => handleSheetDrop(e, index)}
                                >
                                    {sheet ? (
                                        <>
                                            <div className="text-slate-400 dark:text-slate-500 w-6 flex-shrink-0"><GripVerticalIcon className="w-6 h-6" /></div>
                                            <div className="flex-1 h-full relative overflow-hidden rounded bg-slate-100 dark:bg-slate-900">
                                                {sheet.filePath ? (
                                                    <AnswerSnippet imageSrc={sheet.filePath} area={nameArea} template={template} />
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-xs text-slate-400">空の行</div>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <button onClick={() => handleInsertBlankSheet(index)} className="p-1 text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="ここに空行を挿入"><ArrowDownFromLineIcon className="w-4 h-4"/></button>
                                                <button onClick={() => handleDeleteSheet(index)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="この用紙を削除"><Trash2Icon className="w-4 h-4"/></button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex-1 flex justify-center">
                                            <button onClick={() => handleInsertBlankSheet(index)} className="text-xs text-slate-400 hover:text-sky-500">+ 空行を追加</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Middle Connector */}
                    <div className="w-8 flex flex-col gap-2 items-center">
                        <div className="h-10 flex-shrink-0"></div> {/* Spacer for header alignment */}
                        {Array.from({ length: numRows }).map((_, i) => (
                            <div key={i} className="h-28 flex items-center justify-center flex-shrink-0">
                                <ArrowRightIcon className={`w-4 h-4 ${uploadedSheets[i] && studentInfoList[i] ? 'text-sky-500' : 'text-slate-300 dark:text-slate-700'}`} />
                            </div>
                        ))}
                    </div>

                    {/* Right Column: Student Info */}
                    <div className="flex-1 flex flex-col gap-2">
                        <div className="h-10 flex items-center justify-center font-semibold text-center bg-slate-200 dark:bg-slate-700 rounded-md sticky top-0 z-10">生徒情報 ({studentInfoList.length})</div>
                        {Array.from({ length: Math.max(studentInfoList.length, numRows) }).map((_, index) => {
                            const info = studentInfoList[index];
                            const isDraggable = !!info;
                            return (
                                <div 
                                    key={info?.id || `empty-info-${index}`}
                                    className={`relative flex items-center gap-2 p-2 rounded-md border transition-all h-28 flex-shrink-0 ${
                                        info ? 'bg-white dark:bg-slate-800 border-transparent cursor-grab active:cursor-grabbing hover:shadow-md' : 'bg-transparent border-dashed border-slate-300'
                                    } ${dragOverInfoIndex === index ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30' : ''}`}
                                    draggable={isDraggable}
                                    onDragStart={(e) => { setDraggedInfoIndex(index); e.dataTransfer.effectAllowed = 'move'; }}
                                    onDragEnter={(e) => { e.preventDefault(); if(isDraggable) setDragOverInfoIndex(index); }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDragLeave={() => setDragOverInfoIndex(null)}
                                    onDrop={(e) => handleInfoDrop(e, index)}
                                >
                                    {info ? (
                                        <>
                                            <div className="text-slate-400 dark:text-slate-500 w-6 flex-shrink-0"><GripVerticalIcon className="w-6 h-6" /></div>
                                            <div className="flex-1 grid grid-cols-3 gap-2">
                                                <input type="text" value={info.class} onChange={(e) => handleInfoInputChange(index, 'class', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-sm self-center" placeholder="組"/>
                                                <input type="text" value={info.number} onChange={(e) => handleInfoInputChange(index, 'number', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-sm self-center" placeholder="番号"/>
                                                <input type="text" value={info.name} onChange={(e) => handleInfoInputChange(index, 'name', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-sm self-center" placeholder="氏名"/>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <button onClick={() => handleInsertBlankInfo(index)} className="p-1 text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="ここに空行を挿入"><ArrowDownFromLineIcon className="w-4 h-4"/></button>
                                                <button onClick={() => handleDeleteInfo(index)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="この情報を削除"><Trash2Icon className="w-4 h-4"/></button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex-1 flex justify-center">
                                            <button onClick={() => handleInsertBlankInfo(index)} className="text-xs text-slate-400 hover:text-sky-500">+ 空行を追加</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};