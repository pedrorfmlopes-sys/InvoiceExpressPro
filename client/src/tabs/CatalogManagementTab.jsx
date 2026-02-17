import React, { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { FiDatabase, FiUploadCloud, FiSearch, FiCheckCircle, FiClock, FiAlertTriangle, FiLoader, FiTrash2, FiCheckSquare, FiSquare, FiCheck } from 'react-icons/fi';
import api from '../api/apiClient';

const BRANDS_CONFIG = [
    { id: 'nicolazzi', name: 'Nicolazzi', color: 'amber' },
    { id: 'ritmonio', name: 'Ritmonio', color: 'blue' },
    { id: 'bette', name: 'Bette', color: 'green' }
];

const CatalogManagementTab = ({ project }) => {
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [stats, setStats] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Mapping Flow State
    const [inspectData, setInspectData] = useState(null); // { tempFilename, sheets: [{ name, headers }] }
    const [availableCollections, setAvailableCollections] = useState([]); // For import wizard
    const [selectedCollections, setSelectedCollections] = useState([]); // For import wizard
    const [isLoadingCollections, setIsLoadingCollections] = useState(false);

    // Persistent Collection Settings
    const [storedCollections, setStoredCollections] = useState([]);
    const [isLoadingStored, setIsLoadingStored] = useState(false);

    // Initialize with default standard mappings
    const [mapping, setMapping] = useState({
        itemSheetName: '',
        finishSheetName: '',
        columns: {
            sku: 'Codigo',
            description_pt: 'Des.PT',
            price: 'PVP',
            collection: 'Série'
        },
        clearBeforeImport: false
    });
    const [isDragging, setIsDragging] = useState(false);

    const loadStats = async () => {
        try {
            const res = await api.get('/api/catalog/stats');
            setStats(res.data || []);
        } catch (err) {
            console.error("Failed to load catalog stats", err);
        }
    };

    const fetchCollections = async (sheetName, seriesCol) => {
        if (!inspectData || !sheetName || !seriesCol) return;
        setIsLoadingCollections(true);
        try {
            const res = await api.post('/api/catalog/inspect-collections', {
                tempFilename: inspectData.tempFilename,
                sheetName,
                columnName: seriesCol
            });
            if (res.data && res.data.collections) {
                setAvailableCollections(res.data.collections);
                setSelectedCollections(res.data.collections.filter(c => c.toLowerCase() !== 'geral')); // Auto-exclude "Geral" as suggested
            }
        } catch (err) {
            console.error("Failed to fetch collections", err);
        } finally {
            setIsLoadingCollections(false);
        }
    };

    const loadStoredCollections = async () => {
        if (!selectedBrand) return;
        setIsLoadingStored(true);
        try {
            const res = await api.get(`/api/catalog/collections?brand=${selectedBrand.id}`);
            setStoredCollections(res.data || []);
        } catch (err) {
            console.error("Failed to load stored collections", err);
        } finally {
            setIsLoadingStored(false);
        }
    };

    const toggleCollection = async (name, currentVisibility) => {
        // Optimistic update
        const newVisibility = !currentVisibility;
        setStoredCollections(prev => prev.map(c =>
            c.name === name ? { ...c, is_visible: newVisibility } : c
        ));

        try {
            await api.post('/api/catalog/collections/toggle', {
                brand: selectedBrand.id,
                name,
                isVisible: newVisibility
            });
        } catch (err) {
            console.error("Failed to toggle collection", err);
            // Revert on error
            setStoredCollections(prev => prev.map(c =>
                c.name === name ? { ...c, is_visible: currentVisibility } : c
            ));
        }
    };

    useEffect(() => {
        if (selectedBrand) loadStoredCollections();
    }, [selectedBrand]);

    useEffect(() => {
        loadStats();
    }, []);



    const handleSearch = async (q) => {
        setSearchQuery(q);
        if (!selectedBrand) return;
        if (q.length < 2) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const res = await api.get(`/api/catalog/search?brand=${selectedBrand.id}&q=${q}`);
            setSearchResults(res.data || []);
        } catch (err) {
            console.error("Search failed", err);
        } finally {
            setIsSearching(false);
        }
    };

    const handleInspect = async (file) => {
        if (!file || !selectedBrand) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('brand', selectedBrand.id);

        setIsUploading(true);
        try {
            const res = await api.post('/api/catalog/inspect', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setInspectData(res.data);

            // Auto-detect sheet
            const sheets = res.data.sheets || [];
            const itemSheetObj = sheets.find(s => s.name.toLowerCase().includes('tabela') || s.name.toLowerCase().includes('items')) || sheets[0];
            const finishSheetObj = sheets.find(s => s.name.toLowerCase().includes('acabamento') || s.name.toLowerCase().includes('finishes'));

            setMapping(prev => ({
                ...prev,
                itemSheetName: itemSheetObj ? itemSheetObj.name : '',
                finishSheetName: finishSheetObj ? finishSheetObj.name : ''
            }));

            // If auto-detected item sheet has the collection column, fetch immediately
            if (itemSheetObj) {
                const hasCol = itemSheetObj.headers.includes('Série');
                if (hasCol) fetchCollections(itemSheetObj.name, 'Série');
            }

        } catch (err) {
            alert('Falha na inspeção: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsUploading(false);
        }
    };

    const handleProcess = async () => {
        if (!inspectData || !selectedBrand) return;

        setIsUploading(true);
        try {
            const res = await api.post('/api/catalog/process', {
                brand: selectedBrand.id,
                tempFilename: inspectData.tempFilename,
                mappings: {
                    ...mapping,
                    allowedCollections: selectedCollections
                }
            });

            const stats = res.data.stats || {};
            alert(`Processamento concluído!\n\n` +
                `✅ Criados: ${stats.createdCount || 0}\n` +
                `🔄 Atualizados: ${stats.updatedCount || 0}\n` +
                `🚫 Saltados (Sem SKU): ${stats.skippedCount || 0}\n` +
                `🔍 Filtrados (Coleções não selecionadas): ${stats.filteredCount || 0}`);

            setInspectData(null);
            setAvailableCollections([]);
            setSelectedCollections([]);
            // Reset to defaults
            setMapping({
                itemSheetName: '',
                finishSheetName: '',
                columns: { sku: 'Codigo', description_pt: 'Des.PT', price: 'PVP', collection: 'Série' },
                clearBeforeImport: false
            });
            loadStats();
        } catch (err) {
            alert('Falha no processamento: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsUploading(false);
        }
    };

    const handleClearCatalog = async () => {
        if (!selectedBrand) return;
        if (!window.confirm(`TEM A CERTEZA? Isto irá apagar TODOS os artigos e acabamentos da marca ${selectedBrand.name.toUpperCase()} do catálogo. Esta ação é irreversível.`)) {
            return;
        }

        setIsUploading(true);
        try {
            await api.delete(`/api/catalog/clear?brand=${selectedBrand.id}`);
            alert('Catálogo limpo com sucesso!');
            loadStats();
        } catch (err) {
            alert('Erro ao limpar catálogo: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsUploading(false);
        }
    };

    const getBrandStats = (brandId) => {
        const s = stats.find(s => s.brand === brandId);
        return {
            items: s?.count || 0,
            lastSync: s?.lastUpdate ? new Date(s.lastUpdate).toLocaleDateString() : null,
            status: s?.count > 0 ? 'ready' : 'empty'
        };
    };

    // Drag & Drop Handlers
    const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = () => setIsDragging(false);
    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleInspect(file);
    };

    const BrandCard = ({ brandConfig }) => {
        const bStats = getBrandStats(brandConfig.id);
        const isSelected = selectedBrand?.id === brandConfig.id;

        return (
            <GlassCard
                className={`cursor-pointer transition-all duration-300 border-2 ${isSelected ? 'border-amber-500/50 ring-1 ring-amber-500/20' : 'border-transparent'}`}
                onClick={() => {
                    setSelectedBrand({ ...brandConfig, ...bStats });
                    setInspectData(null);
                    // Trigger load in effect or here
                    setTimeout(() => loadStoredCollections(), 0);
                }}
            >
                <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                        <div className={`w-12 h-12 rounded-2xl bg-${brandConfig.color}-500/10 flex items-center justify-center text-${brandConfig.color}-500 text-xl font-bold`}>
                            {brandConfig.name[0]}
                        </div>
                        {bStats.status === 'ready' ? (
                            <span className="flex items-center gap-1 text-[10px] text-green-500 font-bold uppercase tracking-widest bg-green-500/10 px-2 py-1 rounded-full">
                                <FiCheckCircle /> Sincronizado
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-[10px] text-gray-500 font-bold uppercase tracking-widest bg-white/5 px-2 py-1 rounded-full">
                                <FiClock /> Sem Dados
                            </span>
                        )}
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-white">{brandConfig.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">Biblioteca de Artigos & Preços</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-600 uppercase font-bold">Artigos</span>
                            <span className="text-sm font-mono text-white">{bStats.items.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-600 uppercase font-bold">Último Update</span>
                            <span className="text-sm font-mono text-white">{bStats.lastSync || '---'}</span>
                        </div>
                    </div>
                </div>
            </GlassCard>
        );
    };

    const totalItems = stats.reduce((acc, curr) => acc + parseInt(curr.count), 0);

    return (
        <div className="flex flex-col gap-8 h-full fade-in pb-12 overflow-y-auto custom-scrollbar pr-2">
            {/* Header Section */}
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tight uppercase italic">Biblioteca <span className="text-amber-500">Multimarca</span></h2>
                    <p className="text-gray-400 mt-2 max-w-xl">
                        Faça a gestão das tabelas de preços e descrições técnicas.
                        O sistema utiliza estes dados para traduzir propostas automaticamente.
                    </p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-white/5 px-6 py-4 rounded-2xl border border-white/10 flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Total de Artigos</div>
                            <div className="text-xl font-black text-white font-mono">{totalItems.toLocaleString()}</div>
                        </div>
                        <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center text-amber-500">
                            <FiDatabase size={20} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Brands Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {BRANDS_CONFIG.map(brand => (
                    <BrandCard key={brand.id} brandConfig={brand} />
                ))}
            </div>

            {/* Brand Management Detail */}
            {selectedBrand ? (
                <div className="flex flex-col gap-6 slide-up pb-10">
                    <div className="h-px bg-white/10 w-full" />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Upload/Mapping Zone */}
                        <div
                            className={`
                                relative glass-panel p-8 flex flex-col items-center justify-center text-center gap-6 border-2 border-dashed transition-all group overflow-hidden
                                ${isDragging ? 'border-amber-500 bg-amber-500/10 scale-[1.02]' : 'border-white/10 hover:border-amber-500/30'}
                            `}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                        >
                            {isUploading && (
                                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-4">
                                    <FiLoader className="text-amber-500 animate-spin" size={40} />
                                    <span className="text-white font-bold animate-pulse">A Processar...</span>
                                </div>
                            )}

                            {inspectData ? (
                                <div className="flex flex-col gap-6 w-full fade-in">
                                    <div className="flex items-center justify-center gap-4 text-amber-500 mb-2">
                                        <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center">
                                            <FiCheckCircle size={24} />
                                        </div>
                                        <div className="text-left">
                                            <div className="font-bold text-white">Ficheiro Inspecionado</div>
                                            <div className="text-xs opacity-50">{inspectData.sheets.length} separadores detetados</div>
                                        </div>
                                    </div>

                                    <div className="space-y-4 text-left">
                                        <div>
                                            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest block mb-2">Separador de Artigos</label>
                                            <select
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-amber-500/50"
                                                value={mapping.itemSheetName}
                                                onChange={e => setMapping({ ...mapping, itemSheetName: e.target.value })}
                                            >
                                                {inspectData.sheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest block mb-2">Separador de Acabamentos</label>
                                            <select
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-amber-500/50"
                                                value={mapping.finishSheetName}
                                                onChange={e => setMapping({ ...mapping, finishSheetName: e.target.value })}
                                            >
                                                <option value="">Nenhum (Saltar)</option>
                                                {inspectData.sheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Column Mapping Section */}
                                    {(mapping.itemSheetName && inspectData.sheets.find(s => s.name === mapping.itemSheetName)?.headers) && (
                                        <div className="bg-white/5 p-4 rounded-xl border border-white/10 mt-2">
                                            <h5 className="text-[10px] uppercase font-black text-amber-500 tracking-widest mb-4 flex items-center gap-2">
                                                <FiDatabase /> Mapeamento de Colunas
                                            </h5>
                                            <div className="grid grid-cols-2 gap-4">
                                                {[
                                                    { id: 'sku', label: 'Código (SKU)' },
                                                    { id: 'collection', label: 'Série / Coleção' },
                                                    { id: 'description_pt', label: 'Descrição PT' },
                                                    { id: 'price', label: 'Preço (PVP)' }
                                                ].map(field => (
                                                    <div key={field.id}>
                                                        <label className="text-[9px] uppercase font-bold text-gray-500 block mb-1">{field.label}</label>
                                                        <select
                                                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-xs text-white outline-none focus:border-amber-500/50"
                                                            value={mapping.columns[field.id] || ''}
                                                            onChange={e => {
                                                                setMapping({
                                                                    ...mapping,
                                                                    columns: { ...mapping.columns, [field.id]: e.target.value }
                                                                });
                                                                if (field.id === 'collection' && e.target.value) {
                                                                    fetchCollections(mapping.itemSheetName, e.target.value);
                                                                }
                                                            }}
                                                        >
                                                            <option value="">-- Selecionar Coluna --</option>
                                                            {inspectData.sheets.find(s => s.name === mapping.itemSheetName)?.headers.map(h => (
                                                                <option key={h} value={h}>{h}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Collection Filter Section */}
                                    {availableCollections.length > 0 && (
                                        <div className="bg-white/5 p-4 rounded-xl border border-white/10 mt-2 fade-in">
                                            <div className="flex justify-between items-center mb-4">
                                                <h5 className="text-[10px] uppercase font-black text-amber-500 tracking-widest flex items-center gap-2">
                                                    <FiCheckSquare /> Filtro de Coleções
                                                </h5>
                                                <button
                                                    onClick={() => setSelectedCollections(availableCollections)}
                                                    className="text-[9px] uppercase font-bold text-gray-400 hover:text-white transition-all"
                                                >
                                                    Selecionar Todas
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[150px] overflow-y-auto custom-scrollbar p-1">
                                                {availableCollections.map(col => (
                                                    <div
                                                        key={col}
                                                        className={`
                                                            flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer
                                                            ${selectedCollections.includes(col)
                                                                ? 'bg-amber-500/10 border-amber-500/30 text-white'
                                                                : 'bg-black/20 border-white/5 text-gray-500'}
                                                        `}
                                                        onClick={() => {
                                                            if (selectedCollections.includes(col)) {
                                                                setSelectedCollections(selectedCollections.filter(c => c !== col));
                                                            } else {
                                                                setSelectedCollections([...selectedCollections, col]);
                                                            }
                                                        }}
                                                    >
                                                        <div className={`w-3 h-3 rounded flex items-center justify-center ${selectedCollections.includes(col) ? 'bg-amber-500' : 'bg-white/10'}`}>
                                                            {selectedCollections.includes(col) && <FiCheck size={10} className="text-black" />}
                                                        </div>
                                                        <span className="text-[10px] font-bold truncate">{col}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-[9px] text-gray-500 mt-3 italic">
                                                Note: Apenas os artigos pertencentes às coleções selecionadas serão importados.
                                            </p>
                                        </div>
                                    )}

                                    {isLoadingCollections && (
                                        <div className="flex items-center justify-center gap-2 py-4 text-amber-500">
                                            <FiLoader className="animate-spin" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">A carregar coleções...</span>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 bg-red-500/10 p-4 rounded-xl border border-red-500/20 mt-4 cursor-pointer hover:bg-red-500/20 transition-all"
                                        onClick={() => setMapping({ ...mapping, clearBeforeImport: !mapping.clearBeforeImport })}>
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 accent-red-500"
                                            checked={mapping.clearBeforeImport}
                                            onChange={() => { }} // handled by div
                                        />
                                        <div className="text-left">
                                            <div className="text-xs font-bold text-red-500 uppercase tracking-tight">Limpar dados atuais desta marca</div>
                                            <div className="text-[10px] text-gray-400">Remove todos os artigos existentes do catálogo Nicolazzi antes de importar os novos.</div>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 mt-6">
                                        <button
                                            onClick={() => setInspectData(null)}
                                            className="flex-1 bg-white/5 hover:bg-white/10 text-white px-4 py-3 rounded-xl font-bold text-sm transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleProcess}
                                            className="flex-[2] bg-amber-500 hover:bg-amber-400 text-black px-4 py-3 rounded-xl font-black uppercase tracking-tight transition-all shadow-lg shadow-amber-500/20"
                                        >
                                            Confirmar e Importar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                                        <FiUploadCloud size={40} />
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-bold text-white">Atualizar Tabela {selectedBrand.name}</h4>
                                        <p className="text-sm text-gray-500 mt-2">
                                            Arraste o Excel (.xlsx) ou clique para escolher.<br />
                                            Poderá escolher as folhas (Sheet) no próximo passo.
                                        </p>
                                    </div>
                                    <label className="bg-amber-500 hover:bg-amber-400 text-black px-8 py-3 rounded-xl font-black uppercase tracking-tight transition-all shadow-lg shadow-amber-500/20 cursor-pointer">
                                        Escolher Ficheiro
                                        <input type="file" className="hidden" accept=".xlsx" onChange={e => handleInspect(e.target.files?.[0])} disabled={isUploading} />
                                    </label>
                                </>
                            )}
                        </div>

                        {/* Search & Preview */}
                        <GlassCard>
                            <div className="flex flex-col gap-6 h-full">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-lg font-bold text-white flex items-center gap-2">
                                        <FiSearch className="text-amber-500" /> Explorar {selectedBrand.name}
                                    </h4>
                                    <span className="text-[11px] text-gray-500">{searchResults.length} resultados encontrados</span>
                                </div>

                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Pesquisar por Código ou Descrição..."
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white outline-none focus:border-amber-500/50 transition-all font-mono text-sm"
                                        value={searchQuery}
                                        onChange={(e) => handleSearch(e.target.value)}
                                    />
                                    {isSearching && (
                                        <FiLoader className="absolute right-4 top-4 text-amber-500 animate-spin" size={20} />
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {searchResults.length > 0 ? (
                                        searchResults.map((item, idx) => (
                                            <div key={item.id} className="bg-white/5 p-3 rounded-lg border border-white/5 flex gap-4 items-center group hover:bg-white/10 transition-all cursor-default">
                                                <div className="text-[10px] font-mono text-amber-500/60 bg-amber-500/10 px-2 py-1 rounded">{item.sku}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs text-white font-medium truncate">{item.description_pt || item.description_it}</div>
                                                    <div className="text-[10px] text-gray-500 truncate">
                                                        {item.handle && `Manípulo ${item.handle}`}
                                                        {item.finish_group && ` • Grupo ${item.finish_group}`}
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-xs text-white font-bold font-mono">{parseFloat(item.price).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}</div>
                                                    <div className="text-[9px] text-green-500 uppercase font-bold">{item.source}</div>
                                                </div>
                                            </div>
                                        ))
                                    ) : searchQuery.length > 1 && !isSearching ? (
                                        <div className="py-10 text-center text-gray-600 text-sm italic">
                                            Nenhum resultado encontrado para "{searchQuery}"
                                        </div>
                                    ) : (
                                        <div className="py-10 text-center text-gray-600 text-sm italic">
                                            Escreva mais de 2 caracteres para pesquisar...
                                        </div>
                                    )}
                                </div>
                            </div>
                        </GlassCard>
                    </div>

                    {/* Collection Visibility Manager */}
                    <GlassCard>
                        <div className="flex flex-col gap-4">
                            <h4 className="text-lg font-bold text-white flex items-center gap-2">
                                <FiCheckSquare className="text-amber-500" /> Gestão de Coleções
                            </h4>
                            <p className="text-xs text-gray-500">
                                Defina quais as coleções que devem aparecer nas propostas.
                                Desmarque as genéricas (ex: "Geral", "Standard") para não poluirem a descrição dos artigos.
                            </p>

                            {isLoadingStored ? (
                                <div className="flex items-center gap-2 text-amber-500 py-4">
                                    <FiLoader className="animate-spin" /> A carregar coleções...
                                </div>
                            ) : storedCollections.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                                    {storedCollections.map((col, idx) => {
                                        // Handle SQLite 0/1 booleans
                                        const isVisible = col.is_visible !== false && col.is_visible !== 0;
                                        return (
                                            <div
                                                key={col.name || idx}
                                                onClick={() => toggleCollection(col.name, isVisible)}
                                                className={`
                                                    flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all select-none
                                                    ${isVisible
                                                        ? 'bg-amber-500/10 border-amber-500/30 text-white'
                                                        : 'bg-white/5 border-white/10 text-gray-500 opacity-60 hover:opacity-100'}
                                                `}
                                            >
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${isVisible ? 'bg-amber-500 border-amber-500' : 'border-gray-500'}`}>
                                                    {isVisible && <FiCheckCircle size={12} className="text-black" />}
                                                </div>
                                                <span className="text-xs font-bold truncate" title={col.name}>{col.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-gray-500 text-sm italic py-4">
                                    Nenhuma coleção encontrada. Importe tabelas para popular esta lista.
                                </div>
                            )}
                        </div>
                    </GlassCard>

                    {/* Sync Rules Warning */}
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex gap-6 items-center">
                        <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center text-amber-500 shrink-0">
                            <FiAlertTriangle size={24} />
                        </div>
                        <div className="flex-1 text-sm text-amber-500/80">
                            <h5 className="text-amber-500 font-bold mb-1">Proteção de Dados Manuais Ativa</h5>
                            <p className="leading-tight">
                                O sistema deteta automaticamente se a descrição foi alterada manualmente por si no estúdio.
                                Novos carregamentos <strong>nunca</strong> apagam as suas edições personalizadas sem a sua autorização.
                            </p>
                            <button
                                onClick={handleClearCatalog}
                                disabled={isUploading}
                                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all mt-4 flex items-center justify-center gap-2"
                            >
                                <FiTrash2 /> {isUploading ? 'A processar...' : 'Limpar Catálogo Completo'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                    <FiDatabase size={64} className="mb-4 text-gray-600" />
                    <h3 className="text-xl font-bold">Selecione uma marca para gerir</h3>
                    <p className="text-sm">Os catálogos estão organizados de forma isolada por fabricante.</p>
                </div>
            )}
        </div>
    );
};

export default CatalogManagementTab;
