import React, { useState, useEffect } from 'react';
import type { StudentInfo, Roster } from '../types';
import { Trash2Icon, PlusIcon } from './icons';
import { useProject } from '../context/ProjectContext';

const StudentListTable = React.memo(({ studentList, handleInputChange, handleDelete }: {
    studentList: StudentInfo[];
    handleInputChange: (id: string, field: string, value: string) => void;
    handleDelete: (id: string) => void;
}) => {
    return (
        <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-200 dark:bg-slate-700 sticky top-0 z-10">
                <tr>
                    <th className="px-4 py-2">組</th>
                    <th className="px-4 py-2">番号</th>
                    <th className="px-4 py-2">氏名</th>
                    <th className="px-4 py-2 w-16"></th>
                </tr>
            </thead>
            <tbody>
                {studentList.map(student => (
                    <tr key={student.id} className="border-b border-slate-200 dark:border-slate-700">
                        <td className="px-2 py-1 align-middle"><input type="text" value={student.class} onChange={(e) => handleInputChange(student.id, 'class', e.target.value)} className="w-full bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded p-1"/></td>
                        <td className="px-2 py-1 align-middle"><input type="text" value={student.number} onChange={(e) => handleInputChange(student.id, 'number', e.target.value)} className="w-full bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded p-1"/></td>
                        <td className="px-2 py-1 align-middle"><input type="text" value={student.name} onChange={(e) => handleInputChange(student.id, 'name', e.target.value)} className="w-full bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded p-1"/></td>
                        <td className="px-2 py-1 text-center align-middle">
                            <button onClick={() => handleDelete(student.id)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"><Trash2Icon className="w-5 h-5"/></button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
});


export const StudentInfoInput = () => {
    const { activeProject, handleStudentInfoChange, rosters } = useProject();
    const [studentList, setStudentList] = useState<StudentInfo[]>(activeProject?.studentInfo || []);
    const [pasteData, setPasteData] = useState('');
    const [selectedRosterId, setSelectedRosterId] = useState('');

    useEffect(() => {
        setStudentList(activeProject?.studentInfo || []);
    }, [activeProject?.studentInfo]);

    useEffect(() => {
        handleStudentInfoChange(studentList);
    }, [studentList, handleStudentInfoChange]);

    const handleInputChange = (id: string, field: string, value: string) => {
        setStudentList(studentList.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const handlePasteApply = () => {
        const lines = pasteData.trim().split('\n');
        const newStudents = lines.map((line, index) => {
            const [studentClass = '', studentNumber = '', studentName = ''] = line.split('\t');
            return {
                id: `pasted-${Date.now()}-${index}`,
                class: studentClass.trim(),
                number: studentNumber.trim(),
                name: studentName.trim()
            };
        });
        setStudentList(newStudents);
        setPasteData('');
    };
    
    const handleDelete = (id: string) => {
        setStudentList(studentList.filter(s => s.id !== id));
    };

    const handleAddRow = () => {
        setStudentList([...studentList, { id: `new-${Date.now()}`, class: '', number: '', name: ''}]);
    };
    
    const handleLoadRoster = () => {
        if (selectedRosterId && rosters[selectedRosterId]) {
            const rosterStudents = rosters[selectedRosterId].students.map((s, i) => ({
                ...s,
                id: `roster-${selectedRosterId}-${i}`
            }));
            setStudentList(rosterStudents);
        }
    };

    return (
        <div className="w-full flex flex-col lg:flex-row gap-8">
            <div className="flex-1 space-y-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">生徒情報の入力</h3>
                <div className="max-h-[60vh] overflow-y-auto bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md">
                   <StudentListTable studentList={studentList} handleInputChange={handleInputChange} handleDelete={handleDelete} />
                </div>
                <button onClick={handleAddRow} className="flex items-center space-x-2 px-3 py-2 text-sm bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors">
                    <PlusIcon className="w-4 h-4" />
                    <span>行を追加</span>
                </button>
            </div>
            <div className="lg:w-1/3 space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">名簿から読み込み</h3>
                    <div className="flex items-center gap-2 mt-2">
                        <select
                            value={selectedRosterId}
                            onChange={(e) => setSelectedRosterId(e.target.value)}
                            className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700"
                        >
                            <option value="">名簿を選択...</option>
                            {Object.values(rosters).map(roster => (
                                <option key={roster.id} value={roster.id}>{roster.name}</option>
                            ))}
                        </select>
                        <button onClick={handleLoadRoster} disabled={!selectedRosterId} className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50">
                            読み込み
                        </button>
                    </div>
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Excelから一括貼り付け</h3>
                    <textarea
                        value={pasteData}
                        onChange={(e) => setPasteData(e.target.value)}
                        className="w-full h-48 bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded p-2 text-sm mt-2"
                        placeholder="組, 番号, 氏名の順でタブ区切りで貼り付け...&#10;例:&#10;A組	1	山田 太郎&#10;A組	2	鈴木 花子"
                    ></textarea>
                    <button onClick={handlePasteApply} className="w-full mt-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-md transition-colors text-white">
                        貼り付けデータを反映
                    </button>
                </div>
            </div>
        </div>
    );
};
