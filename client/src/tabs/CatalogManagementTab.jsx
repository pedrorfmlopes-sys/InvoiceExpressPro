import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { FiDatabase, FiUploadCloud, FiSearch, FiCheckCircle, FiClock, FiAlertTriangle, FiLoader, FiTrash2, FiCheckSquare, FiSquare, FiCheck, FiCalendar, FiSettings, FiPlus, FiDownload, FiX, FiUpload } from 'react-icons/fi';
import api from '../api/apiClient';
import CalendarManager from '../components/logistics/CalendarManager';

const BRANDS_CONFIG = [
    { id: 'nicolazzi', name: 'Nicolazzi', color: 'amber' },
    { id: 'ritmonio', name: 'Ritmonio', color: 'blue' },
    { id: 'bette', name: 'Bette', color: 'green' },
    { id: 'axa', name: 'AXA', color: 'red' },
    { id: 'fima', name: 'FIMA', color: 'indigo' },
    { id: 'scarabeo', name: 'Scarabeo', color: 'blue' },
    { id: 'buto', name: 'Butö', color: 'orange' }
];

const UNIT_OPTIONS = [
    { value: 'days', label: 'Dias' },
    { value: 'weeks', label: 'Semanas' },
    { value: 'months', label: 'Meses' }
];

// Convert stored lead_time_weeks to display value based on unit
const toDisplayValue = (weeks, unit) => {
    if (weeks == null) return '';
    if (unit === 'days') return Math.round(weeks * 7);
    if (unit === 'months') return parseFloat((weeks / 4.33).toFixed(1));
    return weeks;
};

// Convert display value back to weeks for storage
const toWeeks = (value, unit) => {
    const v = parseFloat(value);
    if (isNaN(v)) return null;
    if (unit === 'days') return parseFloat((v / 7).toFixed(2));
    if (unit === 'months') return parseFloat((v * 4.33).toFixed(2));
    return v;
};

const CatalogManagementTab = ({ project }) => {
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [stats, setStats] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [activeLibraryTab, setActiveLibraryTab] = useState('collections'); // 'collections' | 'finishes'

    // Mapping Flow State
    const [inspectData, setInspectData] = useState(null);
    const [availableCollections, setAvailableCollections] = useState([]);
    const [selectedCollections, setSelectedCollections] = useState([]);
    const [isLoadingCollections, setIsLoadingCollections] = useState(false);

    // Persistent Collection Settings
    const [storedCollections, setStoredCollections] = useState([]);
    const [isLoadingStored, setIsLoadingStored] = useState(false);

    // Finish Settings
    const [brandFinishes, setBrandFinishes] = useState([]);
    const [isLoadingFinishes, setIsLoadingFinishes] = useState(false);

    // Alias Settings
    const [brandAliases, setBrandAliases] = useState([]);
    const [isLoadingAliases, setIsLoadingAliases] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [savedFeedback, setSavedFeedback] = useState(false);

    const saveAll = async () => {
        if (!selectedBrand || isSaving) return;
        setIsSaving(true);
        try {
            if (activeLibraryTab === 'collections') {
                const rows = storedCollections.filter(c => !c._isNew);
                await Promise.all(rows.map(col =>
                    api.patch('/api/catalog/collections', {
                        brand: selectedBrand.id,
                        name: col.name,
                        leadTimeWeeks: col.lead_time_weeks,
                        leadTimeUnit: col.lead_time_unit || 'weeks',
                        description: col.description || null,
                        isVisible: col.is_visible
                    }).catch(e => console.error('Save failed for', col.name, e))
                ));
            } else {
                const rows = brandFinishes.filter(f => !f._isNew);
                await Promise.all(rows.map(f =>
                    api.patch('/api/catalog/finishes', {
                        brand: selectedBrand.id,
                        id: f.id,
                        finishCode: f.finish_code,
                        name: f.name_en || f.name_it || '',
                        groupCode: f.group_code || '',
                        leadTimeWeeks: f.lead_time_weeks,
                        leadTimeUnit: f.lead_time_unit || 'weeks',
                        description: f.description_pt || null
                    }).catch(e => console.error('Save failed for', f.id, e))
                ));
            }
            setSavedFeedback(true);
            setTimeout(() => setSavedFeedback(false), 2500);
        } finally {
            setIsSaving(false);
        }
    };

    // CSV Import
    const importFileRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importFeedback, setImportFeedback] = useState(null); // { count, errors }

    const importFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !selectedBrand) return;
        setIsImporting(true);
        setImportFeedback(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('brand', selectedBrand.id);
            formData.append('type', activeLibraryTab); // 'collections' or 'finishes'

            const res = await api.post('/api/catalog/import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const { count, errors } = res.data;
            setImportFeedback({ count: count ?? 0, errors: errors ?? 0 });
            setTimeout(() => setImportFeedback(null), 4000);

            // Reload the relevant table
            if (activeLibraryTab === 'collections') await loadStoredCollections();
            else await loadBrandFinishes();

        } catch (err) {
            console.error('Import failed', err);
            setImportFeedback({ count: 0, errors: 1 });
        } finally {
            setIsImporting(false);
            if (importFileRef.current) importFileRef.current.value = '';
        }
    };

    const [selectedRows, setSelectedRows] = useState(new Set()); // Set of keys (name for collections, finish_code for finishes)
    const [bulkApply, setBulkApply] = useState({ value: '', unit: 'weeks' });

    const toggleRowSelection = (key) => {
        setSelectedRows(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const selectAllVisible = (items, keyFn) => {
        const allKeys = items.filter(i => !i._isNew).map(keyFn);
        setSelectedRows(prev => {
            const allSelected = allKeys.every(k => prev.has(k));
            if (allSelected) return new Set(); // Deselect all
            return new Set(allKeys); // Select all
        });
    };

    const applyBulkLeadTime = async () => {
        if (!bulkApply.value || selectedRows.size === 0) return;
        const weeks = toWeeks(bulkApply.value, bulkApply.unit);
        if (weeks === null) return;

        if (activeLibraryTab === 'collections') {
            setStoredCollections(prev => prev.map(c =>
                selectedRows.has(c.name) ? { ...c, lead_time_weeks: weeks, lead_time_unit: bulkApply.unit } : c
            ));
            await Promise.all([...selectedRows].map(name =>
                api.patch('/api/catalog/collections', {
                    brand: selectedBrand.id, name,
                    leadTimeWeeks: weeks, leadTimeUnit: bulkApply.unit
                }).catch(err => console.error('Bulk save failed for', name, err))
            ));
        } else {
            setBrandFinishes(prev => prev.map(f =>
                selectedRows.has(f.id) ? { ...f, lead_time_weeks: weeks, lead_time_unit: bulkApply.unit } : f
            ));
            await Promise.all([...selectedRows].map(id =>
                api.patch('/api/catalog/finishes', {
                    brand: selectedBrand.id, id,
                    leadTimeWeeks: weeks, leadTimeUnit: bulkApply.unit
                }).catch(err => console.error('Bulk save failed for', id, err))
            ));
        }
        setSelectedRows(new Set()); // Clear selection after apply
        setBulkApply(prev => ({ ...prev, value: '' }));
    };

    // Initialize with default standard mappings
    const [mapping, setMapping] = useState({
        itemSheetName: '',
        finishSheetName: '',
        columns: {
            sku: 'Codigo',
            description_pt: 'Des.PT',
            price: 'PVP',
            collection: 'Série',
            // Finish columns
            fCode: 'Codigo',
            fName: 'Nome_EN',
            fDays: 'Tempo produção',
            fStar: 'Marcado asterisco',
            fDesc: 'Descricao Tecnica'
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

    const loadStoredCollections = async (brandId) => {
        const bid = brandId || selectedBrand?.id;
        if (!bid) return;
        setIsLoadingStored(true);
        try {
            const res = await api.get(`/api/catalog/collections?brand=${bid}`);
            setStoredCollections(res.data || []);
        } catch (err) {
            console.error("Failed to load stored collections", err);
        } finally {
            setIsLoadingStored(false);
        }
    };

    const loadBrandFinishes = async (brandId) => {
        const bid = brandId || selectedBrand?.id;
        if (!bid) return;
        setIsLoadingFinishes(true);
        try {
            const res = await api.get(`/api/catalog/finishes/${bid}`);
            setBrandFinishes(res.data || []);
        } catch (err) {
            console.error("Failed to load brand finishes", err);
        } finally {
            setIsLoadingFinishes(false);
        }
    };

    const loadBrandAliases = async (brandId) => {
        const bid = brandId || selectedBrand?.id;
        if (!bid) return;
        setIsLoadingAliases(true);
        try {
            const res = await api.get(`/api/catalog/aliases?brand=${bid}`);
            setBrandAliases(res.data || []);
        } catch (err) {
            console.error("Failed to load brand aliases", err);
        } finally {
            setIsLoadingAliases(false);
        }
    };

    const deleteAlias = async (originalSku) => {
        if (!window.confirm(`Tem a certeza que deseja remover a correção para o código "${originalSku}"?`)) return;
        try {
            await api.delete('/api/catalog/aliases', { data: { brand: selectedBrand.id.toUpperCase(), originalSku } });
            setBrandAliases(prev => prev.filter(a => a.original_sku !== originalSku));
        } catch (err) {
            console.error('Failed to delete alias', err);
            alert('Erro ao apagar alias.');
        }
    };

    const toggleCollection = async (name, currentVisibility) => {
        const newVisibility = !currentVisibility;
        setStoredCollections(prev => prev.map(c =>
            c.name === name ? { ...c, is_visible: newVisibility } : c
        ));
        try {
            await api.patch('/api/catalog/collections', {
                brand: selectedBrand.id, name, isVisible: newVisibility
            });
        } catch (err) {
            console.error('Failed to toggle collection', err);
            setStoredCollections(prev => prev.map(c =>
                c.name === name ? { ...c, is_visible: currentVisibility } : c
            ));
        }
    };

    // Generic update for a collection field — called on blur
    const saveCollection = async (name, patch) => {
        try {
            await api.patch('/api/catalog/collections', { brand: selectedBrand.id, name, ...patch });
        } catch (err) {
            console.error('Failed to save collection', err);
            // Do NOT reload — keep the local state to avoid losing user edits
        }
    };

    const addCollection = async () => {
        const newRow = { name: '', description: '', lead_time_weeks: null, lead_time_unit: 'weeks', is_visible: true, _isNew: true };
        setStoredCollections(prev => [newRow, ...prev]);
    };

    const deleteCollection = async (name) => {
        if (!name) {
            setStoredCollections(prev => prev.filter(c => c.name !== name));
            return;
        }
        setStoredCollections(prev => prev.filter(c => c.name !== name));
        try {
            await api.delete('/api/catalog/collections', { data: { brand: selectedBrand.id, name } });
        } catch (err) {
            console.error('Failed to delete collection', err);
            // Reload to restore deleted row if server rejected the delete
            loadStoredCollections();
        }
    };

    const saveNewCollection = async (row) => {
        if (!row.name.trim()) return;
        try {
            await api.post('/api/catalog/collections', {
                brand: selectedBrand.id,
                name: row.name,
                description: row.description,
                leadTimeWeeks: row.lead_time_weeks,
                leadTimeUnit: row.lead_time_unit || 'weeks',
                isVisible: row.is_visible
            });
            await loadStoredCollections();
        } catch (err) {
            console.error('Failed to create collection', err);
        }
    };

    // Generic save for a finish field — called on blur
    const saveFinish = async (id, patch) => {
        try {
            await api.patch('/api/catalog/finishes', { brand: selectedBrand.id, id, ...patch });
        } catch (err) {
            console.error('Failed to save finish', err);
            // Do NOT reload — keep the local state to avoid losing user edits
        }
    };

    const addFinish = async () => {
        const newRow = { finish_code: '', group_code: '', name_en: '', name_it: '', description_pt: '', lead_time_weeks: null, lead_time_unit: 'weeks', _isNew: true };
        setBrandFinishes(prev => [newRow, ...prev]);
    };

    const deleteFinish = async (id) => {
        if (!id) {
            // If it's a new row without id, we can't reliably delete by id yet, 
            // but new rows are handled differently anyway.
            return;
        }
        setBrandFinishes(prev => prev.filter(f => f.id !== id));
        try {
            await api.delete('/api/catalog/finishes', { data: { brand: selectedBrand.id, id } });
        } catch (err) {
            console.error('Failed to delete finish', err);
            loadBrandFinishes();
        }
    };

    const saveNewFinish = async (row) => {
        if (!row.finish_code?.trim()) return;
        try {
            await api.post('/api/catalog/finishes', {
                brand: selectedBrand.id,
                finishCode: row.finish_code,
                groupCode: row.group_code,
                name: row.name_en || row.name || '',
                description: row.description_pt || '',
                leadTimeWeeks: row.lead_time_weeks,
                leadTimeUnit: row.lead_time_unit || 'weeks'
            });
            await loadBrandFinishes();
        } catch (err) {
            console.error('Failed to create finish', err);
        }
    };

    const exportLibrary = async (type) => {
        try {
            const res = await api.get(`/api/catalog/export?brand=${selectedBrand.id}&type=${type}`);
            const rows = res.data;
            if (!rows || !rows.length) return;

            const headers = Object.keys(rows[0]);
            const bom = '\uFEFF';
            const csv = bom + [
                headers.join(';'),
                ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(';'))
            ].join('\n');

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${selectedBrand.id}_${type}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            // Delay cleanup so browser has time to start the download
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 150);
        } catch (err) {
            console.error('Export failed', err);
        }
    };

    useEffect(() => {
        if (selectedBrand) {
            loadStoredCollections(selectedBrand.id);
            loadBrandFinishes(selectedBrand.id);
            loadBrandAliases(selectedBrand.id);
        }
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

            // Auto-detect sheet — matches Nicolazzi, Ritmonio and AXA patterns
            const sheets = res.data.sheets || [];
            const itemSheetObj =
                sheets.find(s => s.name.toLowerCase().includes('tabela')) ||
                sheets.find(s => s.name.toLowerCase().includes('items')) ||
                sheets.find(s => s.name.toLowerCase().includes('listino')) ||
                sheets.find(s => s.name.toLowerCase().includes('pricelist')) ||
                sheets[0];

            const finishSheetObj =
                sheets.find(s => s.name.toLowerCase().includes('acabamento')) ||
                sheets.find(s => s.name.toLowerCase().includes('finishes')) ||
                sheets.find(s => s.name.toLowerCase().includes('finish'));

            // Auto-detect columns from the item sheet headers using keywords
            // Returns the first header that matches any of the keyword fragments
            const autoDetectCol = (headers, ...keywords) => {
                return headers.find(h => keywords.some(kw => h.toLowerCase().includes(kw.toLowerCase()))) || '';
            };

            let autoColumns = { sku: 'Codigo', description_pt: 'Des.PT', price: 'PVP', collection: 'Série' };
            if (itemSheetObj?.headers?.length > 0) {
                const h = itemSheetObj.headers;
                // For description, prefer the LAST matching header (i > 2 equivalent)
                const descHeaders = h.filter((hdr, i) =>
                    i > 2 && (hdr.toLowerCase().includes('descri') || hdr.toLowerCase().includes('descrip'))
                );
                autoColumns = {
                    collection: autoDetectCol(h, 'collezione', 'collection', 'serie', 'série', 'colecao', 'coleção'),
                    sku: autoDetectCol(h, 'articolo', 'cod. art', 'codigo', 'código', 'sku', 'ref', 'item'),
                    description_pt: descHeaders[descHeaders.length - 1] || autoDetectCol(h, 'descri', 'descrip'),
                    price: autoDetectCol(h, 'prezzo', 'price', 'pvp', 'preco', 'preço'),
                };
            }

            setMapping(prev => ({
                ...prev,
                itemSheetName: itemSheetObj ? itemSheetObj.name : '',
                finishSheetName: finishSheetObj ? finishSheetObj.name : '',
                columns: { ...prev.columns, ...autoColumns }
            }));

            // Fetch collections using the auto-detected collection column
            if (itemSheetObj && autoColumns.collection) {
                fetchCollections(itemSheetObj.name, autoColumns.collection);
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

    // Calendar State
    const [calendarBrand, setCalendarBrand] = useState(null);

    // ...

    const BrandCard = ({ brandConfig }) => {
        const bStats = getBrandStats(brandConfig.id);
        const isSelected = selectedBrand?.id === brandConfig.id;

        return (
            <GlassCard
                className={`group relative cursor-pointer transition-all duration-300 border-2 ${isSelected ? 'border-amber-500/50 ring-1 ring-amber-500/20' : 'border-transparent'}`}
                onClick={() => {
                    setSelectedBrand({ ...brandConfig, ...bStats });
                    setInspectData(null);
                    setStoredCollections([]);
                    setBrandFinishes([]);
                    setBrandAliases([]);
                }}
            >
                {/* SETTINGS HOVER BUTTON */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setCalendarBrand(brandConfig);
                    }}
                    className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/20 rounded-lg text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all z-20"
                    title="Configurar Calendário Fabril"
                >
                    <FiCalendar size={16} />
                </button>

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
                                                <FiDatabase /> Mapeamento de Colunas (Artigos)
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

                                            {/* Finish Mapping - Only if finish sheet is selected */}
                                            {mapping.finishSheetName && (
                                                <div className="mt-6 pt-4 border-t border-white/5">
                                                    <h5 className="text-[10px] uppercase font-black text-blue-500 tracking-widest mb-4 flex items-center gap-2">
                                                        <FiDatabase /> Mapeamento de Colunas (Acabamentos)
                                                    </h5>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {[
                                                            { id: 'fCode', label: 'Código Acabamento' },
                                                            { id: 'fName', label: 'Nome Acabamento' },
                                                            { id: 'fDays', label: 'Dias Produção' },
                                                            { id: 'fStar', label: 'Estrela (Destaque)' },
                                                            { id: 'fDesc', label: 'Desc. Técnica (Opt.)' }
                                                        ].map(field => (
                                                            <div key={field.id}>
                                                                <label className="text-[9px] uppercase font-bold text-gray-500 block mb-1">{field.label}</label>
                                                                <select
                                                                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-xs text-white outline-none focus:border-blue-500/50"
                                                                    value={mapping.columns[field.id] || ''}
                                                                    onChange={e => {
                                                                        setMapping({
                                                                            ...mapping,
                                                                            columns: { ...mapping.columns, [field.id]: e.target.value }
                                                                        });
                                                                    }}
                                                                >
                                                                    <option value="">-- Selecionar Coluna --</option>
                                                                    {inspectData.sheets.find(s => s.name === mapping.finishSheetName)?.headers.map(h => (
                                                                        <option key={h} value={h}>{h}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
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

                    {/* ─── Library Manager ─────────────────────── */}
                    <GlassCard>
                        <div className="flex flex-col gap-4">
                            {/* Header */}
                            <div className="flex justify-between items-center flex-wrap gap-3">
                                <div className="flex items-center gap-2">
                                    {/* Tab switcher */}
                                    {[
                                        { id: 'collections', label: 'Coleções', icon: <FiCheckSquare size={14} />, color: 'amber' },
                                        { id: 'finishes', label: 'Acabamentos', icon: <FiSettings size={14} />, color: 'blue' },
                                        { id: 'aliases', label: 'Memória / SKUs', icon: <FiDatabase size={14} />, color: 'green' }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveLibraryTab(tab.id)}
                                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeLibraryTab === tab.id
                                                ? tab.color === 'amber'
                                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                : 'bg-white/5 text-gray-500 border border-white/10 hover:text-white'
                                                }`}
                                        >
                                            {tab.icon} {tab.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => activeLibraryTab === 'collections' ? addCollection() : addFinish()}
                                        className="flex items-center gap-1 px-3 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 rounded-xl text-xs font-bold transition-all"
                                    >
                                        <FiPlus size={14} /> Nova Linha
                                    </button>
                                    <button
                                        onClick={saveAll}
                                        disabled={isSaving}
                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${savedFeedback
                                            ? 'bg-green-500/20 border-green-500/30 text-green-400'
                                            : `bg-${selectedBrand?.color || 'indigo'}-500/20 hover:bg-${selectedBrand?.color || 'indigo'}-500/30 border-${selectedBrand?.color || 'indigo'}-500/30 text-${selectedBrand?.color || 'indigo'}-400 disabled:opacity-50`
                                            }`}
                                    >
                                        {isSaving
                                            ? <><FiLoader size={13} className="animate-spin" /> A guardar...</>
                                            : savedFeedback
                                                ? <><FiCheck size={13} /> Guardado</>
                                                : <><FiCheck size={13} /> Guardar Tudo</>
                                        }
                                    </button>
                                    <button
                                        onClick={() => importFileRef.current?.click()}
                                        disabled={isImporting}
                                        className="flex items-center gap-1 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                                    >
                                        {isImporting ? <FiLoader size={13} className="animate-spin" /> : <FiUpload size={13} />}
                                        Importar Excel/CSV
                                    </button>
                                    <button
                                        onClick={() => exportLibrary(activeLibraryTab)}
                                        className="flex items-center gap-1 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition-all"
                                    >
                                        <FiDownload size={14} /> Exportar CSV
                                    </button>
                                    {/* Hidden file input — accepts Excel and CSV */}
                                    <input
                                        ref={importFileRef}
                                        type="file"
                                        accept=".xlsx,.xls,.csv,.txt"
                                        onChange={importFile}
                                        className="hidden"
                                    />
                                </div>
                                {/* Import feedback toast */}
                                {importFeedback && (
                                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${importFeedback.errors > 0 && importFeedback.count === 0 ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
                                        {importFeedback.count > 0 ? <FiCheckCircle size={12} /> : <FiAlertTriangle size={12} />}
                                        {importFeedback.count > 0 ? `${importFeedback.count} linha${importFeedback.count !== 1 ? 's' : ''} importada${importFeedback.count !== 1 ? 's' : ''}` : ''}
                                        {importFeedback.errors > 0 ? ` · ${importFeedback.errors} erro${importFeedback.errors !== 1 ? 's' : ''}` : ''}
                                    </div>
                                )}
                            </div>

                            <p className="text-xs text-gray-500">
                                {activeLibraryTab === 'collections'
                                    ? 'Gerencie as coleções por marca. A coluna "Visível" controla se o nome da coleção aparece nas descrições das propostas.'
                                    : 'Gerencie os acabamentos por marca. Os prazos definidos aqui têm prioridade sobre os prazos da coleção (Acabamento > Coleção > Marca).'}
                            </p>

                            {/* ─── Bulk Apply Bar ─── */}
                            {selectedRows.size > 0 && (
                                <div className="flex items-center gap-3 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex-wrap">
                                    <span className="text-indigo-400 text-xs font-bold whitespace-nowrap">
                                        {selectedRows.size} selecionado{selectedRows.size !== 1 ? 's' : ''}
                                    </span>
                                    <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                                        <select
                                            value={bulkApply.unit}
                                            onChange={e => setBulkApply(prev => ({ ...prev, unit: e.target.value }))}
                                            className="bg-black/40 border border-indigo-500/30 rounded-lg px-2 py-1.5 text-white text-[11px] outline-none focus:border-indigo-400 w-28"
                                        >
                                            {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                        </select>
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="Valor..."
                                            value={bulkApply.value}
                                            onChange={e => setBulkApply(prev => ({ ...prev, value: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && applyBulkLeadTime()}
                                            className="flex-1 bg-black/40 border border-indigo-500/30 rounded-lg px-3 py-1.5 text-white text-xs font-mono outline-none focus:border-indigo-400 placeholder-gray-600"
                                        />
                                        <button
                                            onClick={applyBulkLeadTime}
                                            disabled={!bulkApply.value}
                                            className="px-4 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/40 text-indigo-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                                        >
                                            Aplicar a Selecionados
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setSelectedRows(new Set())}
                                        className="text-gray-600 hover:text-gray-400 text-xs transition-all"
                                    >
                                        Limpar
                                    </button>
                                </div>
                            )}

                            {/* ─── COLLECTIONS TABLE ──── */}
                            {activeLibraryTab === 'collections' && (
                                <div className="overflow-x-auto">
                                    {(isLoadingStored) ? (
                                        <div className={`flex items-center gap-2 text-${selectedBrand?.color || 'indigo'}-500 py-6`}>
                                            <FiLoader className="animate-spin" /> A carregar coleções...
                                        </div>
                                    ) : (
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="border-b border-white/10">
                                                    <th className="py-2 pr-3 w-8">
                                                        {/* Select All */}
                                                        <div
                                                            onClick={() => selectAllVisible(storedCollections, c => c.name)}
                                                            className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all ${storedCollections.filter(c => !c._isNew).length > 0 &&
                                                                storedCollections.filter(c => !c._isNew).every(c => selectedRows.has(c.name))
                                                                ? `bg-${selectedBrand?.color || 'indigo'}-500 border-${selectedBrand?.color || 'indigo'}-500`
                                                                : `border-gray-600 hover:border-${selectedBrand?.color || 'indigo'}-400`
                                                                }`}
                                                        >
                                                            {storedCollections.filter(c => !c._isNew).every(c => selectedRows.has(c.name)) &&
                                                                <FiCheck size={10} className="text-white" />}
                                                        </div>
                                                    </th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4 w-6">✓</th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4">Nome da Coleção</th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4 w-28">Unidade</th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4 w-20">Prazo</th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2">Descrição Técnica</th>
                                                    <th className="w-8"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {storedCollections.map((col, idx) => {
                                                    const isVisible = col.is_visible !== false && col.is_visible !== 0;
                                                    const unit = col.lead_time_unit || 'weeks';
                                                    return (
                                                        <tr key={col.name || `new-${idx}`} className={`border-b border-white/5 group transition-all ${selectedRows.has(col.name) ? 'bg-indigo-500/8' : 'hover:bg-white/3'
                                                            }`}>
                                                            {/* Row checkbox */}
                                                            <td className="py-2 pr-3">
                                                                {!col._isNew && (
                                                                    <div
                                                                        onClick={() => toggleRowSelection(col.name)}
                                                                        className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all ${selectedRows.has(col.name)
                                                                            ? 'bg-indigo-500 border-indigo-500'
                                                                            : 'border-gray-600 hover:border-indigo-400'
                                                                            }`}
                                                                    >
                                                                        {selectedRows.has(col.name) && <FiCheck size={10} className="text-white" />}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            {/* Visible toggle */}
                                                            <td className="py-2 pr-4">
                                                                <div
                                                                    onClick={() => !col._isNew && toggleCollection(col.name, isVisible)}
                                                                    className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-all shrink-0 ${isVisible ? `bg-${selectedBrand?.color || 'indigo'}-500 border-${selectedBrand?.color || 'indigo'}-500` : 'border-gray-600 hover:border-white'}`}
                                                                >
                                                                    {isVisible && <FiCheck size={12} className="text-black" />}
                                                                </div>
                                                            </td>
                                                            {/* Name */}
                                                            <td className="py-2 pr-4 font-bold">
                                                                <input
                                                                    type="text"
                                                                    defaultValue={col.name}
                                                                    placeholder="Nome..."
                                                                    readOnly={!col._isNew}
                                                                    onBlur={e => {
                                                                        if (col._isNew) {
                                                                            setStoredCollections(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c));
                                                                        }
                                                                    }}
                                                                    className={`bg-transparent border-b outline-none py-1 w-full text-white text-xs font-bold placeholder-gray-700 transition-all ${col._isNew ? 'border-amber-500/50 focus:border-amber-400' : 'border-transparent cursor-default'}`}
                                                                />
                                                            </td>
                                                            {/* Unit */}
                                                            <td className="py-2 pr-4">
                                                                <select
                                                                    value={unit}
                                                                    onChange={e => {
                                                                        const newUnit = e.target.value;
                                                                        setStoredCollections(prev => prev.map((c, i) => i === idx ? { ...c, lead_time_unit: newUnit } : c));
                                                                        if (!col._isNew && col.name) saveCollection(col.name, { leadTimeUnit: newUnit });
                                                                    }}
                                                                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-[11px] outline-none focus:border-amber-500/50 w-full"
                                                                >
                                                                    {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                                                </select>
                                                            </td>
                                                            {/* Value */}
                                                            <td className="py-2 pr-4">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={toDisplayValue(col.lead_time_weeks, unit)}
                                                                    placeholder="—"
                                                                    onChange={e => {
                                                                        const weeks = toWeeks(e.target.value, unit);
                                                                        setStoredCollections(prev => prev.map((c, i) => i === idx ? { ...c, lead_time_weeks: weeks } : c));
                                                                    }}
                                                                    onBlur={e => {
                                                                        const weeks = toWeeks(e.target.value, unit);
                                                                        if (!col._isNew && col.name) saveCollection(col.name, { leadTimeWeeks: weeks, leadTimeUnit: unit });
                                                                    }}
                                                                    className="bg-black/40 border border-white/10 rounded-lg py-1 px-2 text-center text-[11px] font-mono text-white outline-none focus:border-amber-500/50 w-full"
                                                                />
                                                            </td>
                                                            {/* Description */}
                                                            <td className="py-2">
                                                                <input
                                                                    type="text"
                                                                    defaultValue={col.description || ''}
                                                                    placeholder="Descrição técnica da coleção..."
                                                                    onBlur={e => {
                                                                        if (col._isNew) {
                                                                            setStoredCollections(prev => prev.map((c, i) => i === idx ? { ...c, description: e.target.value } : c));
                                                                        } else {
                                                                            saveCollection(col.name, { description: e.target.value });
                                                                        }
                                                                    }}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter' && col._isNew) saveNewCollection({ ...storedCollections[idx], description: e.target.value });
                                                                    }}
                                                                    className="bg-transparent border-b border-white/10 outline-none py-1 w-full text-gray-300 text-[11px] placeholder-gray-700 focus:border-amber-500/50 transition-all"
                                                                />
                                                            </td>
                                                            {/* Actions */}
                                                            <td className="py-2 pl-2">
                                                                {col._isNew ? (
                                                                    <button
                                                                        onClick={() => saveNewCollection(storedCollections[idx])}
                                                                        className="p-1 rounded text-green-400 hover:bg-green-500/20 transition-all"
                                                                        title="Guardar"
                                                                    >
                                                                        <FiCheck size={14} />
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => deleteCollection(col.name)}
                                                                        className="p-1 rounded text-gray-700 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                                                                        title="Eliminar"
                                                                    >
                                                                        <FiX size={14} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {storedCollections.length === 0 && (
                                                    <tr><td colSpan={6} className="py-8 text-center text-gray-600 italic">Nenhuma coleção. Clique em "Nova Linha" ou importe um ficheiro.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {/* ─── FINISHES TABLE ──── */}
                            {activeLibraryTab === 'finishes' && (
                                <div className="overflow-x-auto">
                                    {(isLoadingFinishes) ? (
                                        <div className="flex items-center gap-2 text-blue-500 py-6">
                                            <FiLoader className="animate-spin" /> A carregar acabamentos...
                                        </div>
                                    ) : (
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="border-b border-white/10">
                                                    <th className="py-2 pr-3 w-8">
                                                        <div
                                                            onClick={() => selectAllVisible(brandFinishes, f => f.id)}
                                                            className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all ${brandFinishes.filter(f => !f._isNew).length > 0 &&
                                                                brandFinishes.filter(f => !f._isNew).every(f => selectedRows.has(f.id))
                                                                ? `bg-${selectedBrand?.color || 'indigo'}-500 border-${selectedBrand?.color || 'indigo'}-500`
                                                                : `border-gray-600 hover:border-${selectedBrand?.color || 'indigo'}-400`
                                                                }`}
                                                        >
                                                            {brandFinishes.filter(f => !f._isNew).every(f => selectedRows.has(f.id)) &&
                                                                <FiCheck size={10} className="text-white" />}
                                                        </div>
                                                    </th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4 w-20">Código</th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4 w-20">Grupo</th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4">Nome</th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4 w-28">Unidade</th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4 w-20">Prazo</th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2">Descrição Técnica</th>
                                                    <th className="w-8"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {brandFinishes.map((f, idx) => {
                                                    const unit = f.lead_time_unit || 'weeks';
                                                    const rowKey = f.id || `new-${idx}`;
                                                    return (
                                                        <tr key={rowKey} className={`border-b border-white/5 group transition-all ${selectedRows.has(rowKey) ? 'bg-indigo-500/10' : 'hover:bg-white/3'
                                                            }`}>
                                                            {/* Row checkbox */}
                                                            <td className="py-2 pr-3">
                                                                {!f._isNew && (
                                                                    <div
                                                                        onClick={() => toggleRowSelection(rowKey)}
                                                                        className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all ${selectedRows.has(rowKey)
                                                                            ? `bg-${selectedBrand?.color || 'indigo'}-500 border-${selectedBrand?.color || 'indigo'}-500`
                                                                            : `border-gray-600 hover:border-${selectedBrand?.color || 'indigo'}-400`
                                                                            }`}
                                                                    >
                                                                        {selectedRows.has(rowKey) && <FiCheck size={10} className="text-white" />}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            {/* Code */}
                                                            <td className="py-2 pr-4">
                                                                <input
                                                                    type="text"
                                                                    defaultValue={f.finish_code}
                                                                    placeholder="COD..."
                                                                    onBlur={e => {
                                                                        const newVal = e.target.value;
                                                                        if (f._isNew) {
                                                                            setBrandFinishes(prev => prev.map((r, i) => i === idx ? { ...r, finish_code: newVal } : r));
                                                                        } else if (f.id) {
                                                                            setBrandFinishes(prev => prev.map((r, i) => i === idx ? { ...r, finish_code: newVal } : r));
                                                                            saveFinish(f.id, { finishCode: newVal });
                                                                        }
                                                                    }}
                                                                    className={`bg-transparent border-b outline-none py-1 w-full font-black text-blue-400 text-[11px] uppercase tracking-tight placeholder-gray-700 ${f._isNew ? 'border-blue-500/50' : 'border-transparent focus:border-blue-500/50'}`}
                                                                />
                                                            </td>
                                                            {/* Group */}
                                                            <td className="py-2 pr-4">
                                                                <input
                                                                    type="text"
                                                                    defaultValue={f.group_code || ''}
                                                                    placeholder="GRP"
                                                                    onBlur={e => {
                                                                        const newVal = e.target.value;
                                                                        setBrandFinishes(prev => prev.map((r, i) => i === idx ? { ...r, group_code: newVal } : r));
                                                                        if (!f._isNew && f.id) {
                                                                            saveFinish(f.id, { groupCode: newVal });
                                                                        }
                                                                    }}
                                                                    className="bg-transparent border-b border-white/10 outline-none py-1 w-full text-gray-400 text-[11px] placeholder-gray-700 focus:border-blue-500/50 transition-all"
                                                                />
                                                            </td>
                                                            {/* Name */}
                                                            <td className="py-2 pr-4">
                                                                <input
                                                                    type="text"
                                                                    defaultValue={f.name_en || f.name_it || ''}
                                                                    placeholder="Nome do acabamento..."
                                                                    onBlur={e => {
                                                                        const val = e.target.value;
                                                                        setBrandFinishes(prev => prev.map((r, i) => i === idx ? { ...r, name_en: val } : r));
                                                                        if (!f._isNew && f.id) {
                                                                            saveFinish(f.id, { name: val });
                                                                        }
                                                                    }}
                                                                    className="bg-transparent border-b border-white/10 outline-none py-1 w-full text-white font-bold text-[11px] placeholder-gray-700 focus:border-blue-500/50 transition-all"
                                                                />
                                                            </td>
                                                            {/* Unit */}
                                                            <td className="py-2 pr-4">
                                                                <select
                                                                    value={unit}
                                                                    onBlur={e => {
                                                                        const newUnit = e.target.value;
                                                                        setBrandFinishes(prev => prev.map((r, i) => i === idx ? { ...r, lead_time_unit: newUnit } : r));
                                                                        if (!f._isNew && f.id) saveFinish(f.id, { leadTimeUnit: newUnit });
                                                                    }}
                                                                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-[11px] outline-none focus:border-blue-500/50 w-full"
                                                                >
                                                                    {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                                                </select>
                                                            </td>
                                                            {/* Value */}
                                                            <td className="py-2 pr-4">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={toDisplayValue(f.lead_time_weeks, unit)}
                                                                    placeholder="—"
                                                                    onChange={e => {
                                                                        const weeks = toWeeks(e.target.value, unit);
                                                                        setBrandFinishes(prev => prev.map((r, i) => i === idx ? { ...r, lead_time_weeks: weeks } : r));
                                                                    }}
                                                                    onBlur={e => {
                                                                        const weeks = toWeeks(e.target.value, unit);
                                                                        if (!f._isNew && f.id) saveFinish(f.id, { leadTimeWeeks: weeks, leadTimeUnit: unit });
                                                                    }}
                                                                    className="bg-black/40 border border-white/10 rounded-lg py-1 px-2 text-center text-[11px] font-mono text-white outline-none focus:border-blue-500/50 w-full"
                                                                />
                                                            </td>
                                                            {/* Description */}
                                                            <td className="py-2">
                                                                <input
                                                                    type="text"
                                                                    defaultValue={f.description_pt || ''}
                                                                    placeholder="Descrição técnica..."
                                                                    onBlur={e => {
                                                                        const val = e.target.value;
                                                                        setBrandFinishes(prev => prev.map((r, i) => i === idx ? { ...r, description_pt: val } : r));
                                                                        if (!f._isNew && f.id) {
                                                                            saveFinish(f.id, { description: val });
                                                                        }
                                                                    }}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter' && f._isNew) saveNewFinish({ ...brandFinishes[idx], description_pt: e.target.value });
                                                                    }}
                                                                    className="bg-transparent border-b border-white/10 outline-none py-1 w-full text-gray-300 text-[11px] placeholder-gray-700 focus:border-blue-500/50 transition-all"
                                                                />
                                                            </td>
                                                            {/* Actions */}
                                                            <td className="py-2 pl-2">
                                                                {f._isNew ? (
                                                                    <button
                                                                        onClick={() => saveNewFinish(brandFinishes[idx])}
                                                                        className="p-1 rounded text-green-400 hover:bg-green-500/20 transition-all"
                                                                        title="Guardar"
                                                                    >
                                                                        <FiCheck size={14} />
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => deleteFinish(f.id)}
                                                                        className="p-1.5 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
                                                                        title="Eliminar"
                                                                    >
                                                                        <FiTrash2 size={13} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {brandFinishes.length === 0 && (
                                                    <tr><td colSpan={8} className="py-8 text-center text-gray-600 italic">Nenhum acabamento encontrado. Clique em "Nova Linha" ou importe um ficheiro.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {/* ─── ALIASES (MEMÓRIA) TABLE ──── */}
                            {activeLibraryTab === 'aliases' && (
                                <div className="overflow-x-auto">
                                    {(isLoadingAliases) ? (
                                        <div className="flex items-center gap-2 text-green-500 py-6">
                                            <FiLoader className="animate-spin" /> A carregar memória...
                                        </div>
                                    ) : (
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="border-b border-white/10">
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4 pl-3">Original (Extraído)</th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4">Corrigido Para</th>
                                                    <th className="text-left text-[10px] uppercase font-black text-gray-600 tracking-widest py-2 pr-4 w-32">Data Aprendizagem</th>
                                                    <th className="w-12"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {brandAliases.map((a, idx) => (
                                                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-all group">
                                                        <td className="py-3 pr-4 pl-3 font-mono text-gray-400 line-through decoration-red-500/50">{a.original_sku}</td>
                                                        <td className="py-3 pr-4 font-mono font-bold text-green-400">{a.corrected_sku}</td>
                                                        <td className="py-3 pr-4 text-[10px] text-gray-500">{new Date(a.created_at).toLocaleString()}</td>
                                                        <td className="py-3 pl-2 text-right">
                                                            <button
                                                                onClick={() => deleteAlias(a.original_sku)}
                                                                className="p-1.5 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                                                title="Esquecer regra"
                                                            >
                                                                <FiTrash2 size={13} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {brandAliases.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="py-12 text-center text-gray-500">
                                                            Nenhuma correção de código memorizada para a marca {selectedBrand.name}.
                                                            <br /><span className="text-[10px] opacity-70">O sistema aprende automaticamente os códigos SKUs que você corrige quando revê uma fatura/proforma ou edita linhas no estúdio.</span>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    )}
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

            {/* Calendar Manager Overlay */}
            {calendarBrand && (
                <CalendarManager
                    brand={calendarBrand}
                    onClose={() => setCalendarBrand(null)}
                />
            )}
        </div>
    );
};

export default CatalogManagementTab;
