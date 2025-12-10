import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Student, Area, Annotation, AnnotationTool, PenAnnotation, WaveAnnotation, CircleAnnotation, TextAnnotation, Template } from '../types';
import { AnswerSnippet } from './AnswerSnippet';
import { AnnotationOverlay } from './AnnotationOverlay';
import { XIcon, Undo2Icon, Redo2Icon, PenLineIcon, WavesIcon, CircleDotIcon, BaselineIcon, PaletteIcon } from './icons';

interface AnnotationEditorProps {
    student: Student & { class: string; number: string; name: string };
    area: Area;
    template: Template;
    initialAnnotations: Annotation[];
    onSave: (annotations: Annotation[]) => void;
    onClose: () => void;
}

const useAnnotationHistory = (initialState: Annotation[]) => {
    const [history, setHistory] = useState<Annotation[][]>([initialState]);
    const [index, setIndex] = useState(0);

    const state = history[index];

    const pushState = (newState: Annotation[]) => {
        const newHistory = history.slice(0, index + 1);
        newHistory.push(newState);
        setHistory(newHistory);
        setIndex(newHistory.length - 1);
    };

    const undo = () => {
        if (index > 0) setIndex(index - 1);
    };

    const redo = () => {
        if (index < history.length - 1) setIndex(index + 1);
    };

    const canUndo = index > 0;
    const canRedo = index < history.length - 1;

    return { state, pushState, undo, redo, canUndo, canRedo };
};

export const AnnotationEditor: React.FC<AnnotationEditorProps> = ({ student, area, template, initialAnnotations, onSave, onClose }) => {
    const { state: historyState, pushState, undo: historyUndo, redo: historyRedo, canUndo, canRedo } = useAnnotationHistory(initialAnnotations);
    const [liveAnnotations, setLiveAnnotations] = useState(initialAnnotations);

    useEffect(() => {
        setLiveAnnotations(historyState);
    }, [historyState]);
    
    const [activeTool, setActiveTool] = useState<AnnotationTool>('pen');
    const [color, setColor] = useState('#FF0000');
    const [strokeWidth, setStrokeWidth] = useState(3);
    const [fontSize, setFontSize] = useState(16);

    const drawingSurfaceRef = useRef<HTMLDivElement>(null);
    const isDrawingRef = useRef(false);
    const textInputRef = useRef<HTMLTextAreaElement>(null);
    const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);

    const addAnnotationAndCommit = (annotation: Annotation) => {
        const newAnnotations = [...liveAnnotations, annotation];
        setLiveAnnotations(newAnnotations);
        pushState(newAnnotations);
    };
    
    const getRelativeCoords = useCallback((e: MouseEvent | React.MouseEvent): { x: number; y: number } => {
        if (!drawingSurfaceRef.current) return { x: 0, y: 0 };
        const rect = drawingSurfaceRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
        };
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (textInput || e.button !== 0) return;
        
        const pos = getRelativeCoords(e);

        if (activeTool === 'text') {
            setTextInput({ x: pos.x, y: pos.y, value: '' });
            return;
        }

        isDrawingRef.current = true;
        const newId = `anno_${Date.now()}`;
        let newAnnotation: Annotation | null = null;
        
        switch (activeTool) {
            case 'pen':
            case 'wave':
                newAnnotation = { id: newId, tool: activeTool, color, strokeWidth, points: [pos] } as PenAnnotation | WaveAnnotation;
                break;
            case 'circle':
                newAnnotation = { id: newId, tool: 'circle', color, strokeWidth, x: pos.x, y: pos.y, width: 0, height: 0 } as CircleAnnotation;
                break;
        }
        
        if (newAnnotation) {
            setLiveAnnotations(prev => [...prev, newAnnotation!]);
        }
    };

    const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
        if (!isDrawingRef.current) return;
        const pos = getRelativeCoords(e);
        
        setLiveAnnotations(prev => {
            if (prev.length === 0) return prev;
            const currentAnnotations = [...prev];
            const activeAnno = currentAnnotations[currentAnnotations.length - 1];
            
            let updatedAnnotation: Annotation = activeAnno;
            switch (activeAnno.tool) {
                case 'pen':
                case 'wave':
                    updatedAnnotation = { ...activeAnno, points: [...(activeAnno as PenAnnotation).points, pos] };
                    break;
                case 'circle':
                    const startX = (activeAnno as CircleAnnotation).x;
                    const startY = (activeAnno as CircleAnnotation).y;
                    updatedAnnotation = {
                        ...activeAnno,
                        x: Math.min(startX, pos.x),
                        y: Math.min(startY, pos.y),
                        width: Math.abs(pos.x - startX),
                        height: Math.abs(pos.y - startY),
                    };
                    break;
            }
            currentAnnotations[currentAnnotations.length - 1] = updatedAnnotation;
            return currentAnnotations;
        });
    }, [getRelativeCoords]);

    const handleGlobalMouseUp = useCallback(() => {
        if (isDrawingRef.current) {
            isDrawingRef.current = false;
            pushState(liveAnnotations);
        }
    }, [liveAnnotations, pushState]);

    useEffect(() => {
        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [handleGlobalMouseMove, handleGlobalMouseUp]);
    
    useEffect(() => {
        if (textInput && textInputRef.current) {
            textInputRef.current.focus();
        }
    }, [textInput]);

    const handleTextBlur = () => {
        if (!textInput || !textInput.value.trim()) {
            setTextInput(null);
            return;
        }
        const newAnnotation: TextAnnotation = {
            id: `anno_${Date.now()}`,
            tool: 'text',
            color,
            x: textInput.x,
            y: textInput.y,
            text: textInput.value,
            fontSize,
        };
        addAnnotationAndCommit(newAnnotation);
        setTextInput(null);
    };
    
    const handleSave = () => {
        onSave(liveAnnotations);
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-5xl h-[90vh] bg-white dark:bg-slate-800 rounded-lg shadow-2xl flex flex-col overflow-hidden">
                <header className="flex-shrink-0 flex justify-between items-center p-2 border-b dark:border-slate-700">
                    <h3 className="text-lg font-semibold ml-2">添削: {student.name} - {area.name}</h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><XIcon className="w-6 h-6"/></button>
                </header>
                <main className="flex-1 flex gap-2 p-2 overflow-hidden">
                    <aside className="w-20 flex-shrink-0 flex flex-col items-center gap-2 p-2 bg-slate-100 dark:bg-slate-900/50 rounded-lg">
                         <h4 className="text-xs font-semibold">ツール</h4>
                        {[
                            { tool: 'pen' as AnnotationTool, icon: PenLineIcon, name: 'ペン' },
                            { tool: 'wave' as AnnotationTool, icon: WavesIcon, name: '波線' },
                            { tool: 'circle' as AnnotationTool, icon: CircleDotIcon, name: '円' },
                            { tool: 'text' as AnnotationTool, icon: BaselineIcon, name: 'テキスト' },
                        ].map(({ tool, icon: Icon, name }) => (
                            <button key={tool} onClick={() => setActiveTool(tool)} title={name} className={`p-3 rounded-lg ${activeTool === tool ? 'bg-sky-500 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                <Icon className="w-6 h-6"/>
                            </button>
                        ))}
                         <div className="w-full h-px bg-slate-300 dark:bg-slate-600 my-2"></div>
                         <h4 className="text-xs font-semibold">設定</h4>
                         <div className="relative">
                            <PaletteIcon className="w-6 h-6 text-slate-500"/>
                            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" title="色を選択"/>
                         </div>
                          <div className="w-full text-center">
                            <label className="text-xs">太さ</label>
                            <input type="range" min="1" max="20" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))} className="w-full accent-slate-500" />
                          </div>
                          <div className="w-full text-center">
                            <label className="text-xs">文字</label>
                            <input type="range" min="8" max="48" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-full accent-slate-500" />
                          </div>

                        <div className="w-full h-px bg-slate-300 dark:bg-slate-600 my-2"></div>
                        <button onClick={historyUndo} disabled={!canUndo} className="p-3 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50" title="元に戻す"><Undo2Icon className="w-6 h-6"/></button>
                        <button onClick={historyRedo} disabled={!canRedo} className="p-3 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50" title="やり直す"><Redo2Icon className="w-6 h-6"/></button>
                    </aside>
                    <div ref={drawingSurfaceRef} className="flex-1 relative bg-slate-200 dark:bg-slate-900 rounded-lg flex items-center justify-center overflow-hidden"
                        onMouseDown={handleMouseDown}
                    >
                        <AnswerSnippet imageSrc={student.filePath} area={area} template={template} />
                        <AnnotationOverlay annotations={liveAnnotations} />
                        {textInput && (
                            <textarea
                                ref={textInputRef}
                                value={textInput.value}
                                onChange={(e) => setTextInput(prev => prev ? {...prev, value: e.target.value} : null)}
                                onBlur={handleTextBlur}
                                onKeyDown={(e) => { 
                                    // Prevent commit on Enter if using IME (Japanese input)
                                    // Allow Shift+Enter for new line
                                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { 
                                        e.preventDefault(); 
                                        handleTextBlur(); 
                                    } 
                                }}
                                style={{
                                    position: 'absolute',
                                    left: `${textInput.x * 100}%`,
                                    top: `${textInput.y * 100}%`,
                                    color: color,
                                    fontSize: `${fontSize}px`,
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    border: '1px dashed #333',
                                    outline: 'none',
                                    resize: 'both',
                                    lineHeight: 1.2,
                                    padding: '2px',
                                    fontFamily: 'sans-serif',
                                    minWidth: '100px',
                                    minHeight: '1.5em',
                                    whiteSpace: 'pre-wrap',
                                    overflow: 'hidden'
                                }}
                            />
                        )}
                    </div>
                </main>
                <footer className="flex-shrink-0 flex justify-end items-center p-2 border-t dark:border-slate-700 gap-2">
                     <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">キャンセル</button>
                     <button onClick={handleSave} className="px-4 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-500">保存して閉じる</button>
                </footer>
            </div>
        </div>
    );
};