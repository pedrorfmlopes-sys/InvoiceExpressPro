
import React, { useState, useEffect } from 'react';
import { FiPlus } from 'react-icons/fi';
import api from '../../api/apiClient';

const CatalogSearchModal = ({ brand, initialSku, onClose, onSelect, onCreateNew }) => {
    const [query, setQuery] = useState(initialSku || '');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pendingItem, setPendingItem] = useState(null);
    const [availableFinishes, setAvailableFinishes] = useState([]);
    const [loadingFinishes, setLoadingFinishes] = useState(false);

    // Convert generic 'other' or 'MULTIMARCAS' brand to default TODAS
    let initBrand = brand;
    if (!initBrand || initBrand === 'other' || initBrand.toLowerCase() === 'multimarcas') {
        initBrand = 'TODAS';
    }
    const [targetBrand, setTargetBrand] = useState(initBrand.toUpperCase());

    useEffect(() => {
        if (query.length >= 2) {
            search();
        }
    }, [query, targetBrand]);

    const search = async () => {
        try {
            setLoading(true);
            const res = await api.get('/api/catalog/search', {
                params: { brand: targetBrand, q: query }
            });
            setResults(res.data || []);
        } catch (e) {
            console.error("Catalog search error", e);
        } finally {
            setLoading(false);
        }
    };

    const handleItemClick = async (item) => {
        if (item.brand === 'nicolazzi') {
            setPendingItem(item);
            setLoadingFinishes(true);
            try {
                const res = await api.get(`/api/catalog/finishes/nicolazzi`);
                // Filter by item.finish_group.
                const validFinishes = res.data.filter(f => f.group_code === item.finish_group);
                setAvailableFinishes(validFinishes);
            } catch (e) {
                console.error("Failed to fetch finishes", e);
                onSelect(item); // Fallback to avoid locking user
            } finally {
                setLoadingFinishes(false);
            }
        } else {
            onSelect(item);
        }
    };

    const handleFinishSelect = (finish) => {
        if (!pendingItem) return;

        // Final SKU construction: Base + Finish + Handle
        const base = pendingItem.sku || '';
        const finCode = finish.finish_code || '';
        const handle = pendingItem.handle || '';

        // Sometimes base already includes the handle from user search, 
        // but typically our backend returns item.sku = pure base, and item.handle = handle.
        const composedSku = `${base}${finCode}${handle}`;

        const composedItem = {
            ...pendingItem,
            sku: composedSku,
            extra_attributes: JSON.stringify({
                base_sku: base,
                finish_code: finCode,
                finish_name: finish.note_pt || finish.name_en || finish.name_it,
                handle: handle,
                catalog_price: pendingItem.price
            })
        };

        onSelect(composedItem);
        setPendingItem(null);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[12000] p-4">
            <div className="bg-[#151515] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-blue-500/5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white">🔍</div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">Biblioteca: </h2>
                        <select
                            value={targetBrand}
                            onChange={e => setTargetBrand(e.target.value)}
                            className="bg-white/10 text-white font-bold border-none rounded-lg px-2 py-1 outline-none cursor-pointer hover:bg-white/20 transition-all"
                        >
                            <option value="NICOLAZZI" className="bg-gray-900">Nicolazzi</option>
                            <option value="RITMONIO" className="bg-gray-900">Ritmonio</option>
                            <option value="TODAS" className="bg-gray-900">Todas as Marcas</option>
                        </select>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                <div className="p-6">
                    {!pendingItem ? (
                        <input
                            autoFocus
                            className="w-full bg-white/5 px-4 py-4 rounded-xl text-xl font-bold text-blue-400 outline-none border border-white/10 focus:border-blue-500 transition-all shadow-inner"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Pesquise por SKU, Nome ou Categoria..."
                        />
                    ) : (
                        <div className="flex justify-between items-center bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl">
                            <div className="flex flex-col">
                                <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Base selecionada</span>
                                <span className="text-xl font-black text-white">{pendingItem.sku} <span className="text-gray-500">{pendingItem.handle && ` + ${pendingItem.handle}`}</span></span>
                            </div>
                            <div className="text-right flex flex-col items-end">
                                <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Grupo</span>
                                <span className="text-xl font-black text-amber-500">{pendingItem.finish_group}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-auto px-6 pb-6">
                    {pendingItem ? (
                        loadingFinishes ? (
                            <div className="p-12 text-center text-blue-400 animate-pulse font-bold tracking-widest">A LER ACABAMENTOS {pendingItem.finish_group}...</div>
                        ) : availableFinishes.length === 0 ? (
                            <div className="p-12 text-center flex flex-col items-center gap-4">
                                <span className="text-gray-500">Não encontrámos acabamentos tabelados para o sub-grupo {pendingItem.finish_group}.</span>
                                <button onClick={() => onSelect(pendingItem)} className="px-6 py-2 bg-blue-500 hover:bg-blue-400 text-black font-bold rounded-lg transition-all">
                                    Avançar apenas com o código original
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {availableFinishes.map(f => (
                                    <div
                                        key={f.id}
                                        onClick={() => handleFinishSelect(f)}
                                        className="p-4 bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/50 rounded-xl cursor-pointer transition-all flex flex-col"
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-lg font-black text-white">{f.finish_code}</span>
                                            <span className="text-xs bg-black/30 px-2 py-0.5 rounded text-gray-400 uppercase tracking-widest">{f.group_code}</span>
                                        </div>
                                        <span className="text-sm text-gray-300 font-bold">{f.name_it}</span>
                                        <span className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed" title={f.note_pt || ''}>{f.note_pt || f.technical_type || f.name_en}</span>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : loading ? (
                        <div className="p-12 text-center text-blue-400 animate-pulse font-bold tracking-widest">A PESQUISAR BIBLIOTECA...</div>
                    ) : results.length === 0 ? (
                        <div className="p-12 flex flex-col items-center gap-4 text-center">
                            <div className="text-gray-500 italic">Pesquise acima para encontrar artigos...</div>
                            {query.length > 2 && (
                                <button
                                    onClick={() => onCreateNew(query)}
                                    className="mt-4 flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-dashed border-white/20 hover:border-amber-500/50 transition-all group"
                                >
                                    <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                                        <FiPlus size={16} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-amber-500">Não encontra o artigo?</div>
                                        <div className="text-[10px] text-gray-400">Clique para criar manualmente o SKU <span className="font-mono text-white">{query}</span></div>
                                    </div>
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {results.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => handleItemClick(item)}
                                    className="p-4 bg-white/[0.03] hover:bg-blue-500/10 border border-white/5 hover:border-blue-500/30 rounded-xl cursor-pointer transition-all group"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black text-white group-hover:text-blue-400">{item.sku} {item.handle && `(${item.handle})`}</span>
                                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{item.finish_group}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-mono text-blue-400 font-bold">{parseFloat(item.price || 0).toFixed(2)} €</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400 leading-relaxed group-hover:text-gray-200">
                                        {item.description_pt || item.description_it}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/5 bg-black/20 text-center flex justify-between items-center">
                    {pendingItem && (
                        <button onClick={() => setPendingItem(null)} className="text-xs text-gray-400 hover:text-white px-3 py-1 rounded border border-white/10 hover:border-white/30 transition-all uppercase tracking-widest">
                            ← Voltar
                        </button>
                    )}
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest flex-1 text-center">
                        {pendingItem ? 'Selecione a cor oficial para gerar o código composto.' : 'Selecione um artigo para preencher automaticamente os dados técnicos na proposta.'}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default CatalogSearchModal;
