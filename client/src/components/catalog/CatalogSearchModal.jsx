
import React, { useState, useEffect } from 'react';
import { FiPlus } from 'react-icons/fi';
import api from '../../api/apiClient';

const CatalogSearchModal = ({ brand, initialSku, onClose, onSelect, onCreateNew }) => {
    const [query, setQuery] = useState(initialSku || '');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (query.length >= 2) {
            search();
        }
    }, [query]);

    const search = async () => {
        try {
            setLoading(true);
            const res = await api.get('/api/catalog/search', {
                params: { brand, q: query }
            });
            setResults(res.data || []);
        } catch (e) {
            console.error("Catalog search error", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[12000] p-4">
            <div className="bg-[#151515] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-blue-500/5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white">🔍</div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">Biblioteca Técnica: {brand}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                <div className="p-6">
                    <input
                        autoFocus
                        className="w-full bg-white/5 px-4 py-4 rounded-xl text-xl font-bold text-blue-400 outline-none border border-white/10 focus:border-blue-500 transition-all shadow-inner"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Pesquise por SKU, Nome ou Categoria..."
                    />
                </div>

                <div className="flex-1 overflow-auto px-6 pb-6">
                    {loading ? (
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
                                    onClick={() => onSelect(item)}
                                    className="p-4 bg-white/[0.03] hover:bg-blue-500/10 border border-white/5 hover:border-blue-500/30 rounded-xl cursor-pointer transition-all group"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black text-white group-hover:text-blue-400">{item.sku} {item.handle && `(${item.handle})`}</span>
                                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{item.finish_group}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-mono text-blue-400 font-bold">{item.price?.toFixed(2)} €</span>
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

                <div className="p-6 border-t border-white/5 bg-black/20 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">
                        Selecione um artigo para preencher automaticamente os dados técnicos na proposta.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default CatalogSearchModal;
