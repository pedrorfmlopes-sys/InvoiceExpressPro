import React, { useState, useEffect } from 'react';
import api from '../../api/apiClient';
import { IconFolder, IconSearch, IconX } from '@tabler/icons-react';

export default function ProjectSelectorModal({ onClose, onSelect }) {
    const [q, setQ] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // Initial search or debounced
    useEffect(() => {
        const timer = setTimeout(() => {
            search(q);
        }, 300);
        return () => clearTimeout(timer);
    }, [q]);

    const search = async (query) => {
        setLoading(true);
        try {
            const res = await api.get('/api/dossiers/search', { params: { q: query } });
            setResults(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const renderPath = (path) => path.map(p => p.name).join(' > ');

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg h-[500px] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <IconFolder size={20} className="text-blue-600" />
                        Selecionar Projeto/Subprojeto
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX size={20} /></button>
                </div>

                <div className="p-4 border-b">
                    <div className="flex items-center gap-2 bg-gray-100 px-3 py-2.5 rounded-md border focus-within:ring-2 ring-blue-500/30">
                        <IconSearch size={18} className="text-gray-400" />
                        <input
                            autoFocus
                            className="bg-transparent w-full outline-none text-sm"
                            placeholder="Pesquisar por nome ou código..."
                            value={q}
                            onChange={e => setQ(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="text-center py-4 text-gray-400">Pesquisando...</div>
                    ) : results.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">
                            {q ? 'Nenhum projeto encontrado.' : 'Comece a digitar para pesquisar.'}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {results.map(node => (
                                <button
                                    key={node.id}
                                    onClick={() => onSelect(node)}
                                    className="text-left px-4 py-3 hover:bg-blue-50 rounded-lg group transition-colors flex items-start gap-3"
                                >
                                    <div className="mt-1">
                                        <IconFolder size={20} className="text-blue-400 group-hover:text-blue-600 fill-blue-100" />
                                    </div>
                                    <div>
                                        <div className="font-semibold text-slate-800 text-sm">{node.name}</div>
                                        <div className="text-xs text-slate-500 mt-0.5">{renderPath(node.path)}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
