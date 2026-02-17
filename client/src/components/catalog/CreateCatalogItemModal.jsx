
import React, { useState, useEffect } from 'react';
import { FiPlus, FiX, FiSave, FiLoader, FiAlertCircle, FiCheckSquare } from 'react-icons/fi';
import api from '../../api/apiClient';
import { NICOLAZZI_FINISH_GROUPS } from '../../constants/catalog';

export function CreateCatalogItemModal({ isOpen, onClose, initialSku = '', initialDescription = '', onCreated }) {
    const [formData, setFormData] = useState({
        sku: '',
        handle: '',
        description_pt: '',
        series: ''
    });

    const [priceMappings, setPriceMappings] = useState(
        NICOLAZZI_FINISH_GROUPS.map(g => ({ group: g, selected: false, price: '' }))
    );

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const [collections, setCollections] = useState([]);

    useEffect(() => {
        if (isOpen) {
            setFormData({
                sku: initialSku || '',
                handle: '',
                description_pt: initialDescription || '',
                series: ''
            });
            setError(null);
            // Reset mappings but keep structure
            setPriceMappings(NICOLAZZI_FINISH_GROUPS.map(g => ({ group: g, selected: false, price: '' })));

            // Fetch collections
            fetchCollections();
        }
    }, [isOpen, initialSku, initialDescription]);

    const fetchCollections = async () => {
        try {
            const res = await api.get('/api/catalog/collections', { params: { brand: 'nicolazzi' } });
            setCollections(res.data.map(c => c.name) || []);
        } catch (e) {
            console.error("Failed to fetch collections", e);
        }
    };

    const handlePriceChange = (group, value) => {
        setPriceMappings(prev => prev.map(m =>
            m.group === group ? { ...m, price: value } : m
        ));
    };

    const toggleGroup = (group) => {
        setPriceMappings(prev => prev.map(m =>
            m.group === group ? { ...m, selected: !m.selected } : m
        ));
    };

    const handleSave = async () => {
        if (!formData.sku || !formData.description_pt) {
            setError('SKU e Descrição são obrigatórios.');
            return;
        }

        const selectedMappings = priceMappings.filter(m => m.selected);
        if (selectedMappings.length === 0) {
            setError('Selecione pelo menos um grupo de acabamento e defina o preço.');
            return;
        }

        const invalidPrices = selectedMappings.some(m => !m.price || isNaN(parseFloat(m.price)));
        if (invalidPrices) {
            setError('Todos os grupos selecionados devem ter um preço válido.');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const payload = {
                brand: 'nicolazzi',
                baseData: formData,
                priceMappings: selectedMappings.map(m => ({ group: m.group, price: parseFloat(m.price) }))
            };

            await api.post('/api/catalog/bulk-create', payload);

            if (onCreated) onCreated(formData.sku);
            onClose();
        } catch (err) {
            console.error("Failed to create item", err);
            setError(err.response?.data?.error || 'Erro ao criar artigo.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] w-full max-w-4xl rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <FiPlus className="text-amber-500" /> Criar Novo Artigo (Nicolazzi)
                        </h2>
                        <p className="text-xs text-gray-400 mt-1">Adicione manualmente um artigo em falta ao catálogo global.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        <FiX size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                    {error && (
                        <div className="mb-6 bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-500">
                            <FiAlertCircle size={20} />
                            <span className="text-sm font-bold">{error}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* LEFT: Base identification */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase tracking-widest text-amber-500 mb-4 border-b border-white/10 pb-2">Identificação Base</h3>

                            <div>
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Código Base (SKU)</label>
                                <input
                                    type="text"
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-amber-500/50 font-mono"
                                    placeholder="Ex: 1408"
                                    value={formData.sku}
                                    onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Descrição (PT)</label>
                                <textarea
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-amber-500/50 resize-none h-24"
                                    placeholder="Ex: Torneira de lavatório..."
                                    value={formData.description_pt}
                                    onChange={e => setFormData({ ...formData, description_pt: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Série / Coleção</label>
                                    <input
                                        type="text"
                                        list="series-options"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-amber-500/50"
                                        placeholder="Pesquisar ou criar..."
                                        value={formData.series}
                                        onChange={e => setFormData({ ...formData, series: e.target.value })}
                                    />
                                    <datalist id="series-options">
                                        {collections.map((c, i) => (
                                            <option key={i} value={c} />
                                        ))}
                                    </datalist>
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Manípulo (Opcional)</label>
                                    <input
                                        type="text"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-amber-500/50 font-mono"
                                        placeholder="Ex: 78"
                                        value={formData.handle}
                                        onChange={e => setFormData({ ...formData, handle: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: Price Matrix */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-4">
                                <h3 className="text-xs font-black uppercase tracking-widest text-amber-500">Tabela de Preços e Grupos</h3>
                                <button
                                    className="text-[10px] uppercase font-bold text-gray-500 hover:text-white transition-colors"
                                    onClick={() => setPriceMappings(prev => prev.map(m => ({ ...m, selected: false, price: '' })))}
                                >
                                    Limpar Tudo
                                </button>
                            </div>

                            <div className="grid grid-cols-2 small:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                {priceMappings.map((m) => (
                                    <div
                                        key={m.group}
                                        className={`
                                            p-3 rounded-xl border transition-all flex flex-col gap-2
                                            ${m.selected ? 'bg-amber-500/10 border-amber-500/50' : 'bg-white/5 border-white/5 hover:bg-white/10'}
                                        `}
                                    >
                                        <div
                                            className="flex items-center gap-2 cursor-pointer"
                                            onClick={() => toggleGroup(m.group)}
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${m.selected ? 'bg-amber-500 border-amber-500 text-black' : 'border-gray-600 bg-transparent'}`}>
                                                {m.selected && <FiCheckSquare size={12} />}
                                            </div>
                                            <span className={`text-xs font-bold ${m.selected ? 'text-white' : 'text-gray-400'}`}>Grupo {m.group}</span>
                                        </div>

                                        {m.selected && (
                                            <div className="relative fade-in">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="w-full bg-black/40 border border-amber-500/30 rounded px-2 py-1 text-white text-xs font-mono outline-none focus:border-amber-500"
                                                    placeholder="0.00"
                                                    value={m.price}
                                                    onChange={(e) => handlePriceChange(m.group, e.target.value)}
                                                    autoFocus
                                                />
                                                <span className="absolute right-2 top-1 text-xs text-gray-500">€</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/10 bg-white/5 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 rounded-xl text-sm font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-all uppercase tracking-wide"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-8 py-3 rounded-xl text-sm font-black text-black bg-amber-500 hover:bg-amber-400 transition-all uppercase tracking-wide shadow-lg shadow-amber-500/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? <FiLoader className="animate-spin" /> : <FiSave />}
                        Gravar Artigo
                    </button>
                </div>
            </div>
        </div>
    );
}

