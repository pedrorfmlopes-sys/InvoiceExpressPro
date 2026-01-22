import React, { useState, useEffect } from 'react';
import { IconX, IconCheck, IconTag } from '@tabler/icons-react';
import api from '../../api/apiClient';

export default function DossierLabelModal({ isOpen, onClose, node, onSuccess }) {
    const [labels, setLabels] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen && node) {
            loadData();
        }
    }, [isOpen, node]);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Load All Labels
            const allRes = await api.get('/api/labels');
            setLabels(allRes.data);

            // 2. Load Node Labels (Fresh)
            const nodeRes = await api.get(`/api/node-labels/${node.id}`);
            setSelectedIds(nodeRes.data.map(l => l.id));
        } catch (e) {
            console.error(e);
            alert("Erro ao carregar etiquetas");
        } finally {
            setLoading(false);
        }
    };

    const toggleLabel = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(x => x !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put(`/api/node-labels/${node.id}`, { labelIds: selectedIds });
            onSuccess();
            onClose();
        } catch (e) {
            alert("Erro ao guardar: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                    <h3 className="font-bold flex items-center gap-2">
                        <IconTag size={18} /> Etiquetas
                    </h3>
                    <button onClick={onClose} className="hover:bg-[var(--surface-hover)] p-1 rounded"><IconX size={18} /></button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="animate-pulse space-y-2">
                            <div className="h-8 bg-[var(--surface-hover)] rounded"></div>
                            <div className="h-8 bg-[var(--surface-hover)] rounded"></div>
                        </div>
                    ) : labels.length === 0 ? (
                        <p className="text-center text-[var(--text-muted)] text-sm">Nenhuma etiqueta disponível no sistema.</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {labels.map(lbl => {
                                const isSelected = selectedIds.includes(lbl.id);
                                return (
                                    <button
                                        key={lbl.id}
                                        onClick={() => toggleLabel(lbl.id)}
                                        className={`flex items-center gap-3 p-2 rounded-lg border text-sm transition-all
                                            ${isSelected
                                                ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] text-[var(--text-main)]'
                                                : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'
                                            }`}
                                    >
                                        <div
                                            className="w-4 h-4 rounded-full shadow-sm shrink-0"
                                            style={{ backgroundColor: lbl.color }}
                                        />
                                        <span className="flex-1 text-left font-medium">{lbl.name}</span>
                                        {isSelected && <IconCheck size={16} className="text-[var(--accent-primary)]" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2 text-sm bg-[var(--bg-base)]/50">
                    <button onClick={onClose} className="px-3 py-1.5 rounded hover:bg-[var(--surface-hover)]">Cancelar</button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-1.5 bg-[var(--accent-primary)] text-white rounded shadow-sm hover:brightness-110 font-medium"
                    >
                        {saving ? 'A guardar...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
