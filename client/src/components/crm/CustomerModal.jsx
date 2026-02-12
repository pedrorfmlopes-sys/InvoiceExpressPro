
import React, { useState, useEffect } from 'react';
import { FiX, FiSave, FiSearch } from 'react-icons/fi';
import api from '../../api/apiClient';

export default function CustomerModal({ customer, onClose, onSave }) {
    const isEdit = !!customer;
    const [formData, setFormData] = useState({
        name: '',
        vat: '',
        address: '',
        email: '',
        phone: ''
    });
    const [loading, setLoading] = useState(false);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (customer) {
            setFormData({
                name: customer.name || '',
                vat: customer.vat || '',
                address: customer.address || '',
                email: customer.email || '',
                phone: customer.phone || ''
            });
        }
    }, [customer]);

    // Smart Lookup
    const handleLookup = async (query) => {
        if (!query) return;
        setLookupLoading(true);
        setError(null);
        try {
            const res = await api.get('/api/crm/lookup', { params: { q: query } });
            const data = res.data.formattedParams;

            setFormData(prev => ({
                ...prev,
                name: data.name || prev.name,
                vat: data.vat || prev.vat,
                address: data.address || prev.address,
                // Email/Phone usually not returned by VIES/Nominatim
            }));
        } catch (err) {
            if (err.response && err.response.status === 404) {
                // Not found is not a system error, just no result.
                alert('Não encontrámos resultados para: ' + query + '\nTente "Lisboa" ou um NIF válido para testar.');
            } else {
                console.error("Lookup failed:", err);
                alert('Erro na pesquisa. O serviço pode estar indisponível.');
            }
        } finally {
            setLookupLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            // Validation
            if (!formData.name) throw new Error('Nome é obrigatório');
            if (!formData.vat) throw new Error('NIF é obrigatório');

            const payload = { ...formData };
            // If editing, logic remains the same (upsert by VAT/Name heuristics or ID)

            const res = await api.post('/api/crm/upsert', payload);
            onSave(res.data);
            onClose();
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
                    <h2 className="text-lg font-semibold text-[var(--text-main)]">
                        {isEdit ? 'Editar Cliente' : 'Novo Cliente'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-[var(--bg-hover)] rounded-full text-[var(--text-muted)]">
                        <FiX size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-[var(--text-muted)] uppercase flex justify-between">
                            Nome / Designação *
                            <button
                                type="button"
                                onClick={() => handleLookup(formData.name)}
                                disabled={lookupLoading || !formData.name}
                                className="text-[var(--accent-color)] hover:underline text-[10px] flex items-center gap-1 disabled:opacity-50"
                            >
                                <FiSearch size={10} /> Pesquisar Nome
                            </button>
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                className="input w-full"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ex: Cliente Exemplo Lda"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-[var(--text-muted)] uppercase flex justify-between">
                            NIF / VAT *
                            <button
                                type="button"
                                onClick={() => handleLookup(formData.vat)}
                                disabled={lookupLoading || !formData.vat}
                                className="text-[var(--accent-color)] hover:underline text-[10px] flex items-center gap-1 disabled:opacity-50"
                            >
                                <FiSearch size={10} /> Validar VIES
                            </button>
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                className="input w-full"
                                value={formData.vat}
                                onChange={e => setFormData({ ...formData, vat: e.target.value })}
                                placeholder="Ex: 500123456"
                            />
                            {lookupLoading && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] animate-pulse">
                                    ...
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] opacity-70">
                            O NIF é usado como chave única.
                        </p>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-[var(--text-muted)] uppercase">Email</label>
                        <input
                            type="email"
                            className="input"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            placeholder="email@exemplo.com"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-[var(--text-muted)] uppercase">Telefone</label>
                        <input
                            type="tel"
                            className="input"
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="+351 ..."
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-[var(--text-muted)] uppercase">Morada</label>
                        <textarea
                            className="input min-h-[80px] resize-none"
                            value={formData.address}
                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                            placeholder="Rua, Código Postal, Cidade..."
                        />
                    </div>
                </form>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--border-color)] flex justify-end gap-3 bg-[var(--bg-base)] rounded-b-xl">
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn ghost text-[var(--text-muted)]"
                        disabled={loading}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="btn primary flex items-center gap-2"
                        disabled={loading}
                    >
                        <FiSave />
                        {loading ? 'A guardar...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
