import React, { useState, useEffect } from 'react';
import { IconTag, IconPlus, IconPencil, IconTrash, IconX } from '@tabler/icons-react';
import api from '../api/apiClient';

export default function LabelsManagerTab() {
    const [labels, setLabels] = useState([]);
    const [loading, setLoading] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingLabel, setEditingLabel] = useState(null);
    const [formData, setFormData] = useState({ name: '', color: '#3b82f6', icon_type: 'library', icon_value: '' });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadLabels();
    }, []);

    const loadLabels = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/labels');
            setLabels(res.data);
        } catch (e) {
            console.error("Failed to load labels", e);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenCreate = () => {
        setEditingLabel(null);
        setFormData({ name: '', color: '#3b82f6', icon_type: 'library', icon_value: '' });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (label) => {
        setEditingLabel(label);
        setFormData({
            name: label.name,
            color: label.color || '#3b82f6',
            icon_type: label.icon_type || 'library',
            icon_value: label.icon_value || ''
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (label) => {
        if (!confirm(`Tem a certeza que deseja apagar a etiqueta "${label.name}"?`)) return;
        try {
            await api.delete(`/api/labels/${label.id}`);
            loadLabels();
        } catch (e) {
            alert("Erro ao apagar: " + e.message);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (editingLabel) {
                await api.patch(`/api/labels/${editingLabel.id}`, formData);
            } else {
                await api.post('/api/labels', formData);
            }
            setIsModalOpen(false);
            loadLabels();
        } catch (error) {
            alert("Erro: " + (error.response?.data?.error || error.message));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--bg-app)] text-[var(--text-main)] p-6 overflow-y-auto custom-scrollbar">

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Gestão de Etiquetas</h1>
                    <p className="text-[var(--text-muted)] text-sm">Configure as etiquetas e ícones do sistema.</p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="flex items-center gap-2 bg-[var(--accent-primary)] text-white px-4 py-2 rounded-lg hover:brightness-110 shadow-lg shadow-[var(--accent-primary)]/20 transition-all font-medium"
                >
                    <IconPlus size={20} />
                    <span>Nova Etiqueta</span>
                </button>
            </div>

            {loading ? (
                <div className="animate-pulse flex gap-4">
                    <div className="h-24 w-60 bg-[var(--surface-hover)] rounded-xl"></div>
                    <div className="h-24 w-60 bg-[var(--surface-hover)] rounded-xl"></div>
                </div>
            ) : labels.length === 0 ? (
                <div className="p-10 border border-dashed border-[var(--border)] rounded-2xl flex flex-col items-center text-[var(--text-muted)]">
                    <IconTag size={48} className="opacity-20 mb-4" />
                    <p>Nenhuma etiqueta configurada.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 lx:grid-cols-4 gap-4">
                    {labels.map(label => (
                        <div key={label.id} className="group relative flex items-center justify-between p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent-primary)]/50 hover:shadow-md transition-all">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm"
                                    style={{ backgroundColor: label.color || '#ccc' }}
                                >
                                    {label.name.substring(0, 1).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-sm">{label.name}</span>
                                    <span className="text-[10px] text-[var(--text-muted)] opacity-60 uppercase tracking-widest">
                                        {label.color}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleOpenEdit(label)} className="p-2 hover:bg-[var(--surface-hover)] rounded-lg text-blue-500">
                                    <IconPencil size={18} />
                                </button>
                                <button onClick={() => handleDelete(label)} className="p-2 hover:bg-[var(--surface-hover)] rounded-lg text-red-500">
                                    <IconTrash size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-[var(--text-main)]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-hover)]/30">
                            <h3 className="font-bold text-lg">{editingLabel ? 'Editar Etiqueta' : 'Nova Etiqueta'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-muted)] hover:text-red-500"><IconX size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Nome</label>
                                <input
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2 outline-none focus:ring-2 ring-[var(--accent-primary)] transition-all"
                                    placeholder="Ex: Urgente"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Cor</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={formData.color}
                                        onChange={e => setFormData({ ...formData, color: e.target.value })}
                                        className="h-10 w-20 rounded cursor-pointer border-none bg-transparent"
                                    />
                                    <span className="text-sm font-mono opacity-60">{formData.color}</span>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[var(--border)]">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg hover:bg-[var(--surface-hover)] text-sm">Cancelar</button>
                                <button type="submit" disabled={submitting} className="px-6 py-2 rounded-lg bg-[var(--accent-primary)] text-white font-medium hover:brightness-110 shadow-lg shadow-[var(--accent-primary)]/20 text-sm">
                                    {submitting ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
