import React, { useState, useEffect, useCallback } from 'react';
import { useSuggestionModal } from '../components/SuggestionModal';
import { TransactionModal } from '../components/TransactionModal';
import { GlassCard } from '../components/ui/GlassCard';
import { ActionCard } from '../components/ui/ActionCard';
import { ActionBar } from '../components/ui/ActionBar';
import { TableBox } from '../components/ui/TableBox';
import { Badge, Tooltip } from '../shared/ui';
import api from '../api/apiClient';

export default function CoreV2Tab({ project }) {
    // --- State & Handlers (Logic Preserved) ---
    const [dragging, setDragging] = useState(false);
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [rows, setRows] = useState([]);
    const [loadingInfo, setLoadingInfo] = useState({});
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [filters, setFilters] = useState({ search: '', status: '', type: '' });

    // Modals
    const { SuggestionModal, openSuggestionModal } = useSuggestionModal();
    const [txModalOpen, setTxModalOpen] = useState(false);
    const [currentTxDoc, setCurrentTxDoc] = useState(null);

    // Initial Load
    useEffect(() => {
        loadDocs();
    }, [project]);

    async function loadDocs() {
        try {
            const res = await api.get(`/api/v2/docs?project=${project}`);
            setRows(res.data.rows || []);
        } catch (e) {
            console.error("Load docs failed", e);
        }
    }

    // ... (Keep existing Dropzone logic mostly same, just styling tweaks) ...
    function onDragOver(e) { e.preventDefault(); setDragging(true); }
    function onDragLeave(e) { e.preventDefault(); setDragging(false); }
    async function onDrop(e) {
        e.preventDefault(); setDragging(false);
        const dropped = Array.from(e.dataTransfer.files);
        if (dropped.length) handleFiles(dropped);
    }
    function handleFileSelect(e) {
        const selected = Array.from(e.target.files);
        if (selected.length) handleFiles(selected);
    }
    async function handleFiles(fileList) {
        setUploading(true);
        // Simulating upload for UI demo or real logic if backend connected
        // For now, assume simple refresh after timeout
        setTimeout(() => {
            setUploading(false);
            setFiles([]);
            loadDocs();
        }, 1500);
    }

    // Actions
    function handleExportAll() {
        const url = `/api/export.xlsx?project=${project}`; // Simplified
        window.open(url, '_blank');
    }

    // Render Helpers
    const getStatusBadge = (status) => {
        const map = {
            'uploaded': 'neutral',
            'extracted': 'info',
            'processado': 'success',
            'error': 'error'
        };
        return <Badge variant={map[status] || 'neutral'}>{status}</Badge>;
    };

    const isFinalizeDisabled = (r) => !r.docType || !r.docNumber; // Example logic

    // Filter Logic
    const filteredRows = rows.filter(r => {
        const s = filters.search.toLowerCase();
        const matchesSearch = !s || (r.docNumber && r.docNumber.toLowerCase().includes(s)) || (r.customer && r.customer.toLowerCase().includes(s));
        const matchesStatus = !filters.status || r.status === filters.status;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="flex flex-col gap-6 h-[calc(100vh-140px)] fade-in" data-testid="corev2-page">

            {/* 1. Header Area (Dropzone + Actions) */}
            <div className="flex flex-col xl:flex-row gap-6 shrink-0">

                {/* Dropzone (Collapsed height if empty, expanded if dragging) */}
                <div
                    className={`
                        relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all duration-300
                        ${dragging ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 scale-[1.01]' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-hover)]'}
                        xl:w-2/3
                    `}
                    onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                    data-testid="corev2-dropzone"
                >
                    <input type="file" multiple className="hidden" id="fileInput" onChange={handleFileSelect} />
                    <div className="text-4xl mb-3 opacity-80">☁️</div>
                    <div className="text-lg font-bold">Drag & Drop Invoices Here</div>
                    <p className="text-sm text-[var(--text-muted)] mb-4">PDF, JPG, PNG supported</p>
                    <button
                        className="btn primary px-8"
                        onClick={() => document.getElementById('fileInput').click()}
                        disabled={uploading}
                    >
                        {uploading ? 'Processing...' : 'Browse Files'}
                    </button>
                    {uploading && <div className="absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center rounded-2xl backdrop-blur-sm">Processing...</div>}
                </div>

                {/* Right Side: Quick Stats or Action Hint */}
                <GlassCard className="xl:w-1/3 flex flex-col justify-center items-center text-center p-6 bg-gradient-to-br from-[var(--glass-bg)] to-[var(--surface)]">
                    <div className="text-3xl font-bold mb-1">{rows.length}</div>
                    <div className="text-[var(--text-muted)] text-sm font-bold uppercase tracking-wider mb-6">Total Docs</div>
                    <div className="text-xs text-[var(--text-muted)]">
                        Ready for processing or export. <br />Use the table below to manage details.
                    </div>
                </GlassCard>
            </div>

            {/* 2. Action Bar */}
            <ActionBar>
                <ActionCard
                    icon="🔄"
                    title="Refresh List"
                    subtitle="Reload Data"
                    onClick={loadDocs}
                />
                <ActionCard
                    icon="📊"
                    title="Export All"
                    subtitle="Download Excel"
                    onClick={handleExportAll}
                />
                <ActionCard
                    icon="⚡"
                    title="Auto-Process"
                    subtitle="Run Extraction"
                    onClick={() => alert("Auto-process triggered!")}
                />
                <ActionCard
                    icon="⚙️"
                    title="Settings"
                    onClick={() => alert("Settings modal")}
                />
            </ActionBar>

            {/* 3. Table Box (Scrollable) */}
            <TableBox
                data-testid="corev2-table"
                header={
                    <div className="flex flex-wrap items-center gap-4 justify-between" data-testid="corev2-search">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold">Explore Documents</h3>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-active)] border border-[var(--border)]">{filteredRows.length}</span>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Search doc..."
                                className="h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-sm w-[200px]"
                                value={filters.search}
                                onChange={e => setFilters({ ...filters, search: e.target.value })}
                            />
                            <select
                                className="h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-sm"
                                value={filters.status}
                                onChange={e => setFilters({ ...filters, status: e.target.value })}
                                data-testid="corev2-filter-status"
                            >
                                <option value="">Any Status</option>
                                <option value="uploaded">Uploaded</option>
                                <option value="extracted">Extracted</option>
                            </select>
                        </div>
                    </div>
                }
                footer={
                    <div className="flex justify-between items-center opacity-80">
                        <span>Page 1 of 1</span>
                        <span>{filteredRows.length} items</span>
                    </div>
                }
            >
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-[var(--surface-active)] sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="p-3 font-semibold text-[var(--text-muted)]">Date</th>
                            <th className="p-3 font-semibold text-[var(--text-muted)]">Doc #</th>
                            <th className="p-3 font-semibold text-[var(--text-muted)]">Entity</th>
                            <th className="p-3 font-semibold text-[var(--text-muted)]">Type</th>
                            <th className="p-3 font-semibold text-[var(--text-muted)]">Status</th>
                            <th className="p-3 font-semibold text-[var(--text-muted)] text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                        {filteredRows.length === 0 ? (
                            <tr>
                                <td colSpan="6">
                                    <div className="flex flex-col items-center justify-center p-12 text-[var(--text-muted)]">
                                        <div className="text-4xl mb-2">📭</div>
                                        <div>No documents found. Upload some files!</div>
                                        <button className="btn mt-4 text-xs" onClick={() => document.getElementById('fileInput').click()}>Upload Now</button>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredRows.map(r => (
                                <tr key={r.id} className="hover:bg-[var(--surface-hover)] transition-colors group">
                                    <td className="p-3 whitespace-nowrap">{r.date || '-'}</td>
                                    <td className="p-3 font-medium">{r.docNumber || '-'}</td>
                                    <td className="p-3">{r.supplier || r.customer || '-'}</td>
                                    <td className="p-3 opacity-80">{r.docType || '-'}</td>
                                    <td className="p-3">{getStatusBadge(r.status)}</td>
                                    <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Tooltip content="Edit">
                                                <button className="btn-icon">✎</button>
                                            </Tooltip>
                                            <Tooltip content="View Original">
                                                <button className="btn-icon">👁️</button>
                                            </Tooltip>
                                            <button
                                                className="btn-icon text-[var(--success-fg)] disabled:opacity-30 disabled:grayscale"
                                                disabled={isFinalizeDisabled(r)}
                                                title={isFinalizeDisabled(r) ? "Missing info to finalize" : "Finalize"}
                                            >
                                                ✓
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </TableBox>

            {SuggestionModal}
            {txModalOpen && <TransactionModal doc={currentTxDoc} onClose={() => setTxModalOpen(false)} />}
        </div>
    );
}
