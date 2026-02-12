
import React, { useState, useEffect, useCallback } from 'react';
import { FiPlus, FiSearch, FiEdit2, FiTrash2, FiPhone, FiMail } from 'react-icons/fi';
import api from '../api/apiClient';
import CustomerModal from '../components/crm/CustomerModal';

export default function CustomersTab({ project }) {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [showModal, setShowModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Fetch Data
    const fetchCustomers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/crm/list', {
                params: { page, limit: 20, q: debouncedSearch }
            });
            setCustomers(res.data.rows || []);
            setTotal(res.data.total || 0);
        } catch (err) {
            console.error('Failed to fetch customers', err);
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch]);

    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);

    // Handlers
    const handleCreate = () => {
        setEditingCustomer(null);
        setShowModal(true);
    };

    const handleEdit = (c) => {
        setEditingCustomer(c);
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Tem a certeza que deseja apagar este cliente?')) return;
        try {
            await api.delete(`/api/crm/${id}`);
            fetchCustomers();
        } catch (err) {
            console.error('Failed to delete', err);
            alert('Erro ao apagar cliente.');
        }
    };

    const handleSave = () => {
        setShowModal(false);
        fetchCustomers();
    };

    return (
        <div className="h-full flex flex-col bg-[var(--bg-base)] text-[var(--text-main)] animate-fade-in">
            {/* Header */}
            <div className="h-16 border-b border-[var(--border-color)] flex items-center justify-between px-6 bg-[var(--bg-card)]">
                <h1 className="text-xl font-bold flex items-center gap-2">
                    <span className="text-[var(--accent-color)]">Clientes</span>
                    <span className="text-sm font-normal text-[var(--text-muted)]">({total})</span>
                </h1>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent-color)] transition-colors" />
                        <input
                            type="text"
                            className="input pl-10 w-64 text-sm"
                            placeholder="Pesquisar nome ou NIF..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <button onClick={handleCreate} className="btn primary flex items-center gap-2 shadow-lg shadow-[var(--accent-color)]/20">
                        <FiPlus />
                        <span>Novo Cliente</span>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {loading && customers.length === 0 ? (
                    <div className="flex items-center justify-center h-full opacity-50">Carregando...</div>
                ) : (
                    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] bg-[var(--bg-base)]/50 text-[var(--text-muted)] text-xs uppercase tracking-wider">
                                    <th className="p-4 font-medium">Nome</th>
                                    <th className="p-4 font-medium">NIF / VAT</th>
                                    <th className="p-4 font-medium">Contactos</th>
                                    <th className="p-4 font-medium text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)]">
                                {customers.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className="p-8 text-center text-[var(--text-muted)]">
                                            Nenhum cliente encontrado.
                                        </td>
                                    </tr>
                                ) : (
                                    customers.map(c => (
                                        <tr key={c.id} className="group hover:bg-[var(--bg-hover)] transition-colors">
                                            <td className="p-4 font-medium text-[var(--text-main)]">
                                                {c.name}
                                                <div className="text-xs text-[var(--text-muted)] font-normal line-clamp-1 opacity-70 mt-0.5">
                                                    {c.address}
                                                </div>
                                            </td>
                                            <td className="p-4 font-mono text-sm opacity-80">{c.vat}</td>
                                            <td className="p-4 space-y-1">
                                                {c.email && (
                                                    <div className="flex items-center gap-2 text-xs opacity-70">
                                                        <FiMail size={12} /> {c.email}
                                                    </div>
                                                )}
                                                {c.phone && (
                                                    <div className="flex items-center gap-2 text-xs opacity-70">
                                                        <FiPhone size={12} /> {c.phone}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleEdit(c)}
                                                        className="p-2 hover:bg-[var(--bg-base)] rounded-lg text-blue-400 transition-colors"
                                                        title="Editar"
                                                    >
                                                        <FiEdit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(c.id)}
                                                        className="p-2 hover:bg-[var(--bg-base)] rounded-lg text-red-400 transition-colors"
                                                        title="Apagar"
                                                    >
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

            {/* Pagination / Footer */}
            <div className="h-12 border-t border-[var(--border-color)] flex items-center justify-between px-6 bg-[var(--bg-card)] text-xs text-[var(--text-muted)]">
                <div>
                    Mostrando {customers.length} de {total}
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1 hover:bg-[var(--bg-hover)] rounded disabled:opacity-50"
                    >
                        Anterior
                    </button>
                    <span className="px-2 py-1">Página {page}</span>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={customers.length < 20} // Simple check, or compare with total
                        className="px-3 py-1 hover:bg-[var(--bg-hover)] rounded disabled:opacity-50"
                    >
                        Seguinte
                    </button>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <CustomerModal
                    customer={editingCustomer}
                    onClose={() => setShowModal(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}
