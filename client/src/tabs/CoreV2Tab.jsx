import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import { useExplorer } from '../hooks/useExplorer';
import { GlassCard } from '../components/ui/GlassCard';
import { LinkDocsModal } from '../components/modals/LinkDocsModal';
import ProjectSelectorModal from '../components/dossiers/ProjectSelectorModal';
import { getViewer } from '../components/viewers/ViewerRegistry';
import { BackupDataViewer } from '../components/viewers/BackupDataViewer'; // Phase 20
import ProposalEditor from '../components/proposals/ProposalEditor'; // Phase 32
import api from '../api/apiClient';
import { qp } from '../shared/ui';
import { createPortal } from 'react-dom';

// -- ICONS --
const IconArchive = () => <span>🗃️</span>;
const IconUnarchive = () => <span>🔼</span>;
const IconLink = () => <span>🔗</span>;
const IconFolder = () => <span>📁</span>; // New
const IconTrash = () => <span>🗑️</span>;
const IconEye = () => <span>👁️</span>;

export default function CoreV2Tab({ project, setEditingProposalId }) {
    const { t } = useTranslation();
    const {
        docs, loading, filters, setFilters, updateDoc,
        subProjects, categories, reload
    } = useExplorer(project, { status: 'processado' });

    // -- State --
    const [editingCell, setEditingCell] = useState(null); // { id, field }
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [viewPdfUrl, setViewPdfUrl] = useState(null);
    const [viewDoc, setViewDoc] = useState(null); // New State for Enhanced Viewer
    const [viewAuditDoc, setViewAuditDoc] = useState(null);
    const [viewLinksDoc, setViewLinksDoc] = useState(null); // Doc to show links for
    const [docLinksData, setDocLinksData] = useState([]); // Loaded links
    const [viewProposalsDoc, setViewProposalsDoc] = useState(null);
    const [viewBackupsDoc, setViewBackupsDoc] = useState(null); // Doc to show backups for
    const [backupsData, setBackupsData] = useState([]); // Loaded backups
    const [previewBackupData, setPreviewBackupData] = useState(null); // Snapshot to show in preview modal (Phase 20)
    const [previewBackupId, setPreviewBackupId] = useState(null); // Phase 31: Track specific backup ID being previewed

    // --- Persisted View Settings ---
    const getStored = (key, fallback) => {
        try {
            const val = localStorage.getItem(`corev2_view_${project}_${key}`);
            return val ? JSON.parse(val) : fallback;
        } catch (e) { return fallback; }
    };

    const initialOrder = [
        'archived', 'docType', 'docNumber', 'date', 'supplier', 'customer', 'shipTo', 'total',
        'sub_project_id', 'category_id', 'scope', 'links'
    ];

    const [columnOrder, setColumnOrder] = useState(() => getStored('colOrder', initialOrder));
    const [visibleCols, setVisibleCols] = useState(() => new Set(getStored('visibleCols', initialOrder)));
    
    // Flexible Grouping System
    const [groupList, setGroupList] = useState(() => getStored('groupList', [
        { id: 'g1', label: 'Proformas & Encomendas Em Curso', filters: [{ field: 'docType', values: ['proforma', 'c_pedido'] }] }
    ]));
    const [catchAllLabel, setCatchAllLabel] = useState(() => getStored('catchAllLabel', 'Restantes Documentos (Faturas, Recibos, Etc)'));
    const [vistas, setVistas] = useState(() => getStored('vistas', []));
    const [currentVista, setCurrentVista] = useState(null);

    const [colManagerOpen, setColManagerOpen] = useState(false);
    const [draggedCol, setDraggedCol] = useState(null);

    // Save settings when they change
    useEffect(() => {
        localStorage.setItem(`corev2_view_${project}_colOrder`, JSON.stringify(columnOrder));
        localStorage.setItem(`corev2_view_${project}_visibleCols`, JSON.stringify(Array.from(visibleCols)));
        localStorage.setItem(`corev2_view_${project}_groupList`, JSON.stringify(groupList));
        localStorage.setItem(`corev2_view_${project}_catchAllLabel`, JSON.stringify(catchAllLabel));
        localStorage.setItem(`corev2_view_${project}_vistas`, JSON.stringify(vistas));
    }, [columnOrder, visibleCols, groupList, catchAllLabel, vistas, project]);

    const handleSaveVista = (name) => {
        if (!name) return;
        const newVista = {
            id: Date.now().toString(),
            name,
            columnOrder,
            visibleCols: Array.from(visibleCols),
            groupList,
            catchAllLabel
        };
        setVistas(prev => [...prev.filter(v => v.name !== name), newVista]);
    };

    const handleLoadVista = (view) => {
        setColumnOrder(view.columnOrder);
        setVisibleCols(new Set(view.visibleCols));
        if (view.groupList) setGroupList([...view.groupList]); // Force new array for reactivity
        if (view.catchAllLabel) setCatchAllLabel(view.catchAllLabel);
        setCurrentVista(view.name);
    };

    const handleDeleteVista = (id) => {
        setVistas(prev => prev.filter(v => v.id !== id));
        if (currentVista === vistas.find(v => v.id === id)?.name) setCurrentVista(null);
    };

    // Link Modal
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [linkStartDocs, setLinkStartDocs] = useState([]);

    // Project Selector
    const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);

    // Proposal Studio (Phase 32)
    // const [editingProposalId, setEditingProposalId] = useState(null); // Removed local state

    // -- Drag & Drop Upload --
    const onDrop = useCallback(async (acceptedFiles) => {
        if (!acceptedFiles.length) return;
        const formData = new FormData();
        acceptedFiles.forEach(f => formData.append('files', f));

        try {
            await api.post(qp('/api/extract', project), formData);
            alert(`Uploaded ${acceptedFiles.length} files. Review in Process tab.`);
        } catch (e) {
            alert("Upload failed: " + e.message);
        }
    }, [project]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        noClick: true // Don't trigger upload on click grid, only drag
    });


    // -- Handlers --
    const handleLinkClick = (docsToLink) => {
        setLinkStartDocs(docsToLink);
        setLinkModalOpen(true);
    };

    const handleLinkConfirm = async (ids) => {
        try {
            await api.post('/api/explorer/links', { docIds: ids });
            setLinkModalOpen(false);
            setSelectedIds(new Set());
            reload();
        } catch (e) {
            alert("Link failed");
        }
    };

    const handleUnlink = async (linkDoc) => {
        if (!confirm("Unlink this document?")) return;
        try {
            await api.delete(`/api/explorer/links/${linkDoc.id}?groupId=${linkDoc.group_id}`);
            setDocLinksData(prev => prev.filter(d => d.id !== linkDoc.id));
            reload();
        } catch (e) { alert("Unlink failed"); }
    };

    const handleBulkArchive = async (archive) => {
        if (!confirm(`${archive ? 'Archive' : 'Restore'} ${selectedIds.size} docs?`)) return;
        try {
            const promises = Array.from(selectedIds).map(id => updateDoc(id, { archived: archive }));
            await Promise.all(promises);
            setSelectedIds(new Set());
            reload();
        } catch (e) { alert("Action failed"); }
    };

    const handleAssignProject = async (node) => {
        try {
            // Logic: For each selected doc, we want to PUT to /dossiers/nodes/NODEID/docs
            // But Phase 3 API `PUT /nodes/:id/docs` replaces *ALL* docs for that node.
            // If we want to ADD docs to a node, we must:
            // 1. Get current docs of node.
            // 2. Add selected docs.
            // 3. PUT.
            // Warning: Concurrency issue if multiple users. But acceptable for now.

            const currentDocs = (await api.get(`/api/dossiers/nodes/${node.id}/docs`)).data;
            const currentIds = currentDocs.map(d => d.id);
            const newIds = Array.from(selectedIds);

            // Merge unique
            const finalIds = [...new Set([...currentIds, ...newIds])];

            await api.put(`/api/dossiers/nodes/${node.id}/docs`, { docIds: finalIds });

            setProjectSelectorOpen(false);
            setSelectedIds(new Set());
            alert(`Documentos atribuídos a: ${node.name}`);
            reload(); // To update view if we show project column
        } catch (e) {
            console.error(e);
            alert("Falha ao atribuir projeto: " + e.message);
        }
    };


    // -- Metadata Discovery --
    const getAvailableMetadata = useCallback(() => {
        const types = new Set();
        const suppliers = new Set();
        const customers = new Set();
        docs.forEach(d => {
            if (d.docType) types.add(d.docType);
            if (d.supplier) suppliers.add(d.supplier);
            if (d.customer) customers.add(d.customer);
        });
        return {
            types: Array.from(types).sort(),
            suppliers: Array.from(suppliers).sort(),
            customers: Array.from(customers).sort()
        };
    }, [docs]);
    const handleBulkDelete = async () => {
        if (!confirm(`Tem a certeza que quer APAGAR ${selectedIds.size} documentos?\nEsta ação é irreversível.`)) return;
        try {
            await api.post('/api/explorer/docs/bulk-delete', { docIds: Array.from(selectedIds) });
            setSelectedIds(new Set());
            reload();
        } catch (e) { alert("Erro ao apagar: " + (e.response?.data?.error || e.message)); }
    };

    const handleEdit = (id, field) => {
        setEditingCell({ id, field });
    };

    const handleSave = async (id, field, value) => {
        setEditingCell(null);
        if (value === undefined) return;
        try {
            await updateDoc(id, { [field]: value });
        } catch (e) {
            alert("Failed to save");
            reload();
        }
    };

    const handleKeyDown = (e, id, field, value) => {
        if (e.key === 'Enter') handleSave(id, field, value);
        if (e.key === 'Escape') setEditingCell(null);
    };

    const handleDragStart = (e, colKey) => {
        setDraggedCol(colKey);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, colKey) => {
        e.preventDefault();
        if (draggedCol === colKey) return;
    };

    const handleDrop = (e, targetKey) => {
        e.preventDefault();
        if (!draggedCol || draggedCol === targetKey) return;

        const newOrder = [...columnOrder];
        const oldIdx = newOrder.indexOf(draggedCol);
        const newIdx = newOrder.indexOf(targetKey);

        if (oldIdx !== -1 && newIdx !== -1) {
            newOrder.splice(oldIdx, 1);
            newOrder.splice(newIdx, 0, draggedCol);
            setColumnOrder(newOrder);
        }
        setDraggedCol(null);
    };

    const viewRowPdf = (row) => {
        // Switcher Logic: Check if we have a specialized viewer
        if (getViewer(row)) {
            setViewDoc(row);
            return;
        }

        // Default Legacy Viewer
        api.get(qp(`/api/corev2/docs/${row.id}/view`, project), { responseType: 'blob' })
            .then(res => {
                const url = URL.createObjectURL(res.data);
                setViewPdfUrl(url);
            })
            .catch(e => alert("Error opening PDF: " + e.message));
    };

    // ...



    const deleteRow = async (id) => {
        if (!confirm("Delete this document?")) return;
        try {
            await api.delete(qp(`/api/corev2/docs/${id}`, project));
            reload();
        } catch (e) { alert(e.message); }
    };

    // Load links for popover
    useEffect(() => {
        if (viewLinksDoc) {
            api.get(qp(`/api/explorer/links/${viewLinksDoc.id}`, project))
                .then(res => setDocLinksData(res.data))
                .catch(e => console.error(e));
        }
    }, [viewLinksDoc, project]);

    // Load backups for popover
    useEffect(() => {
        if (viewBackupsDoc) {
            api.get(qp(`/api/corev2/docs/${viewBackupsDoc.id}/backups`, project))
                .then(res => setBackupsData(res.data.backups))
                .catch(e => console.error(e));
        }
    }, [viewBackupsDoc, project]);

    const handleRestore = async (backupId) => {
        if (!confirm("Restaurar esta versão? A versão atual será movida para backup e esta passará a ser a única ativa.")) return;
        try {
            await api.post(qp(`/api/corev2/backups/${backupId}/restore`, project));
            setViewBackupsDoc(null);
            setPreviewBackupData(null); // Close preview if open
            alert("Restauro concluído com sucesso.");
            reload();
        } catch (e) {
            alert("Erro ao restaurar: " + e.message);
        }
    };

    const handleViewBackup = async (backupId) => {
        try {
            const res = await api.get(qp(`/api/corev2/backups/${backupId}/data`, project));
            setPreviewBackupData(res.data.snapshot);
            setPreviewBackupId(backupId); // Phase 31
            setViewBackupsDoc(null);      // Phase 31: Close the history list modal
        } catch (e) {
            alert("Erro ao carregar dados do backup: " + e.message);
        }
    };

    const handleDeleteBackup = async (backupId) => {
        if (!confirm("Apagar este backup definitivamente?")) return;
        try {
            await api.delete(qp(`/api/corev2/backups/${backupId}`, project));
            setBackupsData(prev => prev.filter(b => b.id !== backupId));
        } catch (e) {
            alert("Erro ao apagar backup: " + e.message);
        }
    };

    const handleCreateProposal = async (row) => {
        if (!confirm(`Deseja criar uma proposta personalizada com base no documento ${row.docNumber}?`)) return;
        try {
            const res = await api.post(qp('/api/proposals/clone', project), { docId: row.id });
            alert("Proposta criada com sucesso! A abrir editor...");
            setEditingProposalId(res.data.proposalId);
        } catch (e) {
            alert("Erro ao criar proposta: " + (e.response?.data?.error || e.message));
        }
    };

    const handleCloneToProposal = async (doc) => {
        if (!confirm(`Deseja criar uma nova proposta com base no documento ${doc.docNumber}?`)) return;
        try {
            const res = await api.post(qp('/api/proposals/clone', project), { docId: doc.id });
            alert("Proposta criada com sucesso! A abrir editor...");
            setEditingProposalId(res.data.proposalId);
        } catch (e) {
            alert("Erro ao criar proposta: " + (e.response?.data?.error || e.message));
        }
    };


    // Columns Def 
    const COLUMNS_DEF = [
        { key: 'archived', label: 'Status', width: 80, render: (r) => r.archived ? <span className="text-[var(--text-muted)] text-xs font-bold bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">Archived</span> : <span className="text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30 px-2 py-1 rounded text-xs font-bold">Active</span> },
        {
            key: 'docType', label: 'Type', width: 120,
            editable: true, type: 'select', options: ['fatura', 'recibo', 'nota_credito', 'guia_remessa', 'proforma', 'c_pedido', 'other']
        },
        { key: 'docNumber', label: 'Doc #', width: 120, editable: true },
        { key: 'date', label: 'Date', width: 100, editable: true, type: 'date' },
        { key: 'supplier', label: 'Entity', width: 200, editable: true },
        { key: 'customer', label: 'Cliente', width: 200, editable: true },
        {
            key: 'shipTo',
            label: 'Entrega',
            width: 200,
            render: (r) => {
                const isProforma = (r.docType || '').toLowerCase().includes('proforma') || (r.docType || '').toLowerCase().includes('c_pedido');
                if (isProforma) {
                    const avgProgress = r.associatedProposals?.length > 0
                        ? Math.round(r.associatedProposals.reduce((sum, p) => sum + (p.progress || 0), 0) / r.associatedProposals.length)
                        : 0;
                    return (
                        <div className="w-full flex items-center pr-4">
                            <span className={`text-[10px] font-black w-8 text-right mr-2 ${avgProgress >= 100 ? 'text-green-500' : 'text-gray-400'}`}>{avgProgress}%</span>
                            <div className="flex-1 h-1.5 bg-[#333] rounded-full overflow-hidden" title={`${avgProgress}% Faturado / Expedido`}>
                                <div className={`h-full transition-all duration-500 ease-out ${avgProgress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${avgProgress}%` }}></div>
                            </div>
                        </div>
                    );
                }
                return r.entities?.shipTo?.name || r.shipTo?.name || '-';
            }
        },
        // RIGHT ALIGN TOTAL
        { key: 'total', label: 'Total', width: 100, editable: true, align: 'right', format: (v) => v ? `${parseFloat(parseFloat(v) || 0).toFixed(2)} €` : '-' },
        {
            key: 'sub_project_id', label: 'Sub-Project', width: 150,
            editable: true, type: 'lookup', options: subProjects
        },
        {
            key: 'category_id', label: 'Category', width: 150,
            editable: true, type: 'lookup', options: categories
        },
        {
            key: 'associatedProposals', label: 'Propostas', width: 90, type: 'custom', render: (r) => (
                r.associatedProposals?.length > 0 ? (
                    <button
                        className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400 hover:scale-110 transition-transform cursor-pointer px-2 py-0.5 rounded text-[10px] font-black flex items-center gap-1 border border-amber-500/20"
                        onClick={(e) => { e.stopPropagation(); setViewProposalsDoc(r); }}
                    >
                        📄 {r.associatedProposals.length}
                    </button>
                ) : <span className="opacity-10">-</span>
            )
        },
        {
            key: 'links', label: 'Links', width: 80, type: 'custom', render: (r) => {
                const totalLinks = r.totalRelatedCount || 0;
                return (
                    <button 
                        className={`badge transition-all cursor-pointer px-2 py-0.5 rounded text-[10px] font-black flex items-center gap-1 border ${
                            totalLinks > 0 
                            ? 'bg-blue-500/10 text-blue-400 dark:bg-blue-900/40 dark:text-blue-300 border-blue-500/20 shadow-lg shadow-blue-500/10 hover:scale-110' 
                            : 'bg-gray-500/5 text-gray-500/30 border-gray-500/10 hover:bg-gray-500/20 hover:text-gray-400'
                        }`} 
                        onClick={(e) => { e.stopPropagation(); setViewLinksDoc(r); }}
                    >
                        <IconLink /> {totalLinks > 0 ? totalLinks : ''}
                    </button>
                );
            }
        },
        { key: 'actions', label: 'Actions', width: 140, type: 'action' }
    ];

    // Columns Def moved above or kept as is if it's static

    // -- Renderers --
    const renderCell = (row, col) => {
        const isEditing = editingCell?.id === row.id && editingCell?.field === col.key;
        const val = row[col.key];

        if (isEditing) {
            if (col.type === 'select' || col.type === 'lookup') {
                const opts = col.type === 'lookup' ? col.options : col.options.map(o => ({ id: o, name: o }));
                return (
                    <select
                        autoFocus
                        defaultValue={val || ''}
                        onBlur={(e) => handleSave(row.id, col.key, e.target.value)}
                        className="w-full bg-[var(--bg-base)] border border-[var(--accent-primary)] outline-none rounded p-1 text-xs"
                    >
                        <option value="">-</option>
                        {opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                )
            }
            if (col.type === 'date') {
                return (
                    <input
                        type="date"
                        autoFocus
                        defaultValue={val ? val.substring(0, 10) : ''}
                        onBlur={(e) => handleSave(row.id, col.key, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, row.id, col.key, e.target.value)}
                        className="w-full bg-[var(--bg-base)] border border-[var(--accent-primary)] outline-none rounded p-1 text-xs"
                    />
                )
            }
            return (
                <input
                    autoFocus
                    defaultValue={val}
                    onBlur={(e) => handleSave(row.id, col.key, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, row.id, col.key, e.target.value)}
                    className="w-full bg-[var(--bg-base)] border border-[var(--accent-primary)] outline-none rounded p-1 text-xs text-right"
                />
            )
        }

        if (col.render) return col.render(row);
        if (col.type === 'lookup') {
            const item = col.options.find(o => o.id === val);
            return <span className="truncate block" title={item?.name}>{item ? item.name : '-'}</span>;
        }

        const content = col.format ? col.format(val) : (val || '-');

        return (
            <div
                onClick={() => col.editable && handleEdit(row.id, col.key)}
                className={`w-full h-full min-h-[20px] cursor-pointer flex items-center ${col.align === 'right' ? 'justify-end' : ''} ${!val ? 'opacity-20 hover:opacity-100' : ''}`}
            >
                {content}
            </div>
        );
    };

    const renderLayoutManager = () => {
        if (!colManagerOpen) return null;
        const { types, suppliers, customers } = getAvailableMetadata();

        const addGroup = () => {
            const newGroup = {
                id: Date.now().toString(),
                label: 'Novo Grupo',
                filters: [{ field: 'docType', values: [] }]
            };
            setGroupList([...groupList, newGroup]);
        };

        const removeGroup = (id) => {
            setGroupList(groupList.filter(g => g.id !== id));
        };

        const updateGroup = (id, updates) => {
            setGroupList(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
        };

        const addFilter = (groupId) => {
            const group = groupList.find(g => g.id === groupId);
            updateGroup(groupId, { filters: [...group.filters, { field: 'supplier', values: [] }] });
        };

        const removeFilter = (groupId, filterIdx) => {
            setGroupList(prev => prev.map(g => {
                if (g.id !== groupId) return g;
                const nextFilters = [...g.filters];
                nextFilters.splice(filterIdx, 1);
                return { ...g, filters: nextFilters };
            }));
        };

        const toggleFilterValue = (groupId, filterIdx, value) => {
            setGroupList(prev => prev.map(g => {
                if (g.id !== groupId) return g;
                const filter = g.filters[filterIdx];
                const nextValues = filter.values.includes(value)
                    ? filter.values.filter(v => v !== value)
                    : [...filter.values, value];
                
                const nextFilters = [...g.filters];
                nextFilters[filterIdx] = { ...filter, values: nextValues };
                return { ...g, filters: nextFilters };
            }));
        };

        return createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-end p-6 pointer-events-none">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setColManagerOpen(false)}></div>
                <div className="w-[500px] h-full max-h-[90vh] bg-[#0c1015] border border-white/10 rounded-2xl shadow-2xl flex flex-col p-6 animate-in slide-in-from-right-8 pointer-events-auto relative overflow-hidden ring-1 ring-white/5">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex flex-col">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00E5FF]">Personalizar Vista</h3>
                            <span className="text-[9px] opacity-40 uppercase tracking-widest font-bold">Configuração de Grupos e Colunas</span>
                        </div>
                        <button onClick={() => setColManagerOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors text-white/40 hover:text-white">✕</button>
                    </div>

                    <div className="flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar flex-1">
                        {/* 1. Saved Views */}
                        <section>
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-[10px] font-black uppercase tracking-tighter opacity-50">Vistas Salvas</h4>
                                <button 
                                    className="bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/20 rounded px-2 py-1 text-[9px] font-black uppercase tracking-widest hover:bg-[#00E5FF] hover:text-black transition-all"
                                    onClick={() => {
                                        const name = prompt("Nome da Vista:");
                                        if (name) handleSaveVista(name);
                                    }}
                                >
                                    + Guardar como Vista
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {vistas.map(v => (
                                    <div key={v.id} className="flex items-center bg-white/5 border border-white/5 rounded-lg overflow-hidden group hover:border-white/20 transition-all">
                                        <button 
                                            className={`px-3 py-1.5 text-[10px] font-bold transition-colors ${currentVista === v.name ? 'bg-[#00E5FF] text-black' : 'hover:bg-white/5 text-white/70'}`}
                                            onClick={() => handleLoadVista(v)}
                                        >
                                            {v.name}
                                        </button>
                                        <button 
                                            className="px-2 py-1.5 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 border-l border-white/5 transition-all"
                                            onClick={() => handleDeleteVista(v.id)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <div className="h-px bg-white/5"></div>

                        {/* 2. Advanced Document Grouping */}
                        <section>
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-[10px] font-black uppercase tracking-tighter text-[#FFB300]">Agrupamento Dinâmico</h4>
                                <button className="text-[9px] font-black uppercase text-white/40 hover:text-white transition-colors" onClick={addGroup}>+ Novo Grupo</button>
                            </div>

                            <div className="flex flex-col gap-4">
                                {groupList.map((g, grpIdx) => (
                                    <div key={g.id} className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-4 group/box relative">
                                        <button className="absolute top-2 right-2 text-white/20 hover:text-red-500 transition-colors" onClick={() => removeGroup(g.id)}>✕</button>
                                        
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[8px] font-black uppercase tracking-widest text-[#FFB300]/60">Nome do Grupo</label>
                                            <input 
                                                className="bg-black/40 border border-white/10 rounded px-3 py-2 text-xs font-bold focus:border-[#FFB300]/50 outline-none transition-all"
                                                value={g.label}
                                                onChange={e => updateGroup(g.id, { label: e.target.value })}
                                            />
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            {g.filters.map((f, fIdx) => (
                                                <div key={fIdx} className="bg-black/20 p-3 rounded-lg border border-white/5 flex flex-col gap-3">
                                                    <div className="flex justify-between items-center">
                                                        <select 
                                                            className="bg-transparent text-[9px] font-black uppercase tracking-widest text-white/40 outline-none"
                                                            value={f.field}
                                                            onChange={e => {
                                                                const next = [...g.filters];
                                                                next[fIdx] = { ...f, field: e.target.value, values: [] };
                                                                updateGroup(g.id, { filters: next });
                                                            }}
                                                        >
                                                            <option value="docType">TIPO DE DOCUMENTO</option>
                                                            <option value="supplier">MARCA / ENTIDADE</option>
                                                            <option value="customer">CLIENTE / ENTIDADE</option>
                                                        </select>
                                                        <button className="text-[10px] text-white/20 hover:text-red-400" onClick={() => removeFilter(g.id, fIdx)}>Apagar Filtro</button>
                                                    </div>

                                                    <div className="flex flex-wrap gap-1">
                                                        {(f.field === 'docType' ? types : f.field === 'supplier' ? suppliers : customers).map(val => (
                                                            <button 
                                                                key={val}
                                                                className={`px-2 py-1 rounded text-[8px] font-bold uppercase tracking-tighter transition-all border ${f.values.includes(val) ? 'bg-[#00E5FF]/20 border-[#00E5FF]/40 text-[#00E5FF]' : 'bg-white/5 border-white/5 text-white/20 hover:text-white/40'}`}
                                                                onClick={() => toggleFilterValue(g.id, fIdx, val)}
                                                            >
                                                                {val}
                                                            </button>
                                                        ))}
                                                        { (f.field === 'docType' ? types : f.field === 'supplier' ? suppliers : customers).length === 0 && <span className="text-[9px] opacity-20 italic">Sem dados disponíveis...</span>}
                                                    </div>
                                                </div>
                                            ))}
                                            <button className="text-[9px] font-bold text-white/20 hover:text-white/60 transition-colors py-1 border border-dashed border-white/5 rounded" onClick={() => addFilter(g.id)}>+ Adicionar Condição</button>
                                        </div>
                                    </div>
                                ))}

                                {/* Catch-all edit */}
                                <div className="p-4 border border-dashed border-white/10 rounded-xl flex flex-col gap-1">
                                    <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Grupo Final (Outros)</label>
                                    <input 
                                        className="bg-transparent border-0 p-0 text-xs font-bold text-white/40 focus:text-white transition-all outline-none"
                                        value={catchAllLabel}
                                        onChange={e => setCatchAllLabel(e.target.value)}
                                    />
                                </div>
                            </div>
                        </section>

                        <div className="h-px bg-white/5"></div>

                        {/* 3. Columns Visibility */}
                        <section className="flex-1">
                            <h4 className="text-[10px] font-black uppercase tracking-tighter text-[#00C853] mb-4">Colunas Visíveis</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {COLUMNS_DEF.filter(c => c.key !== 'actions').map(c => (
                                    <label key={c.key} className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group/col ${visibleCols.has(c.key) ? 'bg-[#00C853]/5 border-[#00C853]/20 text-white' : 'bg-white/5 border-white/5 text-white/20 hover:border-white/10'}`}>
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${visibleCols.has(c.key) ? 'bg-[#00C853] border-[#00C853]' : 'border-white/20'}`}>
                                            {visibleCols.has(c.key) && <span className="text-[10px] text-black font-black">✓</span>}
                                        </div>
                                        <span className="text-[9px] font-black uppercase tracking-widest truncate">{c.label}</span>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={visibleCols.has(c.key)}
                                            onChange={() => {
                                                const next = new Set(visibleCols);
                                                visibleCols.has(c.key) ? next.delete(c.key) : next.add(c.key);
                                                setVisibleCols(next);
                                            }}
                                        />
                                    </label>
                                ))}
                            </div>
                        </section>
                    </div>

                    <div className="pt-6 mt-4 border-t border-white/10 flex flex-col gap-4">
                        <button className="text-[9px] font-bold text-white/20 hover:text-white uppercase tracking-widest self-start" onClick={() => {
                            if(confirm("Deseja repor as definições originais?")) {
                                setColumnOrder(initialOrder);
                                setVisibleCols(new Set(initialOrder));
                                setGroupList([{ id: 'g1', label: 'Proformas & Encomendas Em Curso', filters: [{ field: 'docType', values: ['proforma', 'c_pedido'] }] }]);
                                setCatchAllLabel('Restantes Documentos (Faturas, Recibos, Etc)');
                                setCurrentVista(null);
                            }
                        }}>Repor Predefinições</button>
                        
                        <button 
                            className="btn primary py-4 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-[#00E5FF]/10 text-xs"
                            onClick={() => setColManagerOpen(false)}
                        >
                            Concluir Personalização
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );
    };

    const activeColumns = columnOrder
        .filter(key => visibleCols.has(key))
        .map(key => COLUMNS_DEF.find(c => c.key === key))
        .filter(Boolean);

    return (
        <div className="flex flex-col gap-4 h-[calc(100vh-100px)] fade-in relative" {...getRootProps()}>
            {/* Drop Overlay */}
            {isDragActive && (
                <div className="absolute inset-0 z-50 bg-[var(--accent-primary)]/10 border-2 border-[var(--accent-primary)] border-dashed rounded-xl flex items-center justify-center pointer-events-none">
                    <div className="text-xl font-bold bg-[var(--bg-base)] p-4 rounded shadow">Drop PDF to Upload</div>
                </div>
            )}
            <input {...getInputProps()} />

            {/* Header / Filters */}
            <GlassCard className="p-4 flex flex-col gap-4 relative z-20">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold">Explorer</h2>
                        {/* Default Search */}
                        <input
                            className="input-sm w-48"
                            placeholder="Search..."
                            value={filters.q || ''}
                            onChange={e => setFilters({ ...filters, q: e.target.value })}
                        />
                        {/* Selection Actions */}
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] px-3 py-1 rounded-full border border-[var(--accent-primary)]/20">
                                <span className="font-bold">{selectedIds.size} selected</span>
                                <div className="h-4 w-px bg-current opacity-20 mx-2"></div>
                                <button className="btn-xs hover:underline flex items-center gap-1" onClick={() => setProjectSelectorOpen(true)}>
                                    <IconFolder /> Atribuir Projeto
                                </button>
                                <button className="btn-xs hover:underline" onClick={() => handleLinkClick(docs.filter(d => selectedIds.has(d.id)))}>Link</button>
                                <button className="btn-xs hover:underline" onClick={() => handleBulkArchive(true)}>Archive</button>
                                <button className="btn-xs hover:underline" onClick={() => handleBulkArchive(false)}>Restore</button>
                                <div className="h-3 w-px bg-current opacity-20 mx-1"></div>
                                <button className="btn-xs hover:underline text-red-500 font-bold flex items-center gap-1" onClick={handleBulkDelete}>
                                    <IconTrash /> Apagar
                                </button>
                                <button className="btn-xs hover:underline opacity-50 ml-2" onClick={() => setSelectedIds(new Set())}>Cancel</button>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 relative">
                        <button className="btn" onClick={reload}>Refresh</button>
                        <button className={`btn transition-all ${colManagerOpen ? 'primary scale-105 shadow-lg' : 'hover:scale-105'}`} onClick={() => setColManagerOpen(!colManagerOpen)}>
                            {currentVista ? `Vista: ${currentVista}` : 'Layout'}
                        </button>
                        {renderLayoutManager()}
                    </div>
                </div>

                {/* Advanced Filters Row */}
                <div className="flex flex-wrap gap-2 items-center text-sm border-t border-white/5 pt-4">
                    <select
                        className="input-sm w-32"
                        value={filters.archived || 'false'}
                        onChange={e => setFilters({ ...filters, archived: e.target.value })}
                    >
                        <option value="false">Active Only</option>
                        <option value="true">Archived</option>
                        <option value="all">All Status</option>
                    </select>

                    <input type="text" placeholder="Start Date" onFocus={e => e.target.type = 'date'} onBlur={e => e.target.type = 'text'}
                        className="input-sm w-32" onChange={e => setFilters({ ...filters, dateStart: e.target.value })} />
                    <input type="text" placeholder="End Date" onFocus={e => e.target.type = 'date'} onBlur={e => e.target.type = 'text'}
                        className="input-sm w-32" onChange={e => setFilters({ ...filters, dateEnd: e.target.value })} />

                    <input
                        className="input-sm w-32"
                        placeholder="Supplier..."
                        onChange={e => setFilters({ ...filters, supplier: e.target.value })}
                    />

                    <select
                        className="input-sm w-32"
                        onChange={e => setFilters({ ...filters, docType: e.target.value })}
                    >
                        <option value="">Any Type</option>
                        <option value="fatura">Fatura</option>
                        <option value="recibo">Recibo</option>
                        <option value="nota_credito">Nota Credito</option>
                        <option value="guia_remessa">Guia Remessa</option>
                        <option value="proforma">Proforma</option>
                        <option value="c_pedido">C. Pedido</option>
                    </select>

                    <select
                        className="input-sm w-32"
                        onChange={e => setFilters({ ...filters, hasLinks: e.target.value })}
                    >
                        <option value="">Any Link Status</option>
                        <option value="true">Linked</option>
                        <option value="false">Unlinked</option>
                    </select>

                    <div className="h-4 w-px bg-[var(--border)] mx-2"></div>

                    <select
                        className="input-sm w-32 font-bold"
                        onChange={e => setFilters({ ...filters, sort: e.target.value })}
                        defaultValue="date"
                    >
                        <option value="date">Sort: Date</option>
                        <option value="total">Sort: Total</option>
                        <option value="supplier">Sort: Supplier</option>
                        <option value="docNumber">Sort: Num</option>
                    </select>
                </div>
            </GlassCard>

            {/* Grid */}
            <div className="flex-1 overflow-auto border border-[var(--border)] rounded-xl bg-[var(--surface)] relative shadow-inner">
                <table className="w-full text-sm text-left border-collapse table-fixed">
                    <thead className="sticky top-0 bg-[var(--card)] z-50 shadow-md font-bold text-[var(--text-muted)] border-b border-[var(--border)]">
                        <tr>
                            <th className="p-2 w-10 border-r border-[var(--border)] text-center bg-[var(--card)]">
                                <input
                                    type="checkbox"
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedIds(new Set(docs.map(d => d.id)));
                                        else setSelectedIds(new Set());
                                    }}
                                    checked={selectedIds.size === docs.length && docs.length > 0}
                                />
                            </th>
                            {activeColumns.filter(c => c.key !== 'actions').map(c => (
                                <th
                                    key={c.key}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, c.key)}
                                    onDragOver={(e) => handleDragOver(e, c.key)}
                                    onDrop={(e) => handleDrop(e, c.key)}
                                    className={`p-2 border-r border-[var(--border)] whitespace-nowrap overflow-hidden text-ellipsis bg-[var(--card)] ${c.align === 'right' ? 'text-right' : ''} cursor-grab active:cursor-grabbing hover:bg-[var(--bg-base)] transition-colors`}
                                    style={{ width: c.width, opacity: draggedCol === c.key ? 0.5 : 1 }}
                                >
                                    {c.label}
                                </th>
                            ))}
                            <th className="p-2 w-[140px] sticky right-0 bg-[var(--card)] z-[60] text-center shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)] border-l border-[var(--border)]">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                        {(() => {
                            const renderRow = (row) => (
                                <tr key={row.id} className={`group hover:bg-[var(--surface-hover)] transition-colors ${row.archived ? 'opacity-60 bg-gray-50/5' : ''}`}>
                                    <td className="p-2 border-r border-[var(--border)] text-center">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(row.id)}
                                            onChange={() => {
                                                const s = new Set(selectedIds);
                                                s.has(row.id) ? s.delete(row.id) : s.add(row.id);
                                                setSelectedIds(s);
                                            }}
                                        />
                                    </td>
                                    {activeColumns.filter(c => c.key !== 'actions').map(c => (
                                        <td key={c.key} className="p-2 border-r border-[var(--border)] last:border-0 relative overflow-hidden text-ellipsis whitespace-nowrap">
                                            {renderCell(row, c)}
                                        </td>
                                    ))}
                                    {/* Sticky Actions Column */}
                                    <td className="p-2 border-l border-[var(--border)] sticky right-0 bg-[var(--surface)] z-20 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)] group-hover:bg-[var(--surface-hover)]">
                                        <div className="flex gap-2 justify-center">
                                            <button className="btn-icon text-xs text-blue-500 hover:scale-110 transition-transform" onClick={() => viewRowPdf(row)} title="View"><IconEye /></button>
                                            
                                            {/* Quick Proposal Button (✨) - Restore requested by user */}
                                            {((row.docType || '').toLowerCase().includes('proforma') || (row.docType || '').toLowerCase().includes('c_pedido')) && (
                                                <button 
                                                    className="btn-icon text-xs text-amber-500 hover:scale-110 transition-transform" 
                                                    onClick={() => handleCreateProposal(row)} 
                                                    title="Criar Proposta Rápida (✨)"
                                                >
                                                    ✨
                                                </button>
                                            )}

                                            <button className="btn-icon text-xs text-amber-500 hover:scale-110 transition-transform" onClick={() => setViewBackupsDoc(row)} title="History/Backups">🕒</button>
                                            <button className="btn-icon text-xs hover:scale-110 transition-transform" onClick={() => updateDoc(row.id, { archived: !row.archived })} title={row.archived ? "Restore" : "Archive"}>
                                                {row.archived ? <IconUnarchive /> : <IconArchive />}
                                            </button>
                                            <button className="btn-icon text-xs text-red-500 hover:scale-110 transition-transform" onClick={() => deleteRow(row.id)} title="Delete"><IconTrash /></button>
                                        </div>
                                    </td>
                                </tr>
                            );

                            // Modified Grouping Logic
                            let remainingDocs = [...docs];
                            const groupsToRender = groupList.map(group => {
                                const activeFilters = group.filters.filter(f => f.values && f.values.length > 0);

                                // If no filters have values, this group matches nothing (prevents matching all)
                                if (activeFilters.length === 0) return { ...group, docs: [] };

                                const matched = remainingDocs.filter(d => {
                                    // All ACTIVE filters must match (AND)
                                    return activeFilters.every(f => {
                                        const docVal = (d[f.field] || '').toString().toLowerCase();
                                        return f.values.some(v => docVal.includes(v.toLowerCase()));
                                    });
                                });
                                remainingDocs = remainingDocs.filter(d => !matched.find(m => m.id === d.id));
                                return { ...group, docs: matched };
                            });

                            return (
                                <>
                                    {groupsToRender.map((group, idx) => (
                                        group.docs.length > 0 && (
                                            <React.Fragment key={group.id || idx}>
                                                <tr className="bg-[var(--surface-hover)]">
                                                    <td colSpan={100} className="px-5 py-3 text-[11px] font-black tracking-widest text-[#00E5FF] uppercase border-y border-[#333] shadow-md bg-[#0a0f12]">
                                                        {group.label}
                                                    </td>
                                                </tr>
                                                {group.docs.map(row => renderRow(row))}
                                            </React.Fragment>
                                        )
                                    ))}
                                    {remainingDocs.length > 0 && (
                                        <>
                                            <tr className="bg-[var(--surface-hover)]">
                                                <td colSpan={100} className="px-5 py-3 text-[11px] font-black tracking-widest text-gray-400 uppercase border-y border-[#333] shadow-inner bg-[#101010]">
                                                    {catchAllLabel}
                                                </td>
                                            </tr>
                                            {remainingDocs.map(row => renderRow(row))}
                                        </>
                                    )}
                                </>
                            );
                        })()}
                    </tbody>
                </table>
                {loading && <div className="absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center backdrop-blur-sm z-50">Loading...</div>}
                {!loading && docs.length === 0 && (
                    <div className="p-8 text-center opacity-50">No documents found with the current filters.</div>
                )}
            </div>

            {linkModalOpen && <LinkDocsModal
                onClose={() => setLinkModalOpen(false)}
                initialDocs={linkStartDocs}
                onLink={handleLinkConfirm}
            />}

            {/* Combined Links & Proposals Popover */}
            {viewLinksDoc && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewLinksDoc(null)}></div>
                    <GlassCard className="w-full max-w-lg p-6 relative z-10 border-[var(--accent-primary)]/30 overflow-hidden">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold flex items-center gap-2">🔗 Vínculos do Documento</h3>
                            <button onClick={() => setViewLinksDoc(null)} className="opacity-50 hover:opacity-100 text-xl p-1">✕</button>
                        </div>
                        
                        <div className="flex flex-col gap-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                            {/* 1. Associated Proposals */}
                            {(viewLinksDoc.associatedProposals?.length > 0) && (
                                <div className="flex flex-col gap-2">
                                    <h4 className="text-[10px] uppercase tracking-widest text-amber-500 font-black flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                                        Propostas Associadas (Portal Studio)
                                    </h4>
                                    <div className="flex flex-col gap-2">
                                        {viewLinksDoc.associatedProposals.map(p => (
                                            <div key={p.id} className="bg-amber-500/5 p-3 rounded-xl border border-amber-500/10 flex justify-between items-center hover:bg-amber-500/10 transition-colors group">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-gray-200">{p.name}</span>
                                                    <span className="text-[9px] uppercase tracking-tighter text-amber-500/60 font-mono">{p.status || 'Draft'}</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setViewLinksDoc(null);
                                                        setEditingProposalId(p.id);
                                                    }}
                                                    className="text-[9px] font-black uppercase bg-amber-500 text-black px-3 py-1.5 rounded-lg hover:scale-105 transition-all"
                                                >
                                                    Abrir Studio
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 2. Manual Linked Documents */}
                            <div className="flex flex-col gap-2">
                                <h4 className="text-[10px] uppercase tracking-widest text-blue-400 font-black flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                                    Documentos Relacionados
                                </h4>
                                <div className="flex flex-col gap-2">
                                    {docLinksData.length > 0 ? docLinksData.map((ref, idx) => (
                                        <div key={idx} className="bg-white/5 p-3 rounded-xl border border-white/10 flex justify-between items-center hover:bg-white/10 transition-colors group">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-blue-400 uppercase">{ref.docType || 'DOC'}</span>
                                                <span className="text-sm font-mono text-gray-200">{ref.docNumber}</span>
                                                <span className="text-[9px] text-gray-500">{ref.supplier}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleUnlink(ref)}
                                                    className="p-1.5 text-gray-600 hover:text-red-500 transition-colors"
                                                    title="Dissociar"
                                                >
                                                    <IconTrash />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setViewLinksDoc(null);
                                                        viewRowPdf(ref);
                                                    }}
                                                    className="text-[10px] font-bold uppercase tracking-wider bg-white/10 px-3 py-1.5 rounded-lg group-hover:bg-blue-500 group-hover:text-black transition-all"
                                                >
                                                    Visualizar
                                                </button>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="p-4 bg-white/5 border border-dashed border-white/10 rounded-xl text-center text-[10px] text-gray-500 italic">
                                            Nenhum outro documento vinculado manualmente.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-8 pt-6 border-t border-white/10 flex gap-3">
                            <button
                                onClick={() => {
                                    setViewLinksDoc(null);
                                    handleLinkClick([viewLinksDoc]);
                                }}
                                className="flex-1 py-3 bg-[var(--surface-base)] hover:bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl text-xs font-black transition-all"
                            >
                                🔗 Vincular Manualmente
                            </button>
                            <button
                                onClick={() => {
                                    setViewLinksDoc(null);
                                    handleCloneToProposal(viewLinksDoc);
                                }}
                                className="flex-1 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-500 rounded-xl text-xs font-black transition-all"
                            >
                                ✨ Nova Proposta
                            </button>
                        </div>
                    </GlassCard>
                </div>
            )}


            {/* Isolated Backup Preview (Phase 20) */}
            {previewBackupData && (
                <BackupDataViewer
                    snapshot={previewBackupData}
                    onClose={() => { setPreviewBackupData(null); setPreviewBackupId(null); }}
                    onRestore={() => previewBackupId && handleRestore(previewBackupId)} // Phase 31
                />
            )}


            {/* PDF Viewer */}
            {viewPdfUrl && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col relative">
                        <div className="flex justify-between items-center p-4 border-b border-[var(--border)] bg-[var(--surface)] rounded-t-xl">
                            <h3 className="font-bold text-lg flex items-center gap-2"><IconEye /> View Document</h3>
                            <button onClick={() => setViewPdfUrl(null)} className="btn text-xl p-0 w-8 h-8 flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 rounded-full transition-all">✕</button>
                        </div>
                        <iframe src={viewPdfUrl} className="flex-1 w-full bg-gray-100 dark:bg-gray-800 rounded-b-xl" />
                    </div>
                </div>, document.body
            )}

            {/* Enhanced Dynamic Viewer */}
            {viewDoc && (() => {
                const ViewerComponent = getViewer(viewDoc);
                if (ViewerComponent) {
                    return (
                        <ViewerComponent
                            doc={viewDoc}
                            onClose={() => setViewDoc(null)}
                            updateRow={(id, field, val) => updateDoc(id, { [field]: val })}
                            mode="archive"
                        />
                    );
                }
                // Fallback if no specific viewer found but setViewDoc was triggered (shouldn't happen with current logic)
                return null;
            })()}

            {projectSelectorOpen && (
                <ProjectSelectorModal
                    onClose={() => setProjectSelectorOpen(false)}
                    onSelect={handleAssignProject}
                />
            )}

            {/* Backup History Modal (Phase 8) */}
            {viewBackupsDoc && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl max-w-2xl w-full mx-4 overflow-hidden flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold flex items-center gap-2">🕒 Histórico de Backups</h3>
                            <button className="btn-icon" onClick={() => setViewBackupsDoc(null)}>✕</button>
                        </div>
                        <p className="text-sm opacity-60">Histórico de versões para o documento <b>{viewBackupsDoc.docNumber}</b></p>

                        <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {backupsData.length === 0 ? (
                                <div className="p-8 text-center opacity-40 italic">Nenhum backup encontrado para este documento.</div>
                            ) : (
                                backupsData.map(b => (
                                    <div key={b.id} className="bg-[var(--bg-base)] border border-[var(--border)] p-4 rounded-xl flex justify-between items-center group/backup">
                                        <div className="flex flex-col gap-1">
                                            <div className="text-sm font-bold">Versão de {new Date(b.created_at).toLocaleString()}</div>
                                            <div className="text-xs opacity-60">Motivo: {b.reason}</div>
                                            <div className="text-xs opacity-40 italic text-[var(--err)]">Expira em: {new Date(b.expires_at).toLocaleDateString()}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button className="btn-icon text-xs text-blue-500 hover:scale-110 transition-transform" onClick={() => handleViewBackup(b.id)} title="Pré-visualizar">👁️</button>
                                            <button className="btn text-xs bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20" onClick={() => handleRestore(b.id)}>
                                                Restaurar
                                            </button>
                                            <button className="btn-icon text-sm text-red-500 opacity-0 group-hover/backup:opacity-100 transition-opacity" onClick={() => handleDeleteBackup(b.id)}>
                                                <IconTrash />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-4 flex justify-end">
                            <button className="btn" onClick={() => setViewBackupsDoc(null)}>Fechar</button>
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
}
