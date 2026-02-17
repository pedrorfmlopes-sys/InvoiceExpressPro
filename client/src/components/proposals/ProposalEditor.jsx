import React, { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import api from '../../api/apiClient';
import { qp } from '../../shared/ui';
import { PDFDownloadLink } from '@react-pdf/renderer';
import ProposalPdf from './ProposalPdf';
import { NICOLAZZI_FINISH_GROUPS, shouldShowCollection } from '../../constants/catalog';
import CatalogSearchModal from '../catalog/CatalogSearchModal';
import { FiDatabase, FiUploadCloud, FiSearch, FiCheckCircle, FiClock, FiAlertTriangle, FiLoader, FiTrash2, FiMaximize2, FiPlus } from 'react-icons/fi';

const PRESET_CATEGORIES = {
    WARRANTY: 'warranty',
    OBSERVATIONS: 'observations',
    PAYMENT: 'payment'
};

const ProposalEditor = ({ proposalId, onClose }) => {
    const [proposal, setProposal] = useState(null);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [searching, setSearching] = useState(false);
    const [activeSearchField, setActiveSearchField] = useState(null);
    const [presets, setPresets] = useState([]);
    const [showEntityModal, setShowEntityModal] = useState(false);
    const [showCatalogModal, setShowCatalogModal] = useState(false);
    const [showCreateItemModal, setShowCreateItemModal] = useState(false);
    const [createItemSku, setCreateItemSku] = useState('');
    const [resolutionIndex, setResolutionIndex] = useState(null);
    const [visibleCollections, setVisibleCollections] = useState(null); // Null means not loaded yet (show all)
    const [collectionsLoaded, setCollectionsLoaded] = useState(false);

    useEffect(() => { loadData(); }, [proposalId]);

    const shouldShowCollectionDynamic = (name) => {
        if (!name) return false;
        if (visibleCollections === null) return true; // Show all if not loaded
        return visibleCollections.has(String(name).trim().toLowerCase());
    };
    const handleExport = async (format) => {
        if (format !== 'excel') return;
        try {
            setSaving(true);
            const res = await api.get(`/api/proposals/${proposalId}/${format}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `proposta_${proposalId}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (e) {
            alert("Erro ao exportar: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const loadData = async () => {
        try {
            setLoading(true);
            const [pRes, projRes, presetRes] = await Promise.all([
                api.get(`/api/proposals/${proposalId}`),
                api.get('/api/projects'),
                api.get(`/api/proposals/presets/list`)
            ]);
            setProposal(pRes.data);
            setProjects(projRes.data.projects || []);
            setPresets(presetRes.data || []);
        } catch (e) {
            alert("Erro ao carregar dados: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    // Load collections visibility settings
    useEffect(() => {
        if (proposal?.brand_id && !collectionsLoaded) {
            loadCollections(proposal.brand_id);
        }
    }, [proposal?.brand_id]);

    const loadCollections = async (brandId) => {
        try {
            const res = await api.get(`/api/catalog/collections?brand=${brandId}`);
            const collections = res.data || [];
            // Create Set of visible collection names (lowercase for comparison)
            // SQLite returns 1/0 for booleans.
            const visibleSet = new Set(
                collections
                    .filter(c => c.is_visible !== false && c.is_visible !== 0)
                    .map(c => String(c.name).trim().toLowerCase())
            );

            // If we have stored collections, we use the strict set.
            // If we have NO stored collections (empty array), it might mean 
            // the user hasn't imported anything yet, or hasn't configured visibility.
            // In that case, should we show everything? 
            // The logic "visibleCollections === null" handles "not loaded".
            // If loaded but empty, it means NOTHING is visible? Or everything?
            // Usually if the DB returns empty, it means no config. 
            // But here the DB returns the list of KNOWN collections.
            // If the DB returns [], then there are no collections known, so nothing is visible?
            // Actually, if the list is empty, `visibleCollections` becomes a empty Set.
            // Then `has` returns false for everything.
            // But if the DB is empty (invalid brand?), then we probably want to show everything (default behavior).
            // Let's stick to: if we successfully fetched, we use the result.

            setVisibleCollections(visibleSet);
            setCollectionsLoaded(true);
        } catch (err) {
            console.error("Failed to load collections", err);
            // On error, leave as null to show all
        }
    };

    const handleSavePreset = async (category, content) => {
        if (!content?.trim()) return;
        const name = prompt("Nome para esta predefinição:");
        if (!name) return;

        try {
            setSaving(true);
            const res = await api.post('/api/proposals/presets', {
                category,
                content,
                name,
                is_global: false
            });
            setPresets(prev => [res.data, ...prev]);
            alert("Predefinição guardada com sucesso!");
        } catch (e) {
            alert("Erro ao guardar predefinição: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.put(`/api/proposals/${proposalId}`, proposal);
            alert("Proposta guardada com sucesso!");
        } catch (e) {
            alert("Erro ao guardar: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const updateHeader = (field, val) => {
        setProposal(prev => ({ ...prev, [field]: val }));
    };

    const updateStatus = async (newStatus) => {
        try {
            setSaving(true);
            const res = await api.patch(`/api/proposals/${proposalId}`, { status: newStatus });
            setProposal(res.data);
            // If accepted, we might want to refresh project data or show a message
            if (newStatus === 'accepted') {
                alert("Proposta ACEITE! Outras propostas deste projeto foram encerradas automaticamente.");
            }
        } catch (e) {
            alert("Erro ao atualizar estado: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const updateMetadata = (field, value) => {
        setProposal({
            ...proposal,
            metadata: { ...proposal.metadata, [field]: value }
        });
    };

    const updateLine = (index, field, value) => {
        const newLines = [...proposal.lines];
        newLines[index] = { ...newLines[index], [field]: value };
        setProposal({ ...proposal, lines: newLines });
    };

    const addLine = () => {
        const newLine = {
            id: 'new-' + Math.random().toString(36).substr(2, 9),
            sku: '',
            description: '',
            quantity: 1,
            unit_price_commercial: 0,
            discount_commercial_percent: 0,
            vat_rate: '23',
            extra_attributes: {}
        };
        setProposal({ ...proposal, lines: [...proposal.lines, newLine] });
    };

    const removeLine = (index) => {
        if (!confirm("Remover esta linha?")) return;
        const newLines = [...proposal.lines];
        newLines.splice(index, 1);
        setProposal({ ...proposal, lines: newLines });
    };

    const moveLine = (index, direction) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= proposal.lines.length) return;
        const newLines = [...proposal.lines];
        const temp = newLines[index];
        newLines[index] = newLines[newIndex];
        newLines[newIndex] = temp;
        setProposal({ ...proposal, lines: newLines });
    };

    // Helper to format original description (Sentence case)
    const formatOriginalDescription = (text) => {
        if (!text) return '';
        // Lowercase everything, then capitalize first letter
        const lower = text.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    };

    const handleEnrich = async () => {
        try {
            setSaving(true);
            const newLines = [...proposal.lines];
            let enrichedCount = 0;

            for (let i = 0; i < newLines.length; i++) {
                const line = newLines[i];
                if (!line.sku) continue;

                try {
                    const res = await api.post('/api/catalog/resolve', {
                        brand: proposal.brand_id,
                        sku: line.sku
                    });

                    if (res.data && res.data.success) {
                        const item = res.data.item;
                        const finish = res.data.finish;

                        // Unified Description: PT Description + Finish technical note if exists
                        let desc = item.description_pt || item.description_it || line.description;

                        // Original description for PDF (Sentence case)
                        // Prefer IT description as "original", or fallback to current line description
                        const rawOriginal = item.description_it || item.description_en || line.description;
                        const originalFormatted = formatOriginalDescription(rawOriginal);

                        // If we have a finish note, we might want to store it in extra_attributes 
                        // to keep the main description clean but use it in the PDF later.
                        const extra = {
                            ...line.extra_attributes,
                            catalog_match: true,
                            finish_code: res.data.finishCode,
                            finish_note: finish?.note_pt,
                            original_it: item.description_it, // Keep raw for debugging
                            original_description: originalFormatted, // Formatted for PDF
                            collection: res.data.series || item.series // Series/Collection
                        };

                        newLines[i] = {
                            ...line,
                            description: desc,
                            // SMART PRICE LOGIC:
                            unit_price_commercial: line.unit_price_commercial,
                            extra_attributes: {
                                ...extra,
                                catalog_sku: item.sku,
                                catalog_price: item.price,
                                price_match: (Math.abs((item.price || 0) - (line.unit_price_commercial || 0)) < 0.01)
                            },
                            enrichment_status: res.data.fuzzy ? 'fuzzy' : 'match'
                        };
                        enrichedCount++;
                    } else {
                        newLines[i] = {
                            ...line,
                            enrichment_status: 'miss'
                        };
                    }
                } catch (err) {
                    console.error(`Failed to enrich SKU ${line.sku}:`, err);
                }
            }

            setProposal({ ...proposal, lines: newLines });
            if (enrichedCount > 0) {
                alert(`${enrichedCount} artigos enriquecidos com sucesso!`);
            } else {
                alert("Nenhuma correspondência exata encontrada na biblioteca.");
            }
        } catch (e) {
            alert("Erro ao enriquecer: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const selectCatalogItem = (index, item) => {
        const newLines = [...proposal.lines];
        const line = newLines[index];

        // Format original description (Sentence case)
        const rawOriginal = item.description_it || item.description_en || '';
        const originalFormatted = rawOriginal ? (rawOriginal.charAt(0).toUpperCase() + rawOriginal.slice(1).toLowerCase()) : '';

        // Price Safety: Do not overwrite current price, but set mismatch if needed
        const currentPrice = parseFloat(line.unit_price_commercial || 0);
        const catalogPrice = parseFloat(item.price || 0);
        const priceDiff = Math.abs(currentPrice - catalogPrice);
        const isMatch = priceDiff < 0.01;

        // Update with catalog data
        newLines[index] = {
            ...line,
            // SKU REMAIN UNCHANGED BY USER REQUEST
            description: item.description_pt || item.description_it || line.description,
            unit_price_commercial: line.unit_price_commercial,
            extra_attributes: {
                ...line.extra_attributes,
                catalog_match: true,
                catalog_sku: item.sku,
                finish_code: item.finish_code || line.extra_attributes.finish_code,
                finish_group: item.finish_group,
                finish_note: item.finish_note || line.extra_attributes.finish_note,
                manual_resolution: true,
                collection: item.series,
                series: item.series,
                original_description: originalFormatted,
                catalog_price: item.price,
                price_match: isMatch
            },
            enrichment_status: 'match'
        };

        setProposal({ ...proposal, lines: newLines });
        setShowCatalogModal(false);
        setResolutionIndex(null);
    };

    const confirmFuzzyMatch = (index) => {
        const newLines = [...proposal.lines];
        newLines[index] = {
            ...newLines[index],
            enrichment_status: 'match'
        };
        setProposal({ ...proposal, lines: newLines });
    };

    const searchCRM = async (q) => {
        if (!q || q.length < 1) {
            setSearchResults([]);
            setShowResults(false);
            return;
        }
        try {
            setSearching(true);
            setShowResults(true);
            const projectParam = proposal?.project_ref || 'default';
            const res = await api.get('/api/crm/search', {
                params: {
                    project: projectParam,
                    q: q
                }
            });
            setSearchResults(res.data);
        } catch (e) {
            console.error("CRM Search Error:", e);
        } finally {
            setSearching(false);
        }
    };

    const selectCustomer = (c) => {
        const isShippingSame = proposal.metadata?.shipping_is_billing;
        setProposal({
            ...proposal,
            client_ref: c.name,
            metadata: {
                ...proposal.metadata,
                client_vat: c.vat,
                billing_address: c.address, // Fix: Update billing address
                shipping_address: isShippingSame ? c.address : proposal.metadata?.shipping_address, // Sync if needed
                client_email: c.email,
                client_phone: c.phone
            }
        });
        setShowResults(false);
    };

    const saveToCrm = async () => {
        try {
            setSaving(true);
            const data = {
                name: proposal.client_ref,
                vat: proposal.metadata?.client_vat,
                address: proposal.metadata?.delivery_address,
                email: proposal.metadata?.client_email,
                phone: proposal.metadata?.client_phone
            };
            await api.post('/api/crm/upsert', data);
            alert("Dados do cliente atualizados no CRM com sucesso!");
        } catch (e) {
            alert("Erro ao atualizar CRM: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const calculateTotals = () => {
        if (!proposal?.lines) return { net: 0, vat: 0, gross: 0 };

        const linesTotal = proposal.lines.reduce((acc, l) => {
            const qty = parseFloat(l.quantity || 0);
            const price = parseFloat(l.unit_price_commercial || 0);
            const desc = parseFloat(l.discount_commercial_percent || 0);
            const lineNet = qty * price * (1 - desc / 100);
            const vat = lineNet * (parseFloat(l.vat_rate || 23) / 100);

            acc.net += lineNet;
            acc.vat += vat;
            return acc;
        }, { net: 0, vat: 0 });

        // Global Values from Metadata
        const shipping = parseFloat(proposal.metadata?.shipping_cost || 0);
        const globalDiscPercent = parseFloat(proposal.metadata?.global_discount || 0);

        // Calculate Discount Value
        // (Net + Shipping) * (Percent / 100)
        const discountValue = (linesTotal.net + shipping) * (globalDiscPercent / 100);

        const taxBase = linesTotal.net + shipping - discountValue;
        const totalVat = taxBase * 0.23; // Force 23% for preview
        const gross = taxBase + totalVat;

        return {
            net: linesTotal.net,
            shipping,
            globalDiscPercent, // Used for display
            discountValue,     // Calculated amount
            taxBase,
            vat: totalVat,
            gross
        };
    };

    if (loading) return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center text-white z-[10000]">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="font-bold tracking-widest animate-pulse">A CARREGAR EDITOR...</span>
            </div>
        </div>
    );

    if (!proposal) return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[10000]">
            <GlassCard className="p-8 border-red-500/30 bg-red-500/10 text-center">
                <h2 className="text-xl font-bold text-red-500 mb-2">Erro ao carregar proposta</h2>
                <p className="text-gray-400 mb-6">Não foi possível obter os dados. Por favor tente novamente.</p>
                <button
                    onClick={onClose}
                    className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded text-white transition-colors"
                >
                    Fechar
                </button>
            </GlassCard>
        </div>
    );

    const totals = calculateTotals();

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[10000] font-sans">
            <div className="w-full h-full flex flex-col overflow-hidden bg-[var(--bg-base)]">

                {/* Header */}
                <div className="h-20 bg-white/5 border-b border-white/10 flex items-center justify-between px-8 shrink-0">
                    <div className="flex items-center gap-6 flex-1">
                        <div className="w-12 h-12 bg-amber-500 rounded flex items-center justify-center text-black font-black text-xl shadow-lg shadow-amber-500/20">PS</div>
                        <div className="flex flex-col gap-1 flex-1 max-w-2xl">
                            <input
                                className="bg-transparent text-xl font-black text-white outline-none focus:text-amber-500 transition-colors w-full"
                                value={proposal.name}
                                onChange={e => updateHeader('name', e.target.value)}
                                placeholder="Nome da Proposta"
                            />
                            <div className="flex gap-4 items-center">
                                <span className="text-[9px] text-amber-500 font-black uppercase tracking-widest">{proposal.brand_id}</span>
                                <div className="h-3 w-px bg-white/10"></div>
                                <div className="flex gap-2 items-center">
                                    <span className="text-[9px] text-gray-500 uppercase tracking-widest">Estado:</span>
                                    <select
                                        className={`bg-transparent text-[10px] font-bold uppercase tracking-tight outline-none border-b border-transparent focus:border-white/20 px-1 rounded
                                            ${proposal.status === 'draft' ? 'text-gray-400' : ''}
                                            ${proposal.status === 'sent' ? 'text-blue-400' : ''}
                                            ${proposal.status === 'accepted' ? 'text-green-500' : ''}
                                            ${proposal.status === 'rejected' ? 'text-red-500' : ''}
                                            ${proposal.status === 'closed_other' ? 'text-orange-400' : ''}
                                        `}
                                        value={proposal.status}
                                        onChange={e => updateStatus(e.target.value)}
                                    >
                                        <option value="draft" className="bg-gray-900 text-gray-400">Rascunho</option>
                                        <option value="sent" className="bg-gray-900 text-blue-400">Enviada</option>
                                        <option value="accepted" className="bg-gray-900 text-green-500">Aceite (Win)</option>
                                        <option value="rejected" className="bg-gray-900 text-red-500">Perdida (Loss)</option>
                                        <option value="closed_other" className="bg-gray-900 text-orange-400">Encerrada (Outro Canal)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end mr-4">
                            <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Data Proposta</div>
                            <input
                                type="date"
                                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-amber-500"
                                value={proposal.metadata?.doc_date ? new Date(proposal.metadata.doc_date).toISOString().split('T')[0] : ''}
                                onChange={e => updateMetadata('doc_date', e.target.value)}
                            />
                        </div>
                        <div className="w-px h-10 bg-white/10 mx-2"></div>

                        <div className="flex items-center gap-2 bg-white/5 py-1 px-3 rounded-full hover:bg-white/10 transition-colors mr-2">
                            <input
                                type="checkbox"
                                checked={!!proposal.metadata?.show_technical_details}
                                onChange={e => updateMetadata('show_technical_details', e.target.checked)}
                                className="accent-amber-500 cursor-pointer w-3 h-3"
                            />
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Detalhes Técnicos</span>
                        </div>

                        {proposal && (
                            <PDFDownloadLink
                                document={<ProposalPdf proposal={proposal} visibleCollections={visibleCollections} />}
                                fileName={`proposta_${proposal.name?.replace(/[^a-z0-9]/gi, '_') || proposalId}.pdf`}
                                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all text-xs font-bold border border-white/10 flex items-center gap-2"
                            >
                                {({ blob, url, loading, error }) =>
                                    loading ? '⏳ A processar PDF...' : '📄 Baixar PDF'
                                }
                            </PDFDownloadLink>
                        )}
                        <button
                            onClick={() => handleExport('excel')}
                            disabled={saving}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all text-xs font-bold border border-white/10 disabled:opacity-50"
                        >
                            📊 Excel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg transition-all text-xs font-black uppercase tracking-tight shadow-lg shadow-amber-500/20 disabled:opacity-50"
                        >
                            {saving ? 'A Guardar...' : 'Guardar'}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center hover:bg-red-500/20 text-white rounded-full transition-all text-xl"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Sub-Header: Focused on Project & Entity Trigger */}
                <div className="bg-white/[0.02] border-b border-white/10 p-6 flex gap-6 shrink-0 items-center">
                    <div className="flex-[2] flex flex-col gap-1">
                        <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Cliente / Entidade</label>
                        <div className="flex items-center gap-3">
                            <span className="text-xl font-black text-amber-500 leading-none">{proposal.client_ref || 'Consumidor Final'}</span>
                            <button
                                onClick={() => setShowEntityModal(true)}
                                className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded border border-amber-500/20 transition-all text-[10px] font-bold uppercase flex items-center gap-2"
                            >
                                📍 Dados e Entrega
                            </button>
                        </div>
                        {proposal.metadata?.client_vat && (
                            <div className="flex gap-3 text-[10px] text-gray-500 mt-1">
                                <span>NIF: <span className="text-gray-300 font-mono">{proposal.metadata.client_vat}</span></span>
                                <span>•</span>
                                <span className="truncate max-w-sm">{proposal.metadata.billing_address}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 max-w-[300px]">
                        <label className="text-[9px] text-gray-500 uppercase tracking-widest block mb-1 font-bold">Projeto (Cliente)</label>
                        <input
                            className="w-full bg-amber-500/5 px-3 py-2 rounded text-xs text-amber-200 outline-none border border-amber-500/20 focus:border-amber-500/50"
                            placeholder="Ex: Nome do Projeto / Ref. Cliente"
                            value={proposal.metadata?.client_project_name || ''}
                            onChange={e => updateMetadata('client_project_name', e.target.value)}
                        />
                    </div>

                    <div className="flex-1 max-w-[200px]">
                        <label className="text-[9px] text-gray-500 uppercase tracking-widest block mb-1 font-bold">Nossa Ref / Orç.</label>
                        <input
                            className="w-full bg-white/5 px-3 py-2 rounded font-mono text-xs text-amber-500/80 outline-none border border-white/5 focus:border-amber-500/50"
                            value={proposal.metadata?.our_ref || ''}
                            onChange={e => updateMetadata('our_ref', e.target.value)}
                        />
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-2 flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[8px] text-amber-500/50 uppercase font-bold">Linhas</span>
                            <span className="text-sm text-white font-bold">{proposal.lines?.length || 0}</span>
                        </div>
                        <div className="w-px h-6 bg-amber-500/10"></div>
                        <div className="flex flex-col">
                            <span className="text-[8px] text-amber-500/50 uppercase font-bold">Total Bruto</span>
                            <span className="text-sm text-white font-bold">{calculateTotals().gross.toFixed(2)} €</span>
                        </div>
                    </div>
                </div>

                {/* Entity & Delivery Modal */}
                {showEntityModal && (
                    <EntityDataModal
                        proposal={proposal}
                        onClose={() => setShowEntityModal(false)}
                        updateHeader={updateHeader}
                        updateMetadata={updateMetadata}
                        searchCRM={searchCRM}
                        searchResults={searchResults}
                        searching={searching}
                        selectCustomer={selectCustomer}
                        saveToCrm={saveToCrm}
                        activeSearchField={activeSearchField}
                        setActiveSearchField={setActiveSearchField}
                        showResults={showResults}
                        setShowResults={setShowResults}
                    />
                )}

                {showCatalogModal && (
                    <CatalogSearchModal
                        brand={proposal.brand_id}
                        initialSku={proposal.lines[resolutionIndex]?.sku}
                        onClose={() => { setShowCatalogModal(false); setResolutionIndex(null); }}
                        onSelect={(item) => selectCatalogItem(resolutionIndex, item)}
                        onCreateNew={(sku) => {
                            setCreateItemSku(sku);
                            setShowCreateItemModal(true);
                        }}
                    />
                )}

                {showCreateItemModal && (
                    <CreateCatalogItemModal
                        isOpen={showCreateItemModal}
                        onClose={() => setShowCreateItemModal(false)}
                        initialSku={createItemSku}
                        initialDescription={proposal.lines[resolutionIndex]?.description}
                        onCreated={(newSku) => {
                            alert(`Artigo ${newSku} criado com sucesso! Pode selecioná-lo agora.`);
                            setShowCreateItemModal(false);
                        }}
                    />
                )}

                {/* Editor Content */}
                <div className="flex-1 overflow-auto p-8">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                            Artigos e Serviços
                        </h3>
                        <button
                            onClick={handleEnrich}
                            disabled={saving}
                            className="px-4 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/20 transition-all text-[10px] font-black uppercase tracking-tight flex items-center gap-2 group disabled:opacity-50"
                        >
                            <span className="group-hover:rotate-12 transition-transform text-xs">✨</span>
                            Enriquecer Artigos
                        </button>
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/10">
                                <th className="pb-4 font-normal w-12 text-center">#</th>
                                <th className="pb-4 font-normal w-40">SKU</th>
                                <th className="pb-4 font-normal">Descrição Comercial</th>
                                <th className="pb-4 font-normal w-20 text-center">Qtd</th>
                                <th className="pb-4 font-normal w-32 text-right">Preço Un. (€)</th>
                                <th className="pb-4 font-normal w-24 text-center">Desc (%)</th>
                                <th className="pb-4 font-normal w-32 text-right">Total (€)</th>
                                <th className="pb-4 font-normal w-32 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {proposal.lines.map((line, idx) => {
                                const qty = parseFloat(line.quantity || 0);
                                const price = parseFloat(line.unit_price_commercial || 0);
                                const desc = parseFloat(line.discount_commercial_percent || 0);
                                const lineTotal = qty * price * (1 - desc / 100);

                                return (
                                    <tr key={line.id} className="group hover:bg-white/[0.02]">
                                        <td className="py-2 text-[9px] font-mono text-gray-600 text-center">{idx + 1}</td>
                                        <td className="py-2 text-[10px] font-mono text-amber-500/70">
                                            <div className="flex items-center gap-1.5">
                                                {line.enrichment_status === 'match' && (
                                                    <button onClick={() => { setResolutionIndex(idx); setShowCatalogModal(true); }} className="text-[10px] hover:scale-125 transition-transform" title="Correspondência Exata (Clique para alterar)">✅</button>
                                                )}
                                                {line.enrichment_status === 'fuzzy' && (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => { setResolutionIndex(idx); setShowCatalogModal(true); }}
                                                            className="text-[10px] hover:scale-125 transition-transform"
                                                            title="Correspondência Aproximada (Clique para pesquisar manual)"
                                                        >🟡</button>
                                                        <button
                                                            onClick={() => confirmFuzzyMatch(idx)}
                                                            className="text-[8px] bg-green-500/20 text-green-500 px-1 rounded hover:bg-green-500/40"
                                                            title="Confirmar esta sugestão"
                                                        >Comp.</button>
                                                    </div>
                                                )}
                                                {line.enrichment_status === 'miss' && (
                                                    <button
                                                        onClick={() => { setResolutionIndex(idx); setShowCatalogModal(true); }}
                                                        className="text-[14px] leading-none text-red-500 hover:scale-150 transition-transform"
                                                        title="Não encontrado na Biblioteca (Clique para resolver)"
                                                    >·</button>
                                                )}
                                                <input
                                                    className="bg-transparent outline-none w-full focus:text-white font-bold"
                                                    value={line.sku}
                                                    onChange={e => updateLine(idx, 'sku', e.target.value)}
                                                    placeholder="SKU..."
                                                />
                                            </div>
                                        </td>
                                        <td className="py-2 pr-4">
                                            <div className="flex flex-col gap-0.5">
                                                <textarea
                                                    rows="1"
                                                    className="w-full bg-transparent text-gray-300 outline-none resize-none focus:text-white text-xs font-bold leading-tight"
                                                    value={line.description}
                                                    onChange={e => updateLine(idx, 'description', e.target.value)}
                                                />
                                                {line.extra_attributes?.original_description && (
                                                    <div className="text-[9px] text-gray-500 italic leading-none">
                                                        ({line.extra_attributes.original_description})
                                                    </div>
                                                )}
                                                {shouldShowCollectionDynamic(line.extra_attributes?.collection) && (
                                                    <div className="text-[9px] font-bold text-amber-500/60 uppercase tracking-tighter leading-none mt-0.5">
                                                        Coleção {line.extra_attributes.collection}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2">
                                            <input
                                                className="w-full bg-transparent text-center outline-none text-gray-400 focus:text-white text-xs"
                                                type="number"
                                                onWheel={(e) => e.target.blur()}
                                                value={line.quantity}
                                                onChange={e => updateLine(idx, 'quantity', e.target.value)}
                                            />
                                        </td>
                                        <td className="py-2">
                                            <div className="flex flex-col items-end gap-0.5">
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        className="bg-transparent w-20 text-right outline-none font-mono text-xs"
                                                        type="number"
                                                        value={line.unit_price_commercial}
                                                        onChange={e => updateLine(idx, 'unit_price_commercial', e.target.value)}
                                                    />
                                                    <span className="text-gray-500 text-[10px]">€</span>

                                                    {/* Price Mismatch Indicator */}
                                                    {line.extra_attributes?.price_match === false && line.extra_attributes?.catalog_price > 0 && (
                                                        <button
                                                            className="text-amber-500 hover:text-amber-400"
                                                            title={`PVP Catálogo: ${line.extra_attributes.catalog_price.toFixed(2)}€ (Clique para atualizar)`}
                                                            onClick={() => {
                                                                updateLine(idx, 'unit_price_commercial', line.extra_attributes.catalog_price);
                                                                const newLines = [...proposal.lines];
                                                                newLines[idx].extra_attributes.price_match = true;
                                                                setProposal({ ...proposal, lines: newLines });
                                                            }}
                                                        >
                                                            <FiAlertTriangle size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                                {line.extra_attributes?.price_match === false && line.extra_attributes?.catalog_price > 0 && (
                                                    <div className="text-[9px] text-amber-500 font-bold leading-none pr-4">
                                                        Bib: {line.extra_attributes.catalog_price.toFixed(2)}€
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2">
                                            <input
                                                className="w-full bg-transparent text-center outline-none text-gray-400 focus:text-white text-xs"
                                                type="number"
                                                onWheel={(e) => e.target.blur()}
                                                value={line.discount_commercial_percent}
                                                onChange={e => updateLine(idx, 'discount_commercial_percent', e.target.value)}
                                            />
                                        </td>
                                        <td className="py-2 text-right font-mono text-white font-bold text-xs">
                                            {lineTotal.toFixed(2)} €
                                        </td>
                                        <td className="py-2">
                                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => moveLine(idx, -1)}
                                                    className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded text-gray-400 hover:text-white text-[10px]"
                                                    title="Mover para cima"
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    onClick={() => moveLine(idx, 1)}
                                                    className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded text-gray-400 hover:text-white text-[10px]"
                                                    title="Mover para baixo"
                                                >
                                                    ↓
                                                </button>
                                                <button
                                                    onClick={() => removeLine(idx)}
                                                    className="w-6 h-6 flex items-center justify-center hover:bg-red-500/20 rounded text-gray-500 hover:text-red-500 text-[10px]"
                                                    title="Remover linha"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <button
                        onClick={addLine}
                        className="mt-6 w-full py-4 border-2 border-dashed border-white/5 hover:border-amber-500/30 hover:bg-amber-500/5 text-gray-500 hover:text-amber-500 transition-all rounded-xl font-bold flex items-center justify-center gap-2 group"
                    >
                        <span className="text-xl group-hover:scale-125 transition-transform">+</span>
                        Adicionar Novo Artigo / Linha
                    </button>
                </div>

                {/* Footer Totals */}
                <div className="h-32 bg-white/5 border-t border-white/10 flex items-center justify-between px-12 gap-12 shrink-0">

                    {/* Observations & Warranty */}
                    <div className="flex-1 h-full py-4 flex flex-col gap-2 overflow-hidden">
                        <div className="flex-1 flex flex-col">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Observações / Termos</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleSavePreset(PRESET_CATEGORIES.OBSERVATIONS, proposal.metadata?.observations)}
                                        className="text-[8px] text-amber-500/60 hover:text-amber-500 font-bold uppercase transition-colors"
                                    >
                                        + Guardar
                                    </button>
                                    <select
                                        className="bg-gray-900 text-[9px] text-amber-500 border border-white/10 rounded px-1 outline-none max-w-[120px]"
                                        onChange={(e) => {
                                            const p = presets.find(x => x.id === e.target.value);
                                            if (p) updateMetadata('observations', p.content);
                                        }}
                                        value=""
                                    >
                                        <option value="">-- Carregar --</option>
                                        {presets.filter(x => x.category === PRESET_CATEGORIES.OBSERVATIONS).map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <textarea
                                className="w-full bg-transparent text-xs text-gray-400 outline-none resize-none border-r border-white/10 pr-4"
                                value={proposal.metadata?.observations || ''}
                                onChange={e => updateMetadata('observations', e.target.value)}
                                placeholder="Notas internas ou notas adicionais para o cliente..."
                                rows={2}
                            />
                        </div>
                        <div className="flex-1 flex flex-col border-t border-white/5 pt-2">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Garantia / Marca</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleSavePreset(PRESET_CATEGORIES.WARRANTY, proposal.metadata?.warranty_text)}
                                        className="text-[8px] text-amber-500/60 hover:text-amber-500 font-bold uppercase transition-colors"
                                    >
                                        + Guardar
                                    </button>
                                    <select
                                        className="bg-gray-900 text-[9px] text-amber-500 border border-white/10 rounded px-1 outline-none max-w-[120px]"
                                        onChange={(e) => {
                                            const p = presets.find(x => x.id === e.target.value);
                                            if (p) updateMetadata('warranty_text', p.content);
                                        }}
                                        value=""
                                    >
                                        <option value="">-- Carregar --</option>
                                        {presets.filter(x => x.category === PRESET_CATEGORIES.WARRANTY).map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <textarea
                                className="w-full bg-transparent text-[10px] text-gray-500 outline-none resize-none border-r border-white/10 pr-4 leading-tight"
                                value={proposal.metadata?.warranty_text || ''}
                                onChange={e => updateMetadata('warranty_text', e.target.value)}
                                placeholder="Selecione uma predefinição ou escreva o texto da garantia aqui..."
                                rows={2}
                            />
                        </div>
                    </div>

                    {/* Totals Columns */}
                    <div className="flex gap-8 items-end py-4">
                        <div className="text-right space-y-2">
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase">Soma Ilíquida</div>
                                <div className="text-lg text-gray-300 font-mono">{totals.net.toFixed(2)} €</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase">Portes Envio</div>
                                <input
                                    type="number"
                                    className="bg-transparent text-right text-sm text-white font-mono outline-none border-b border-white/10 w-24 focus:border-amber-500"
                                    value={proposal.metadata?.shipping_cost || 0}
                                    onChange={e => updateMetadata('shipping_cost', e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="text-right space-y-2">
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase">Desconto Extra (%)</div>
                                <input
                                    type="number"
                                    className="bg-transparent text-right text-sm text-red-400 font-mono outline-none border-b border-white/10 w-24 focus:border-red-500"
                                    value={proposal.metadata?.global_discount || 0}
                                    onChange={e => updateMetadata('global_discount', e.target.value)}
                                />
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase">IVA (23%)</div>
                                <div className="text-lg text-gray-300 font-mono">{totals.vat.toFixed(2)} €</div>
                            </div>
                        </div>

                        <div className="text-right bg-amber-500/10 px-6 py-4 rounded-xl border border-amber-500/20 h-full flex flex-col justify-center">
                            <div className="text-[10px] text-amber-500 font-bold uppercase mb-1">Total Final</div>
                            <div className="text-3xl text-white font-black font-mono">{totals.gross.toFixed(2)} €</div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

const EntityDataModal = ({
    proposal, onClose, updateHeader, updateMetadata,
    searchCRM, searchResults, searching, selectCustomer, saveToCrm,
    activeSearchField, setActiveSearchField, showResults, setShowResults
}) => {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[11000] p-4">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center text-black font-black">📍</div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">Dados da Entidade e Entrega</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl">✕</button>
                </div>

                <div className="p-8 overflow-auto flex flex-col gap-8">
                    {/* Identification Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 bg-white/[0.02] rounded-xl border border-white/5">
                        <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Nome do Cliente / Entidade</label>
                                <button
                                    onClick={saveToCrm}
                                    className="text-[9px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded border border-amber-500/20 transition-all font-bold uppercase"
                                >
                                    Sincronizar CRM
                                </button>
                            </div>
                            <div className="relative">
                                <input
                                    className="w-full bg-white/5 px-4 py-3 rounded-lg text-lg font-black text-amber-500 outline-none border border-white/10 focus:border-amber-500 transition-all pl-10"
                                    value={proposal.client_ref}
                                    onChange={e => {
                                        updateHeader('client_ref', e.target.value);
                                        searchCRM(e.target.value);
                                    }}
                                    onFocus={() => {
                                        setActiveSearchField('name');
                                        if (proposal.client_ref?.length >= 1) setShowResults(true);
                                    }}
                                    placeholder="Nome comercial do cliente..."
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500/40">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                </div>

                                {showResults && activeSearchField === 'name' && (
                                    <div className="absolute top-full left-0 w-full mt-2 bg-gray-900 border border-amber-500/30 rounded-xl shadow-2xl z-[12000] max-h-64 overflow-auto backdrop-blur-xl">
                                        {searching ? (
                                            <div className="p-4 text-xs text-amber-500 italic text-center animate-pulse">A pesquisar CRM...</div>
                                        ) : searchResults.length === 0 ? (
                                            <div className="p-4 text-xs text-gray-500 italic text-center">Nenhum resultado...</div>
                                        ) : (
                                            searchResults.map(c => (
                                                <div
                                                    key={c.id}
                                                    onClick={() => {
                                                        selectCustomer(c);
                                                        setShowResults(false);
                                                    }}
                                                    className="p-4 hover:bg-amber-500/10 cursor-pointer border-b border-white/5 last:border-0 transition-colors group"
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm font-bold text-white group-hover:text-amber-500">{c.name}</span>
                                                        <span className="text-[10px] font-mono text-gray-500">{c.vat}</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 mt-1 truncate">{c.address}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="relative">
                                <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold block mb-1">NIF / VAT</label>
                                <input
                                    className="w-full bg-white/5 px-4 py-3 rounded-lg text-sm text-gray-200 outline-none border border-white/10 focus:border-amber-500 transition-all"
                                    value={proposal.metadata?.client_vat || ''}
                                    onChange={e => {
                                        updateMetadata('client_vat', e.target.value);
                                        setActiveSearchField('vat');
                                        searchCRM(e.target.value);
                                    }}
                                    onFocus={() => {
                                        setActiveSearchField('vat');
                                        if (proposal.metadata?.client_vat?.length >= 1) setShowResults(true);
                                    }}
                                />
                                {showResults && activeSearchField === 'vat' && (
                                    <div className="absolute top-full left-0 w-full mt-2 bg-gray-900 border border-amber-500/30 rounded-xl shadow-2xl z-[12000] max-h-64 overflow-auto backdrop-blur-xl">
                                        {searching ? (
                                            <div className="p-4 text-xs text-amber-500 italic text-center animate-pulse">A procurar NIF...</div>
                                        ) : searchResults.length === 0 ? (
                                            <div className="p-4 text-xs text-gray-500 italic text-center">Não encontrado...</div>
                                        ) : (
                                            searchResults.map(c => (
                                                <div key={c.id} onClick={() => { selectCustomer(c); setShowResults(false); }} className="p-4 hover:bg-amber-500/10 cursor-pointer border-b border-white/5 last:border-0 transition-colors group">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm font-bold text-white group-hover:text-amber-500">{c.name}</span>
                                                        <span className="text-[10px] font-mono text-gray-500">{c.vat}</span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold block mb-1">Email / Contacto</label>
                                <input
                                    className="w-full bg-white/5 px-4 py-3 rounded-lg text-sm text-gray-200 outline-none border border-white/10 focus:border-amber-500 transition-all font-mono"
                                    value={proposal.metadata?.client_email || ''}
                                    onChange={e => updateMetadata('client_email', e.target.value)}
                                    placeholder="email@exemplo.com"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Addresses Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Billing Address */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] text-blue-400 uppercase tracking-widest font-bold flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
                                Morada de Faturação
                            </label>
                            <textarea
                                rows="5"
                                className="w-full bg-white/5 px-4 py-3 rounded-xl text-xs text-gray-300 outline-none border border-white/10 focus:border-blue-500 transition-all resize-none leading-relaxed"
                                value={proposal.metadata?.billing_address || ''}
                                onChange={e => {
                                    updateMetadata('billing_address', e.target.value);
                                    if (proposal.metadata?.shipping_is_billing) {
                                        updateMetadata('shipping_address', e.target.value);
                                    }
                                }}
                                placeholder="Morada fiscal completa..."
                            />
                        </div>

                        {/* Shipping Address */}
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] text-green-400 uppercase tracking-widest font-bold flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                                    Morada de Entrega / Descarga
                                </label>
                                <button
                                    onClick={() => {
                                        const newVal = !proposal.metadata?.shipping_is_billing;
                                        updateMetadata('shipping_is_billing', newVal);
                                        if (newVal) {
                                            updateMetadata('shipping_address', proposal.metadata?.billing_address);
                                        }
                                    }}
                                    className={`text-[9px] px-2 py-1 rounded border transition-all font-bold uppercase
                                        ${proposal.metadata?.shipping_is_billing
                                            ? 'bg-green-500/20 border-green-500/40 text-green-400'
                                            : 'bg-white/5 border-white/10 text-gray-500 hover:text-white'
                                        }`}
                                >
                                    {proposal.metadata?.shipping_is_billing ? '✓ Igual à Faturação' : 'Mudar Morada'}
                                </button>
                            </div>
                            <textarea
                                rows="5"
                                disabled={proposal.metadata?.shipping_is_billing}
                                className={`w-full px-4 py-3 rounded-xl text-xs outline-none border transition-all resize-none leading-relaxed
                                    ${proposal.metadata?.shipping_is_billing
                                        ? 'bg-black/20 border-transparent text-gray-600 cursor-not-allowed italic'
                                        : 'bg-white/5 border-white/10 text-gray-300 focus:border-green-500'
                                    }`}
                                value={proposal.metadata?.shipping_address || ''}
                                onChange={e => updateMetadata('shipping_address', e.target.value)}
                                placeholder="Local de descarga do material..."
                            />
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 bg-white/5 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl transition-all font-black uppercase tracking-tight shadow-xl shadow-amber-500/10"
                    >
                        Concluído
                    </button>
                </div>
            </div>
        </div>
    );
};


export default ProposalEditor;
