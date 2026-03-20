import React, { useState, useEffect, useCallback } from 'react';
import { FiPlus, FiSearch, FiEdit2, FiTrash2, FiSave, FiX } from 'react-icons/fi';
import api from '../api/apiClient';

export default function ShippingAddressesTab({ project }) {
    const [addresses, setAddresses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [showModal, setShowModal] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);
    const [formData, setFormData] = useState({ name: '', address: '' });
    const [saveLoading, setSaveLoading] = useState(false);

    const loadAddresses = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/crm/shipping-addresses?project=${project}`);
            setAddresses(res.data || []);
        } catch (err) {
            console.error('Failed to load shipping addresses', err);
        } finally {
            setLoading(false);
        }
    }, [project]);

    useEffect(() => {
        loadAddresses();
    }, [loadAddresses]);

    const handleCreate = () => {
        setEditingAddress(null);
        setFormData({ name: '', address: '' });
        setShowModal(true);
    };

    const handleEdit = (addr) => {
        setEditingAddress(addr);
        setFormData({ name: addr.name, address: addr.address });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Tem a certeza que deseja apagar esta morada?')) return;
        try {
            await api.delete(`/api/crm/shipping-addresses/${id}?project=${project}`);
            loadAddresses();
        } catch (err) {
            alert('Erro ao apagar morada.');
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaveLoading(true);
        try {
            const payload = { ...formData };
            if (editingAddress) payload.id = editingAddress.id;

            await api.post(`/api/crm/shipping-addresses?project=${project}`, payload);
            setShowModal(false);
            loadAddresses();
        } catch (err) {
            alert('Erro ao guardar morada.');
        } finally {
            setSaveLoading(false);
        }
    };

    const filteredAddresses = addresses.filter(a =>
        (a.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.address || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col bg-[var(--bg-base)] text-[var(--text-main)] animate-fade-in">
            {/* Header */}
            <div className="h-16 border-b border-[var(--border-color)] flex items-center justify-between px-6 bg-[var(--bg-card)]">
                <h1 className="text-xl font-bold flex items-center gap-2">
                    <span className="text-[var(--accent-color)]">Locais de Entrega</span>
                    <span className="text-sm font-normal text-[var(--text-muted)]">({filteredAddresses.length})</span>
                </h1>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent-color)] transition-colors" />
                        <input
                            type="text"
                            className="input pl-10 w-64 text-sm"
                            placeholder="Pesquisar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button onClick={handleCreate} className="btn primary flex items-center gap-2 shadow-lg shadow-[var(--accent-color)]/20">
                        <FiPlus />
                        <span>Nova Morada</span>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {loading && addresses.length === 0 ? (
                    <div className="flex items-center justify-center h-full opacity-50">Carregando...</div>
                ) : (
                    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] bg-[var(--bg-base)]/50 text-[var(--text-muted)] text-xs uppercase tracking-wider">
                                    <th className="p-4 font-medium">Designação do Local</th>
                                    <th className="p-4 font-medium">Morada Completa</th>
                                    <th className="p-4 font-medium text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)]">
                                {filteredAddresses.length === 0 ? (
                                    <tr>
                                        <td colSpan="3" className="p-8 text-center text-[var(--text-muted)]">
                                            Nenhuma morada encontrada.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAddresses.map(a => (
                                        <tr key={a.id} className="group hover:bg-[var(--bg-hover)] transition-colors">
                                            <td className="p-4 font-medium text-[var(--text-main)] whitespace-nowrap">
                                                {a.name}
                                            </td>
                                            <td className="p-4 text-sm opacity-80 whitespace-pre-wrap">
                                                {a.address}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEdit(a)} className="p-2 hover:bg-[var(--bg-base)] rounded-lg text-blue-400 transition-colors" title="Editar">
                                                        <FiEdit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDelete(a.id)} className="p-2 hover:bg-[var(--bg-base)] rounded-lg text-red-400 transition-colors" title="Apagar">
                                                        <FiTrash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
                            <h2 className="text-lg font-semibold text-[var(--text-main)]">
                                {editingAddress ? 'Editar Morada' : 'Nova Morada de Entrega'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-[var(--bg-hover)] rounded-full text-[var(--text-muted)]">
                                <FiX size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-[var(--text-muted)] uppercase">
                                    Designação (Ex: Armazém Lisboa) *
                                </label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-[var(--text-muted)] uppercase">Morada Completa *</label>
                                <textarea
                                    className="input min-h-[100px] resize-none whitespace-pre-wrap"
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    required
                                    placeholder="Rua, Código Postal, Localidade..."
                                />
                            </div>
                        </form>

                        <div className="p-4 border-t border-[var(--border-color)] flex justify-end gap-3 bg-[var(--bg-base)] rounded-b-xl">
                            <button type="button" onClick={() => setShowModal(false)} className="btn ghost text-[var(--text-muted)]" disabled={saveLoading}>
                                Cancelar
                            </button>
                            <button onClick={handleSave} className="btn primary flex items-center gap-2" disabled={saveLoading}>
                                <FiSave />
                                {saveLoading ? 'A guardar...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
