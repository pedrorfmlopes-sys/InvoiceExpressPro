import React, { useState, useEffect, useRef } from 'react';
import { GlassCard } from '../ui/GlassCard';
import api from '../../api/apiClient';
import { qp } from '../../shared/ui';
import { NICOLAZZI_FINISH_GROUPS, shouldShowCollection } from '../../constants/catalog';
import CatalogSearchModal from '../catalog/CatalogSearchModal';
import { FiDatabase, FiUploadCloud, FiSearch, FiCheckCircle, FiClock, FiAlertTriangle, FiLoader, FiTrash2, FiMaximize2, FiPlus, FiSettings, FiX } from 'react-icons/fi';
import { CreateCatalogItemModal } from '../catalog/CreateCatalogItemModal';
import PresetManagementModal from './PresetManagementModal';
import LogisticsManager from '../logistics/LogisticsManager';
import CustomerModal from '../crm/CustomerModal';
import ProposalPdf from './ProposalPdf';
import ProposalSourceSyncModal from './ProposalSourceSyncModal';
import { formatDiscountDisplay, getDiscountMultiplier } from '../../shared/utils/DiscountEngine';
import {
    calculateLineAmounts,
    createCommentLine,
    createItemLine,
    getCommentPreviewStyle,
    getCommentRowClass,
    isCommentLine,
    normalizeDiscountExpression,
    normalizeCommentStyle,
    normalizeLineForUi
} from '../../shared/proposalLineUtils';

const PRESET_CATEGORIES = {
    WARRANTY: 'warranty',
    OBSERVATIONS: 'observations',
    PAYMENT: 'payment'
};

const BRAND_COLORS = {
    nicolazzi: 'amber',
    ritmonio: 'blue',
    bette: 'green',
    axa: 'red',
    fima: 'indigo',
    scarabeo: 'blue',
    buto: 'orange',
    other: 'gray',
    multimarcas: 'purple'
};

const COMMENT_TYPE_OPTIONS = [
    { value: 'title', label: 'Titulo' },
    { value: 'subtitle', label: 'Subtitulo' },
    { value: 'note', label: 'Nota' }
];

const PROPOSAL_BRAND_ABBR = {
    nicolazzi: 'NIC',
    ritmonio: 'RIT',
    bette: 'BET',
    nicolazzi_gold: 'NIC'
};

const sanitizeFilenamePart = (value, fallback = '') => {
    const cleaned = String(value || fallback || '')
        .replace(/[\/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || fallback;
};

const buildProposalExportFilename = (proposal, proposalId, extension) => {
    const brandAbbr = PROPOSAL_BRAND_ABBR[proposal?.brand_id]
        || proposal?.brand_id?.substring(0, 3)?.toUpperCase()
        || 'PRO';
    const clientFirstName = sanitizeFilenamePart((proposal?.client_ref || '').split(' ')[0], 'Cliente');
    const docNumRaw = proposal?.proposal_number
        || proposal?.metadata?.doc_number
        || proposal?.name?.replace(/Proposta Manual:\s*/i, '').replace(/Proposta:\s*/i, '').trim()
        || proposalId;
    const safeNum = sanitizeFilenamePart(docNumRaw, proposalId);
    return `Proposta ${safeNum} ${clientFirstName} ${brandAbbr}.${extension}`;
};

const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

const ProposalEditor = (props) => {
    if (!props) {
        console.warn("[ProposalEditor] Props are undefined! Redirecting or returning null.");
        return null;
    }
    const { proposalId, onClose } = props;
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
    const [showPresetManagement, setShowPresetManagement] = useState(null); // category name or null
    const [showLogistics, setShowLogistics] = useState(false);
    const [showSourceSync, setShowSourceSync] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState(null);
    const persistTimerRef = useRef(null);
    const latestProposalRef = useRef(null);
    const suppressDirtyRef = useRef(true);
    const confirmResolverRef = useRef(null);

    useEffect(() => { loadData(); }, [proposalId]);

    useEffect(() => {
        latestProposalRef.current = proposal;
        if (!proposal) return;
        if (suppressDirtyRef.current) {
            suppressDirtyRef.current = false;
            return;
        }
        setHasUnsavedChanges(true);
    }, [proposal]);

    useEffect(() => {
        if (!proposal || !hasUnsavedChanges) return;
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        const draft = proposal;
        persistTimerRef.current = setTimeout(() => {
            api.put(`/api/proposals/${proposalId}/working-copy`, draft).catch(err => {
                console.error('[ProposalEditor] Failed to persist working copy', err);
            });
        }, 500);

        return () => {
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        };
    }, [proposal, hasUnsavedChanges, proposalId]);

    useEffect(() => {
        const handleBeforeUnload = (event) => {
            if (!hasUnsavedChanges) return;
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    useEffect(() => () => {
        if (confirmResolverRef.current) {
            confirmResolverRef.current('cancel');
            confirmResolverRef.current = null;
        }
    }, []);

    const shouldShowCollectionDynamic = (name) => {
        if (!name) return false;
        if (visibleCollections === null) return true; // Show all if not loaded
        return visibleCollections.has(String(name).trim().toLowerCase());
    };
    const persistWorkingCopyNow = async (draft = latestProposalRef.current) => {
        if (!draft) return null;
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        const res = await api.put(`/api/proposals/${proposalId}/working-copy`, draft);
        return res.data?.proposal || null;
    };

    const askEditorConfirmation = (options = {}) => new Promise((resolve) => {
        if (confirmResolverRef.current) {
            confirmResolverRef.current('cancel');
        }

        confirmResolverRef.current = resolve;
        setConfirmDialog({
            title: 'Alterações por guardar',
            message: '',
            confirmLabel: 'Guardar',
            discardLabel: 'Sair sem guardar',
            cancelLabel: 'Cancelar',
            showDiscard: false,
            ...options
        });
    });

    const resolveEditorConfirmation = (decision) => {
        const resolver = confirmResolverRef.current;
        confirmResolverRef.current = null;
        setConfirmDialog(null);
        if (resolver) resolver(decision);
    };

    const ensureSavedBeforeProtectedAction = async (actionLabel) => {
        if (!hasUnsavedChanges) return latestProposalRef.current;
        const decision = await askEditorConfirmation({
            title: 'Alterações por guardar',
            message: `Queres guardar antes de ${actionLabel}?`,
            confirmLabel: 'Guardar',
            cancelLabel: 'Cancelar',
            showDiscard: false
        });
        if (decision !== 'confirm') return null;
        await handleSave({ silent: true });
        return latestProposalRef.current;
    };

    const handleExport = async (format) => {
        try {
            setSaving(true);
            const exportProposal = await ensureSavedBeforeProtectedAction(`exportar ${format.toUpperCase()}`);
            if (!exportProposal) return;

            if (format === 'pdf') {
                const { pdf: renderPdf } = await import('@react-pdf/renderer');
                const blob = await renderPdf(
                    <ProposalPdf proposal={exportProposal} visibleCollections={visibleCollections} />
                ).toBlob();
                downloadBlob(blob, buildProposalExportFilename(exportProposal, proposalId, 'pdf'));
                return;
            }

            const res = await api.get(`/api/proposals/${proposalId}/${format}`, { responseType: 'blob' });
            downloadBlob(
                new Blob([res.data]),
                buildProposalExportFilename(exportProposal, proposalId, format === 'pdf' ? 'pdf' : 'xlsx')
            );
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
                api.get(`/api/proposals/${proposalId}/working-copy?t=${Date.now()}`),
                api.get('/api/projects'),
                api.get(`/api/proposals/presets/list`)
            ]);
            const data = pRes.data?.proposal || pRes.data;
            // Default doc_date to today if not set — avoids empty date in editor & PDF
            if (!data.metadata) data.metadata = {};
            if (!data.metadata.doc_date) {
                data.metadata.doc_date = new Date().toISOString().split('T')[0];
            }
            const normalizedProposal = {
                ...data,
                lines: (data.lines || []).map(normalizeLineForUi)
            };
            suppressDirtyRef.current = true;
            setProposal(normalizedProposal);
            latestProposalRef.current = normalizedProposal;
            setHasUnsavedChanges(!!pRes.data?.dirty);
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
            let collections = [];
            if (brandId === 'MULTIMARCAS') {
                const collsRes = await Promise.all(['nicolazzi', 'ritmonio'].map(b => api.get(`/api/catalog/collections?brand=${b}`)));
                collections = collsRes.map(res => res.data || []).flat();
            } else {
                const res = await api.get(`/api/catalog/collections?brand=${brandId}`);
                collections = res.data || [];
            }

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
            if (collections.length === 0) {
                setVisibleCollections(null); // Show everything by default
            } else {
                setVisibleCollections(visibleSet);
            }

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

    const handleSave = async ({ silent = false } = {}) => {
        try {
            setSaving(true);
            await persistWorkingCopyNow(proposal);
            const res = await api.post(`/api/proposals/${proposalId}/working-copy/commit`);
            const savedProposal = res?.data?.proposal || res?.data || null;
            if (savedProposal) {
                const normalizedProposal = {
                    ...savedProposal,
                    lines: (savedProposal.lines || []).map(normalizeLineForUi)
                };
                suppressDirtyRef.current = true;
                setProposal(normalizedProposal);
                latestProposalRef.current = normalizedProposal;
                setHasUnsavedChanges(false);
            }
            if (!silent) {
                alert("Proposta guardada com sucesso!");
            }
            return savedProposal;
        } catch (e) {
            if (!silent) {
                alert("Erro ao guardar: " + e.message);
            }
            throw e;
        } finally {
            setSaving(false);
        }
    };

    const updateHeader = (field, val) => {
        setProposal(prev => ({ ...prev, [field]: val }));
    };

    const updateStatus = async (newStatus) => {
        setProposal(prev => ({ ...prev, status: newStatus }));
    };

    const updateMetadata = (field, value) => {
        setProposal({
            ...proposal,
            metadata: { ...proposal.metadata, [field]: value }
        });
    };

    const updatePackagingCost = (index, field, value) => {
        const costs = [...(proposal.metadata?.packaging_costs || [])];
        costs[index] = { ...costs[index], [field]: value };
        updateMetadata('packaging_costs', costs);
    };

    const addPackagingCost = () => {
        const costs = [...(proposal.metadata?.packaging_costs || [])];
        costs.push({
            brandId: 'other',
            enabled: true,
            type: 'percent',
            value: 0,
            base: 'liquid',
            description: 'Novo Custo'
        });
        updateMetadata('packaging_costs', costs);
    };

    const removePackagingCost = (index) => {
        const costs = [...(proposal.metadata?.packaging_costs || [])];
        costs.splice(index, 1);
        updateMetadata('packaging_costs', costs);
    };

    const updateLine = (index, field, value) => {
        const newLines = [...proposal.lines];
        const currentLine = newLines[index];
        const nextLine = { ...currentLine, [field]: value };

        if (field === 'line_type' && value === 'comment') {
            nextLine.sku = '';
            nextLine.quantity = 0;
            nextLine.unit_price_factory = 0;
            nextLine.unit_price_commercial = 0;
            nextLine.discount_commercial_percent = 0;
            nextLine.extra_attributes = {
                ...(currentLine.extra_attributes || {}),
                comment_style: normalizeCommentStyle(currentLine.extra_attributes?.comment_style)
            };
        }

        if (field === 'line_type' && value === 'item') {
            const nextExtra = { ...(currentLine.extra_attributes || {}) };
            delete nextExtra.comment_style;
            nextLine.quantity = currentLine.quantity || 1;
            nextLine.extra_attributes = nextExtra;
        }

        const normalizedLine = normalizeLineForUi(nextLine);
        if (field === 'discount_commercial_percent' && normalizedLine.line_type !== 'comment') {
            normalizedLine.discount_commercial_percent = value;
        }
        newLines[index] = normalizedLine;
        setProposal({ ...proposal, lines: newLines });
    };

    const addLine = () => {
        setProposal({ ...proposal, lines: [...proposal.lines, createItemLine()] });
    };

    const addCommentLine = () => {
        setProposal({ ...proposal, lines: [...proposal.lines, createCommentLine()] });
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

    const insertLine = (index) => {
        const newLines = [...proposal.lines];
        newLines.splice(index + 1, 0, createItemLine());
        setProposal({ ...proposal, lines: newLines });
    };

    const insertCommentLine = (index) => {
        const newLines = [...proposal.lines];
        newLines.splice(index + 1, 0, createCommentLine());
        setProposal({ ...proposal, lines: newLines });
    };

    const duplicateLine = (index) => {
        const lineToCopy = proposal.lines[index];
        const newLines = [...proposal.lines];
        newLines.splice(index + 1, 0, {
            ...normalizeLineForUi(lineToCopy),
            id: 'new-' + Math.random().toString(36).substr(2, 9)
        });
        setProposal({ ...proposal, lines: newLines });
    };

    const updateCommentStyle = (index, patch) => {
        const line = proposal.lines[index];
        const nextExtra = {
            ...(line.extra_attributes || {}),
            comment_style: normalizeCommentStyle({
                ...(line.extra_attributes?.comment_style || {}),
                ...patch
            })
        };
        updateLine(index, 'extra_attributes', nextExtra);
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
            const skusToResolve = newLines.map(l => l.sku).filter(Boolean);

            if (skusToResolve.length === 0) {
                alert("Nenhum SKU para enriquecer.");
                return;
            }

            const resBulk = await api.post('/api/catalog/resolve-bulk', {
                brand: proposal.brand_id,
                skus: skusToResolve
            });

            const resolutions = resBulk.data || [];
            let enrichedCount = 0;
            let resIdx = 0;

            for (let i = 0; i < newLines.length; i++) {
                if (!newLines[i].sku) continue;
                const res = resolutions[resIdx++];
                const line = newLines[i];

                if (res && res.success) {
                    const item = res.item;
                    const finish = res.finish;

                    let desc = item.description_pt || item.description_it || line.description;
                    const rawOriginal = item.description_it || item.description_en || line.description;
                    const originalFormatted = formatOriginalDescription(rawOriginal);

                    const extra = {
                        ...line.extra_attributes,
                        brand_id: item.brand || proposal.brand_id,
                        brand: item.brand || proposal.brand_id,
                        catalog_match: true,
                        finish_code: res.finishCode,
                        finish_note: finish?.description_pt || finish?.note_pt || res.finishNote,
                        finish_group: item.finish_group || null,
                        original_it: item.description_it,
                        original_description: line.extra_attributes?.original_description || originalFormatted,
                        collection: res.series || item.series,
                        series: res.series || item.series
                    };

                    newLines[i] = {
                        ...line,
                        brand_id: item.brand || proposal.brand_id,
                        description: desc,
                        unit_price_commercial: line.unit_price_commercial,
                        production_category: res.productionCategory || item.finish_group || line.production_category || 'standard',
                        extra_attributes: {
                            ...extra,
                            catalog_sku: item.sku,
                            catalog_price: item.price,
                            price_match: (Math.abs((item.price || 0) - (line.unit_price_commercial || 0)) < 0.01)
                        },
                        enrichment_status: res.fuzzy ? 'fuzzy' : 'match'
                    };
                    enrichedCount++;
                } else {
                    newLines[i] = {
                        ...line,
                        enrichment_status: 'miss'
                    };
                }
            }

            setProposal({ ...proposal, lines: newLines });
            if (enrichedCount > 0) {
                alert(`${enrichedCount} artigos enriquecidos com sucesso!`);
            } else {
                alert("Nenhuma correspondência exata encontrada na biblioteca.");
            }
        } catch (e) {
            console.error("Enrichment Error:", e);
            alert("Erro ao enriquecer: " + (e.response?.data?.error || e.message));
        } finally {
            setSaving(false);
        }
    };

    const selectCatalogItem = async (index, item) => {
        const newLines = [...proposal.lines];
        const line = newLines[index];

        setSaving(true);
        try {
            // Fetch extra details (finish notes, etc.) for this item
            const res = await api.post('/api/catalog/resolve', {
                brand: item.brand || proposal.brand_id,
                sku: item.sku
            });

            const extraDetails = res.data?.success ? res.data : null;

            // Format original description (Sentence case)
            const rawOriginal = item.description_it || item.description_en || '';
            const originalFormatted = rawOriginal ? (rawOriginal.charAt(0).toUpperCase() + rawOriginal.slice(1).toLowerCase()) : '';

            // Parse item extra_attributes from modal (may contain finish_note, finish_code chosen by user)
            const itemExtra = typeof item.extra_attributes === 'string'
                ? JSON.parse(item.extra_attributes || '{}')
                : (item.extra_attributes || {});

            // Price Safety
            const catalogPrice = parseFloat(item.price || 0);
            const currentPrice = parseFloat(line.unit_price_commercial || 0);
            const isMatch = Math.abs(currentPrice - catalogPrice) < 0.01;

            // Mapeamento Multi-Marca: gravar o brand_id real da biblioteca!
            newLines[index] = {
                ...line,
                brand_id: item.brand || line.brand_id,
                description: item.description_pt || item.description_it || line.description,
                sku: item.sku,
                unit_price_commercial: currentPrice === 0 ? (item.price || 0) : currentPrice, // Auto inject price if 0!
                lead_time_weeks: extraDetails?.leadTimeWeeks || line.lead_time_weeks || null,
                production_category: extraDetails?.productionCategory || extraDetails?.item?.finish_group || item.finish_group || line.production_category || 'standard',
                extra_attributes: {
                    ...line.extra_attributes,
                    brand_id: item.brand || line.brand_id,
                    brand: item.brand || line.brand_id,
                    catalog_match: true,
                    catalog_sku: item.sku,
                    finish_code: extraDetails?.finishCode || itemExtra.finish_code || line.extra_attributes?.finish_code,
                    finish_group: item.finish_group,
                    finish_note: extraDetails?.finish?.description_pt || extraDetails?.finish?.note_pt || extraDetails?.finishNote || itemExtra.finish_note || line.extra_attributes?.finish_note,
                    manual_resolution: true,
                    collection: extraDetails?.item?.series || extraDetails?.series || item.series,
                    series: extraDetails?.item?.series || extraDetails?.series || item.series,
                    original_description: line.extra_attributes?.original_description || null,
                    catalog_price: item.price,
                    price_match: currentPrice === 0 ? true : isMatch
                },
                enrichment_status: 'match'
            };

            setProposal({ ...proposal, lines: newLines });
            setShowCatalogModal(false);
            setResolutionIndex(null);
        } catch (e) {
            console.error("Error in selectCatalogItem:", e);
        } finally {
            setSaving(false);
        }
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
        const hasCustomShipping = c.shipping_address && c.shipping_address.trim().length > 0;
        const isShippingSame = hasCustomShipping ? false : (proposal.metadata?.shipping_is_billing !== false); // Default true if no custom shipping

        setProposal({
            ...proposal,
            client_ref: c.name,
            metadata: {
                ...proposal.metadata,
                client_vat: c.vat,
                billing_address: c.address,
                shipping_address: hasCustomShipping ? c.shipping_address : (isShippingSame ? c.address : proposal.metadata?.shipping_address),
                shipping_is_billing: isShippingSame, // Ensure toggle matches reality
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

    const handleSourceSyncApplied = (nextProposal) => {
        if (!nextProposal) return;
        const normalizedProposal = {
            ...nextProposal,
            lines: (nextProposal.lines || []).map(normalizeLineForUi)
        };
        suppressDirtyRef.current = true;
        setProposal(normalizedProposal);
        latestProposalRef.current = normalizedProposal;
        setHasUnsavedChanges(true);
    };

    const openSourceSync = async () => {
        try {
            await persistWorkingCopyNow(proposal);
            setShowSourceSync(true);
        } catch (e) {
            alert("Não foi possível preparar a atualização da proposta: " + (e.response?.data?.error || e.message));
        }
    };

    const handleOpenLogistics = async () => {
        try {
            const canContinue = await ensureSavedBeforeProtectedAction('abrir a logística');
            if (!canContinue) return;
            setShowLogistics(true);
        } catch (e) {
            alert("NÃ£o foi possÃ­vel abrir a logística: " + (e.response?.data?.error || e.message));
        }
    };

    const handleCloseEditor = async () => {
        try {
            if (hasUnsavedChanges) {
                const decision = await askEditorConfirmation({
                    title: 'Sair da proposta',
                    message: 'Existem alterações por guardar nesta proposta. O que queres fazer?',
                    confirmLabel: 'Guardar e sair',
                    discardLabel: 'Sair sem guardar',
                    cancelLabel: 'Cancelar',
                    showDiscard: true
                });

                if (decision === 'confirm') {
                    await handleSave({ silent: true });
                    await api.delete(`/api/proposals/${proposalId}/working-copy`).catch(() => { });
                    onClose?.();
                    return;
                }

                if (decision !== 'discard') return;
            }

            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
            await api.delete(`/api/proposals/${proposalId}/working-copy`).catch(() => { });
            setHasUnsavedChanges(false);
            onClose?.();
        } catch (e) {
            alert("Erro ao fechar editor: " + (e.response?.data?.error || e.message));
        }
    };

    const calculateTotals = () => {
        if (!proposal?.lines) return { net: 0, vat: 0, gross: 0, packagingTotal: 0 };

        const linesTotal = proposal.lines.reduce((acc, l) => {
            const { lineNet, lineVat } = calculateLineAmounts(l);

            acc.net += lineNet;
            acc.vat += lineVat;
            return acc;
        }, { net: 0, vat: 0 });

        // Global Values from Metadata
        const shipping = parseFloat(proposal.metadata?.shipping_cost || 0);
        const globalDiscPercent = normalizeDiscountExpression(proposal.metadata?.global_discount || '0', '0');

        // Packaging Costs Calculation
        let packagingTotal = 0;
        const pkCosts = proposal.metadata?.packaging_costs || [];
        pkCosts.forEach(cost => {
            if (!cost.enabled) return;
            if (cost.type === 'fixed') {
                packagingTotal += parseFloat(cost.value || 0);
            } else {
                const baseVal = cost.base === 'liquid' ? linesTotal.net : (linesTotal.net + shipping);
                packagingTotal += baseVal * (parseFloat(cost.value || 0) / 100);
            }
        });

        // Calculate Discount Value (applied to Lines + Shipping, usually)
        const discountValue = (linesTotal.net + shipping) * (1 - getDiscountMultiplier(globalDiscPercent));

        const taxBase = linesTotal.net + shipping + packagingTotal - discountValue;
        const totalVat = taxBase * 0.23; // Force 23% for preview
        const gross = taxBase + totalVat;

        return {
            net: linesTotal.net,
            shipping,
            packagingTotal,
            globalDiscPercent,
            discountValue,
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

    const getDisplayBrandInfo = () => {
        if (!proposal?.lines || proposal.lines.length === 0) {
            const bid = (proposal?.brand_id || 'OTHER').toLowerCase();
            return {
                label: proposal?.brand_id === 'MULTIMARCAS' ? 'MULTIMARCAS' : bid.toUpperCase(),
                color: BRAND_COLORS[bid] || 'amber'
            };
        }

        const brandsInLines = new Set();
        proposal.lines.forEach(l => {
            const b = l.brand_id || l.extra_attributes?.brand_id || l.extra_attributes?.brand;
            if (b) brandsInLines.add(b.toLowerCase());
        });

        if (brandsInLines.size === 1) {
            const bid = Array.from(brandsInLines)[0];
            return {
                label: bid.toUpperCase(),
                color: BRAND_COLORS[bid] || 'amber'
            };
        }

        if (brandsInLines.size > 1) {
            return { label: 'OTHERS', color: 'purple' };
        }

        const bid = (proposal.brand_id || 'OTHER').toLowerCase();
        return { label: bid.toUpperCase(), color: BRAND_COLORS[bid] || 'amber' };
    };

    const brandInfo = getDisplayBrandInfo();

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
                                <span className={`text-[9px] text-${brandInfo.color}-500 font-black uppercase tracking-widest`}>{brandInfo.label}</span>
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
                            <button
                                onClick={() => handleExport('pdf')}
                                disabled={saving}
                                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all text-xs font-bold border border-white/10 disabled:opacity-50"
                            >
                                📄 PDF
                            </button>
                        )}
                        {false && proposal && (
                            <PDFDownloadLink
                                document={<ProposalPdf proposal={proposal} visibleCollections={visibleCollections} />}
                                fileName={(() => {
                                    const brandMap = {
                                        'nicolazzi': 'NIC',
                                        'ritmonio': 'RIT',
                                        'bette': 'BET',
                                        'nicolazzi_gold': 'NIC'
                                    };
                                    const brandAbbr = brandMap[proposal.brand_id] || proposal.brand_id?.substring(0, 3).toUpperCase() || 'PRO';
                                    const clientFirstName = (proposal.client_ref || '').split(' ')[0] || 'Cliente';
                                    const docNum = proposal.metadata?.doc_number || proposal.name?.replace('Proposta:', '').trim() || proposalId;

                                    // Sanitize for filename (replacing / with - is usually best for OS compatibility)
                                    const safeNum = String(docNum).replace(/[\/\\?%*:|"<>]/g, '-');
                                    return `Proposta ${safeNum} ${clientFirstName} ${brandAbbr}.pdf`;
                                })()}
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
                            onClick={openSourceSync}
                            className="px-4 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 rounded-lg transition-all text-xs font-bold border border-sky-500/20"
                            title="Atualizar linhas a partir de uma proforma retificada"
                        >
                            Atualizar por Proforma
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg transition-all text-xs font-black uppercase tracking-tight shadow-lg shadow-amber-500/20 disabled:opacity-50"
                        >
                            {saving ? 'A Guardar...' : 'Guardar'}
                        </button>
                        <button
                            onClick={handleOpenLogistics}
                            className="bg-white/5 hover:bg-white/10 text-white w-10 h-10 flex items-center justify-center rounded-lg transition-all text-xs font-bold border border-white/10"
                            title="Gestão Logística"
                        >
                            🚚
                        </button>
                        <button
                            onClick={handleCloseEditor}
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
                            <span className="text-sm text-white font-bold">{parseFloat(calculateTotals().gross || 0).toFixed(2)} €</span>
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
                        initialSku={createItemSku}
                        onClose={() => { setShowCatalogModal(false); setResolutionIndex(null); setCreateItemSku(''); }}
                        onSelect={(item) => selectCatalogItem(resolutionIndex, item)}
                        onCreateNew={(sku) => {
                            setCreateItemSku(sku);
                            setShowCatalogModal(false);
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
                            setShowCreateItemModal(false);
                        }}
                    />
                )}

                {showSourceSync && (
                    <ProposalSourceSyncModal
                        proposalId={proposalId}
                        onPrepareSync={() => persistWorkingCopyNow(latestProposalRef.current)}
                        onClose={() => setShowSourceSync(false)}
                        onApplied={handleSourceSyncApplied}
                    />
                )}

                {confirmDialog && (
                    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/75 backdrop-blur-sm">
                        <GlassCard className="w-full max-w-md border-amber-500/20 bg-[var(--bg-base)] p-6 shadow-2xl shadow-black/40">
                            <div className="mb-5">
                                <h3 className="text-lg font-black text-white">{confirmDialog.title}</h3>
                                <p className="mt-2 text-sm text-gray-300 leading-relaxed">{confirmDialog.message}</p>
                            </div>
                            <div className="flex flex-wrap justify-end gap-3">
                                <button
                                    onClick={() => resolveEditorConfirmation('cancel')}
                                    className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm font-bold text-white hover:bg-white/10 transition-colors"
                                >
                                    {confirmDialog.cancelLabel}
                                </button>
                                {confirmDialog.showDiscard && (
                                    <button
                                        onClick={() => resolveEditorConfirmation('discard')}
                                        className="px-4 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-sm font-bold text-red-300 hover:bg-red-500/20 transition-colors"
                                    >
                                        {confirmDialog.discardLabel}
                                    </button>
                                )}
                                <button
                                    onClick={() => resolveEditorConfirmation('confirm')}
                                    className="px-4 py-2 rounded-lg bg-amber-500 text-sm font-black text-black hover:bg-amber-400 transition-colors"
                                >
                                    {confirmDialog.confirmLabel}
                                </button>
                            </div>
                        </GlassCard>
                    </div>
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
                            {proposal.lines.map((rawLine, idx) => {
                                const line = normalizeLineForUi(rawLine);
                                if (!isCommentLine(rawLine) && rawLine?.discount_commercial_percent !== undefined && rawLine?.discount_commercial_percent !== null) {
                                    line.discount_commercial_percent = String(rawLine.discount_commercial_percent);
                                }
                                const isComment = isCommentLine(line);
                                const { lineNet } = calculateLineAmounts(line);
                                const commentStyle = normalizeCommentStyle(line.extra_attributes?.comment_style);

                                if (isComment) {
                                    return (
                                        <tr key={`${line.id}-${idx}`} className="group hover:bg-white/[0.02]">
                                            <td className="py-2 text-[9px] font-mono text-gray-600 text-center align-top">{idx + 1}</td>
                                            <td colSpan={6} className="py-3 pr-4">
                                                <div className="rounded-2xl border border-sky-500/20 bg-slate-950/50 px-4 py-3 shadow-inner shadow-sky-950/30">
                                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                                        <div className="text-[9px] font-black uppercase tracking-[0.25em] text-sky-300">
                                                            Linha de Comentario
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <select
                                                                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-200 outline-none"
                                                                value={commentStyle.variant}
                                                                onChange={e => updateCommentStyle(idx, { variant: e.target.value })}
                                                            >
                                                                {COMMENT_TYPE_OPTIONS.map(option => (
                                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                                ))}
                                                            </select>
                                                            <input
                                                                type="number"
                                                                min="9"
                                                                max="24"
                                                                className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-mono text-white outline-none"
                                                                value={commentStyle.fontSize}
                                                                onChange={e => updateCommentStyle(idx, { fontSize: e.target.value })}
                                                            />
                                                            <input
                                                                type="color"
                                                                className="h-8 w-10 rounded border border-white/10 bg-black/30 p-1"
                                                                value={commentStyle.color}
                                                                onChange={e => updateCommentStyle(idx, { color: e.target.value })}
                                                            />
                                                            <button
                                                                onClick={() => updateCommentStyle(idx, { bold: !commentStyle.bold })}
                                                                className={`rounded-lg border px-2 py-1 text-[10px] font-black transition-colors ${commentStyle.bold ? 'border-amber-500 bg-amber-500/20 text-amber-300' : 'border-white/10 bg-black/30 text-gray-400 hover:text-white'}`}
                                                                title="Negrito"
                                                            >
                                                                B
                                                            </button>
                                                            <button
                                                                onClick={() => updateCommentStyle(idx, { italic: !commentStyle.italic })}
                                                                className={`rounded-lg border px-2 py-1 text-[10px] font-black transition-colors ${commentStyle.italic ? 'border-sky-500 bg-sky-500/20 text-sky-200' : 'border-white/10 bg-black/30 text-gray-400 hover:text-white'}`}
                                                                title="Italico"
                                                            >
                                                                I
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <textarea
                                                        rows="2"
                                                        className={`w-full resize-y rounded-xl border border-white/5 bg-black/20 px-3 py-2 outline-none transition-colors focus:border-sky-500/40 ${getCommentRowClass(commentStyle)}`}
                                                        style={getCommentPreviewStyle(commentStyle)}
                                                        value={line.description}
                                                        onChange={e => updateLine(idx, 'description', e.target.value)}
                                                        placeholder="Escreve aqui o comentario da proposta..."
                                                    />
                                                </div>
                                            </td>
                                            <td className="py-2 align-top">
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
                                                        onClick={() => insertLine(idx)}
                                                        className="w-6 h-6 flex items-center justify-center hover:bg-green-500/20 rounded text-gray-500 hover:text-green-400 text-[10px]"
                                                        title="Inserir artigo abaixo"
                                                    >
                                                        +
                                                    </button>
                                                    <button
                                                        onClick={() => insertCommentLine(idx)}
                                                        className="w-6 h-6 flex items-center justify-center hover:bg-sky-500/20 rounded text-gray-500 hover:text-sky-300 text-[10px]"
                                                        title="Inserir comentario abaixo"
                                                    >
                                                        C
                                                    </button>
                                                    <button
                                                        onClick={() => duplicateLine(idx)}
                                                        className="w-6 h-6 flex items-center justify-center hover:bg-blue-500/20 rounded text-gray-500 hover:text-blue-400 text-[10px]"
                                                        title="Duplicar linha"
                                                    >
                                                        D
                                                    </button>
                                                    <button
                                                        onClick={() => removeLine(idx)}
                                                        className="w-6 h-6 flex items-center justify-center hover:bg-red-500/20 rounded text-gray-500 hover:text-red-500 text-[10px]"
                                                        title="Remover linha"
                                                    >
                                                        X
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }

                                return (
                                    <tr key={`${line.id}-${line.predicted_ship_date || 'nodate'}`} className="group hover:bg-white/[0.02]">
                                        <td className="py-2 text-[9px] font-mono text-gray-600 text-center">{idx + 1}</td>
                                        <td className="py-2 text-[10px] font-mono text-amber-500/70">
                                            <div className="flex items-center gap-1.5">
                                                {line.enrichment_status === 'match' && (
                                                    <button
                                                        onClick={() => {
                                                            setResolutionIndex(idx);
                                                            setCreateItemSku(line.sku);
                                                            setShowCatalogModal(true);
                                                        }}
                                                        className="text-[10px] hover:scale-125 transition-transform"
                                                        title="Correspondência Exata (Clique para alterar)"
                                                    >✅</button>
                                                )}
                                                {line.enrichment_status === 'fuzzy' && (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => {
                                                                setResolutionIndex(idx);
                                                                setCreateItemSku(line.sku);
                                                                setShowCatalogModal(true);
                                                            }}
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
                                                {(line.enrichment_status === 'miss' || !line.enrichment_status) && (
                                                    <button
                                                        onClick={() => {
                                                            setResolutionIndex(idx);
                                                            setCreateItemSku(line.sku);
                                                            setShowCatalogModal(true);
                                                        }}
                                                        className={`text-[12px] transition-all hover:scale-125 ${line.enrichment_status === 'miss' ? 'text-red-500' : 'text-gray-600 hover:text-amber-500'}`}
                                                        title={line.enrichment_status === 'miss' ? "Não encontrado na Biblioteca (Clique para pesquisar manual)" : "Pesquisa Manual na Biblioteca"}
                                                    >
                                                        <FiSearch />
                                                    </button>
                                                )}
                                                <div className="flex flex-col w-full relative">
                                                    {line.brand_id && line.brand_id.toLowerCase() !== String(proposal.brand_id || '').toLowerCase() && (
                                                        <span
                                                            title={`Artigo de Marca Distinta: ${line.brand_id.toUpperCase()}`}
                                                            className="absolute -top-3 left-0 text-[7px] font-black uppercase text-indigo-200 bg-indigo-600/80 px-1 rounded shadow-lg shadow-indigo-900/20 z-10"
                                                        >
                                                            {line.brand_id.toUpperCase()}
                                                        </span>
                                                    )}
                                                    <input
                                                        className="bg-transparent outline-none w-full focus:text-white font-bold"
                                                        value={line.sku}
                                                        onChange={e => updateLine(idx, 'sku', e.target.value)}
                                                        placeholder="SKU..."
                                                    />
                                                </div>
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
                                                <>
                                                    {line.extra_attributes?.original_description && (
                                                        <div className="text-[9px] text-gray-500 italic leading-none">
                                                            ({line.extra_attributes.original_description})
                                                        </div>
                                                    )}
                                                    {shouldShowCollectionDynamic(line.extra_attributes?.collection) && (
                                                        <div className="text-[9px] text-gray-500 uppercase tracking-tighter mt-1 line-clamp-1">
                                                            {line.extra_attributes.collection}
                                                        </div>
                                                    )}
                                                    {(line.extra_attributes?.finish_note || line.extra_attributes?.brand_meta?.finishNote) && (
                                                        <div className="mt-1 flex items-center gap-1.5 text-[8px] bg-blue-500/5 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/10 w-fit">
                                                            <span className="font-bold uppercase">📋 Spec Técnica:</span>
                                                            <span className="line-clamp-1 opacity-70">{(line.extra_attributes.finish_note || line.extra_attributes.brand_meta.finishNote).substring(0, 30)}...</span>
                                                        </div>
                                                    )}
                                                </>

                                                {(() => {
                                                    const effLead = line.lead_time_weeks || proposal.general_lead_time_weeks || 0;
                                                    let pDate = line.predicted_ship_date;

                                                    if (!pDate && effLead > 0) {
                                                        const bDate = proposal.order_confirmation_date
                                                            ? new Date(proposal.order_confirmation_date)
                                                            : (proposal.metadata?.doc_date ? new Date(proposal.metadata.doc_date) : null);
                                                        if (bDate) {
                                                            bDate.setDate(bDate.getDate() + (effLead * 7));
                                                            pDate = bDate.getTime();
                                                        }
                                                    }

                                                    const dateVal = pDate ? new Date(pDate).toISOString().split('T')[0] : '';
                                                    const isOverdue = pDate && (new Date(pDate) < new Date());

                                                    return (
                                                        <div className={`text-[9px] font-black uppercase mt-2 flex items-center gap-2 px-2 py-1 rounded-md border shadow-sm transition-all
                                                            ${isOverdue
                                                                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                                                                : 'bg-green-500/10 border-green-500/20 text-green-400'
                                                            }`}>
                                                            <FiClock className="shrink-0 text-[11px]" />
                                                            <input
                                                                type="date"
                                                                value={dateVal}
                                                                onChange={e => {
                                                                    const val = e.target.value ? new Date(e.target.value).getTime() : null;
                                                                    updateLine(idx, 'predicted_ship_date', val);
                                                                }}
                                                                className="bg-transparent border-none outline-none text-[10px] font-bold text-current cursor-pointer"
                                                            />
                                                            {isOverdue && <span className="px-1.5 bg-red-500 text-white text-[8px] rounded animate-pulse ml-auto">ATRASO</span>}
                                                        </div>
                                                    );
                                                })()}
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
                                                            title={`PVP Catálogo: ${parseFloat(line.extra_attributes?.catalog_price || 0).toFixed(2)}€ (Clique para atualizar)`}
                                                            onClick={() => {
                                                                updateLine(idx, 'unit_price_commercial', line.extra_attributes?.catalog_price);
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
                                                        Bib: {parseFloat(line.extra_attributes?.catalog_price || 0).toFixed(2)}€
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2">
                                            <input
                                                className="w-full bg-transparent text-center outline-none text-gray-400 focus:text-white text-xs"
                                                type="text"
                                                value={line.discount_commercial_percent || ''}
                                                onChange={e => updateLine(idx, 'discount_commercial_percent', e.target.value)}
                                                onBlur={e => updateLine(idx, 'discount_commercial_percent', normalizeDiscountExpression(e.target.value, '0'))}
                                                placeholder="0"
                                            />
                                        </td>
                                        <td className="py-2 text-right font-mono text-white font-bold text-xs">
                                            {parseFloat(lineNet || 0).toFixed(2)} €
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
                                                    onClick={() => insertLine(idx)}
                                                    className="w-6 h-6 flex items-center justify-center hover:bg-green-500/20 rounded text-gray-500 hover:text-green-400 text-[10px]"
                                                    title="Inserir artigo abaixo"
                                                >
                                                    +
                                                </button>
                                                <button
                                                    onClick={() => insertCommentLine(idx)}
                                                    className="w-6 h-6 flex items-center justify-center hover:bg-sky-500/20 rounded text-gray-500 hover:text-sky-300 text-[10px]"
                                                    title="Inserir comentario abaixo"
                                                >
                                                    C
                                                </button>
                                                <button
                                                    onClick={() => duplicateLine(idx)}
                                                    className="w-6 h-6 flex items-center justify-center hover:bg-blue-500/20 rounded text-gray-500 hover:text-blue-400 text-[10px]"
                                                    title="Duplicar linha"
                                                >
                                                    📋
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
                        Adicionar Artigo
                    </button>
                    <button
                        onClick={addCommentLine}
                        className="mt-3 w-full py-4 border-2 border-dashed border-sky-500/15 hover:border-sky-400/40 hover:bg-sky-500/5 text-sky-200/70 hover:text-sky-200 transition-all rounded-xl font-bold flex items-center justify-center gap-2 group"
                    >
                        <span className="text-xl group-hover:scale-125 transition-transform">C</span>
                        Adicionar Comentario
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
                                    <button
                                        onClick={() => setShowPresetManagement(PRESET_CATEGORIES.OBSERVATIONS)}
                                        className="text-[12px] text-gray-400 hover:text-amber-500 transition-colors"
                                        title="Gerir Predefinições"
                                    >
                                        <FiSettings />
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
                                    <button
                                        onClick={() => setShowPresetManagement(PRESET_CATEGORIES.WARRANTY)}
                                        className="text-[12px] text-gray-400 hover:text-amber-500 transition-colors"
                                        title="Gerir Predefinições"
                                    >
                                        <FiSettings />
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

                    {/* Packaging Costs Section */}
                    <PackagingCostsCard 
                        costs={proposal.metadata?.packaging_costs || []}
                        updateCost={updatePackagingCost}
                        onAdd={addPackagingCost}
                        onRemove={removePackagingCost}
                        totals={totals}
                    />

                    {/* Totals Columns */}
                    <div className="flex gap-8 items-end py-4">
                        <div className="text-right space-y-2">
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase">Soma Ilíquida</div>
                                <div className="text-lg text-gray-300 font-mono">{parseFloat(totals.net || 0).toFixed(2)} €</div>
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
                            {totals.packagingTotal > 0 && (
                                <div>
                                    <div className="text-[10px] text-gray-500 uppercase">Embalagem</div>
                                    <div className="text-sm text-gray-300 font-mono">{parseFloat(totals.packagingTotal || 0).toFixed(2)} €</div>
                                </div>
                            )}
                        </div>

                        <div className="text-right space-y-2">
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase">Desconto Extra (%)</div>
                                <input
                                    type="text"
                                    className="bg-transparent text-right text-sm text-red-400 font-mono outline-none border-b border-white/10 w-32 focus:border-red-500"
                                    value={proposal.metadata?.global_discount || ''}
                                    onChange={e => updateMetadata('global_discount', e.target.value)}
                                    onBlur={e => updateMetadata('global_discount', normalizeDiscountExpression(e.target.value, '0'))}
                                    placeholder="0 ou 45+5+5+5"
                                />
                                {!!proposal.metadata?.global_discount && proposal.metadata?.global_discount !== '0' && (
                                    <div className="text-[10px] text-red-300/70 mt-1">{formatDiscountDisplay(proposal.metadata.global_discount)}</div>
                                )}
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase">IVA (23%)</div>
                                <div className="text-lg text-gray-300 font-mono">{parseFloat(totals.vat || 0).toFixed(2)} €</div>
                            </div>
                        </div>

                        <div className="text-right bg-amber-500/10 px-6 py-4 rounded-xl border border-amber-500/20 h-full flex flex-col justify-center">
                            <div className="text-[10px] text-amber-500 font-bold uppercase mb-1">Total Final</div>
                            <div className="text-3xl text-white font-black font-mono">{parseFloat(totals.gross || 0).toFixed(2)} €</div>
                        </div>
                    </div>
                </div>

                {/* Modals & Overlays */}
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
                        onClose={() => setShowCatalogModal(false)}
                        onSelect={(item) => selectCatalogItem(resolutionIndex, item)}
                        brand={proposal.brand_id}
                        initialSku={createItemSku}
                        onCreateNew={(sku) => {
                            setCreateItemSku(sku);
                            setShowCatalogModal(false);
                            setShowCreateItemModal(true);
                        }}
                    />
                )}

                {showCreateItemModal && (
                    <CreateCatalogItemModal
                        isOpen={showCreateItemModal}
                        onClose={() => setShowCreateItemModal(false)}
                        onCreated={() => {
                            setShowCreateItemModal(false);
                            handleEnrich(); // Retry enrichment
                        }}
                        initialSku={createItemSku}
                    />
                )}

                {showLogistics && (
                    <LogisticsManager
                        proposalId={proposalId}
                        onClose={() => {
                            setShowLogistics(false);
                            loadData();
                        }}
                    />
                )}

                {showPresetManagement && (
                    <PresetManagementModal
                        category={showPresetManagement}
                        presets={presets.filter(x => x.category === showPresetManagement)}
                        onClose={() => setShowPresetManagement(null)}
                        onRefresh={() => api.get(`/api/proposals/presets/list`).then(res => setPresets(res.data || []))}
                    />
                )}
            </div>
        </div>
    );
};

const EntityDataModal = ({
    proposal, onClose, updateHeader, updateMetadata,
    searchCRM, searchResults, searching, selectCustomer, saveToCrm,
    activeSearchField, setActiveSearchField, showResults, setShowResults
}) => {
    const [showNewCustomer, setShowNewCustomer] = useState(false);
    const [savedAddresses, setSavedAddresses] = useState([]);

    useEffect(() => {
        const fetchAddresses = async () => {
            try {
                const res = await api.get(`/api/crm/shipping-addresses?project=${proposal.project_ref || 'default'}`);
                setSavedAddresses(res.data || []);
            } catch (err) {
                console.error('Failed to fetch shipping addresses', err);
            }
        };
        fetchAddresses();
    }, [proposal.project_ref]);

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
                                <div className="flex gap-2 items-center">
                                    <button
                                        onClick={() => setShowNewCustomer(true)}
                                        className="text-[9px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded border border-blue-500/20 transition-all font-bold uppercase flex items-center gap-1"
                                    >
                                        <FiPlus size={10} /> Novo Cliente
                                    </button>
                                    <button
                                        onClick={saveToCrm}
                                        className="text-[9px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded border border-amber-500/20 transition-all font-bold uppercase"
                                    >
                                        Sincronizar CRM
                                    </button>
                                </div>
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
                                <div className="flex items-center gap-3">
                                    <label className="text-[10px] text-green-400 uppercase tracking-widest font-bold flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                                        Morada de Entrega / Descarga
                                    </label>
                                    {savedAddresses.length > 0 && (
                                        <select
                                            className="text-[9px] bg-white/5 border border-white/10 text-gray-300 rounded px-2 outline-none focus:border-green-500 max-w-[120px]"
                                            onChange={e => {
                                                if (e.target.value) {
                                                    updateMetadata('shipping_address', e.target.value);
                                                    updateMetadata('shipping_is_billing', false);
                                                }
                                            }}
                                            value=""
                                        >
                                            <option value="">Locais Salvos...</option>
                                            {savedAddresses.map(a => (
                                                <option key={a.id} value={a.address}>{a.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
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

            {showNewCustomer && (
                <CustomerModal
                    project={proposal.project_ref || 'default'}
                    customer={null}
                    onClose={() => setShowNewCustomer(false)}
                    onSave={(c) => {
                        selectCustomer(c);
                        setShowNewCustomer(false);
                    }}
                />
            )}
        </div>
    );
};

const PackagingCostsCard = ({ costs, updateCost, onAdd, onRemove, totals }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const enabledCostsCount = costs.filter(c => c.enabled).length;

    return (
        <>
            <div 
                className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-2 mb-6 hover:bg-white/10 transition-all cursor-pointer group"
                onClick={() => setIsModalOpen(true)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 group-hover:bg-amber-500/20 transition-all">
                        <FiSettings size={14} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Custos de Embalagem</div>
                        <div className="text-xs text-white font-bold">{enabledCostsCount} {enabledCostsCount === 1 ? 'custo ativo' : 'custos ativos'}</div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Sub-Total:</div>
                        <div className="text-sm font-black text-amber-500 font-mono">{totals.packagingTotal.toFixed(2)} €</div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg text-gray-400 group-hover:text-white transition-colors">
                        <FiPlus size={14} />
                    </div>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div 
                        className="absolute inset-0 bg-black/80 backdrop-blur-md"
                        onClick={() => setIsModalOpen(false)}
                    />
                    
                    <GlassCard className="w-full max-w-2xl relative z-10 border-amber-500/20 shadow-2xl overflow-hidden">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-amber-500/5">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500">
                                    <FiSettings size={24} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-white uppercase tracking-tighter">Configuração de Embalagem</h2>
                                    <p className="text-xs text-amber-500/60 font-medium">Gestão de custos logísticos e manuseamento</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all"
                            >
                                <FiX size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                            {costs.length === 0 ? (
                                <div 
                                    className="py-12 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-white/5 transition-all group"
                                    onClick={onAdd}
                                >
                                    <div className="p-4 bg-white/5 rounded-full text-gray-600 group-hover:text-amber-500 transition-all group-hover:scale-110">
                                        <FiPlus size={32} />
                                    </div>
                                    <span className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em]">Adicionar primeiro custo</span>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {costs.map((cost, idx) => (
                                        <div key={idx} className="bg-white/5 p-4 rounded-xl border border-white/5 hover:border-amber-500/30 transition-all">
                                            <div className="flex items-start gap-4">
                                                <div className="pt-1">
                                                    <input 
                                                        type="checkbox"
                                                        checked={cost.enabled}
                                                        onChange={e => updateCost(idx, 'enabled', e.target.checked)}
                                                        className="accent-amber-500 w-5 h-5 rounded cursor-pointer"
                                                    />
                                                </div>
                                                
                                                <div className="flex-1 grid grid-cols-12 gap-4">
                                                    <div className="col-span-5">
                                                        <label className="text-[9px] text-gray-500 uppercase font-black block mb-1 tracking-widest pl-1">Identificação / Marca</label>
                                                        <input 
                                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all font-medium"
                                                            placeholder="Ex: Scarabeo (3%)"
                                                            value={cost.description}
                                                            onChange={e => updateCost(idx, 'description', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="col-span-3">
                                                        <label className="text-[9px] text-gray-500 uppercase font-black block mb-1 tracking-widest pl-1">Tipo</label>
                                                        <select 
                                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all font-medium"
                                                            value={cost.type}
                                                            onChange={e => updateCost(idx, 'type', e.target.value)}
                                                        >
                                                            <option value="percent">Percentagem (%)</option>
                                                            <option value="fixed">Valor Fixo (€)</option>
                                                        </select>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="text-[9px] text-gray-500 uppercase font-black block mb-1 tracking-widest pl-1">Valor</label>
                                                        <input 
                                                            type="number"
                                                            step="0.01"
                                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all font-mono font-medium"
                                                            value={cost.value}
                                                            onChange={e => updateCost(idx, 'value', parseFloat(e.target.value) || 0)}
                                                        />
                                                    </div>
                                                    <div className="col-span-2 flex items-end">
                                                        <button 
                                                            onClick={() => onRemove(idx)}
                                                            className="w-full p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all flex items-center justify-center"
                                                            title="Remover Custo"
                                                        >
                                                            <FiTrash2 size={16} />
                                                        </button>
                                                    </div>

                                                    {cost.type === 'percent' && (
                                                        <div className="col-span-12 mt-2 pt-2 border-t border-white/5">
                                                            <div className="flex items-center gap-4">
                                                                <span className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Base de Cálculo:</span>
                                                                <div className="flex gap-2">
                                                                    {['liquid', 'before_shipping'].map((b) => (
                                                                        <button
                                                                            key={b}
                                                                            onClick={() => updateCost(idx, 'base', b)}
                                                                            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase transition-all ${
                                                                                cost.base === b 
                                                                                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' 
                                                                                : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/10'
                                                                            }`}
                                                                        >
                                                                            {b === 'liquid' ? 'Líquido' : 'Líquido + Portes'}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 border-t border-white/5 bg-black/20 flex items-center justify-between">
                            <button 
                                onClick={onAdd}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black rounded-xl text-xs font-black uppercase tracking-tighter hover:bg-amber-400 transition-all active:scale-95"
                            >
                                <FiPlus size={16} /> Adicionar Novo Custo
                            </button>
                            
                            <div className="text-right">
                                <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Total Embalagem</div>
                                <div className="text-2xl font-black text-white font-mono tracking-tighter">
                                    {totals.packagingTotal.toFixed(2)} <span className="text-amber-500 text-sm">€</span>
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                </div>
            )}
        </>
    );
};

export default ProposalEditor;
