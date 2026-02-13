
import React, { useState, useEffect } from 'react';
import { PlusIcon, Trash2Icon } from './icons';
import type { Roster, StudentInfo } from '../types';
import { toHalfWidth } from '../utils';

interface RosterManagementViewProps {
    rosters: Record<string, Roster>;
    setRosters: React.Dispatch<React.SetStateAction<Record<string, Roster>>>;
}

export const RosterManagementView = ({ rosters, setRosters }: RosterManagementViewProps) => {
    const [selectedRosterId, setSelectedRosterId] = useState<string | null>(null);
    const [editingRosterName, setEditingRosterName] = useState('');
    const [editingStudents, setEditingStudents] = useState<StudentInfo[]>([]);
    const [rosterPasteData, setRosterPasteData] = useState('');
    
    // State for create roster modal
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newRosterName, setNewRosterName] = useState('');
    const [createError, setCreateError] = useState('');

    useEffect(() => {
        if (selectedRosterId && rosters[selectedRosterId]) {
            const roster = rosters[selectedRosterId];
            setEditingRosterName(roster.name);
            const studentsWithIds = roster.students.map((student, index) => ({
                ...student,
                id: `roster-student-${roster.id}-${index}`
            }));
            setEditingStudents(studentsWithIds);
        } else {
            setEditingRosterName('');
            setEditingStudents([]);
        }
        setRosterPasteData('');
    }, [selectedRosterId, rosters]);

    const handleOpenCreateModal = () => {
        setNewRosterName('');
        setCreateError('');
        setIsCreateModalOpen(true);
    };

    const handleConfirmCreateRoster = () => {
        const trimmedName = newRosterName.trim();
        if (!trimmedName) {
            setCreateError('名簿名を入力してください。');
            return;
        }
        if (Object.values(rosters).some(r => r.name === trimmedName)) {
            setCreateError('同じ名前の名簿が既に存在します。');
            return;
        }
        
        const newId = `roster_${Date.now()}`;
        const newRoster: Roster = { id: newId, name: trimmedName, students: [] };
        setRosters(prev => ({ ...prev, [newId]: newRoster }));
        setSelectedRosterId(newId);
        setIsCreateModalOpen(false);
    };

    const handleDeleteRoster = () => {
        if (selectedRosterId && window.confirm(`名簿「${rosters[selectedRosterId].name}」を削除しますか？この操作は元に戻せません。`)) {
            setRosters(prev => {
                const newRosters = { ...prev };
                delete newRosters[selectedRosterId];
                return newRosters;
            });
            setSelectedRosterId(null);
        }
    };

    const handleSaveRoster = () => {
        if (!selectedRosterId || !editingRosterName.trim()) {
            alert('名簿名を入力してください。');
            return;
        }
        const studentsToSave = editingStudents.map(({ id, ...rest }) => rest);
        const updatedRoster: Roster = {
            id: selectedRosterId,
            name: editingRosterName.trim(),
            students: studentsToSave,
        };
        setRosters(prev => ({ ...prev, [selectedRosterId]: updatedRoster }));
        alert('名簿を保存しました。');
    };

    // FIX: Update id type to string.
    const handleRosterStudentChange = (id: string, field: keyof Omit<StudentInfo, 'id'>, value: string) => {
        let val = value;
        if (field === 'class' || field === 'number') {
            val = toHalfWidth(val);
        }
        setEditingStudents(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));
    };

    const handleAddRosterStudent = () => {
        setEditingStudents(prev => [...prev, { id: Date.now().toString(), class: '', number: '', name: '' }]);
    };

    // FIX: Update id type to string.
    const handleDeleteRosterStudent = (id: string) => {
        setEditingStudents(prev => prev.filter(s => s.id !== id));
    };
    
    const handleRosterPasteApply = () => {
        const lines = rosterPasteData.trim().split('\n');
        const newStudents = lines.map((line, index) => {
            const [studentClass = '', studentNumber = '', studentName = ''] = line.split('\t');
            return {
                id: `pasted-roster-${Date.now()}-${index}`,
                class: toHalfWidth(studentClass.trim()),
                number: toHalfWidth(studentNumber.trim()),
                name: studentName.trim()
            };
        });
        setEditingStudents(newStudents);
        setRosterPasteData('');
    };

    return (
        <div className="w-full max-w-6xl mx-auto flex flex-col h-full gap-6">
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
                        <h3 className="text-lg font-semibold">新しい名簿の作成</h3>
                        <div>
                            <label htmlFor="new-roster-name-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                名簿名
                            </label>
                            <input
                                id="new-roster-name-input"
                                type="text"
                                value={newRosterName}
                                onChange={(e) => { setNewRosterName(e.target.value); setCreateError(''); }}
                                className="mt-1 w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700"
                                autoFocus
                            />
                            {createError && <p className="text-red-500 text-sm mt-1">{createError}</p>}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">
                                キャンセル
                            </button>
                            <button onClick={handleConfirmCreateRoster} className="px-4 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-500">
                                作成
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex-shrink-0 flex justify-between items-center">
                <p className="text-slate-600 dark:text-slate-400">
                    ここで作成した名簿は、テストの「生徒情報入力」ステップで読み込めます。
                </p>
                <button onClick={handleOpenCreateModal} className="flex items-center gap-2 px-3 py-2 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-md transition-colors">
                    <PlusIcon className="w-4 h-4" />
                    <span>新規名簿作成</span>
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-hidden">
                <div className="md:col-span-1 space-y-4">
                    <div>
                        <label htmlFor="roster-selector" className="block text-sm font-medium text-slate-700 dark:text-slate-300">編集する名簿を選択</label>
                        <select id="roster-selector" value={selectedRosterId || ''} onChange={e => setSelectedRosterId(e.target.value)} className="mt-1 w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700">
                            <option value="" disabled>選択してください...</option>
                            {Object.values(rosters).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                    {selectedRosterId && (
                        <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg space-y-4">
                            <div>
                                <label htmlFor="roster-name-editor" className="block text-sm font-medium text-slate-700 dark:text-slate-300">名簿名</label>
                                <input id="roster-name-editor" type="text" value={editingRosterName} onChange={e => setEditingRosterName(e.target.value)} className="mt-1 w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleSaveRoster} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md transition-colors">保存</button>
                                <button onClick={handleDeleteRoster} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full transition-colors"><Trash2Icon className="w-5 h-5" /></button>
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="md:col-span-2 flex flex-col h-full">
                    {selectedRosterId ? (
                        <div className="space-y-4 flex flex-col flex-1 h-full">
                            <div className="flex-1 flex flex-col space-y-2">
                                <h4 className="flex-shrink-0 text-lg font-semibold text-slate-800 dark:text-slate-200">生徒一覧 <span className="text-sm font-normal">({editingStudents.length}名)</span></h4>
                                 <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-800 p-2 rounded-md border border-slate-200 dark:border-slate-700">
                                    <table className="w-full text-sm">
                                        <tbody>
                                            {editingStudents.map(student => (
                                                <tr key={student.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                                                    <td className="p-1"><input type="text" placeholder="組" value={student.class} onChange={(e) => handleRosterStudentChange(student.id, 'class', e.target.value)} className="w-full bg-transparent p-1"/></td>
                                                    <td className="p-1"><input type="text" placeholder="番号" value={student.number} onChange={(e) => handleRosterStudentChange(student.id, 'number', e.target.value)} className="w-full bg-transparent p-1"/></td>
                                                    <td className="p-1"><input type="text" placeholder="氏名" value={student.name} onChange={(e) => handleRosterStudentChange(student.id, 'name', e.target.value)} className="w-full bg-transparent p-1"/></td>
                                                    <td className="p-1 text-center"><button onClick={() => handleDeleteRosterStudent(student.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2Icon className="w-4 h-4"/></button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                 </div>
                                 <button onClick={handleAddRosterStudent} className="flex-shrink-0 mt-2 flex items-center gap-2 px-3 py-1 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md self-start">
                                    <PlusIcon className="w-4 h-4" /> 行を追加
                                </button>
                            </div>
                            <div className="flex-shrink-0">
                                <h4 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-2">Excelから一括貼り付け</h4>
                                <textarea value={rosterPasteData} onChange={e => setRosterPasteData(e.target.value)} className="w-full h-24 p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-xs" placeholder="組, 番号, 氏名の順でタブ区切りで貼り付け..."></textarea>
                                <button onClick={handleRosterPasteApply} className="mt-2 px-3 py-1 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-md">反映</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full bg-slate-100 dark:bg-slate-800 rounded-lg p-8">
                            <p className="text-slate-500 dark:text-slate-400 text-center">左のリストから名簿を選択するか、<br/>「新規作成」ボタンで新しい名簿を作成してください。</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
