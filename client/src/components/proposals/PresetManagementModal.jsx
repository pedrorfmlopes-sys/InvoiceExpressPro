import React, { useState } from 'react';
import api from '../../services/api';

const PresetManagementModal = ({ category, presets, onClose, onRefresh }) => {
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', content: '' });
    const [saving, setSaving] = useState(false);

    const categoryLabel = category === 'warranty' ? 'Garantias' : 'Observações';

    const handleEdit = (p) => {
        setEditingId(p.id);
        setEditForm({ name: p.name, content: p.content });
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditForm({ name: '', content: '' });
    };

    const handleSave = async (id) => {
        try {
            setSaving(true);
            await api.put(`/api/proposals/presets/${id}`, editForm);
            setEditingId(null);
            await onRefresh();
        } catch (err) {
            alert("Erro ao atualizar predefinição: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Tem a certeza que deseja eliminar esta predefinição?")) return;
        try {
            setSaving(true);
            await api.delete(`/api/proposals/presets/${id}`);
            await onRefresh();
        } catch (err) {
            alert("Erro ao eliminar predefinição: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[20000] flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-2xl flex flex-col max-h-[80vh] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                            <span className="w-2 h-8 bg-amber-500 rounded-full"></span>
                            Gerir Predefinições: {categoryLabel}
                        </h2>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 italic">Edite ou elimine as suas opções guardadas</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-all text-gray-400 hover:text-white">✕</button>
                </div>

                <div className="flex-1 overflow-auto p-6 space-y-4">
                    {presets.length === 0 ? (
                        <div className="py-12 text-center text-gray-500 italic text-sm">Nenhuma predefinição encontrada para esta categoria.</div>
                    ) : (
                        presets.map(p => (
                            <div key={p.id} className={`p-4 rounded-xl border transition-all ${editingId === p.id ? 'bg-amber-500/5 border-amber-500/50 shadow-lg shadow-amber-500/5' : 'bg-white/5 border-white/10 hover:border-white/20'}`}>
                                {editingId === p.id ? (
                                    <div className="space-y-3">
                                        <input
                                            className="w-full bg-white/10 border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-amber-500 font-bold"
                                            value={editForm.name}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            placeholder="Nome da predefinição"
                                        />
                                        <textarea
                                            className="w-full bg-white/10 border border-white/10 rounded px-3 py-2 text-xs text-gray-300 outline-none focus:border-amber-500 min-h-[100px] resize-none leading-relaxed"
                                            value={editForm.content}
                                            onChange={e => setEditForm({ ...editForm, content: e.target.value })}
                                            placeholder="Conteúdo..."
                                        />
                                        <div className="flex justify-end gap-2 pt-2">
                                            <button onClick={handleCancel} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white transition-colors" disabled={saving}>Cancelar</button>
                                            <button onClick={() => handleSave(p.id)} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-xs font-black uppercase transition-all shadow-lg shadow-amber-500/20" disabled={saving}>Guardar Alterações</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between gap-4">
                                        <div className="flex-1 overflow-hidden">
                                            <h3 className="text-sm font-bold text-amber-500 truncate mb-1">{p.name}</h3>
                                            <p className="text-[11px] text-gray-400 line-clamp-3 leading-relaxed whitespace-pre-wrap">{p.content}</p>
                                        </div>
                                        <div className="flex flex-col gap-2 shrink-0">
                                            <button onClick={() => handleEdit(p)} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[10px] font-bold text-gray-300 rounded uppercase border border-white/5 transition-all">Editar</button>
                                            <button onClick={() => handleDelete(p.id)} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-[10px] font-bold text-red-400 rounded uppercase border border-red-500/10 transition-all">Eliminar</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="p-6 border-t border-white/10 bg-white/5 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold font-mono">Invoice Studio Proposal Engine</p>
                </div>
            </div>
        </div>
    );
};

export default PresetManagementModal;
