
import React, { useState } from 'react';
import { UsersIcon, ArrowRightIcon } from './icons';
import { useProject } from '../context/ProjectContext';
import { toHalfWidth } from '../utils';

export const StudentInfoInput = () => {
    const { activeProject, handleStudentInfoChange, rosters, updateActiveProject, nextStep } = useProject();
    const [selectedRosterId, setSelectedRosterId] = useState('');

    const handleConfirmSelection = (rosterId: string) => {
        if (!rosterId || !rosters[rosterId]) return;

        const roster = rosters[rosterId];
        
        // Map to student list with unique IDs
        const studentList = roster.students.map((s, i) => ({
            ...s,
            class: toHalfWidth(s.class),
            number: toHalfWidth(s.number),
            id: `roster-${roster.id}-${i}-${Date.now()}`
        }));

        // Update project name to include roster name for clarity if it's generic
        if (activeProject && !activeProject.name.includes(roster.name)) {
             updateActiveProject(p => ({
                 ...p,
                 name: `${p.name} - ${roster.name}`,
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
                            名簿（クラス）を選択
                        </label>
                        <select
                            value={selectedRosterId}
                            onChange={(e) => { 
                                const id = e.target.value;
                                setSelectedRosterId(id); 
                                if (id) handleConfirmSelection(id);
                            }}
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

                    <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => handleConfirmSelection(selectedRosterId)}
                            disabled={!selectedRosterId}
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
