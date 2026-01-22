import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/apiClient';
import { IconSearch, IconFolder, IconFileText } from '@tabler/icons-react';

export default function DossierSearchBox({ onSelect }) {
    const [q, setQ] = useState('');
    const [mode, setMode] = useState('projects'); // 'projects' | 'docs'
    const [results, setResults] = useState([]);
    const [isOpen, setIsOpen] = useState(false);

    // Debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            if (q.length > 2) doSearch();
            else setResults([]);
        }, 300);
        return () => clearTimeout(timer);
    }, [q, mode]);

    const doSearch = async () => {
        try {
            const url = mode === 'projects' ? '/api/dossiers/search' : '/api/dossiers/by-doc';
            const res = await api.get(url, { params: { q } });
            setResults(res.data);
            setIsOpen(true);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSelect = (item) => {
        if (onSelect) {
            // Unpack node
            // If mode=doc, item is { type:'doc_hit', node:..., doc:... }
            // If mode=project, item is node directly
            const node = mode === 'projects' ? item : item.node;
            onSelect(node);
        }
        setIsOpen(false);
        setQ('');
    };

    const renderPath = (path) => {
        if (!path || path.length === 0) return '';
        return path.map(p => p.name).join(' > ');
    };

    return (
        <div className="relative w-full text-slate-700">
            <div className="flex bg-gray-100 rounded border focus-within:ring-2 ring-primary-500/20 transition-all">
                <button
                    onClick={() => setMode(mode === 'projects' ? 'docs' : 'projects')}
                    className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-200 border-r hover:bg-gray-300 transition-colors uppercase"
                    title="Click to toggle mode"
                >
                    {mode === 'projects' ? 'PROJ' : 'DOCS'}
                </button>
                <div className="flex-1 flex items-center px-2 gap-2">
                    <IconSearch size={16} className="text-gray-400" />
                    <input
                        className="bg-transparent w-full text-sm outline-none placeholder-gray-500 h-9"
                        placeholder={mode === 'projects' ? "Pesquisar Projeto (Teleporte)..." : "Pesquisar Documento..."}
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        onFocus={() => q.length > 2 && setIsOpen(true)}
                        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                    />
                </div>
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute top-12 left-0 w-full bg-white border border-gray-200 shadow-xl rounded-lg max-h-96 overflow-y-auto z-50">
                    {results.map((res, i) => {
                        const isDoc = mode === 'docs';
                        const node = isDoc ? res.node : res;
                        const doc = isDoc ? res.doc : null;

                        return (
                            <div
                                key={i}
                                className="px-4 py-3 border-b last:border-0 hover:bg-blue-50 cursor-pointer transition-colors group"
                                onMouseDown={() => handleSelect(res)} // OnMouseDown fires before Blur
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${isDoc ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                        {isDoc ? <IconFileText size={18} /> : <IconFolder size={18} />}
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm text-slate-800">
                                            {isDoc ? `${doc.supplier_name} #${doc.invoice_no}` : node.name}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                            {isDoc && <span className="font-semibold text-slate-400">Em:</span>}
                                            {renderPath(node.path)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
