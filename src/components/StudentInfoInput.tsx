
import React, { useState, useMemo } from 'react';
import { UsersIcon, ArrowRightIcon } from './icons';
import { useProject } from '../context/ProjectContext';

export const StudentInfoInput = () => {
    const { activeProject, handleStudentInfoChange, rosters, updateActiveProject, nextStep } = useProject();
    const [selectedRosterId, setSelectedRosterId] = useState('');
    const [selectedClass, setSelectedClass] = useState<string>('');

    // Extract unique classes from the selected roster
    const availableClasses = useMemo(() => {
        if (!selectedRosterId || !rosters[selectedRosterId]) return [];
        const classes = new Set(rosters[selectedRosterId].students.map(s => s.class));
        return Array.from(classes).sort();
    }, [selectedRosterId, rosters]);

    const handleConfirmSelection = () => {
        if (!selectedRosterId || !rosters[selectedRosterId] || !selectedClass) return;

        const roster = rosters[selectedRosterId];
        // Filter students by selected class
        const targetStudents = roster.students.filter(s => s.class === selectedClass);
        
        // Map to student list with unique IDs
        const studentList = targetStudents.map((s, i) => ({
            ...s,
            id: `roster-${roster.id}-${selectedClass}-${i}-${Date.now()}`
        }));

        // Update project name to include class name for clarity if it's generic
        if (activeProject && !activeProject.name.includes(selectedClass)) {
             updateActiveProject(p => ({
                 ...p,
                 name: `${p.name} - ${selectedClass}組`,
                 studentInfo: studentList
             }));
        } else {
            handleStudentInfoChange(studentList);
        }
        
        nextStep();
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 p-6 rounded-lg">
            <div className="max-w-xl w-full bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-sky-100 dark:bg-sky-900 rounded-full">
                        <UsersIcon className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">採点するクラスを選択</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">あらかじめ登録された名簿から選択してください</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                            1. 名簿（学年）を選択
                        </label>
                        <select
                            value={selectedRosterId}
                            onChange={(e) => { setSelectedRosterId(e.target.value); setSelectedClass(''); }}
                            className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all text-lg"
                        >
                            <option value="">選択してください...</option>
                            {Object.values(rosters).map(roster => (
                                <option key={roster.id} value={roster.id}>{roster.name}</option>
                            ))}
                        </select>
                        {Object.keys(rosters).length === 0 && (
                            <p className="text-xs text-red-500 mt-2">
                                ※名簿が登録されていません。ホーム画面の「名簿管理」から作成してください。
                            </p>
                        )}
                    </div>

                    <div className={`transition-all duration-300 ${selectedRosterId ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                            2. 採点する組を選択
                        </label>
                        {availableClasses.length > 0 ? (
                            <div className="grid grid-cols-4 gap-3">
                                {availableClasses.map(cls => (
                                    <button
                                        key={cls}
                                        onClick={() => setSelectedClass(cls)}
                                        className={`p-3 rounded-lg border font-bold text-lg transition-all ${
                                            selectedClass === cls
                                                ? 'bg-sky-500 text-white border-sky-500 shadow-md transform scale-105'
                                                : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30'
                                        }`}
                                    >
                                        {cls}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="p-4 text-center text-slate-400 bg-slate-100 dark:bg-slate-900 rounded-lg">
                                名簿を選択するとクラスが表示されます
                            </div>
                        )}
                    </div>

                    <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                        <button
                            onClick={handleConfirmSelection}
                            disabled={!selectedClass}
                            className="w-full flex items-center justify-center gap-2 py-4 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                        >
                            <span>このクラスで採点を開始</span>
                            <ArrowRightIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
