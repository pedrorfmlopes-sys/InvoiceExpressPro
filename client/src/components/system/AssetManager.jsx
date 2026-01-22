import React, { useState, useEffect, useRef } from 'react';
import { IconPhoto, IconTrash, IconUpload, IconSearch, IconX, IconCheck } from '@tabler/icons-react';
import api from '../../api/apiClient';

export default function AssetManager({ onSelect, selectMode = false }) {
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [filter, setFilter] = useState('');
    const fileInputRef = useRef(null);

    const loadAssets = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/assets', { params: { kind: 'icon' } });
            setAssets(res.data);
        } catch (e) {
            console.error("Failed to load assets", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAssets();
    }, []);

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Reset input
        e.target.value = null;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('kind', 'icon');

        try {
            await api.post('/api/assets/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            await loadAssets(); // Refresh
        } catch (error) {
            console.error(error);
            alert("Erro no upload: " + (error.response?.data?.error || error.message));
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!confirm("Tem a certeza que deseja apagar este ícone?")) return;
        try {
            await api.delete(`/api/assets/${id}`);
            setAssets(prev => prev.filter(a => a.id !== id));
        } catch (error) {
            alert("Erro ao apagar: " + error.message);
        }
    };

    const filteredAssets = assets.filter(a =>
        a.original_filename.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between gap-4 bg-[var(--surface-hover)]/30">
                <div className="flex items-center gap-2 text-[var(--text-main)] font-semibold">
                    <IconPhoto size={20} className="text-[var(--accent-primary)]" />
                    <span>{selectMode ? 'Selecionar Ícone' : 'Biblioteca de Ícones'}</span>
                </div>

                <div className="flex items-center gap-2 flex-1 max-w-md">
                    <div className="relative flex-1">
                        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            placeholder="Pesquisar..."
                            className="w-full pl-9 pr-3 py-1.5 text-sm bg-[var(--bg-input)] border border-[var(--border)] rounded-lg focus:ring-2 ring-[var(--accent-primary)] outline-none transition-all"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => fileInputRef.current.click()}
                        disabled={uploading}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--accent-primary)] text-white text-sm font-medium rounded-lg hover:brightness-110 shadow-sm transition-all"
                    >
                        {uploading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <IconUpload size={16} />}
                        <span>Upload</span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        onChange={handleUpload}
                    />
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {loading ? (
                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 animate-pulse">
                        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="aspect-square bg-[var(--surface-active)] rounded-lg" />)}
                    </div>
                ) : filteredAssets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] opacity-50">
                        <IconPhoto size={48} stroke={1} />
                        <p className="mt-2 text-sm">Sem ícones</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                        {filteredAssets.map(asset => (
                            <div
                                key={asset.id}
                                onClick={() => onSelect && onSelect(asset)}
                                className={`
                                    group relative aspect-square rounded-xl border border-[var(--border)] bg-white dark:bg-slate-800 
                                    flex items-center justify-center p-2 cursor-pointer transition-all hover:border-[var(--accent-primary)] hover:shadow-md
                                    ${selectMode ? 'hover:scale-105 active:scale-95' : ''}
                                `}
                            >
                                <img
                                    src={asset.url}
                                    alt={asset.original_filename}
                                    className="max-w-full max-h-full object-contain pointer-events-none select-none"
                                />

                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 rounded-xl backdrop-blur-[1px]">
                                    {!selectMode && (
                                        <button
                                            onClick={(e) => handleDelete(asset.id, e)}
                                            className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-lg"
                                            title="Apagar"
                                        >
                                            <IconTrash size={16} />
                                        </button>
                                    )}
                                    {selectMode && (
                                        <div className="p-1.5 bg-[var(--accent-primary)] text-white rounded-full shadow-lg">
                                            <IconCheck size={20} />
                                        </div>
                                    )}
                                </div>
                                <div className="absolute bottom-1 left-1 right-1 px-1 bg-black/40 text-white text-[9px] truncate rounded text-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    {asset.original_filename}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
