import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import { qp } from '../shared/ui';
import api from '../api/apiClient';
import { GlassCard } from '../components/ui/GlassCard';

// -- ICONS --
const IconTrash = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" /><path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" /></svg>;
const IconEye = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" /><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" /></svg>;
const IconArrowLeftRight = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M1 11.5a.5.5 0 0 0 .5.5h11.793l-3.147 3.146a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 11H1.5a.5.5 0 0 0-.5.5zm14-7a.5.5 0 0 0-.5-.5H2.707l3.147 3.146a.5.5 0 1 0-.708.708l-4-4a.5.5 0 0 0 0-.708l4-4a.5.5 0 1 0 .708.708L2.707 4H14.5a.5.5 0 0 0 .5-.5z" /></svg>;

// Helper: Normalize DB string to Translation Key or Label
function normalizeDocType(val, availableTypes = []) {
    if (!val) return 'other';
    // 1. Try exact match in known types (slug or label)
    const exact = availableTypes.find(t => t.slug === val || t.label === val);
    if (exact) return exact.slug;

    // 2. Legacy Fallback (Substring)
    const v = String(val).toLowerCase().trim();
    if (v.includes('nota') && v.includes('credito')) return 'nota_credito';
    if (v.includes('fatura') && v.includes('recibo')) return 'fatura_recibo';
    if (v.includes('fatura') || v === 'invoice') return 'fatura';
    if (v.includes('recibo') || v === 'receipt') return 'recibo';
    if (v.includes('guia') || v === 'delivery') return 'guia_remessa';

    // 3. If it's a known custom slug content (e.g. from DB) but didn't match above rules?
    // We assume the value itself is the slug if not 'other'
    return val;
}

// Draggable Input Component (Defined Outside Row/ProcessTab to prevent re-mount focus loss)
const DInput = ({ rowId, field, value, className, prefix, onBlur, updateRow, handleDragStart, handleDrop }) => {
    return (
        <div className="flex items-center gap-2 group relative">

            {/* Drag Handle */}
            <div
                draggable
                onDragStart={(e) => handleDragStart(e, rowId, field, value)}
                className="cursor-grab active:cursor-grabbing opacity-10 group-hover:opacity-100 transition-opacity"
                title="Drag"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M7 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M7 14a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0" /></svg>
            </div>

            <div className={`relative flex items-center w-full ${prefix ? 'pl-4' : ''}`}>
                {prefix && <span className="absolute left-0 opacity-50 font-mono text-xs">{prefix}</span>}
                <input
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, rowId, field, value)}
                    className={`bg-transparent w-full outline-none transition-all ${className || ''}`}
                    value={value || ''}
                    onChange={(e) => updateRow(rowId, field, e.target.value)}
                    onBlur={(e) => {
                        if (onBlur) onBlur(e);
                    }}
                    placeholder={field === 'docNumber' ? 'Missing!' : ''}
                />
            </div>
        </div >
    )
}

export default function ProcessV2Tab({ project }) {
    const { t } = useTranslation();
    const [files, setFiles] = useState([]);
    const [batchId, setBatchId] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [processingStats, setProcessingStats] = useState({ done: 0, total: 0, errors: 0 });
    const [rows, setRows] = useState([]);
    const [showAdditional, setShowAdditional] = useState(false);
    const [busy, setBusy] = useState(false);

    // -- Selection State --
    const [selectedIds, setSelectedIds] = useState(new Set());

    // Load Doc Types
    const [availableTypes, setAvailableTypes] = useState([]);
    useEffect(() => {
        api.get('/api/settings/doctypes')
            .then(res => setAvailableTypes(res.data))
            .catch(err => console.error("Failed to load doctypes", err));
    }, []);

    // Create Type Action
    const createType = async (label) => {
        if (!label) return;
        try {
            const res = await api.post('/api/settings/doctypes', { label });
            setAvailableTypes(prev => [...prev, res.data]);
            return res.data;
        } catch (e) {
            alert(e.message);
            return null;
        }
    };
    const [dragSrc, setDragSrc] = useState(null);
    const [dragModal, setDragModal] = useState(null);

    // -- View PDF State --
    const [viewPdfUrl, setViewPdfUrl] = useState(null);

    // -- File Handling --
    const onDrop = useCallback((acceptedFiles) => {
        setFiles(prev => [...prev, ...acceptedFiles]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] }
    });

    // -- Actions --
    async function startProcessing() {
        if (!files.length) return;
        setIsUploading(true);
        setUploadProgress(0);
        setProcessingProgress(0);
        setRows([]);
        setBatchId(null);
        setSelectedIds(new Set());

        const formData = new FormData();
        files.forEach(f => formData.append('files', f));

        const apiKey = localStorage.getItem('OPENAI_API_KEY') || '';
        try {
            const res = await api.post(qp('/api/extract', project), formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(apiKey ? { 'X-OpenAI-Key': apiKey } : {})
                },
                onUploadProgress: (p) => {
                    const percent = Math.round((p.loaded * 100) / p.total);
                    setUploadProgress(percent);
                }
            });
            setBatchId(res.data.batchId);
            setProcessingStats({ done: 0, total: files.length, errors: 0 });
        } catch (e) {
            alert('Erro ao iniciar processamento: ' + e.message);
            setIsUploading(false); // Reset on fail
        } finally {
            setUploadProgress(100);
        }
    }

    // -- Polling --
    useEffect(() => {
        if (!batchId) return;
        let interval = setInterval(async () => {
            try {
                // 1. Get Progress
                const pRes = await api.get(`/api/progress/${batchId}`);
                const p = pRes.data;
                setProcessingStats({ done: p.done, total: p.total, errors: p.errors });

                const percent = Math.round(((p.done + p.errors) / p.total) * 100);
                setProcessingProgress(percent);

                // 2. Get Rows
                const rowsRes = await api.get(`/api/batch/${batchId}`);
                if (rowsRes.data.rows) {
                    const fmtRows = rowsRes.data.rows.map(r => ({
                        ...r,
                        total: r.total ? parseFloat(String(r.total).replace(',', '.')).toFixed(2) : r.total
                    }));
                    setRows(fmtRows);
                }

                if (percent >= 100) {
                    clearInterval(interval);
                    setIsUploading(false); // Done
                }
            } catch (e) {
                console.error("Poll error", e);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [batchId]);


    // -- Row Updating (Inline Edit) --
    const updateRow = async (id, field, value) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
        try {
            await api.patch(qp(`/api/doc/${id}`, project), { [field]: value });
        } catch (e) {
            console.error("Failed to save draft", e);
        }
    };

    const deleteRow = async (id) => {
        if (!confirm(t('process.actions.delete') + '?')) return;
        try {
            await api.delete(qp(`/api/doc/${id}`, project));
            setRows(prev => prev.filter(r => r.id !== id));
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        } catch (e) { alert(e.message); }
    };

    const deleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`${t('process.actions.delete')} (${selectedIds.size})?`)) return;

        // Naive bulk delete (loop) - ideally implement bulk delete API
        setBusy(true);
        try {
            for (const id of selectedIds) {
                await api.delete(qp(`/api/doc/${id}`, project));
            }
            setRows(prev => prev.filter(r => !selectedIds.has(r.id)));
            setSelectedIds(new Set());
        } catch (e) { alert(e.message) }
        finally { setBusy(false); }
    }

    const finalize = async () => {
        // If selection exists, finalize ONLY selection. Else finalize ALL.
        const targetRows = selectedIds.size > 0
            ? rows.filter(r => selectedIds.has(r.id))
            : rows;

        if (!targetRows.length) return;

        const count = targetRows.length;
        if (!confirm(`${t('process.actions.finalize')} (${count})?`)) return;

        setBusy(true);
        try {
            const items = targetRows.map(r => ({ id: r.id, docType: r.docType, docNumber: r.docNumber }));
            await api.post(qp('/api/docs/finalize-bulk', project), { items });
            alert("Sucesso! Documentos guardados.");

            // Remove finalized from view
            const finalizedIds = new Set(targetRows.map(r => r.id));
            setRows(prev => prev.filter(r => !finalizedIds.has(r.id)));
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                targetRows.forEach(r => newSet.delete(r.id));
                return newSet;
            });

            if (rows.length === 0) {
                setFiles([]);
                setBatchId(null);
                setProcessingProgress(0);
                setUploadProgress(0);
            }

        } catch (e) {
            alert("Erro ao finalizar: " + e.message);
        } finally {
            setBusy(false);
        }
    };

    // -- Selection Logic --
    const toggleSelection = (id) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === rows.length && rows.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(rows.map(r => r.id)));
        }
    };


    const viewRowPdf = (row) => {
        api.get(qp(`/api/doc/view?id=${row.id}`, project), { responseType: 'blob' })
            .then(res => {
                const url = URL.createObjectURL(res.data);
                setViewPdfUrl(url);
            })
            .catch(e => alert("Erro ao abrir PDF: " + e.message));
    };

    // -- Drag & Drop Logic --
    const handleDragStart = (e, id, field, value) => {
        setDragSrc({ id, field, value });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ id, field, value }));
    };

    const handleDrop = async (e, targetId, targetField, targetValue) => {
        e.preventDefault();
        if (!dragSrc) return;
        if (dragSrc.id === targetId && dragSrc.field === targetField) return;

        if (targetValue && String(targetValue).trim() !== '') {
            setDragModal({
                src: dragSrc,
                target: { id: targetId, field: targetField, value: targetValue }
            });
            return;
        }
        await performMove(dragSrc, { id: targetId, field: targetField });
        setDragSrc(null);
    };

    const performMove = async (src, target) => {
        await updateRow(target.id, target.field, src.value);
        await updateRow(src.id, src.field, '');
    };
    const performSwap = async (src, target) => {
        await updateRow(target.id, target.field, src.value);
        await updateRow(src.id, src.field, target.value);
    };
    const performReplace = async (src, target) => {
        await performMove(src, target);
    };


    return (
        <div className="flex flex-col gap-6 fade-in h-full overflow-y-auto pb-8 custom-scrollbar relative">
            {/* MARKER */}
            <div className="fixed top-2 right-2 opacity-50 text-[10px] pointer-events-none z-[9999]">PROCESSAR_V2_MARKER</div>

            {/* Modal: Drag Conflict */}
            {dragModal && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
                        <h3 className="text-lg font-bold mb-2">{t('process.modal.drag_title')}</h3>
                        <p className="opacity-75 mb-6">{t('process.modal.drag_msg')}</p>
                        <div className="text-sm bg-[var(--bg-base)] p-3 rounded mb-6 font-mono text-center truncate">
                            {dragModal.src.value} <span className="opacity-50">➔</span> {dragModal.target.value}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button className="btn" onClick={() => setDragModal(null)}>{t('process.actions.cancel')}</button>
                            <button className="btn" onClick={async () => {
                                await performSwap(dragModal.src, dragModal.target);
                                setDragModal(null); setDragSrc(null);
                            }}>
                                <IconArrowLeftRight /> {t('process.actions.swap')}
                            </button>
                            <button className="btn primary" onClick={async () => {
                                await performReplace(dragModal.src, dragModal.target);
                                setDragModal(null); setDragSrc(null);
                            }}>
                                {t('process.actions.replace')}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {/* Modal: PDF Viewer */}
            {viewPdfUrl && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col relative">
                        <div className="flex justify-between items-center p-4 border-b border-[var(--border)] bg-[var(--surface)] rounded-t-xl">
                            <h3 className="font-bold text-lg flex items-center gap-2"><IconEye /> {t('process.modal.view_title')}</h3>
                            <button onClick={() => setViewPdfUrl(null)} className="btn text-xl p-0 w-8 h-8 flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 rounded-full transition-all">✕</button>
                        </div>
                        <iframe src={viewPdfUrl} className="flex-1 w-full bg-gray-100 dark:bg-gray-800 rounded-b-xl" />
                    </div>
                </div>, document.body
            )}

            {/* 1. Header & Project Actions */}
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold">{t('process.title')}</h1>
                    <div className="text-sm opacity-50">{t('sidebar.workspace')}: {project}</div>
                </div>
            </div>

            {/* 2. Upload Area */}
            {rows.length === 0 && !isUploading && (
                <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all ${isDragActive ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10' : 'border-[var(--border)] hover:border-[var(--text-muted)]'}`}>
                    <input {...getInputProps()} />
                    <div className="text-4xl mb-4">📄</div>
                    <div className="text-lg font-medium mb-2">{t('process.dropzone')}</div>
                    <div className="text-sm opacity-50">.PDF (Multiple)</div>
                    {files.length > 0 && (
                        <div className="mt-6 flex flex-col gap-2 w-full max-w-md">
                            <div className="text-xs font-bold uppercase tracking-widest opacity-50">Selected: {files.length}</div>
                            <button onClick={(e) => { e.stopPropagation(); startProcessing(); }} className="btn primary w-full">{t('process.btn_process')}</button>
                        </div>
                    )}
                </div>
            )}

            {/* 3. Progress Bars */}
            {(isUploading || processingProgress > 0) && (
                <GlassCard>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <div className="flex justify-between text-xs uppercase font-bold tracking-widest mb-2 opacity-75">{t('process.uploading')} <span>{uploadProgress}%</span></div>
                            <div className="h-2 bg-[var(--bg-base)] rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} /></div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs uppercase font-bold tracking-widest mb-2 opacity-75">{t('process.processing')} <span>{processingStats.done}/{processingStats.total}</span></div>
                            <div className="h-2 bg-[var(--bg-base)] rounded-full overflow-hidden"><div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${processingProgress}%` }} /></div>
                        </div>
                    </div>
                </GlassCard>
            )}

            {/* 4. Review Table */}
            {rows.length > 0 && (
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="text-lg font-bold">Review Batch ({rows.length})</div>
                        <div className="flex gap-2">
                            {/* Show "Delete Selected" if > 0 */}
                            {selectedIds.size > 0 && (
                                <button className="btn text-[var(--err)]" onClick={deleteSelected}>
                                    <IconTrash /> {t('process.actions.delete')} ({selectedIds.size})
                                </button>
                            )}

                            <button className="btn text-xs" onClick={() => setShowAdditional(!showAdditional)}>{showAdditional ? 'Hide Extra' : 'Show Extra'}</button>
                            <button className="btn primary" onClick={finalize}>
                                {t('process.actions.finalize')}
                                {selectedIds.size > 0 ? ` (${selectedIds.size})` : ' All'}
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase bg-[var(--bg-base)] text-[var(--text-muted)] font-bold">
                                <tr>
                                    {/* Select All Checkbox */}
                                    <th className="p-3 w-10">
                                        <input
                                            type="checkbox"
                                            checked={rows.length > 0 && selectedIds.size === rows.length}
                                            onChange={toggleSelectAll}
                                            className="cursor-pointer"
                                        />
                                    </th>
                                    <th className="p-3 w-10">#</th>
                                    <th className="p-3">{t('process.table.type')}</th>
                                    <th className="p-3">{t('process.table.doc_no')}</th>
                                    <th className="p-3">{t('process.table.date')}</th>
                                    <th className="p-3">Customer</th>
                                    <th className="p-3">{t('process.table.total')}</th>
                                    <th className="p-3">{t('process.table.supplier')}</th>
                                    {showAdditional && <th className="p-3">Notes</th>}
                                    <th className="p-3 w-20">{t('process.table.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {rows.map((row, i) => (
                                    <Row
                                        key={row.id}
                                        index={i}
                                        row={row}
                                        updateRow={updateRow}
                                        deleteRow={deleteRow}
                                        viewRowPdf={viewRowPdf}
                                        showAdditional={showAdditional}
                                        t={t}
                                        handleDragStart={handleDragStart}
                                        handleDrop={handleDrop}
                                        isSelected={selectedIds.has(row.id)}
                                        toggleSelection={toggleSelection}
                                        availableTypes={availableTypes}
                                        processCreateType={createType}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// Sub-component
function Row({ index, row, updateRow, deleteRow, viewRowPdf, showAdditional, t, handleDragStart, handleDrop, isSelected, toggleSelection, availableTypes = [], processCreateType }) {

    // Helper Props for DInput
    const dInputProps = {
        rowId: row.id, updateRow, handleDragStart, handleDrop
    }

    const currentType = normalizeDocType(row.docType, availableTypes);

    return (
        <tr className={`hover:bg-[var(--surface-hover)] transition-colors ${isSelected ? 'bg-blue-500/10' : ''}`}>
            <td className="p-3">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection(row.id)}
                    className="cursor-pointer"
                />
            </td>
            <td className="p-3 opacity-50 font-mono text-xs">{index + 1}</td>
            <td className="p-3">
                <select
                    className="bg-transparent w-full outline-none focus:text-[var(--accent-primary)] font-medium appearance-none cursor-pointer"
                    value={currentType}
                    onChange={async (e) => {
                        const val = e.target.value;
                        if (val === '__NEW__') {
                            const label = prompt("Nome do novo tipo de documento:");
                            if (label) {
                                const newType = await processCreateType(label); // Passed from parent
                                if (newType) {
                                    updateRow(row.id, 'docType', newType.slug);
                                }
                            }
                        } else {
                            updateRow(row.id, 'docType', val);
                        }
                    }}
                >
                    {availableTypes.map(t => (
                        <option key={t.slug} value={t.slug}>{t.label || t.slug}</option>
                    ))}
                    <option value="other">Outro</option>
                    <option disabled>──────────</option>
                    <option value="__NEW__">+ Criar Novo...</option>
                </select>
            </td>
            <td className="p-3"><DInput {...dInputProps} field="docNumber" value={row.docNumber} className={!row.docNumber ? 'border-b border-red-500/50' : 'focus:scale-105'} /></td>
            <td className="p-3"><DInput {...dInputProps} field="date" value={row.date} className="w-24" /></td>
            <td className="p-3"><DInput {...dInputProps} field="customer" value={row.customer} className="font-medium" /></td>

            {/* Total with Euro Format */}
            <td className="p-3 font-mono">
                <DInput
                    {...dInputProps}
                    field="total"
                    value={row.total}
                    className="w-20 text-right"
                    prefix="€"
                    onBlur={(e) => {
                        const v = parseFloat(e.target.value.replace(',', '.')); // Handle decimal comma
                        if (!isNaN(v)) {
                            updateRow(row.id, 'total', v.toFixed(2));
                        }
                    }}
                />
            </td>

            <td className="p-3"><DInput {...dInputProps} field="supplier" value={row.supplier} className="opacity-80" /></td>
            {showAdditional && <td className="p-3"><DInput {...dInputProps} field="notes" value={row.notes} className="opacity-50" /></td>}
            <td className="p-3 flex gap-2 justify-end items-center">
                <button className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors p-1" onClick={() => viewRowPdf(row)} title={t('process.actions.view')}><IconEye /></button>
                <button className="text-[var(--err)] opacity-50 hover:opacity-100 transition-colors p-1" onClick={() => deleteRow(row.id)} title={t('process.actions.delete')}><IconTrash /></button>
            </td>
        </tr>
    )
}
