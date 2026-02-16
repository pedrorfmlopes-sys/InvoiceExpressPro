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

    // Column Visibility & Order
    // Initial order needs to match COLUMNS_DEF keys roughly
    const [columnOrder, setColumnOrder] = useState([
        'archived', 'docType', 'docNumber', 'date', 'supplier', 'customer', 'shipTo', 'total',
        'associatedProposals', 'sub_project_id', 'category_id', 'scope', 'links'
    ]);
    const [visibleCols, setVisibleCols] = useState(new Set(columnOrder));
    const [colManagerOpen, setColManagerOpen] = useState(false);
    const [draggedCol, setDraggedCol] = useState(null);

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
            editable: true, type: 'select', options: ['fatura', 'recibo', 'nota_credito', 'guia_remessa', 'proforma', 'other']
        },
        { key: 'docNumber', label: 'Doc #', width: 120, editable: true },
        { key: 'date', label: 'Date', width: 100, editable: true, type: 'date' },
        { key: 'supplier', label: 'Entity', width: 200, editable: true },
        { key: 'customer', label: 'Cliente', width: 200, editable: true },
        {
            key: 'shipTo',
            label: 'Entrega',
            width: 200,
            render: (r) => r.entities?.shipTo?.name || r.shipTo?.name || '-'
        },
        // RIGHT ALIGN TOTAL
        { key: 'total', label: 'Total', width: 100, editable: true, align: 'right', format: (v) => v ? `${parseFloat(v).toFixed(2)} €` : '-' },
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
            key: 'links', label: 'Links', width: 60, type: 'custom', render: (r) => (
                r.linkCount > 0 ? (
                    <button className="badge bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 hover:scale-110 transition-transform cursor-pointer px-2 py-0.5 rounded text-xs font-bold" onClick={(e) => { e.stopPropagation(); setViewLinksDoc(r); }}>
                        🔗 {r.linkCount}
                    </button>
                ) : <span className="opacity-20">-</span>
            )
        },
        { key: 'actions', label: 'Actions', width: 140, type: 'action' }
    ];

    const activeColumns = columnOrder
        .filter(key => visibleCols.has(key))
        .map(key => COLUMNS_DEF.find(c => c.key === key))
        .filter(Boolean);

    // -- Renderers --
    const renderCell = (row, col) => {
        const isEditing = editingCell?.id === row.id && editingCell?.field === col.key;
        const val = row[col.key];

        if (isEditing) {
            // ... (Same editing logic)
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

                    <div className="flex gap-2">
                        <button className="btn" onClick={reload}>Refresh</button>
                        <button className="btn primary" onClick={() => setColManagerOpen(!colManagerOpen)}>Columns</button>
                        {/* Column Manager Popover logic */}
                        {colManagerOpen && (
                            <div className="absolute top-full right-0 mt-2 z-50 bg-[var(--card)] border border-[var(--border)] p-4 rounded-xl shadow-xl w-64 grid grid-cols-1 gap-2 animate-in fade-in zoom-in-95 duration-100">
                                <h4 className="font-bold mb-2 text-xs uppercase tracking-wider opacity-50">Visible Columns</h4>
                                {COLUMNS_DEF.map(c => (
                                    <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-[var(--bg-base)] p-1 rounded">
                                        <input
                                            type="checkbox"
                                            checked={visibleCols.has(c.key)}
                                            onChange={e => {
                                                const newSet = new Set(visibleCols);
                                                e.target.checked ? newSet.add(c.key) : newSet.delete(c.key);
                                                setVisibleCols(newSet);
                                            }}
                                        />
                                        {c.label}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Advanced Filters Row */}
                <div className="flex flex-wrap gap-2 items-center text-sm border-t border-[var(--border)] pt-4">
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
                        {docs.map(row => (
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
                                        <button className="btn-icon text-xs hover:scale-110 transition-transform" onClick={() => handleLinkClick([row])} title="Link"><IconLink /></button>
                                        <button className="btn-icon text-xs text-amber-500 hover:scale-110 transition-transform" onClick={() => setViewBackupsDoc(row)} title="History/Backups">🕒</button>
                                        <button className="btn-icon text-xs hover:scale-110 transition-transform" onClick={() => updateDoc(row.id, { archived: !row.archived })} title={row.archived ? "Restore" : "Archive"}>
                                            {row.archived ? <IconUnarchive /> : <IconArchive />}
                                        </button>
                                        <button className="btn-icon text-xs text-red-500 hover:scale-110 transition-transform" onClick={() => deleteRow(row.id)} title="Delete"><IconTrash /></button>
                                        <button className="btn-icon text-xs text-green-500 hover:scale-110 transition-transform" onClick={() => handleCreateProposal(row)} title="Criar Proposta">📝</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
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

            {/* Links Popover */}
            {viewLinksDoc && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewLinksDoc(null)}></div>
                    <GlassCard className="w-full max-w-lg p-6 relative z-10 border-[var(--accent-primary)]/30">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold flex items-center gap-2">🔗 Documentos Vinculados</h3>
                            <button onClick={() => setViewLinksDoc(null)} className="opacity-50 hover:opacity-100 text-xl">✕</button>
                        </div>
                        <div className="flex flex-col gap-3">
                            {viewLinksDoc.references?.map((ref, idx) => (
                                <div key={idx} className="bg-white/5 p-3 rounded-xl border border-white/10 flex justify-between items-center hover:bg-white/10 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-amber-500">{ref.groupType || 'Link'}</span>
                                        <span className="text-sm font-mono">{ref.extDocId || ref.docNumber}</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setViewLinksDoc(null);
                                            // Assuming onView is a prop or function available in this scope
                                            // If not, this might need adjustment based on how linked docs are viewed
                                            // For now, let's assume viewRowPdf can handle it if ref.id is a doc ID
                                            viewRowPdf(ref); // Changed from onView to viewRowPdf
                                        }}
                                        className="text-[10px] font-bold uppercase tracking-wider bg-white/10 px-3 py-1.5 rounded-lg hover:bg-amber-500 hover:text-black transition-all"
                                    >
                                        Abrir
                                    </button>
                                </div>
                            ))}
                        </div>
                    </GlassCard>
                </div>
            )}

            {/* Proposals Popover (Phase 21) */}
            {viewProposalsDoc && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewProposalsDoc(null)}></div>
                    <GlassCard className="w-full max-w-md p-6 relative z-10 border-amber-500/30 bg-gray-950/90">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black flex items-center gap-3">
                                <span className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center text-black text-xs font-black">PS</span>
                                Propostas Associadas
                            </h3>
                            <button onClick={() => setViewProposalsDoc(null)} className="opacity-50 hover:opacity-100 text-xl">✕</button>
                        </div>
                        <div className="flex flex-col gap-3">
                            {viewProposalsDoc.associatedProposals?.map((p, idx) => (
                                <div key={p.id} className="bg-white/5 p-4 rounded-xl border border-white/10 flex justify-between items-center hover:bg-white/10 transition-colors group">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full 
                                                ${p.status === 'accepted' ? 'bg-green-500' : ''}
                                                ${p.status === 'sent' ? 'bg-blue-400' : ''}
                                                ${p.status === 'rejected' ? 'bg-red-500' : ''}
                                                ${p.status === 'closed_other' ? 'bg-orange-400' : ''}
                                                ${(!p.status || p.status === 'draft') ? 'bg-gray-400' : ''}
                                            `}></span>
                                            <span className="text-sm font-bold group-hover:text-amber-500 transition-colors">{p.name}</span>
                                        </div>
                                        <span className="text-[10px] uppercase tracking-wider opacity-40 font-bold ml-4">
                                            {p.status || 'Rascunho'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setViewProposalsDoc(null);
                                            setEditingProposalId(p.id);
                                        }}
                                        className="text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 px-4 py-2 rounded-lg hover:bg-amber-500 hover:text-black transition-all border border-amber-500/20"
                                    >
                                        Editar
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                setViewProposalsDoc(null);
                                handleCloneToProposal(viewProposalsDoc);
                            }}
                            className="w-full mt-6 py-3 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition-all"
                        >
                            + Criar Nova Proposta
                        </button>
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
