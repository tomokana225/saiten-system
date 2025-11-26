import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Student, StudentInfo, Template, Area } from '../types';
import { AreaType } from '../types';
import { fileToArrayBuffer } from '../utils';
import { AnswerSnippet } from './AnswerSnippet';
import { Trash2Icon, PlusIcon, GripVerticalIcon, XIcon, UploadCloudIcon, ArrowDownFromLineIcon } from './icons';
import { useProject } from '../context/ProjectContext';

export const StudentVerificationEditor = () => {
    const { activeProject, handleStudentSheetsChange, handleStudentInfoChange } = useProject();
    const { uploadedSheets, studentInfo: studentInfoList, template, areas } = activeProject!;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadTargetIndex, setUploadTargetIndex] = useState<number | null>(null);
    const [draggedSheetIndex, setDraggedSheetIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

    const nameArea = useMemo(() => areas.find(a => a.type === AreaType.NAME), [areas]);
    const createBlankSheet = (): Student => ({ id: `blank-sheet-${Date.now()}-${Math.random()}`, originalName: '（空の行）', filePath: null });
    
    const syncedSheets = useMemo(() => {
        const newSheets = [...uploadedSheets];
        while (newSheets.length < studentInfoList.length) {
            newSheets.push(createBlankSheet());
        }
        return newSheets;
    }, [uploadedSheets, studentInfoList]);

    const numRows = Math.max(syncedSheets.length, studentInfoList.length);

    const handleDeleteRow = (index: number) => {
        if (window.confirm('この行を削除しますか？\n（解答用紙と生徒情報の両方が削除されます）')) {
            const newSheets = [...syncedSheets];
            const newInfo = [...studentInfoList];
            if (index < newSheets.length) newSheets.splice(index, 1);
            if (index < newInfo.length) newInfo.splice(index, 1);
            handleStudentSheetsChange(newSheets.filter(s => s.id));
            handleStudentInfoChange(newInfo.filter(i => i.id));
        }
    };
    
    const handleInfoInputChange = (index: number, field: string, value: string) => {
        const newInfo = [...studentInfoList];
        while (newInfo.length <= index) {
            newInfo.push({ id: `new-info-${Date.now()}-${Math.random()}`, class: '', number: '', name: '' });
        }
        newInfo[index] = { ...newInfo[index], [field]: value };
        handleStudentInfoChange(newInfo);
    };

    const handleClearSheet = (index: number) => {
         if (window.confirm('この解答用紙をクリアしますか？\n（空欄になり、後から別の用紙を挿入できます）')) {
            const newSheets = [...syncedSheets];
            newSheets[index] = createBlankSheet();
            handleStudentSheetsChange(newSheets);
         }
    };

    const handleAppendSheets = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        const newSheetData = await Promise.all(files.map(async (file: File) => {
            const buffer = await fileToArrayBuffer(file);
            const filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName: file.name });
            return { id: `${file.name}-${file.lastModified}`, originalName: file.name, filePath };
        }));
        const newInfoData = newSheetData.map(() => ({ id: `new-info-${Date.now()}-${Math.random()}`, class: '', number: '', name: '' }));
        handleStudentSheetsChange([...uploadedSheets, ...newSheetData]);
        handleStudentInfoChange([...studentInfoList, ...newInfoData]);
        e.target.value = '';
    };

    const handleFileInsert = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || uploadTargetIndex === null) return;
        const file = e.target.files[0];
        const buffer = await fileToArrayBuffer(file);
        const filePath = await window.electronAPI.invoke('save-file-temp', { buffer, originalName: file.name });
        const newSheetData = { id: `${file.name}-${file.lastModified}`, originalName: file.name, filePath };
        const newSheets = [...syncedSheets];
        newSheets[uploadTargetIndex] = newSheetData;
        handleStudentSheetsChange(newSheets);
        setUploadTargetIndex(null);
        e.target.value = '';
    };
    
    const handleBlankRowUploadClick = (index: number) => {
        setUploadTargetIndex(index);
        fileInputRef.current?.click();
    };

    const handleShiftDown = (index: number) => {
        const newSheets = [...syncedSheets];
        const newInfo = [...studentInfoList];
        while (newInfo.length < newSheets.length) {
            newInfo.push({ id: `new-info-${Date.now()}-${Math.random()}`, class: '', number: '', name: '' });
        }
        newSheets.splice(index, 0, createBlankSheet());
        newInfo.splice(index, 0, { id: `new-info-${Date.now()}-${Math.random()}`, class: '', number: '', name: '' });
        handleStudentSheetsChange(newSheets);
        handleStudentInfoChange(newInfo);
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedSheetIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        if (index !== draggedSheetIndex) setDragOverIndex(index);
    };
    
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); };
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { setDragOverIndex(null); };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
        e.preventDefault();
        if (draggedSheetIndex === null || draggedSheetIndex === dropIndex) {
            setDraggedSheetIndex(null);
            setDragOverIndex(null);
            return;
        }
        const newSheets = [...syncedSheets];
        const newInfo = [...studentInfoList];
        const maxLength = Math.max(newSheets.length, newInfo.length);
        while(newSheets.length < maxLength) newSheets.push(createBlankSheet());
        while(newInfo.length < maxLength) newInfo.push({ id: `new-info-${Date.now()}-${Math.random()}`, class: '', number: '', name: '' });
        const draggedSheet = newSheets[draggedSheetIndex];
        const draggedInfo = newInfo[draggedSheetIndex];
        newSheets.splice(draggedSheetIndex, 1);
        newInfo.splice(draggedSheetIndex, 1);
        newSheets.splice(dropIndex, 0, draggedSheet);
        newInfo.splice(dropIndex, 0, draggedInfo);
        handleStudentSheetsChange(newSheets);
        handleStudentInfoChange(newInfo);
        setDraggedSheetIndex(null);
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedSheetIndex(null);
        setDragOverIndex(null);
    };
    
    const handleToggleRowSelection = (index: number) => {
        setSelectedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) newSet.delete(index);
            else newSet.add(index);
            return newSet;
        });
    };

    const handleToggleSelectAll = () => {
        if (selectedRows.size === numRows) setSelectedRows(new Set());
        else setSelectedRows(new Set(Array.from({ length: numRows }, (_, i) => i)));
    };

    const handleDeleteSelected = () => {
        if (selectedRows.size === 0) return;
        if (window.confirm(`${selectedRows.size}件の行を削除しますか？\n（解答用紙と生徒情報の両方が削除されます）`)) {
            // FIX: Explicitly type the sort function parameters to resolve type inference issues.
            const sortedIndices = Array.from(selectedRows).sort((a: number, b: number) => b - a);
            const newSheets = [...syncedSheets];
            const newInfo = [...studentInfoList];
            sortedIndices.forEach(index => {
                if (index < newSheets.length) newSheets.splice(index, 1);
                if (index < newInfo.length) newInfo.splice(index, 1);
            });
            handleStudentSheetsChange(newSheets);
            handleStudentInfoChange(newInfo);
            setSelectedRows(new Set());
        }
    };

    const allSelected = selectedRows.size > 0 && selectedRows.size === numRows;
    const someSelected = selectedRows.size > 0 && !allSelected;

    return (
         <div className="w-full space-y-4 flex flex-col h-full">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileInsert} accept="image/*" />
            <div className="flex-shrink-0 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">生徒情報と解答用紙の照合・修正</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">行全体をドラッグ＆ドロップで入れ替え、内容を修正してください。</p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedRows.size > 0 && (
                        <button onClick={handleDeleteSelected} className="flex items-center space-x-2 px-3 py-2 text-sm bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 rounded-md transition-colors">
                            <Trash2Icon className="w-4 h-4" />
                            <span>選択した{selectedRows.size}件を削除</span>
                        </button>
                    )}
                    <label className="flex items-center space-x-2 px-3 py-2 text-sm bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors cursor-pointer">
                        <PlusIcon className="w-4 h-4" />
                        <span>解答用紙を追加</span>
                        <input type="file" multiple className="hidden" onChange={handleAppendSheets} accept="image/*" />
                    </label>
                </div>
            </div>
            
             <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md">
                <div className="flex items-center gap-4 p-2 bg-slate-200 dark:bg-slate-700 rounded-md text-sm font-semibold sticky top-0 z-10 mb-2">
                    <div className="flex-shrink-0 w-5">
                        <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected; }} onChange={handleToggleSelectAll} className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500 cursor-pointer" aria-label="すべて選択" />
                    </div>
                    <div className="w-6"><span className="sr-only">Drag Handle</span></div>
                    <div className="w-1/3">解答用紙</div>
                    <div className="flex-1 grid grid-cols-3 gap-2"><span>組</span><span>番号</span><span>氏名</span></div>
                    <div className="w-[52px]"></div>
                </div>
                <div className="space-y-2">
                    {Array.from({ length: numRows }).map((_, index) => {
                        const sheet = syncedSheets[index];
                        const info = studentInfoList[index];
                        const isSelected = selectedRows.has(index);
                        if (!info && !sheet) return null;
                        return (
                            <div key={info?.id || sheet?.id || index} draggable onDragStart={(e) => handleDragStart(e, index)} onDragEnd={handleDragEnd} onDragEnter={(e) => handleDragEnter(e, index)} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, index)} className={`flex items-center gap-4 p-2 rounded-md border transition-all cursor-grab active:cursor-grabbing ${isSelected ? 'bg-sky-100 dark:bg-sky-900/50 border-sky-300 dark:border-sky-700' : 'bg-white dark:bg-slate-800 border-transparent'} ${dragOverIndex === index ? 'border-sky-500' : ''}`} style={{ opacity: draggedSheetIndex === index ? 0.4 : 1 }}>
                                <div className="flex-shrink-0 w-5"><input type="checkbox" checked={isSelected} onChange={() => handleToggleRowSelection(index)} onClick={(e) => e.stopPropagation()} className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500 cursor-pointer"/></div>
                                <div className="text-slate-400 dark:text-slate-500 w-6"><GripVerticalIcon className="w-6 h-6" /></div>
                                <div className="w-1/3 relative group">
                                    <div className="flex-1">
                                        {(sheet && sheet.filePath) ? (
                                            <><AnswerSnippet imageSrc={sheet.filePath} area={nameArea} template={template} /><div className="absolute top-1 right-1 flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => handleClearSheet(index)} className="p-1 bg-slate-800/70 text-white rounded-full hover:bg-red-500" title="この解答用紙をクリア"><XIcon className="w-4 h-4" /></button></div></>
                                        ) : (
                                            <div className="w-full h-24 bg-slate-200 dark:bg-slate-700 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-md flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-600 hover:border-sky-500 transition-colors" onClick={() => handleBlankRowUploadClick(index)}><UploadCloudIcon className="w-8 h-8 mb-1" /><span className="text-xs text-center">クリックして<br/>解答用紙を挿入</span></div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 grid grid-cols-3 gap-2">
                                    <input type="text" value={info?.class || ''} onChange={(e) => handleInfoInputChange(index, 'class', e.target.value)} className="w-full bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded p-1 text-sm" placeholder="組"/>
                                    <input type="text" value={info?.number || ''} onChange={(e) => handleInfoInputChange(index, 'number', e.target.value)} className="w-full bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded p-1 text-sm" placeholder="番号"/>
                                    <input type="text" value={info?.name || ''} onChange={(e) => handleInfoInputChange(index, 'name', e.target.value)} className="w-full bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded p-1 text-sm" placeholder="氏名"/>
                                </div>
                                <div className="flex flex-col space-y-2 w-[52px]">
                                    <button onClick={() => handleShiftDown(index)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-sky-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors" title="この行の下に空の行を挿入"><ArrowDownFromLineIcon className="w-5 h-5"/></button>
                                    <button onClick={() => handleDeleteRow(index)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors" title="この行を削除"><Trash2Icon className="w-5 h-5"/></button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};