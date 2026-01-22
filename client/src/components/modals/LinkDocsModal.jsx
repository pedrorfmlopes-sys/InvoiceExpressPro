import React, { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import api from '../../api/apiClient';

export function LinkDocsModal({ onClose, onLink, initialDocs = [], currentProject }) {
    const [search, setSearch] = useState('');
    const [results, setResults] = useState([]);
    const [selected, setSelected] = useState(initialDocs);
    const [searching, setSearching] = useState(false);

    const handleSearch = async (q) => {
        setSearch(q);
        if (q.length < 3) return;
        setSearching(true);
        try {
            // Search globally for linking? "Cross-project"
            const res = await api.get(`/api/explorer/docs?project=ALL&q=${q}&limit=10`);
            setResults(res.data.rows || []);
        } finally {
            setSearching(false);
        }
    };

    const handleConfirm = () => {
        onLink(selected.map(d => d.id));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <GlassCard className="w-[600px] h-[70vh] flex flex-col p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Link Documents</h3>
                    <button className="btn-icon" onClick={onClose}>✕</button>
                </div>

                {/* Selected List */}
                <div className="flex flex-wrap gap-2 mb-4 p-4 rounded bg-[var(--bg-base)] border border-[var(--border)] min-h-[50px]">
                    {selected.length === 0 && <span className="opacity-50 text-sm">No docs selected</span>}
                    {selected.map(d => (
                        <div key={d.id} className="badge flex items-center gap-2">
                            <span>{d.docNumber}</span>
                            <button onClick={() => setSelected(selected.filter(x => x.id !== d.id))} className="text-xs hover:text-red-500">✕</button>
                        </div>
                    ))}
                </div>

                {/* Search */}
                <input
                    className="input mb-4"
                    placeholder="Search to add (Enter Doc #, Supplier, etc)..."
                    value={search}
                    autoFocus
                    onChange={e => handleSearch(e.target.value)}
                />

                {/* Results */}
                <div className="flex-1 overflow-auto border border-[var(--border)] rounded">
                    {searching && <div className="p-4 opacity-50">Searching...</div>}
                    {results.map(r => {
                        const isSel = selected.find(s => s.id === r.id);
                        return (
                            <div
                                key={r.id}
                                className={`p-2 border-b border-[var(--border)] flex justify-between items-center hover:bg-[var(--surface-hover)] cursor-pointer ${isSel ? 'opacity-50' : ''}`}
                                onClick={() => !isSel && setSelected([...selected, r])}
                            >
                                <div>
                                    <div className="font-bold text-sm">{r.docNumber || 'No Num'}</div>
                                    <div className="text-xs opacity-70">{r.supplier} • {r.date}</div>
                                </div>
                                <div className="text-xs badge">{r.project}</div>
                            </div>
                        )
                    })}
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn primary" onClick={handleConfirm} disabled={selected.length < 2}>Link {selected.length} Docs</button>
                </div>
            </GlassCard>
        </div>
    )
}
