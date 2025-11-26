import React, { useState } from 'react';
import { AppStep } from '../types';
import { 
    UploadCloudIcon, FileTextIcon, BoxSelectIcon, UsersIcon, FileStackIcon, 
    ClipboardCheckIcon, CalculatorIcon, Edit3Icon, BarChart3Icon 
} from './icons';

export const Spinner = () => (
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400"></div>
);

export const Stepper = ({ currentStep }: { currentStep: string }) => {
    const steps = [
        { id: AppStep.CLASS_SELECTION, title: 'テスト選択' },
        { id: AppStep.TEMPLATE_UPLOAD, title: 'テンプレート' },
        { id: AppStep.AREA_SELECTION, title: '領域設定' },
        { id: AppStep.STUDENT_INFO_INPUT, title: '生徒情報' },
        { id: AppStep.STUDENT_UPLOAD, title: '解答用紙' },
        { id: AppStep.STUDENT_VERIFICATION, title: '照合・修正' },
        { id: AppStep.POINT_ALLOCATION, title: '配点設定' },
        { id: AppStep.GRADING, title: '採点' },
        { id: AppStep.RESULTS, title: '結果' },
    ];
    
    const stepIcons: { [key: string]: React.FC<{ className: string }> } = {
        [AppStep.CLASS_SELECTION]: UsersIcon,
        [AppStep.TEMPLATE_UPLOAD]: FileTextIcon,
        [AppStep.AREA_SELECTION]: BoxSelectIcon,
        [AppStep.STUDENT_INFO_INPUT]: ClipboardCheckIcon, // Changed icon
        [AppStep.STUDENT_UPLOAD]: FileStackIcon,
        [AppStep.STUDENT_VERIFICATION]: ClipboardCheckIcon,
        [AppStep.POINT_ALLOCATION]: CalculatorIcon,
        [AppStep.GRADING]: Edit3Icon,
        [AppStep.RESULTS]: BarChart3Icon,
    };

    const currentStepIndex = steps.findIndex(step => step.id === currentStep);

    return (
        <nav className="p-2 bg-slate-200 dark:bg-slate-800 rounded-lg">
            <ol className="flex items-center w-full">
                {steps.map((step, index) => {
                    const IconComponent = stepIcons[step.id];
                    return (
                        <li key={step.id} className={`flex w-full items-center ${index < steps.length - 1 ? "after:content-[''] after:w-full after:h-1 after:border-b after:border-slate-300 dark:after:border-slate-600 after:border-1 after:inline-block" : ""}`}>
                            <div className="flex flex-col items-center">
                                <span className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${index <= currentStepIndex ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                                    <IconComponent className={`w-4 h-4 ${index <= currentStepIndex ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                                </span>
                                <span className={`mt-1 text-xs font-medium text-center ${index <= currentStepIndex ? 'text-sky-500 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'}`}>{step.title}</span>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};

export const FileUpload = ({ onFilesUpload, title, description, multiple = false, id = "dropzone-file" }: { onFilesUpload: (files: File[]) => void, title: string, description: string, multiple?: boolean, id?: string }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleDrag = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true);
        } else if (e.type === 'dragleave') {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFilesUpload(Array.from(e.dataTransfer.files));
            e.dataTransfer.clearData();
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFilesUpload(Array.from(e.target.files));
        }
    };

    return (
        <div className="w-full max-w-lg mx-auto">
            <label
                htmlFor={id}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-sky-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${isDragging ? 'border-sky-500 bg-slate-200 dark:bg-slate-700' : ''}`}
            >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadCloudIcon className="w-10 h-10 mb-3 text-slate-500 dark:text-slate-400" />
                    <p className="mb-2 text-sm text-slate-600 dark:text-slate-300"><span className="font-semibold">{title}</span></p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
                </div>
                <input id={id} type="file" className="hidden" multiple={multiple} onChange={handleChange} accept="image/*" />
            </label>
        </div>
    );
};