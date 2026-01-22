import React, { useState, useEffect } from 'react';
import { IconSearch, IconX, IconLink, IconFileText } from '@tabler/icons-react';
import api from '../../api/apiClient';

export default function DossierLinkDocModal({ isOpen, onClose, node, onSuccess }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [linking, setLinking] = useState(false);

    // Debounce Search
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (isOpen && query.trim().length > 1) {
                performSearch();
            } else if (query.trim().length === 0) {
                setResults([]);
            }
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [query, isOpen]);

    const performSearch = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/docs/search', { params: { q: query } });
            setResults(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleLink = async () => {
        if (!selectedId) return;
        setLinking(true);
        try {
            // Append
            await api.post(`/api/dossiers/nodes/${node.id}/docs`, { docId: selectedId });
            onSuccess();
            onClose();
        } catch (e) {
            alert("Erro ao associar: " + (e.response?.data?.error || e.message));
        } finally {
            setLinking(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                    <h3 className="font-bold flex items-center gap-2">
                        <IconLink size={18} /> Associar Documento a "{node.name}"
                    </h3>
                    <button onClick={onClose} className="hover:bg-[var(--surface-hover)] p-1 rounded"><IconX size={18} /></button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-base)]/50">
                    <div className="relative">
                        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                            autoFocus
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Pesquisar por nº fatura, fornecedor..."
                            className="w-full pl-9 pr-3 py-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg focus:ring-2 ring-[var(--accent-primary)] outline-none"
                        />
                    </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    {loading && (
                        <div className="p-4 text-center text-sm text-[var(--text-muted)] animate-pulse">Pesquisando...</div>
                    )}

                    {!loading && results.length === 0 && query.length > 1 && (
                        <div className="p-8 text-center text-[var(--text-muted)]">Nenhum documento encontrado.</div>
                    )}

                    <div className="flex flex-col gap-1">
                        {results.map(doc => (
                            <button
                                key={doc.id}
                                onClick={() => setSelectedId(doc.id)}
                                className={`flex items-start gap-3 p-3 rounded-lg text-left transition-colors border
                                    ${selectedId === doc.id
                                        ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]'
                                        : 'bg-[var(--surface)] border-transparent hover:bg-[var(--surface-hover)] hover:border-[var(--border)]'}`}
                            >
                                <div className="p-2 bg-[var(--bg-base)] rounded text-[var(--accent-secondary)]">
                                    <IconFileText size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-[var(--text-main)] truncate">
                                        {doc.supplier || doc.supplier_name || 'Desconhecido'}
                                    </div>
                                    <div className="text-xs text-[var(--text-muted)] flex gap-2">
                                        <span>{doc.docType || 'Doc'} {doc.docNumber || doc.invoice_no}</span>
                                        {doc.date && <span>• {doc.date.substring(0, 10)}</span>}
                                    </div>
                                    {doc.total && <div className="text-xs font-mono mt-1 opacity-75">{doc.total} €</div>}
                                </div>
                                {selectedId === doc.id && <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] mt-2"></div>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2 text-sm bg-[var(--bg-base)]/50">
                    <button onClick={onClose} className="px-3 py-1.5 rounded hover:bg-[var(--surface-hover)]">Cancelar</button>
                    <button
                        onClick={handleLink}
                        disabled={!selectedId || linking}
                        className="px-4 py-1.5 bg-[var(--accent-primary)] text-white rounded shadow-sm hover:brightness-110 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {linking ? 'Associando...' : 'Associar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
